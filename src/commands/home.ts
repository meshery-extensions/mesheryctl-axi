import { encode } from "@toon-format/toon";
import { tryLoadMesheryAuth } from "../config.js";
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
];

/**
 * Content-first home (no args).
 * axi-sdk-js prepends bin + description; we add best-effort system slices + help[].
 */
export async function homeCommand(_args: string[]): Promise<string> {
  const blocks: string[] = [];
  const auth = await tryLoadMesheryAuth();

  if (auth) {
    blocks.push(
      renderDetail(
        "system_context",
        {
          name: auth.context.name,
          endpoint: auth.context.endpoint,
          token: auth.context.tokenName,
          platform: auth.context.platform ?? null,
        },
        contextSchema,
      ),
    );
  } else {
    blocks.push(encode({ system_context: "unavailable" }));
  }

  try {
    const ver = await serverGetJson<Record<string, unknown>>({
      path: API.version,
      anonymous: true,
      ...(auth ? { auth } : {}),
    });
    const version =
      (ver["build"] as string | undefined) ??
      (ver["version"] as string | undefined) ??
      null;
    blocks.push(
      renderDetail(
        "system_status",
        {
          status: "running",
          version,
          platform: auth?.context.platform ?? null,
          provider: auth?.context.provider ?? null,
          endpoint: auth?.context.endpoint ?? null,
        },
        statusSchema,
      ),
    );
  } catch {
    blocks.push(
      encode({
        system_status: auth ? "unreachable" : "unavailable",
      }),
    );
  }

  blocks.push(renderHelp(getSuggestions({ domain: "home", action: "home" })));
  return renderOutput(blocks);
}
