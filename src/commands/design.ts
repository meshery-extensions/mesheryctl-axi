import { getFlag, getPositional, rejectUnknownFlags } from "../args.js";
import { AxiError } from "../errors.js";
import { asObject, mesheryctlExec, mesheryctlJson } from "../mesheryctl.js";
import { API } from "../paths.js";
import { listQueryFromFlags, serverGetJson } from "../server.js";
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
  content returns schema-faithful YAML/JSON — never TOON
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

/**
 * argv the wrapper sends to `mesheryctl design view`.
 * Exported so the mesheryctl contract suite can check it against a real binary.
 */
export function designViewArgv(name: string, format: string): string[] {
  return ["design", "view", name, "--output-format", format];
}

function normalizeDesign(item: Record<string, unknown>): Record<string, unknown> {
  const user = item["user_id"] ?? item["userID"] ?? item["UserID"];
  return {
    id: item["id"] ?? item["ID"],
    name: item["name"] ?? item["Name"],
    user_id: typeof user === "object" && user ? String(user) : user,
    visibility: item["visibility"] ?? item["Visibility"],
    created_at: item["created_at"] ?? item["createdAt"] ?? item["CreatedAt"],
    updated_at: item["updated_at"] ?? item["updatedAt"] ?? item["UpdatedAt"],
  };
}

async function listDesigns(args: string[]): Promise<string> {
  // Interim Server API — mesheryctl design list has no --output-format.
  const q = listQueryFromFlags({
    page: getFlag(args, "--page"),
    pagesize: getFlag(args, "--pagesize") ?? getFlag(args, "--limit"),
  });
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.designs,
    query: { page: q.page, pagesize: q.pagesize },
  });
  const raw = Array.isArray(payload["patterns"])
    ? (payload["patterns"] as Record<string, unknown>[])
    : Array.isArray(payload["designs"])
      ? (payload["designs"] as Record<string, unknown>[])
      : [];
  const items = raw.map(normalizeDesign);
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
  const payload = await mesheryctlJson(designViewArgv(name, "json"));
  return renderOutput([
    renderDetail("design", normalizeDesign(asObject(payload)), viewSchema),
    renderHelp(getSuggestions({ domain: "design", action: "view" })),
  ]);
}

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
  const raw = await mesheryctlExec(designViewArgv(name, format));
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
