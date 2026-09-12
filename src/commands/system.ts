import { encode } from "@toon-format/toon";
import { rejectUnknownFlags } from "../args.js";
import { AxiError } from "../errors.js";
import { asObject, mesheryctlExec, mesheryctlJson } from "../mesheryctl.js";
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
];

const contextSchema: FieldDef[] = [
  field("name"),
  field("endpoint"),
  field("token"),
  field("platform"),
  field("channel"),
];

async function systemStatus(): Promise<string> {
  let detail: string;
  try {
    const payload = await mesheryctlJson([
      "system",
      "status",
    ]);
    detail = renderDetail("system_status", asObject(payload), statusSchema);
  } catch {
    // Fallback: some mesheryctl builds lack JSON for status.
    const text = await mesheryctlExec(["system", "status"]);
    detail = encode({ system_status: text.trim().slice(0, 500) || "ok" });
  }
  return renderOutput([
    detail,
    renderHelp(getSuggestions({ domain: "system", action: "status" })),
  ]);
}

async function systemContext(): Promise<string> {
  let detail: string;
  try {
    const payload = await mesheryctlJson([
      "system",
      "context",
      "view",
    ]);
    detail = renderDetail("system_context", asObject(payload), contextSchema);
  } catch {
    const text = await mesheryctlExec(["system", "context", "view"]);
    detail = encode({ system_context: text.trim().slice(0, 500) || "none" });
  }
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
      rejectUnknownFlags(args.slice(1), SYSTEM_FLAGS.status, "system", "status");
      return systemStatus();
    case "context":
      rejectUnknownFlags(args.slice(1), SYSTEM_FLAGS.context, "system", "context");
      return systemContext();
    default:
      throw new AxiError(
        `Unknown subcommand: ${sub}`,
        "VALIDATION_ERROR",
        ["Available subcommands: status, context", "mesheryctl-axi system --help"],
      );
  }
}
