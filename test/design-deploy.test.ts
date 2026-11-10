import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { designCommand } from "../src/commands/design.js";
import type { ResolvedMesheryAuth } from "../src/config.js";
import { AxiError, AxiPartialFailureError } from "../src/errors.js";
import { API } from "../src/paths.js";
import { setServerAuth, setServerFetcher } from "../src/server.js";

const DESIGN_ID = "f96770a7-fa56-45e1-b3ba-524aa9cb4a4b";
const CONTEXT_ID = "f59996fc29edc9a765c4b73d88934844";
const CONNECTION_ID = "f59996fc-29ed-c9a7-65c4-b73d88934844";
const CONFIGMAP_ID = "65a25039-46c4-45de-a9a0-10638688abd3";
const DEPLOYMENT_ID = "37a02748-fee4-473b-9e16-efbae4f3393e";
const SERVICE_ID = "e882f4a8-ce7d-4ec3-ae2c-16455b334c44";

const fakeAuth: ResolvedMesheryAuth = {
  configPath: "/tmp/config.yaml",
  tokenPath: "/tmp/auth.json",
  tokenValue: "",
  providerValue: "Local",
  context: {
    name: "local",
    endpoint: "http://localhost:9081",
    tokenName: "default",
    platform: "docker",
  },
};

// The fixtures below are trimmed from real Meshery Server v1.0.75 responses,
// except `failedDeploy`: a per-component deploy failure could not be provoked.
const patternFile = JSON.stringify({
  name: "demo-app",
  components: [
    {
      id: CONFIGMAP_ID,
      displayName: "demo-app-config",
      component: { kind: "ConfigMap" },
    },
    {
      id: DEPLOYMENT_ID,
      displayName: "demo-app",
      component: { kind: "Deployment" },
    },
    { id: SERVICE_ID, displayName: "demo-app", component: { kind: "Service" } },
  ],
});

const demoApp = { id: DESIGN_ID, name: "demo-app", patternFile };
const minikube = {
  id: CONTEXT_ID,
  name: "minikube",
  server: "https://192.168.49.2:8443",
  connectionId: CONNECTION_ID,
};

function summary(kind: string, name: string, overrides = {}) {
  return [
    {
      Summary: [
        {
          Kind: kind,
          Model: "kubernetes",
          CompName: name,
          Success: true,
          DesignName: "demo-app",
          Message: `deployed demo-app/${name}`,
          Metadata: null,
          Error: null,
          IsPrerequisite: false,
          ...overrides,
        },
      ],
      SystemName: "",
      Location: "https://192.168.49.2:8443",
    },
  ];
}

const deployed = {
  [DEPLOYMENT_ID]: summary("Deployment", "demo-app"),
  [CONFIGMAP_ID]: summary("ConfigMap", "demo-app-config"),
  [SERVICE_ID]: summary("Service", "demo-app"),
};

const failedDeploy = {
  ...deployed,
  [SERVICE_ID]: summary("Service", "demo-app", {
    Success: false,
    Message: "failed to deploy demo-app/demo-app: port is required",
    Error: {},
  }),
};

// Server keys dry-run results by display name, so the Deployment is overwritten
// by the Service of the same name.
const dryRunOk = {
  dryRunResponse: {
    "demo-app": {
      [CONTEXT_ID]: {
        success: true,
        error: null,
        component: {
          id: SERVICE_ID,
          displayName: "demo-app",
          component: { kind: "Service" },
        },
      },
    },
    "demo-app-config": {
      [CONTEXT_ID]: {
        success: true,
        error: null,
        component: {
          id: CONFIGMAP_ID,
          displayName: "demo-app-config",
          component: { kind: "ConfigMap" },
        },
      },
    },
  },
};

const dryRunFailed = {
  dryRunResponse: {
    ...dryRunOk.dryRunResponse,
    "demo-app-config": {
      [CONTEXT_ID]: {
        success: false,
        error: {
          Status: "Failure",
          Causes: [
            {
              Type: "Failure",
              Message: '[Status Code: 404] namespaces "no-such-ns" not found',
              FieldPath: "unknown",
            },
          ],
        },
        component: {
          id: CONFIGMAP_ID,
          displayName: "demo-app-config",
          component: { kind: "ConfigMap" },
        },
      },
    },
  },
};

const evaluated = {
  design: {},
  schemaVersion: "",
  timestamp: "2026-11-07T10:42:54Z",
  trace: {},
  actions: [
    {
      op: "add_component",
      value: {
        item: {
          displayName: "containers.0",
          component: { kind: "Container" },
        },
      },
    },
    {
      op: "update_relationship",
      value: {
        id: "6325d8d9-e948-4709-aa86-d3287df2db8c",
        path: "/status",
        value: "approved",
      },
    },
  ],
};

type Call = { method: string; url: URL; body: unknown };

type ServerState = {
  designs?: Record<string, unknown>[];
  contexts?: Record<string, unknown>[];
  deploy?: unknown;
  deployStatus?: number;
  evaluate?: unknown;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

/** Fake Meshery Server routing the requests these commands make. */
function server(state: ServerState): Call[] {
  const calls: Call[] = [];
  setServerAuth(fakeAuth);
  setServerFetcher(async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname.slice(1);
    calls.push({
      method: init.method ?? "GET",
      url: parsed,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (path === API.k8sContexts) {
      const contexts = state.contexts ?? [minikube];
      return json({
        page: 0,
        pageSize: 100,
        totalCount: contexts.length,
        contexts,
      });
    }
    if (path === API.designDeploy) {
      return json(state.deploy ?? deployed, state.deployStatus ?? 200);
    }
    if (path === API.designEvaluate) return json(state.evaluate ?? evaluated);
    if (path === API.designs) {
      const patterns = state.designs ?? [demoApp];
      return json({
        page: 0,
        pageSize: 100,
        totalCount: patterns.length,
        patterns,
      });
    }
    if (path === `${API.designs}/${DESIGN_ID}`) return json(demoApp);
    return json({ patternFile: "", name: "" }, 400);
  });
  return calls;
}

const deployCall = (calls: Call[]) =>
  calls.find((c) => c.url.pathname === `/${API.designDeploy}`);

async function failure(args: string[]): Promise<AxiError> {
  const error = await designCommand(args).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AxiError);
  return error as AxiError;
}

afterEach(() => {
  setServerFetcher(undefined);
  setServerAuth(undefined);
});

describe("design deploy", () => {
  it("POSTs the design to the resolved context and reports each component", async () => {
    const calls = server({});
    const out = await designCommand(["deploy", "demo-app"]);

    const call = deployCall(calls);
    expect(call?.method).toBe("POST");
    expect(call?.url.searchParams.get("contexts")).toBe(CONTEXT_ID);
    expect(call?.url.searchParams.get("verify")).toBe("true");
    expect(call?.url.searchParams.has("dryRun")).toBe(false);
    expect(call?.body).toEqual({ patternFile, patternId: DESIGN_ID });

    expect(out).toContain("results[3]{component,kind,context,success,error}:");
    expect(out).toContain("demo-app,Deployment,minikube,true,null");
    expect(out).toContain("failed: 0");
    expect(out).toContain(`mesheryctl-axi design undeploy ${DESIGN_ID}`);
  });

  it("looks a UUID up directly without searching", async () => {
    const calls = server({});
    await designCommand(["deploy", DESIGN_ID]);
    expect(calls[0].url.pathname).toBe(`/${API.designs}/${DESIGN_ID}`);
    expect(calls[0].url.searchParams.has("search")).toBe(false);
  });

  it("ignores a failed prerequisite, which the server carries on past", async () => {
    server({
      deploy: {
        ...deployed,
        "ns-prerequisite": summary("Namespace", "default", {
          Success: false,
          IsPrerequisite: true,
        }),
      },
    });
    const out = await designCommand(["deploy", "demo-app"]);
    expect(out).not.toContain("Namespace");
    expect(out).toContain("failed: 0");
  });

  it("raises a partial failure carrying every row", async () => {
    server({ deploy: failedDeploy });
    const error = await failure(["deploy", "demo-app"]);
    expect(error).toBeInstanceOf(AxiPartialFailureError);
    expect(error.code).toBe("PARTIAL_FAILURE");
    expect(error.message).toBe("1 of 3 components failed deploy");
    const { results } = error as AxiPartialFailureError;
    expect(results).toContain("demo-app,Deployment,minikube,true,null");
    expect(results).toContain("port is required");
    expect(results).toContain("failed: 1");
    expect(error.suggestions.join()).toContain("design undeploy");
  });

  it("prints results and exits non-zero on a partial failure", async () => {
    server({ deploy: failedDeploy });
    let out = "";
    const previous = process.exitCode;
    try {
      await main({
        argv: ["design", "deploy", "demo-app"],
        stdout: { write: (text: string) => ((out += text), true) },
      });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previous;
    }
    expect(out).toContain("demo-app-config,ConfigMap,minikube,true,null");
    expect(out).toContain("code: PARTIAL_FAILURE");
    expect(out.indexOf("results[3]")).toBeLessThan(out.indexOf("error:"));
  });

  it("surfaces the reason from a MeshKit error", async () => {
    server({
      deployStatus: 500,
      deploy: {
        error: 'Unable to deploy the selected design "demo-app"',
        code: "meshery-server-1073",
        longDescription: [
          "invalid component configuration for demo-app: /spec/replicas type should be integer",
        ],
      },
    });
    const error = await failure(["deploy", "demo-app"]);
    expect(error.message).toContain("/spec/replicas type should be integer");
  });
});

describe("design deploy --dry-run", () => {
  it("asks for a dry run", async () => {
    const calls = server({ deploy: dryRunOk });
    await designCommand(["deploy", "demo-app", "--dry-run"]);
    const params = deployCall(calls)?.url.searchParams;
    expect(params?.get("dryRun")).toBe("true");
    expect(params?.get("verify")).toBe("true");
  });

  it("rejects --dry-run=value without making a deploy call", async () => {
    const calls = server({ deploy: dryRunOk });
    for (const value of ["--dry-run=true", "--dry-run=false"]) {
      const error = await failure(["deploy", "demo-app", value]);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain("--dry-run does not take a value");
    }
    expect(deployCall(calls)).toBeUndefined();
  });

  it("marks a component the server overwrote as unverified, not passed", async () => {
    server({ deploy: dryRunOk });
    const out = await designCommand(["deploy", "demo-app", "--dry-run"]);
    expect(out).toContain("results[3]");
    expect(out).toContain("demo-app,Service,minikube,true,null");
    expect(out).toMatch(/demo-app,Deployment,minikube,null,"no dry-run result/);
    expect(out).toContain("unverified: 1");
    expect(out).toContain(`mesheryctl-axi design deploy ${DESIGN_ID}`);
  });

  it("does not expect a result for an annotation component", async () => {
    const withLabel = JSON.stringify({
      components: [
        {
          id: "label",
          displayName: "note",
          metadata: { isAnnotation: true },
          component: { kind: "Comment" },
        },
      ],
    });
    server({
      designs: [{ ...demoApp, patternFile: withLabel }],
      deploy: { dryRunResponse: {} },
    });
    const out = await designCommand(["deploy", "demo-app", "--dry-run"]);
    expect(out).toContain("results: 0");
  });

  it("reports a failed component's cause and does not suggest deploying", async () => {
    server({ deploy: dryRunFailed });
    const error = await failure(["deploy", "demo-app", "--dry-run"]);
    expect(error).toBeInstanceOf(AxiPartialFailureError);
    expect((error as AxiPartialFailureError).results).toContain("no-such-ns");
    expect(error.suggestions.join()).not.toContain("design deploy");
  });

  it("rejects a response without dry-run results", async () => {
    server({ deploy: {} });
    const error = await failure(["deploy", "demo-app", "--dry-run"]);
    expect(error.message).toContain("Unexpected dry-run response");
  });
});

describe("design undeploy", () => {
  it("sends DELETE, without dryRun or verify", async () => {
    const calls = server({});
    const out = await designCommand(["undeploy", "demo-app"]);
    const call = deployCall(calls);
    expect(call?.method).toBe("DELETE");
    expect(call?.url.searchParams.has("dryRun")).toBe(false);
    expect(call?.url.searchParams.has("verify")).toBe(false);
    expect(call?.body).toEqual({ patternFile, patternId: DESIGN_ID });
    expect(out).toContain("action: undeploy");
  });

  it("rejects --dry-run", async () => {
    const calls = server({});
    const error = await failure(["undeploy", "demo-app", "--dry-run"]);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(calls).toHaveLength(0);
  });
});

describe("design lookup", () => {
  it("requires a design", async () => {
    const calls = server({});
    for (const sub of ["evaluate", "deploy", "undeploy"]) {
      expect((await failure([sub])).code).toBe("VALIDATION_ERROR");
    }
    expect(calls).toHaveLength(0);
  });

  it("matches names exactly", async () => {
    const calls = server({
      designs: [{ ...demoApp, id: "other", name: "demo-app-2" }],
    });
    const error = await failure(["deploy", "demo-app"]);
    expect(error.code).toBe("NOT_FOUND");
    expect(deployCall(calls)).toBeUndefined();
  });

  it("refuses an ambiguous name and lists the IDs", async () => {
    const calls = server({
      designs: [demoApp, { ...demoApp, id: "second-id" }],
    });
    const error = await failure(["deploy", "demo-app"]);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(DESIGN_ID);
    expect(error.message).toContain("second-id");
    expect(deployCall(calls)).toBeUndefined();
  });

  it("treats the HTTP 400 returned for an unknown ID as not found", async () => {
    const calls = server({});
    const error = await failure([
      "deploy",
      "00000000-1111-2222-3333-444444444444",
    ]);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe(
      "Design not found: 00000000-1111-2222-3333-444444444444",
    );
    expect(deployCall(calls)).toBeUndefined();
  });

  it("treats a stored design with no content as not found", async () => {
    server({ designs: [{ ...demoApp, patternFile: "" }] });
    expect((await failure(["deploy", "demo-app"])).code).toBe("NOT_FOUND");
  });
});

describe("Kubernetes context selection", () => {
  const other = {
    id: "aaaa",
    name: "kind-dev",
    connectionId: "aaaa-connection",
  };

  it.each([
    ["name", "kind-dev"],
    ["context ID", "aaaa"],
    ["connection ID", "aaaa-connection"],
  ])("selects by %s", async (_label, flag) => {
    const calls = server({ contexts: [minikube, other] });
    await designCommand(["deploy", "demo-app", "--context", flag]);
    expect(deployCall(calls)?.url.searchParams.get("contexts")).toBe("aaaa");
  });

  it("accepts --context=value and keeps it in suggestions", async () => {
    server({ contexts: [minikube, other] });
    const out = await designCommand([
      "deploy",
      "demo-app",
      "--context=kind-dev",
    ]);
    expect(out).toContain(`design undeploy ${DESIGN_ID} --context kind-dev`);
  });

  it("does not read the --context value as the design", async () => {
    const calls = server({});
    await designCommand(["deploy", "--context", "minikube", "demo-app"]);
    expect(calls[0].url.searchParams.get("search")).toBe("demo-app");
  });

  it("fails before deploying when no cluster is connected", async () => {
    const calls = server({ contexts: [] });
    const error = await failure(["deploy", "demo-app"]);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain("No Kubernetes cluster");
    expect(deployCall(calls)).toBeUndefined();
  });

  it("requires --context when several clusters are connected", async () => {
    const calls = server({ contexts: [minikube, other] });
    const error = await failure(["deploy", "demo-app"]);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("minikube");
    expect(error.message).toContain("kind-dev");
    expect(deployCall(calls)).toBeUndefined();
  });

  it("names the available contexts when --context matches none", async () => {
    const calls = server({});
    const error = await failure(["deploy", "demo-app", "--context", "nope"]);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain("minikube");
    expect(deployCall(calls)).toBeUndefined();
  });

  it("rejects --context without a value", async () => {
    const calls = server({});
    const error = await failure(["deploy", "demo-app", "--context"]);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.suggestions).toContain("mesheryctl-axi design deploy --help");
    expect(calls).toHaveLength(0);
  });
});

describe("design evaluate", () => {
  it("posts the parsed design and renders its actions", async () => {
    const calls = server({});
    const out = await designCommand(["evaluate", "demo-app"]);

    const call = calls.find((c) => c.url.pathname === `/${API.designEvaluate}`);
    expect(call?.method).toBe("POST");
    expect(call?.body).toEqual({ design: JSON.parse(patternFile) });

    expect(out).toContain("actions[2]{op,target,change}:");
    expect(out).toContain("add_component,Container containers.0,null");
    expect(out).toContain(
      "update_relationship,6325d8d9-e948-4709-aa86-d3287df2db8c,/status -> approved",
    );
    expect(out).toContain(`design deploy ${DESIGN_ID} --dry-run`);
  });

  it("renders the definitive empty state", async () => {
    for (const actions of [[], null]) {
      server({ evaluate: { actions } });
      expect(await designCommand(["evaluate", "demo-app"])).toContain(
        "actions: 0",
      );
    }
  });

  it("rejects an unexpected response", async () => {
    server({ evaluate: { actions: "nope" } });
    const error = await failure(["evaluate", "demo-app"]);
    expect(error.message).toContain("Unexpected evaluation response");
  });

  it("rejects unknown flags", async () => {
    const calls = server({});
    const error = await failure(["evaluate", "demo-app", "--context", "x"]);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(calls).toHaveLength(0);
  });
});
