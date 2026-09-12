import { getFlag, getPositional, rejectUnknownFlags } from "../args.js";
import { AxiError } from "../errors.js";
import { asArray, asObject, mesheryctlExec, mesheryctlJson } from "../mesheryctl.js";
import { getSuggestions } from "../suggestions.js";
import {
  emptyState,
  field,
  renderDetail,
  renderHelp,
  renderList,
  renderOutput,
  type FieldDef,
} from "../toon.js";

export const DESIGN_FLAGS: Record<string, readonly string[]> = {
  list: ["--page", "--pagesize", "--limit"],
  view: [],
  content: ["--format"],
};

export const DESIGN_HELP = `usage: mesheryctl-axi design <subcommand>
subcommands[3]:
  list, view, content
flags{list}:
  --page, --pagesize, --limit
flags{content}:
  --format yaml|json (default yaml)
notes:
  content returns schema-faithful YAML/JSON - never TOON
examples:
  mesheryctl-axi design list
  mesheryctl-axi design view <name>
  mesheryctl-axi design content <name> --format yaml
`;

const listSchema: FieldDef[] = [
  field("id"),
  field("name"),
  field("user_id", "user"),
  field("created_at", "created"),
  field("updated_at", "updated"),
];

const viewSchema: FieldDef[] = [
  field("id"),
  field("name"),
  field("user_id", "user"),
  field("visibility"),
  field("created_at", "created"),
  field("updated_at", "updated"),
];

async function listDesigns(args: string[]): Promise<string> {
  const mArgs = ["design", "list"];
  const page = getFlag(args, "--page");
  const pagesize = getFlag(args, "--pagesize") ?? getFlag(args, "--limit");
  if (page) mArgs.push("--page", page);
  if (pagesize) mArgs.push("--pagesize", pagesize);

  const payload = await mesheryctlJson(mArgs);
  const items = asArray(payload, ["designs", "patterns", "data", "results"]);
  const isEmpty = items.length === 0;
  return renderOutput([
    isEmpty ? emptyState("designs") : renderList("designs", items, listSchema),
    renderHelp(getSuggestions({ domain: "design", action: "list", isEmpty })),
  ]);
}

async function viewDesign(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      "Design name is required: mesheryctl-axi design view <name>",
      "VALIDATION_ERROR",
    );
  }
  const payload = await mesheryctlJson([
    "design",
    "view",
    name,
    "--output-format",
    "json",
  ]);
  return renderOutput([
    renderDetail("design", asObject(payload), viewSchema),
    renderHelp(getSuggestions({ domain: "design", action: "view" })),
  ]);
}

/**
 * Schema-faithful content retrieve - YAML/JSON only, NEVER TOON-as-content.
 */
async function contentDesign(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      "Design name is required: mesheryctl-axi design content <name> [--format yaml|json]",
      "VALIDATION_ERROR",
    );
  }
  const format = (getFlag(args, "--format") ?? "yaml").toLowerCase();
  if (format !== "yaml" && format !== "json") {
    throw new AxiError(
      `--format must be yaml or json (got ${format})`,
      "VALIDATION_ERROR",
    );
  }
  // Pass through mesheryctl's output-format so content stays schema-faithful.
  const raw = await mesheryctlExec([
    "design",
    "view",
    name,
    "--output-format",
    format,
  ]);
  // Return content verbatim - do not wrap in TOON.
  return raw.endsWith("\n") ? raw : `${raw}\n`;
}

export async function designCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === "--help" || sub === "-h" || sub === undefined) {
    return DESIGN_HELP;
  }
  switch (sub) {
    case "list":
      rejectUnknownFlags(args.slice(1), DESIGN_FLAGS.list, "design", "list");
      return listDesigns(args.slice(1));
    case "view":
      rejectUnknownFlags(args.slice(1), DESIGN_FLAGS.view, "design", "view");
      return viewDesign(args.slice(1));
    case "content":
      rejectUnknownFlags(args.slice(1), DESIGN_FLAGS.content, "design", "content");
      return contentDesign(args.slice(1));
    default:
      throw new AxiError(
        `Unknown subcommand: ${sub}`,
        "VALIDATION_ERROR",
        [
          "Available subcommands: list, view, content",
          "mesheryctl-axi design --help",
        ],
      );
  }
}
