import { afterEach, describe, expect, it } from "vitest";
import { setMesheryctlRunner, type ExecResult } from "../src/mesheryctl.js";
import { setServerAuth, setServerFetcher } from "../src/server.js";
import { designCommand } from "../src/commands/design.js";
import { API } from "../src/paths.js";
import type { ResolvedMesheryAuth } from "../src/config.js";

const FULL_ID = "8c20c83f-7417-4029-9477-fb77517ede7f";

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

// mesheryctl logs the import confirmation to stderr, with stdout empty.
function imported(name: string, shortId = FULL_ID.slice(0, 8)): ExecResult {
  return {
    stdout: "",
    stderr: `The design file '${name}' has been imported. Design ID: ${shortId}\n`,
    exitCode: 0,
  };
}

const patternFile = `name: demo-app
components:
  - component: { kind: ConfigMap }
  - component: { kind: Deployment }
  - component: { kind: Service }
`;

function patternsResponse(patterns: Record<string, unknown>[]): Response {
  return new Response(
    JSON.stringify({ page: 0, pageSize: 100, totalCount: patterns.length, patterns }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function serverWith(patterns: Record<string, unknown>[]): string[] {
  const urls: string[] = [];
  setServerAuth(fakeAuth);
  setServerFetcher(async (url) => {
    urls.push(url);
    return patternsResponse(patterns);
  });
  return urls;
}

afterEach(() => {
  setMesheryctlRunner(undefined);
  setServerFetcher(undefined);
  setServerAuth(undefined);
});

describe("design import", () => {
  it("imports a file, maps the source type, and resolves the full ID", async () => {
    let argv: string[] = [];
    setMesheryctlRunner(async (_bin, args) => {
      argv = args;
      return imported("demo-app");
    });
    const urls = serverWith([
      { id: FULL_ID, name: "demo-app", patternFile },
      { id: "11111111-0000-0000-0000-000000000000", name: "demo-app-old" },
    ]);

    const out = await designCommand([
      "import",
      "-f",
      "demo-app.yaml",
      "-s",
      "manifest",
      "-n",
      "demo-app",
    ]);

    expect(argv).toEqual([
      "design",
      "import",
      "--file",
      "demo-app.yaml",
      "--source-type",
      "Kubernetes Manifest",
      "--name",
      "demo-app",
    ]);
    expect(urls[0]).toContain(API.designs);
    expect(urls[0]).toContain("search=demo-app");
    expect(out).toContain(`id: ${FULL_ID}`);
    expect(out).toContain("name: demo-app");
    expect(out).toContain("components: 3");
    expect(out).toContain("help[2]:");
    expect(out).toContain(`mesheryctl-axi design view ${FULL_ID}`);
    expect(out).toContain(
      `mesheryctl-axi design content ${FULL_ID} --format yaml`,
    );
  });

  it("passes a URL through unchanged and accepts long flag names", async () => {
    const url = "https://raw.githubusercontent.com/org/repo/main/app.yaml";
    let argv: string[] = [];
    setMesheryctlRunner(async (_bin, args) => {
      argv = args;
      return imported("from-url");
    });
    serverWith([{ id: FULL_ID, name: "from-url", patternFile }]);

    const out = await designCommand([
      "import",
      `--file=${url}`,
      "--source-type",
      "Helm Chart",
      "--name",
      "from-url",
    ]);

    expect(argv).toEqual([
      "design",
      "import",
      "--file",
      url,
      "--source-type",
      "Helm Chart",
      "--name",
      "from-url",
    ]);
    expect(out).toContain(`id: ${FULL_ID}`);
  });

  it("without --name, uses the name mesheryctl reports", async () => {
    let argv: string[] = [];
    setMesheryctlRunner(async (_bin, args) => {
      argv = args;
      return imported("my app.yaml");
    });
    serverWith([{ id: FULL_ID, name: "my app.yaml", patternFile }]);

    const out = await designCommand(["import", "-f", "my app.yaml"]);

    expect(argv).toEqual(["design", "import", "--file", "my app.yaml"]);
    expect(out).toContain("name: my app.yaml");
  });

  it("requires -f before spawning mesheryctl", async () => {
    let spawned = false;
    setMesheryctlRunner(async () => {
      spawned = true;
      return imported("x");
    });
    await expect(designCommand(["import", "-n", "x"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(designCommand(["import", "-f"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(spawned).toBe(false);
  });

  it("rejects an unknown source type before spawning mesheryctl", async () => {
    let spawned = false;
    setMesheryctlRunner(async () => {
      spawned = true;
      return imported("x");
    });
    await expect(
      designCommand(["import", "-f", "a.yaml", "-s", "terraform"]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("design, manifest, helm, compose"),
    });
    expect(spawned).toBe(false);
  });

  it("rejects inherited object keys as source types", async () => {
    let spawned = false;
    setMesheryctlRunner(async () => {
      spawned = true;
      return imported("x");
    });
    for (const s of ["constructor", "toString", "__proto__"]) {
      await expect(
        designCommand(["import", "-f", "a.yaml", "-s", s]),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(spawned).toBe(false);
  });

  it("pages through search results to find the imported design", async () => {
    setMesheryctlRunner(async () => imported("demo-app"));
    const filler = Array.from({ length: 100 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      name: `demo-app-${i}`,
    }));
    const urls: string[] = [];
    setServerAuth(fakeAuth);
    setServerFetcher(async (url) => {
      urls.push(url);
      const page = new URL(url).searchParams.get("page");
      const patterns =
        page === "0" ? filler : [{ id: FULL_ID, name: "demo-app", patternFile }];
      return new Response(
        JSON.stringify({ page: Number(page), pageSize: 100, totalCount: 101, patterns }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const out = await designCommand(["import", "-f", "a.yaml", "-n", "demo-app"]);

    expect(urls).toHaveLength(2);
    expect(out).toContain(`id: ${FULL_ID}`);
  });

  it("maps a mesheryctl failure to a structured error", async () => {
    setMesheryctlRunner(async () => ({
      stdout: "",
      stderr: "Error: file does not exist\n",
      exitCode: 1,
    }));
    await expect(
      designCommand(["import", "-f", "missing.yaml"]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fails clearly on unexpected mesheryctl output", async () => {
    setMesheryctlRunner(async () => ({
      stdout: "something else\n",
      stderr: "",
      exitCode: 0,
    }));
    await expect(
      designCommand(["import", "-f", "a.yaml"]),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("something else"),
    });
  });

  it("errors when no server design matches the name and ID prefix", async () => {
    setMesheryctlRunner(async () => imported("demo-app"));
    serverWith([
      { id: "ffffffff-0000-0000-0000-000000000000", name: "demo-app" },
      { id: FULL_ID, name: "demo-app-2" },
    ]);
    await expect(
      designCommand(["import", "-f", "a.yaml", "-n", "demo-app"]),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("no matching design"),
    });
  });

  it("errors instead of guessing when several designs match", async () => {
    setMesheryctlRunner(async () => imported("demo-app"));
    const other = "8c20c83f-0000-0000-0000-000000000000";
    serverWith([
      { id: FULL_ID, name: "demo-app" },
      { id: other, name: "demo-app" },
    ]);
    await expect(
      designCommand(["import", "-f", "a.yaml", "-n", "demo-app"]),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining(other),
    });
  });

  it("uses the first of repeated aliases in command-line order", async () => {
    let argv: string[] = [];
    setMesheryctlRunner(async (_bin, args) => {
      argv = args;
      return imported("first");
    });
    serverWith([{ id: FULL_ID, name: "first", patternFile }]);

    await designCommand([
      "import",
      "-f",
      "first.yaml",
      "--file",
      "second.yaml",
      "--name=first",
      "-n",
      "second",
    ]);

    expect(argv).toEqual([
      "design",
      "import",
      "--file",
      "first.yaml",
      "--name",
      "first",
    ]);
  });

  it("accepts hyphen-leading values for -f and -n", async () => {
    let argv: string[] = [];
    setMesheryctlRunner(async (_bin, args) => {
      argv = args;
      return imported("-draft");
    });
    serverWith([{ id: FULL_ID, name: "-draft", patternFile }]);

    const out = await designCommand(["import", "-f", "-", "-n", "-draft"]);

    expect(argv).toEqual([
      "design",
      "import",
      "--file",
      "-",
      "--name",
      "-draft",
    ]);
    expect(out).toContain(`id: ${FULL_ID}`);
  });

  it("treats a following known flag as a missing value", async () => {
    await expect(
      designCommand(["import", "-f", "a.yaml", "-n", "-s", "manifest"]),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("requires a value"),
    });
  });

  it("rejects unknown flags", async () => {
    await expect(
      designCommand(["import", "-f", "a.yaml", "--bogus"]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
