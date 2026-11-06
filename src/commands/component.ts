import { getPositional, rejectUnknownFlags } from "../args.js";
import { AxiError } from "../errors.js";
import { selectFields } from "../fields.js";
import { asObject, mesheryctlJson } from "../mesheryctl.js";
import { API } from "../paths.js";
import {
  listQueryFromFlags,
  listTotal,
  nextPage,
  serverGetJson,
} from "../server.js";
import { getSuggestions } from "../suggestions.js";
import {
  emptyState,
  field,
  renderDetail,
  renderHelp,
  renderList,
  renderListCounts,
  renderOutput,
  type FieldDef,
} from "../toon.js";

export const COMPONENT_FLAGS: Record<string, readonly string[]> = {
  list: ["--page", "--pagesize", "--limit", "--fields", "--full"],
  view: ["--fields", "--full"],
};

export const COMPONENT_HELP = `usage: mesheryctl-axi component <subcommand>
subcommands[2]:
  list, view
flags{list}:
  --page, --pagesize, --limit, --fields, --full
flags{view}:
  --fields, --full
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

/**
 * argv the wrapper sends to `mesheryctl component view`.
 * Exported so the mesheryctl contract suite can check it against a real binary.
 */
export function componentViewArgv(name: string, format: string): string[] {
  return ["component", "view", name, "--output-format", format];
}

function normalizeComponent(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const model = item["model"];
  const modelObj =
    typeof model === "object" && model !== null
      ? (model as Record<string, unknown>)
      : undefined;
  const modelName =
    modelObj !== undefined
      ? (modelObj["name"] ?? modelObj["Name"])
      : model;
  const nestedModel =
    typeof modelObj?.["model"] === "object" && modelObj?.["model"] !== null
      ? (modelObj["model"] as Record<string, unknown>)
      : undefined;
  const modelReleaseVersion =
    nestedModel?.["version"] ?? nestedModel?.["Version"];

  const compObj =
    typeof item["component"] === "object" && item["component"] !== null
      ? (item["component"] as Record<string, unknown>)
      : undefined;
  const resourceVersion =
    compObj?.["version"] ??
    compObj?.["apiVersion"] ??
    compObj?.["api_version"];

  const kind =
    compObj?.["kind"] ??
    compObj?.["Kind"] ??
    item["kind"] ??
    item["Kind"];

  const apiVersion =
    resourceVersion ??
    item["apiVersion"] ??
    item["api_version"];

  const version =
    modelReleaseVersion ??
    resourceVersion ??
    item["version"];

  return {
    name:
      item["name"] ??
      item["displayName"] ??
      item["DisplayName"] ??
      item["Name"],
    kind,
    model: modelName,
    version,
    apiVersion,
  };
}

async function listComponents(args: string[]): Promise<string> {
  const schema = selectFields(args, listSchema, viewSchema, "component list");
  const q = listQueryFromFlags(args);
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.components,
    query: { page: q.page, pagesize: q.pagesize },
  });
  const raw = Array.isArray(payload["components"])
    ? (payload["components"] as Record<string, unknown>[])
    : [];
  const items = raw.map(normalizeComponent);
  const isEmpty = items.length === 0;
  const total = listTotal(payload);
  return renderOutput([
    renderListCounts(items.length, total),
    isEmpty
      ? emptyState("components")
      : renderList("components", items, schema),
    renderHelp(
      getSuggestions({
        domain: "component",
        action: "list",
        isEmpty,
        nextPage: nextPage(q.page, q.pagesize, items.length, total),
        nextPageFlags:
          q.pagesize === 10 ? [] : ["--pagesize", String(q.pagesize)],
      }),
    ),
  ]);
}

async function viewComponent(args: string[]): Promise<string> {
  const schema = selectFields(args, viewSchema, viewSchema, "component view");
  const name = getPositional(args, 0, ["--fields"]);
  if (!name) {
    throw new AxiError(
      "Component name is required: mesheryctl-axi component view <name>",
      "VALIDATION_ERROR",
    );
  }
  const payload = await mesheryctlJson(componentViewArgv(name, "json"));
  return renderOutput([
    renderDetail("component", normalizeComponent(asObject(payload)), schema),
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
      rejectUnknownFlags(
        args.slice(1),
        COMPONENT_FLAGS.list,
        "component",
        "list",
      );
      return listComponents(args.slice(1));
    case "view":
      rejectUnknownFlags(
        args.slice(1),
        COMPONENT_FLAGS.view,
        "component",
        "view",
      );
      return viewComponent(args.slice(1));
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Available subcommands: list, view",
        "mesheryctl-axi component --help",
      ]);
  }
}
