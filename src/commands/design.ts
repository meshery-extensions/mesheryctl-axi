import { parse as parseYaml } from "yaml";
import { getFlag, getPositional, rejectUnknownFlags } from "../args.js";
import { AxiError, mapMesheryctlError } from "../errors.js";
import { selectFields } from "../fields.js";
import {
  asObject,
  mesheryctlExec,
  mesheryctlJson,
  mesheryctlRaw,
} from "../mesheryctl.js";
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

export const DESIGN_FLAGS: Record<string, readonly string[]> = {
  list: ["--page", "--pagesize", "--limit", "--fields", "--full"],
  view: ["--fields", "--full"],
  content: ["--format"],
  import: ["-f", "--file", "-s", "--source-type", "-n", "--name"],
};

export const DESIGN_HELP = `usage: mesheryctl-axi design <subcommand>
subcommands[4]:
  list, view, content, import
flags{list}:
  --page, --pagesize, --limit, --fields, --full
flags{view}:
  --fields, --full
flags{content}:
  --format yaml|json (default yaml)
flags{import}:
  -f/--file <path|url> (required), -s/--source-type design|manifest|helm|compose, -n/--name <name>
notes:
  content returns schema-faithful YAML/JSON — never TOON
  import without --name names the design after the file
examples:
  mesheryctl-axi design list
  mesheryctl-axi design view <name>
  mesheryctl-axi design content <name> --format yaml
  mesheryctl-axi design import -f app.yaml -s manifest -n my-app
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

const importSchema: FieldDef[] = [
  field("id"),
  field("name"),
  field("components"),
];

/**
 * Short source names the wrapper accepts, mapped to the design types Meshery
 * Server reports at /api/pattern/types. mesheryctl rejects the short names.
 */
const SOURCE_TYPES: Record<string, string> = {
  design: "Design",
  manifest: "Kubernetes Manifest",
  helm: "Helm Chart",
  compose: "Docker Compose",
};

/**
 * argv the wrapper sends to `mesheryctl design import`.
 * Exported so the mesheryctl contract suite can check it against a real binary.
 */
export function designImportArgv(
  file: string,
  sourceType?: string,
  name?: string,
): string[] {
  return [
    "design",
    "import",
    "--file",
    file,
    ...(sourceType ? ["--source-type", sourceType] : []),
    ...(name ? ["--name", name] : []),
  ];
}

/**
 * argv the wrapper sends to `mesheryctl design view`.
 * Exported so the mesheryctl contract suite can check it against a real binary.
 */
export function designViewArgv(name: string, format: string): string[] {
  return ["design", "view", name, "--output-format", format];
}

/** Map a design from mesheryctl or Meshery Server onto the wrapper's snake_case fields. */
function normalizeDesign(
  item: Record<string, unknown>,
): Record<string, unknown> {
  // Server-canonical spelling is camelCase userId (MesheryPattern.UserID).
  const user =
    item["user_id"] ?? item["userId"] ?? item["userID"] ?? item["UserID"];
  return {
    id: item["id"] ?? item["ID"],
    name: item["name"] ?? item["Name"],
    user_id: typeof user === "object" && user ? String(user) : user,
    visibility: item["visibility"] ?? item["Visibility"],
    created_at: item["created_at"] ?? item["createdAt"] ?? item["CreatedAt"],
    updated_at: item["updated_at"] ?? item["updatedAt"] ?? item["UpdatedAt"],
  };
}

/** Designs in a Meshery Server list response (`patterns`, or `designs` as a fallback). */
function designsFromPayload(
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(payload["patterns"])
    ? (payload["patterns"] as Record<string, unknown>[])
    : Array.isArray(payload["designs"])
      ? (payload["designs"] as Record<string, unknown>[])
      : [];
}

/** `design list`: one page of designs from Meshery Server, rendered as TOON. */
async function listDesigns(args: string[]): Promise<string> {
  const schema = selectFields(args, listSchema, viewSchema, "design list");
  // Interim Server API — mesheryctl design list has no --output-format.
  const q = listQueryFromFlags(args);
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.designs,
    query: { page: q.page, pagesize: q.pagesize },
  });
  const items = designsFromPayload(payload).map(normalizeDesign);
  const isEmpty = items.length === 0;
  const total = listTotal(payload);
  return renderOutput([
    renderListCounts(items.length, total),
    isEmpty ? emptyState("designs") : renderList("designs", items, schema),
    renderHelp(
      getSuggestions({
        domain: "design",
        action: "list",
        isEmpty,
        nextPage: nextPage(q.page, q.pagesize, items.length, total),
        nextPageFlags:
          q.pagesize === 10 ? [] : ["--pagesize", String(q.pagesize)],
      }),
    ),
  ]);
}

/** `design view <name>`: one design's metadata, rendered as TOON. */
async function viewDesign(args: string[]): Promise<string> {
  const schema = selectFields(args, viewSchema, viewSchema, "design view");
  const name = getPositional(args, 0, ["--fields"]);
  if (!name) {
    throw new AxiError(
      "Design name is required: mesheryctl-axi design view <name>",
      "VALIDATION_ERROR",
    );
  }
  const payload = await mesheryctlJson(designViewArgv(name, "json"));
  return renderOutput([
    renderDetail("design", normalizeDesign(asObject(payload)), schema),
    renderHelp(getSuggestions({ domain: "design", action: "view" })),
  ]);
}

/** `design content <name>`: the design document as raw YAML or JSON, never TOON. */
async function contentDesign(args: string[]): Promise<string> {
  const name = getPositional(args, 0, ["--format"]);
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

/**
 * Value of the first flag on the command line given under any of its names,
 * so `-f a.yaml --file b.yaml` picks a.yaml. A flag with no value is an error.
 * Only a known import flag counts as a missing value, so `-n -draft` and
 * `-f -` are accepted.
 */
function flagValue(
  args: string[],
  names: readonly string[],
  knownFlags: readonly string[] = DESIGN_FLAGS.import,
): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = names.find((n) => arg === n || arg.startsWith(`${n}=`));
    if (name === undefined) continue;
    const next = args[i + 1];
    const nextIsFlag =
      next !== undefined &&
      knownFlags.some((f) => next === f || next.startsWith(`${f}=`));
    const value =
      arg === name ? (nextIsFlag ? undefined : next) : arg.slice(name.length + 1);
    if (value === undefined || value.trim() === "") {
      throw new AxiError(
        `${names.join("/")} requires a value`,
        "VALIDATION_ERROR",
        ["mesheryctl-axi design import --help"],
      );
    }
    return value;
  }
  return undefined;
}

/**
 * Map a `--source-type` value (short name or full Meshery type, any case) to
 * the type mesheryctl expects. Throws VALIDATION_ERROR for anything else.
 */
function resolveSourceType(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const key = value.trim().toLowerCase();
  // Own keys only: `-s constructor` must not resolve to Object.prototype members.
  const sourceType = Object.hasOwn(SOURCE_TYPES, key)
    ? SOURCE_TYPES[key]
    : Object.values(SOURCE_TYPES).find((t) => t.toLowerCase() === key);
  if (!sourceType) {
    throw new AxiError(
      `--source-type must be one of ${Object.keys(SOURCE_TYPES).join(", ")} (got ${value})`,
      "VALIDATION_ERROR",
      ["mesheryctl-axi design import -f <file|url> -s manifest"],
    );
  }
  return sourceType;
}

/** Number of components in a design's patternFile, or null when unreadable. */
function componentCount(item: Record<string, unknown>): number | null {
  const patternFile = item["patternFile"] ?? item["pattern_file"];
  try {
    const doc =
      typeof patternFile === "string" ? parseYaml(patternFile) : patternFile;
    if (!doc || typeof doc !== "object") return null;
    const components = (doc as Record<string, unknown>)["components"];
    return Array.isArray(components) ? components.length : 0;
  } catch {
    return null;
  }
}

/**
 * mesheryctl prints only the first 8 characters of the new design's ID, so
 * find the full design on Meshery Server by exact name and ID prefix.
 */
async function findImportedDesign(
  name: string,
  shortId: string,
): Promise<Record<string, unknown>> {
  // search is a substring match, so read every page; the exact filter below
  // narrows it.
  const pageSize = 100;
  const items: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const payload = await serverGetJson<Record<string, unknown>>({
      path: API.designs,
      query: { search: name, order: "updated_at desc", page, pagesize: pageSize },
    });
    const pageItems = designsFromPayload(payload);
    items.push(...pageItems);
    const total = listTotal(payload);
    if (
      pageItems.length < pageSize ||
      (total !== undefined && items.length >= total)
    ) {
      break;
    }
  }
  const matches = items.filter((item) => {
    const design = normalizeDesign(item);
    return design.name === name && String(design.id ?? "").toLowerCase().startsWith(shortId.toLowerCase());
  });
  if (matches.length === 1) return matches[0];
  const reason =
    matches.length === 0
      ? "no matching design was found"
      : `${matches.length} designs match: ${matches.map((m) => normalizeDesign(m).id).join(", ")}`;
  throw new AxiError(
    `Design '${name}' was imported (ID ${shortId}…) but its full ID could not be resolved: ${reason}`,
    "UNKNOWN",
    ["mesheryctl-axi design list --fields id,name"],
  );
}

/**
 * `design import`: run `mesheryctl design import`, then look up the new design
 * on Meshery Server to report its full ID and component count.
 */
async function importDesign(args: string[]): Promise<string> {
  const file = flagValue(args, ["--file", "-f"]);
  if (!file) {
    throw new AxiError(
      "A design file or URL is required: mesheryctl-axi design import -f <file|url> [-s design|manifest|helm|compose] [-n name]",
      "VALIDATION_ERROR",
    );
  }
  const sourceType = resolveSourceType(
    flagValue(args, ["--source-type", "-s"]),
  );
  const name = flagValue(args, ["--name", "-n"]);

  const result = await mesheryctlRaw(designImportArgv(file, sourceType, name));
  if (result.exitCode !== 0) {
    throw mapMesheryctlError(result.stderr || result.stdout, result.exitCode);
  }
  // mesheryctl logs the confirmation to stderr; check both streams.
  const output = `${result.stdout}\n${result.stderr}`;
  const match = output.match(
    /The design file '(.+?)' has been imported\. Design ID: ([0-9a-f]{8})/i,
  );
  if (!match) {
    throw new AxiError(
      `Unexpected mesheryctl design import output: ${output.trim().slice(0, 200)}`,
      "UNKNOWN",
    );
  }
  const [, importedName, shortId] = match;

  const design = await findImportedDesign(importedName, shortId);
  const { id } = normalizeDesign(design);
  return renderOutput([
    renderDetail(
      "design",
      { id, name: importedName, components: componentCount(design) },
      importSchema,
    ),
    // Suggest the full ID: mesheryctl design view resolves names loosely and
    // can pick another design whose name starts with the same text.
    renderHelp(
      getSuggestions({ domain: "design", action: "import", name: String(id) }),
    ),
  ]);
}

/** Entry point for `mesheryctl-axi design`: checks flags, then dispatches to the subcommand. */
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
      rejectUnknownFlags(
        args.slice(1),
        DESIGN_FLAGS.content,
        "design",
        "content",
      );
      return contentDesign(args.slice(1));
    case "import":
      rejectUnknownFlags(
        args.slice(1),
        DESIGN_FLAGS.import,
        "design",
        "import",
        DESIGN_FLAGS.import,
      );
      return importDesign(args.slice(1));
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Available subcommands: list, view, content, import",
        "mesheryctl-axi design --help",
      ]);
  }
}
