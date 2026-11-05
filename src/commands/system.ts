import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { rejectUnknownFlags } from "../args.js";
import { loadMesheryAuth, tryLoadMesheryAuth } from "../config.js";
import { AxiError } from "../errors.js";
import { API } from "../paths.js";
import { serverGetJson } from "../server.js";
import { getSuggestions } from "../suggestions.js";
import {
  field,
  renderDetail,
  renderHelp,
  renderOutput,
  type FieldDef,
} from "../toon.js";

export const SYSTEM_FLAGS: Record<string, readonly string[]> = {
  status: [],
  context: [],
};

export const SYSTEM_HELP = `usage: mesheryctl-axi system <subcommand>
subcommands[2]:
  status, context
examples:
  mesheryctl-axi system status
  mesheryctl-axi system context
`;

const statusSchema: FieldDef[] = [
  field("status"),
  field("version"),
  field("platform"),
  field("provider"),
  field("endpoint"),
];

const contextSchema: FieldDef[] = [
  field("name"),
  field("endpoint"),
  field("token"),
  field("platform"),
  field("channel"),
];

async function resolveProvider(
  auth: Awaited<ReturnType<typeof tryLoadMesheryAuth>>,
): Promise<string> {
  // 1. Initial check from context in config.yaml
  if (auth?.context.provider && auth.context.provider.trim() !== "") {
    return auth.context.provider.trim();
  }

  // 2. Fall back to token file's meshery-provider (~/.meshery/auth.json or auth.tokenPath)
  const tokenPath = auth?.tokenPath ?? join(homedir(), ".meshery", "auth.json");
  try {
    const raw = await readFile(tokenPath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["meshery-provider", "provider"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }
  } catch {
    // Token file missing, unreadable, or invalid JSON
  }

  // 3. Fall back to server's /api/provider selection
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      serverGetJson<Record<string, unknown> | string>({
        path: API.provider,
        ...(auth ? { auth } : { anonymous: true }),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("provider request timed out")),
          3000,
        );
      }),
    ]);
    if (typeof res === "string" && res.trim() !== "") {
      return res.trim();
    }
    if (typeof res === "object" && res !== null) {
      const serverProvider =
        (res["provider"] as string | undefined) ??
        (res["meshery-provider"] as string | undefined);
      if (typeof serverProvider === "string" && serverProvider.trim() !== "") {
        return serverProvider.trim();
      }
    }
  } catch {
    // Server unreachable or endpoint absent
  } finally {
    clearTimeout(timer);
  }

  // 4. Explicit fallback state rather than null
  return "Unknown";
}

async function systemStatus(): Promise<string> {
  // mesheryctl system status has no --output-format; build structured status
  // from config + /api/system/version (never scrape tables).
  const auth = await tryLoadMesheryAuth();
  let version: string | undefined;
  let status = "unreachable";
  try {
    const ver = await serverGetJson<Record<string, unknown>>({
      path: API.version,
      anonymous: true,
      ...(auth ? { auth } : {}),
    });
    version =
      (ver["build"] as string | undefined) ??
      (ver["version"] as string | undefined) ??
      (ver["server_version"] as string | undefined) ??
      JSON.stringify(ver).slice(0, 80);
    status = "running";
  } catch {
    status = auth ? "unreachable" : "unavailable";
  }

  const provider = await resolveProvider(auth);

  const detail = renderDetail(
    "system_status",
    {
      status,
      version: version ?? null,
      platform: auth?.context.platform ?? null,
      provider,
      endpoint: auth?.context.endpoint ?? null,
    },
    statusSchema,
  );
  return renderOutput([
    detail,
    renderHelp(getSuggestions({ domain: "system", action: "status" })),
  ]);
}

async function systemContext(): Promise<string> {
  // Read structured context from mesheryctl config — no table scrape.
  const auth = await loadMesheryAuth();
  const detail = renderDetail(
    "system_context",
    {
      name: auth.context.name,
      endpoint: auth.context.endpoint,
      token: auth.context.tokenName,
      platform: auth.context.platform ?? null,
      channel: auth.context.channel ?? null,
    },
    contextSchema,
  );
  return renderOutput([
    detail,
    renderHelp(getSuggestions({ domain: "system", action: "context" })),
  ]);
}

export async function systemCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === "--help" || sub === "-h" || sub === undefined) {
    return SYSTEM_HELP;
  }
  switch (sub) {
    case "status":
      rejectUnknownFlags(
        args.slice(1),
        SYSTEM_FLAGS.status,
        "system",
        "status",
      );
      return systemStatus();
    case "context":
      rejectUnknownFlags(
        args.slice(1),
        SYSTEM_FLAGS.context,
        "system",
        "context",
      );
      return systemContext();
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Available subcommands: status, context",
        "mesheryctl-axi system --help",
      ]);
  }
}
