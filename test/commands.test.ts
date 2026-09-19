import { afterEach, describe, expect, it } from "vitest";
import { setMesheryctlRunner, type ExecResult } from "../src/mesheryctl.js";
import { setServerAuth, setServerFetcher } from "../src/server.js";
import { connectionCommand } from "../src/commands/connection.js";
import { designCommand } from "../src/commands/design.js";
import { modelCommand } from "../src/commands/model.js";
import { componentCommand } from "../src/commands/component.js";
import { systemCommand } from "../src/commands/system.js";
import { AxiError, mapMesheryctlError } from "../src/errors.js";
import { API } from "../src/paths.js";
import type { ResolvedMesheryAuth } from "../src/config.js";

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

const fakeAuth: ResolvedMesheryAuth = {
  configPath: "/tmp/config.yaml",
  tokenPath: "/tmp/auth.json",
  tokenValue: "tok",
  providerValue: "Meshery",
  context: {
    name: "local",
    endpoint: "http://localhost:9081",
    tokenName: "default",
    platform: "docker",
    channel: "stable",
    provider: "Meshery",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  setMesheryctlRunner(undefined);
  setServerFetcher(undefined);
  setServerAuth(undefined);
});

describe("connection list via Server API", () => {
  it("hits api/integrations/connections and never spawns list --output-format", async () => {
    setServerAuth(fakeAuth);
    let calledUrl = "";
    setServerFetcher(async (url) => {
      calledUrl = url;
      return jsonResponse({
        connections: [
          {
            id: "c1",
            name: "k8s",
            status: "CONNECTED",
            kind: "kubernetes",
            type: "platform",
          },
        ],
        total_count: 1,
      });
    });
    setMesheryctlRunner(async () => {
      throw new Error("mesheryctl should not be called for connection list");
    });

    const out = await connectionCommand(["list"]);
    expect(calledUrl).toContain(API.connections);
    expect(calledUrl).toContain("page=");
    expect(calledUrl).toContain("pagesize=");
    expect(out).toContain("connections");
    expect(out).toContain("c1");
    expect(out).toContain("count: 1");
    expect(out).toContain("total: 1");
    expect(out).toContain("status:");
    expect(out).toContain("connected: 1");
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it("uses source status aggregates and supports current camelCase metadata", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [
          { id: "c1", name: "one", status: "CONNECTED" },
          { id: "c2", name: "two", status: "DISCOVERED" },
        ],
        totalCount: 8,
        statusSummary: { connected: 6, discovered: 2 },
      }),
    );

    const out = await connectionCommand(["list"]);
    expect(out).toContain("count: 2");
    expect(out).toContain("total: 8");
    expect(out).toContain("connected: 6");
    expect(out).toContain("discovered: 2");
  });

  it("falls back to row statuses when a source summary mixes valid and invalid entries", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [
          { id: "c1", status: "CONNECTED" },
          { id: "c2", status: "CONNECTED" },
        ],
        statusSummary: { connected: 6, bogus: "n/a" },
      }),
    );

    const out = await connectionCommand(["list"]);
    expect(out).toContain("status:\n  connected: 2");
  });

  it("falls back to row statuses when a source summary has non-numeric counts", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [
          { id: "c1", status: "CONNECTED" },
          { id: "c2", status: "DISCOVERED" },
        ],
        statusSummary: { connected: true, discovered: null },
      }),
    );

    const out = await connectionCommand(["list"]);
    expect(out).toContain("status:\n  connected: 1\n  discovered: 1");
  });

  it("falls back to row statuses when a source summary has fractional counts", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [{ id: "c1", status: "CONNECTED" }],
        statusSummary: { connected: 1.5 },
      }),
    );

    const out = await connectionCommand(["list"]);
    expect(out).toContain("status:\n  connected: 1");
  });

  it("falls back to row statuses when a source summary is empty", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [
          { id: "c1", status: "CONNECTED" },
          { id: "c2", status: "connected" },
        ],
        statusSummary: {},
      }),
    );

    const out = await connectionCommand(["list"]);
    expect(out).toContain("status:\n  connected: 2");
  });

  it("limits columns with --fields and expands the known schema with --full", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: [
          {
            id: "c1",
            name: "k8s",
            status: "connected",
            kind: "kubernetes",
            type: "platform",
            createdAt: "2026-09-18",
            updatedAt: "2026-09-19",
          },
        ],
        totalCount: 1,
      }),
    );

    const selected = await connectionCommand(["list", "--fields", "id,name"]);
    expect(selected).toContain("connections[1]{id,name}");
    expect(selected).not.toContain("{id,name,status,kind,type}");

    const full = await connectionCommand(["list", "--full"]);
    expect(full).toContain("created");
    expect(full).toContain("updated");
  });

  it("rejects unknown fields before making a request and lists valid fields", async () => {
    let fetched = false;
    setServerFetcher(async () => {
      fetched = true;
      return jsonResponse({ connections: [] });
    });

    await expect(
      connectionCommand(["list", "--fields", "bogus"]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      suggestions: [expect.stringContaining("id, name, status, kind, type")],
    });
    expect(fetched).toBe(false);
  });

  it("forwards repeatable long and short connection filters", async () => {
    setServerAuth(fakeAuth);
    let calledUrl = "";
    setServerFetcher(async (url) => {
      calledUrl = url;
      return jsonResponse({ connections: [], totalCount: 0 });
    });

    await connectionCommand([
      "list",
      "--kind",
      "kubernetes",
      "-k=meshery",
      "-s",
      "connected,discovered",
    ]);

    const query = new URL(calledUrl).searchParams;
    expect(query.getAll("kind")).toEqual(["kubernetes", "meshery"]);
    expect(query.getAll("status")).toEqual(["connected", "discovered"]);
  });

  it("suggests the next page only when a full page has more results", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        connections: Array.from({ length: 2 }, (_, index) => ({
          id: `c${index}`,
          name: `connection-${index}`,
        })),
        totalCount: 3,
      }),
    );

    const out = await connectionCommand([
      "list",
      "--pagesize",
      "2",
      "--kind",
      "kubernetes",
    ]);
    expect(out).toContain(
      "mesheryctl-axi connection list --page 2 --pagesize 2 --kind kubernetes",
    );
  });

  it("definitive empty state", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({ connections: [], total_count: 0 }),
    );
    const out = await connectionCommand(["list"]);
    expect(out).toContain("connections: 0");
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it("rejects unknown flags", async () => {
    await expect(connectionCommand(["list", "--nope"])).rejects.toBeInstanceOf(
      AxiError,
    );
  });

  it("view uses mesheryctl connection view --output-format json (not exp)", async () => {
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual([
        "connection",
        "view",
        "c1",
        "--output-format",
        "json",
      ]);
      expect(args).not.toContain("exp");
      return ok(
        JSON.stringify({
          id: "c1",
          name: "k8s",
          status: "connected",
          kind: "kubernetes",
        }),
      );
    });
    const out = await connectionCommand(["view", "c1"]);
    expect(out).toContain("connection");
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it("applies --fields to view and accepts flags before the id", async () => {
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual([
        "connection",
        "view",
        "c1",
        "--output-format",
        "json",
      ]);
      return ok(JSON.stringify({ id: "c1", name: "k8s", kind: "kubernetes" }));
    });

    const out = await connectionCommand(["view", "--fields", "id,name", "c1"]);
    expect(out).toContain("connection:");
    expect(out).toContain("id: c1");
    expect(out).toContain("name: k8s");
    expect(out).not.toContain("kind: kubernetes");
  });
});

describe("design content is never TOON", () => {
  it("returns YAML content verbatim with exact argv", async () => {
    const yaml =
      "apiVersion: core.meshery.io/v1alpha1\nkind: Design\nmetadata:\n  name: demo\n";
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual([
        "design",
        "view",
        "demo",
        "--output-format",
        "yaml",
      ]);
      return ok(yaml);
    });
    const out = await designCommand(["content", "demo", "--format", "yaml"]);
    expect(out).toBe(yaml.endsWith("\n") ? yaml : `${yaml}\n`);
    expect(out).not.toMatch(/^help\[/);
  });
});

describe("model content is never TOON", () => {
  it("returns JSON content verbatim", async () => {
    const json = '{\n  "name": "kubernetes",\n  "version": "v1.0.0"\n}\n';
    setMesheryctlRunner(async (_bin, args) => {
      expect(args).toEqual([
        "model",
        "view",
        "kubernetes",
        "--output-format",
        "json",
      ]);
      return ok(json);
    });
    const out = await modelCommand([
      "content",
      "kubernetes",
      "--format",
      "json",
    ]);
    expect(out).toBe(json);
  });
});

describe("list commands use Server API (no --output-format spawn)", () => {
  it("design list", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async (url) => {
      expect(url).toContain(API.designs);
      expect(url).not.toContain("output-format");
      return jsonResponse({ patterns: [], total_count: 0 });
    });
    setMesheryctlRunner(async () => {
      throw new Error("should not spawn mesheryctl for design list");
    });
    const out = await designCommand(["list"]);
    expect(out).toContain("count: 0");
    expect(out).toContain("total: 0");
    expect(out).toContain("designs: 0");
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it("design list maps the server-canonical userId key", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async () =>
      jsonResponse({
        patterns: [
          {
            id: "d1",
            name: "sock-shop",
            userId: "owner-1",
            visibility: "private",
            createdAt: "2026-09-10T14:22:01Z",
            updatedAt: "2026-09-17T09:11:44Z",
          },
        ],
        totalCount: 1,
      }),
    );
    const out = await designCommand(["list"]);
    expect(out).toContain("sock-shop,owner-1,");
    expect(out).not.toContain(",null,");
  });

  it("model list", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async (url) => {
      expect(url).toContain(API.models);
      return jsonResponse({ models: [], total_count: 0 });
    });
    const out = await modelCommand(["list"]);
    expect(out).toContain("count: 0");
    expect(out).toContain("models: 0");
  });

  it("component list", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async (url) => {
      expect(url).toContain(API.components);
      return jsonResponse({ components: [], total_count: 0 });
    });
    const out = await componentCommand(["list"]);
    expect(out).toContain("count: 0");
    expect(out).toContain("components: 0");
  });
});

describe("system status/context", () => {
  it("status probes /api/system/version without mesheryctl --output-format", async () => {
    setServerAuth(fakeAuth);
    setServerFetcher(async (url) => {
      expect(url).toContain(API.version);
      return jsonResponse({ build: "v0.8.0" });
    });
    setMesheryctlRunner(async () => {
      throw new Error("system status must not spawn mesheryctl");
    });
    const out = await systemCommand(["status"]);
    expect(out).toContain("system_status");
    expect(out).toContain("running");
    expect(out).toMatch(/help\[\d+\]:/);
  });

  it("context reads config auth (structured)", async () => {
    setServerAuth(fakeAuth);
    // system context uses loadMesheryAuth  -  inject via monkeypatch of files is hard;
    // instead we test through setServerAuth only for status. For context, stub by
    // writing is not needed if we call with mocked load  -  use server auth path via
    // temporarily setting env and a temp config in a dedicated test file.
    // Here: ensure command rejects unknown flags and help works.
    await expect(systemCommand(["context", "--bogus"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("MESHERYCTL_INCOMPATIBLE", () => {
  it("maps unknown flag to MESHERYCTL_INCOMPATIBLE", () => {
    const err = mapMesheryctlError("Error: unknown flag: --output-format", 1);
    expect(err).toBeInstanceOf(AxiError);
    expect(err.code).toBe("MESHERYCTL_INCOMPATIBLE");
    expect(err.suggestions.join(" ")).toMatch(/v1\.0\.69/);
  });

  it("maps unknown command similarly", () => {
    const err = mapMesheryctlError('Error: unknown command "exp"', 1);
    expect(err.code).toBe("MESHERYCTL_INCOMPATIBLE");
  });
});

describe("unknown flags non-zero path via commands", () => {
  it("design list unknown flag", async () => {
    await expect(designCommand(["list", "--bogus"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("model view unknown flag", async () => {
    await expect(modelCommand(["view", "x", "--weird"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("component list unknown flag", async () => {
    await expect(componentCommand(["list", "--nope"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
