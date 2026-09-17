import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { AxiError } from "./errors.js";

export type MesheryTokenFile = {
  token?: string;
  "meshery-provider"?: string;
};

export type MesheryContext = {
  name: string;
  endpoint: string;
  tokenName: string;
  platform?: string;
  channel?: string;
  version?: string;
  provider?: string;
};

export type ResolvedMesheryAuth = {
  context: MesheryContext;
  configPath: string;
  tokenPath: string;
  tokenValue: string;
  providerValue: string;
};

type RawConfig = {
  "current-context"?: string;
  contexts?: Record<
    string,
    {
      endpoint?: string;
      token?: string;
      platform?: string;
      channel?: string;
      version?: string;
      provider?: string;
    }
  >;
  tokens?: Array<{ name?: string; location?: string }>;
};

/** Override with MESHERY_CONFIG / MESHERYCTL_CONFIG. Default: ~/.meshery/config.yaml */
export function resolveMesheryConfigPath(): string {
  const fromEnv =
    process.env["MESHERY_CONFIG"]?.trim() ||
    process.env["MESHERYCTL_CONFIG"]?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".meshery", "config.yaml");
}

export async function loadMesheryAuth(
  configPath = resolveMesheryConfigPath(),
): Promise<ResolvedMesheryAuth> {
  let rawText: string;
  try {
    rawText = await readFile(configPath, "utf8");
  } catch {
    throw new AxiError(
      `mesheryctl config not found at ${configPath} — run mesheryctl system context create / login`,
      "AUTH_REQUIRED",
      [
        "Install and authenticate mesheryctl: https://docs.meshery.io/installation",
        "Or set MESHERY_CONFIG to your mesheryctl config.yaml",
      ],
    );
  }

  let cfg: RawConfig;
  try {
    cfg = parseYaml(rawText) as RawConfig;
  } catch (e) {
    throw new AxiError(
      `Invalid mesheryctl config YAML at ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      "UNKNOWN",
    );
  }

  const current = cfg["current-context"];
  if (!current || !cfg.contexts?.[current]) {
    throw new AxiError(
      `No valid current-context in ${configPath}`,
      "AUTH_REQUIRED",
      ["Run `mesheryctl system context view` and fix current-context"],
    );
  }

  const ctx = cfg.contexts[current];
  const endpoint = (ctx.endpoint ?? "").replace(/\/$/, "");
  if (!endpoint) {
    throw new AxiError(
      `Context ${current} has no endpoint in ${configPath}`,
      "AUTH_REQUIRED",
    );
  }

  const tokenName = ctx.token ?? "default";
  const tokenEntry = (cfg.tokens ?? []).find((t) => t.name === tokenName);
  const location = tokenEntry?.location ?? "auth.json";
  const tokenPath = isAbsolute(location)
    ? location
    : join(homedir(), ".meshery", location);

  let tokenObj: MesheryTokenFile;
  try {
    tokenObj = JSON.parse(
      await readFile(tokenPath, "utf8"),
    ) as MesheryTokenFile;
  } catch {
    throw new AxiError(
      `mesheryctl token file missing or invalid: ${tokenPath}`,
      "AUTH_REQUIRED",
      ["Run `mesheryctl system login` (or provider login) and retry"],
    );
  }

  const tokenValue = tokenObj.token ?? "";
  if (!tokenValue) {
    throw new AxiError(
      `Token file ${tokenPath} has no token field`,
      "AUTH_REQUIRED",
      ["Run `mesheryctl system login` and retry"],
    );
  }

  return {
    configPath,
    tokenPath,
    tokenValue,
    providerValue: tokenObj["meshery-provider"] ?? "Meshery",
    context: {
      name: current,
      endpoint,
      tokenName,
      platform: ctx.platform,
      channel: ctx.channel,
      version: ctx.version,
      provider: ctx.provider,
    },
  };
}

/** Best-effort context load for home (never throws). */
export async function tryLoadMesheryAuth(): Promise<ResolvedMesheryAuth | null> {
  try {
    return await loadMesheryAuth();
  } catch {
    return null;
  }
}
