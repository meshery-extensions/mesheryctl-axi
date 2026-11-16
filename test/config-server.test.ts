import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMesheryAuth } from "../src/config.js";
import { systemCommand } from "../src/commands/system.js";
import { setServerAuth, setServerFetcher } from "../src/server.js";
import { setMesheryctlRunner } from "../src/mesheryctl.js";

afterEach(() => {
  setServerAuth(undefined);
  setServerFetcher(undefined);
  setMesheryctlRunner(undefined);
  delete process.env["MESHERY_CONFIG"];
});

describe("config + system context", () => {
  it("loadMesheryAuth reads endpoint and token cookies source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mesheryctl-axi-"));
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
        "    platform: kubernetes",
        "    channel: stable",
        "tokens:",
        "  - name: default",
        `    location: ${tokenPath}`,
        "",
      ].join("\n"),
    );

    const auth = await loadMesheryAuth(configPath);
    expect(auth.context.endpoint).toBe("http://127.0.0.1:9081");
    expect(auth.tokenValue).toBe("abc");
    expect(auth.context.platform).toBe("kubernetes");
  });

  it("system context renders TOON from config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mesheryctl-axi-"));
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
        "    channel: stable",
        "tokens:",
        "  - name: default",
        `    location: ${tokenPath}`,
        "",
      ].join("\n"),
    );
    process.env["MESHERY_CONFIG"] = configPath;
    setMesheryctlRunner(async () => {
      throw new Error("context must not spawn mesheryctl");
    });

    const out = await systemCommand(["context"]);
    expect(out).toContain("system_context");
    expect(out).toContain("http://127.0.0.1:9081");
    expect(out).toContain("docker");
    expect(out).toMatch(/help\[\d+\]:/);
  });
});

/** Writes a config.yaml pointing at an auth.json with the given contents. */
async function writeConfigWithToken(tokenFile: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mesheryctl-axi-"));
  const tokenPath = join(dir, "auth.json");
  const configPath = join(dir, "config.yaml");
  await writeFile(tokenPath, JSON.stringify(tokenFile));
  await writeFile(
    configPath,
    [
      "current-context: local",
      "contexts:",
      "  local:",
      "    endpoint: http://127.0.0.1:9081",
      "    token: default",
      "tokens:",
      "  - name: default",
      `    location: ${tokenPath}`,
      "",
    ].join("\n"),
  );
  return configPath;
}

describe("loadMesheryAuth token requirements", () => {
  // mesheryctl writes an empty token for the Local provider; "None" is the
  // legacy name Meshery Server still accepts, matched case-insensitively.
  it.each(["Local", "None", "local", "NONE"])(
    "accepts an empty token for the %s provider",
    async (provider) => {
      const configPath = await writeConfigWithToken({
        token: "",
        "meshery-provider": provider,
      });

      const auth = await loadMesheryAuth(configPath);
      expect(auth.tokenValue).toBe("");
      expect(auth.providerValue).toBe(provider);
    },
  );

  it.each([
    ["an empty token", { token: "", "meshery-provider": "Meshery" }],
    ["no token field", { "meshery-provider": "Meshery" }],
    ["no provider and an empty token", { token: "" }],
  ])("rejects a remote provider with %s", async (_label, tokenFile) => {
    const configPath = await writeConfigWithToken(tokenFile);

    await expect(loadMesheryAuth(configPath)).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("keeps a non-empty token for the Local provider", async () => {
    const configPath = await writeConfigWithToken({
      token: "abc",
      "meshery-provider": "Local",
    });

    const auth = await loadMesheryAuth(configPath);
    expect(auth.tokenValue).toBe("abc");
    expect(auth.providerValue).toBe("Local");
  });
});
