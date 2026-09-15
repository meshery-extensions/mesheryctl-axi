import { getFlag, getPositional, rejectUnknownFlags } from "../args.js";
import { AxiError } from "../errors.js";
import { asObject, mesheryctlJson } from "../mesheryctl.js";
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

export const COMPONENT_FLAGS: Record<string, readonly string[]> = {
  list: ["--page", "--pagesize", "--limit"],
  view: [],
};

export const COMPONENT_HELP = `usage: mesheryctl-axi component <subcommand>
subcommands[2]:
  list, view
flags{list}:
  --page, --pagesize, --limit
examples:
  mesheryctl-axi component list
  mesheryctl-axi component view <name>
`;

const listSchema: FieldDef[] = [
  field("name"),
  field("kind"),
  field("model"),
  field("version"),
];

const viewSchema: FieldDef[] = [
  field("name"),
  field("kind"),
  field("model"),
  field("version"),
  field("apiVersion", "api_version"),
];

function normalizeComponent(item: Record<string, unknown>): Record<string, unknown> {
  const model = item["model"];
  const modelName =
    typeof model === "object" && model !== null
      ? ((model as Record<string, unknown>)["name"] ??
        (model as Record<string, unknown>)["Name"])
      : model;
  const component = item["component"];
  const version =
    item["version"] ??
    (typeof component === "object" && component !== null
      ? (component as Record<string, unknown>)["version"]
      : undefined);
  return {
    name: item["name"] ?? item["displayName"] ?? item["DisplayName"] ?? item["Name"],
    kind: item["kind"] ?? item["Kind"],
    model: modelName,
    version,
    apiVersion: item["apiVersion"] ?? item["api_version"],
  };
}

async function listComponents(args: string[]): Promise<string> {
  const q = listQueryFromFlags({
    page: getFlag(args, "--page"),
    pagesize: getFlag(args, "--pagesize") ?? getFlag(args, "--limit"),
  });
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.components,
    query: { page: q.page, pagesize: q.pagesize },
  });
  const raw = Array.isArray(payload["components"])
    ? (payload["components"] as Record<string, unknown>[])
    : [];
  const items = raw.map(normalizeComponent);
  const isEmpty = items.length === 0;
  return renderOutput([
    isEmpty
      ? emptyState("components")
      : renderList("components", items, listSchema),
    renderHelp(
      getSuggestions({ domain: "component", action: "list", isEmpty }),
    ),
  ]);
}

async function viewComponent(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      "Component name is required: mesheryctl-axi component view <name>",
      "VALIDATION_ERROR",
    );
  }
  const payload = await mesheryctlJson([
    "component",
    "view",
    name,
    "--output-format",
    "json",
  ]);
  return renderOutput([
    renderDetail(
      "component",
      normalizeComponent(asObject(payload)),
      viewSchema,
    ),
    renderHelp(getSuggestions({ domain: "component", action: "view" })),
  ]);
}

export async function componentCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === "--help" || sub === "-h" || sub === undefined) {
    return COMPONENT_HELP;
  }
  switch (sub) {
    case "list":
      rejectUnknownFlags(args.slice(1), COMPONENT_FLAGS.list, "component", "list");
      return listComponents(args.slice(1));
    case "view":
      rejectUnknownFlags(args.slice(1), COMPONENT_FLAGS.view, "component", "view");
      return viewComponent(args.slice(1));
    default:
      throw new AxiError(
        `Unknown subcommand: ${sub}`,
        "VALIDATION_ERROR",
        [
          "Available subcommands: list, view",
          "mesheryctl-axi component --help",
        ],
      );
  }
}
