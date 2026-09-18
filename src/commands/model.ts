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

export const MODEL_FLAGS: Record<string, readonly string[]> = {
  list: ["--page", "--pagesize", "--limit", "--count"],
  view: [],
  content: ["--format"],
};

export const MODEL_HELP = `usage: mesheryctl-axi model <subcommand>
subcommands[3]:
  list, view, content
flags{list}:
  --page, --pagesize, --limit, --count
flags{content}:
  --format yaml|json (default json)
notes:
  content returns schema-faithful YAML/JSON — never TOON
examples:
  mesheryctl-axi model list
  mesheryctl-axi model view <name>
  mesheryctl-axi model content <name> --format json
`;

const listSchema: FieldDef[] = [
  field("name"),
  field("version"),
  field("category"),
  field("displayname", "display"),
];

const viewSchema: FieldDef[] = [
  field("name"),
  field("version"),
  field("category"),
  field("displayname", "display"),
  field("registrant"),
];

/**
 * argv the wrapper sends to `mesheryctl model view`.
 * Exported so the mesheryctl contract suite can check it against a real binary.
 */
export function modelViewArgv(name: string, format: string): string[] {
  return ["model", "view", name, "--output-format", format];
}

function normalizeModel(item: Record<string, unknown>): Record<string, unknown> {
  const category = item["category"];
  const categoryName =
    typeof category === "object" && category !== null
      ? ((category as Record<string, unknown>)["name"] ??
        (category as Record<string, unknown>)["Name"])
      : category;
  return {
    name: item["name"] ?? item["Name"],
    version: item["version"] ?? item["Version"],
    category: categoryName,
    displayname: item["displayname"] ?? item["displayName"] ?? item["DisplayName"],
    registrant: item["registrant"] ?? item["Registrant"],
  };
}

async function listModels(args: string[]): Promise<string> {
  const q = listQueryFromFlags({
    page: getFlag(args, "--page"),
    pagesize: getFlag(args, "--pagesize") ?? getFlag(args, "--limit"),
  });
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.models,
    query: { page: q.page, pagesize: q.pagesize },
  });
  const raw = Array.isArray(payload["models"])
    ? (payload["models"] as Record<string, unknown>[])
    : [];
  const items = raw.map(normalizeModel);
  const isEmpty = items.length === 0;
  return renderOutput([
    isEmpty ? emptyState("models") : renderList("models", items, listSchema),
    renderHelp(getSuggestions({ domain: "model", action: "list", isEmpty })),
  ]);
}

async function viewModel(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      "Model name is required: mesheryctl-axi model view <name>",
      "VALIDATION_ERROR",
    );
  }
  const payload = await mesheryctlJson(modelViewArgv(name, "json"));
  return renderOutput([
    renderDetail("model", normalizeModel(asObject(payload)), viewSchema),
    renderHelp(getSuggestions({ domain: "model", action: "view" })),
  ]);
}

async function contentModel(args: string[]): Promise<string> {
  const name = getPositional(args, 0);
  if (!name) {
    throw new AxiError(
      "Model name is required: mesheryctl-axi model content <name> [--format yaml|json]",
      "VALIDATION_ERROR",
    );
  }
  const format = (getFlag(args, "--format") ?? "json").toLowerCase();
  if (format !== "yaml" && format !== "json") {
    throw new AxiError(
      `--format must be yaml or json (got ${format})`,
      "VALIDATION_ERROR",
    );
  }
  const raw = await mesheryctlExec(modelViewArgv(name, format));
  return raw.endsWith("\n") ? raw : `${raw}\n`;
}

export async function modelCommand(args: string[]): Promise<string> {
  const sub = args[0];
  if (sub === "--help" || sub === "-h" || sub === undefined) {
    return MODEL_HELP;
  }
  switch (sub) {
    case "list":
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.list, "model", "list");
      return listModels(args.slice(1));
    case "view":
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.view, "model", "view");
      return viewModel(args.slice(1));
    case "content":
      rejectUnknownFlags(args.slice(1), MODEL_FLAGS.content, "model", "content");
      return contentModel(args.slice(1));
    default:
      throw new AxiError(
        `Unknown subcommand: ${sub}`,
        "VALIDATION_ERROR",
        [
          "Available subcommands: list, view, content",
          "mesheryctl-axi model --help",
        ],
      );
  }
}
