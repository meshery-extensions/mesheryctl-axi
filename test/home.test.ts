import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { homeCommand } from "../src/commands/home.js";
import { setMesheryctlRunner } from "../src/mesheryctl.js";
import { setServerAuth, setServerFetcher } from "../src/server.js";

afterEach(() => {
  setMesheryctlRunner(undefined);
  setServerFetcher(undefined);
  setServerAuth(undefined);
  delete process.env["MESHERY_CONFIG"];
});

describe("home", () => {
  it("content-first slices from config + version API", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mesheryctl-axi-home-"));
    const tokenPath = join(dir, "auth.json");
    const configPath = join(dir, "config.yaml");
    await writeFile(
      tokenPath,
      JSON.stringify({ token: "abc", "meshery-provider": "Meshery" }),
    );
    await writeFile(
      configPath,
      [
        "current-context: local",
        "contexts:",
        "  local:",
        "    endpoint: http://127.0.0.1:9081",
        "    token: default",
        "    platform: docker",
        "tokens:",
        "  - name: default",
        `    location: ${tokenPath}`,
        "",
      ].join("\n"),
    );
    process.env["MESHERY_CONFIG"] = configPath;
    setServerFetcher(async (url) => {
      expect(url).toContain("api/system/version");
      return new Response(JSON.stringify({ build: "v0.8.0" }), { status: 200 });
    });
    setMesheryctlRunner(async () => {
      throw new Error("home must not spawn mesheryctl");
    });

    const out = await homeCommand([]);
    expect(out).toContain("system_context");
    expect(out).toContain("http://127.0.0.1:9081");
    expect(out).toContain("system_status");
    expect(out).toContain("running");
    expect(out).toMatch(/help\[\d+\]:/);
  });
});
