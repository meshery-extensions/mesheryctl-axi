import { parse as parseYaml } from "yaml";
import {
  getFlag,
  getPositional,
  hasFlag,
  rejectUnknownFlags,
} from "../args.js";
import {
  AxiError,
  AxiPartialFailureError,
  mapMesheryctlError,
} from "../errors.js";
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
  serverRequestJson,
} from "../server.js";
import { getSuggestions, suggestionValue } from "../suggestions.js";
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
  evaluate: [],
  deploy: ["--dry-run", "--context"],
  undeploy: ["--context"],
};

export const DESIGN_HELP = `usage: mesheryctl-axi design <subcommand>
subcommands[7]:
  list, view, content, import, evaluate, deploy, undeploy
flags{list}:
  --page, --pagesize, --limit, --fields, --full
flags{view}:
  --fields, --full
flags{content}:
  --format yaml|json (default yaml)
flags{import}:
  -f/--file <path|url> (required), -s/--source-type design|manifest|helm|compose, -n/--name <name>
flags{deploy}:
  --dry-run, --context <name|id>
flags{undeploy}:
  --context <name|id>
notes:
  content returns schema-faithful YAML/JSON — never TOON
  import without --name names the design after the file
  evaluate, deploy, and undeploy take a design name or ID; names must match exactly
  --context is optional when only one Kubernetes cluster is connected
  a failed component prints results[], then a PARTIAL_FAILURE error, and exits non-zero
  a dry run gives success: null for a component it could not report (shared display name)
examples:
  mesheryctl-axi design list
  mesheryctl-axi design view <name>
  mesheryctl-axi design content <name> --format yaml
  mesheryctl-axi design import -f app.yaml -s manifest -n my-app
  mesheryctl-axi design evaluate <name>
  mesheryctl-axi design deploy <name> --dry-run
  mesheryctl-axi design deploy <name> --context minikube
  mesheryctl-axi design undeploy <name>
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

const targetSchema: FieldDef[] = [
  field("id"),
  field("name"),
  field("action"),
  field("context"),
];

const resultSchema: FieldDef[] = [
  field("component"),
  field("kind"),
  field("context"),
  field("success"),
  field("error"),
];

const summarySchema: FieldDef[] = [
  field("total"),
  field("succeeded"),
  field("failed"),
  field("unverified"),
];

const actionSchema: FieldDef[] = [
  field("op"),
  field("target"),
  field("change"),
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
 * Only a flag known to the subcommand counts as a missing value, so
 * `-n -draft` and `-f -` are accepted.
 */
function flagValue(
  args: string[],
  names: readonly string[],
  sub = "import",
): string | undefined {
  const knownFlags = DESIGN_FLAGS[sub];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = names.find((n) => arg === n || arg.startsWith(`${n}=`));
    if (name === undefined) continue;
    const next = args[i + 1];
    const nextIsFlag =
      next !== undefined &&
      knownFlags.some((f) => next === f || next.startsWith(`${f}=`));
    const value =
      arg === name
        ? nextIsFlag
          ? undefined
          : next
        : arg.slice(name.length + 1);
    if (value === undefined || value.trim() === "") {
      throw new AxiError(
        `${names.join("/")} requires a value`,
        "VALIDATION_ERROR",
        [`mesheryctl-axi design ${sub} --help`],
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
 * Every design whose name contains `name`. Server search is a substring match,
 * so read every page and leave exact matching to the caller.
 */
async function searchDesigns(name: string): Promise<Record<string, unknown>[]> {
  const pageSize = 100;
  const items: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const payload = await serverGetJson<Record<string, unknown>>({
      path: API.designs,
      query: {
        search: name,
        order: "updated_at desc",
        page,
        pagesize: pageSize,
      },
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
  return items;
}

/**
 * mesheryctl prints only the first 8 characters of the new design's ID, so
 * find the full design on Meshery Server by exact name and ID prefix.
 */
async function findImportedDesign(
  name: string,
  shortId: string,
): Promise<Record<string, unknown>> {
  const items = await searchDesigns(name);
  const matches = items.filter((item) => {
    const design = normalizeDesign(item);
    return (
      design.name === name &&
      String(design.id ?? "")
        .toLowerCase()
        .startsWith(shortId.toLowerCase())
    );
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

type ResolvedDesign = { id: string; name: string; patternFile: string };

type K8sContext = { id: string; name: string; connectionId?: string };

type ResultRow = {
  component: string;
  kind: string;
  context: string;
  /** null when the server gave no result for this component. */
  success: boolean | null;
  error: string | null;
};

const DESIGN_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** NOT_FOUND for a design reference the server cannot resolve. */
function designNotFound(ref: string): AxiError {
  return new AxiError(`Design not found: ${ref}`, "NOT_FOUND", [
    "mesheryctl-axi design list --fields id,name",
  ]);
}

/** A server design record as a resolved design, or NOT_FOUND when it has no content. */
function toResolvedDesign(
  ref: string,
  item: Record<string, unknown>,
): ResolvedDesign {
  const patternFile = item["patternFile"] ?? item["pattern_file"];
  if (typeof patternFile !== "string" || patternFile.trim() === "") {
    throw designNotFound(ref);
  }
  const { id, name } = normalizeDesign(item);
  return { id: String(id ?? ref), name: String(name ?? ref), patternFile };
}

/** Find a design by ID, or by exact name so a loose match can never deploy the wrong one. */
async function resolveDesign(ref: string): Promise<ResolvedDesign> {
  if (DESIGN_UUID.test(ref)) {
    // The server answers an unknown ID with HTTP 400 and a blank design.
    const item = await serverGetJson<Record<string, unknown>>({
      path: `${API.designs}/${ref}`,
      notFoundStatuses: [400],
    }).catch((error: unknown) => {
      if (error instanceof AxiError && error.code === "NOT_FOUND") {
        throw designNotFound(ref);
      }
      throw error;
    });
    return toResolvedDesign(ref, item);
  }
  const matches = (await searchDesigns(ref)).filter(
    (item) => normalizeDesign(item).name === ref,
  );
  if (matches.length === 0) throw designNotFound(ref);
  if (matches.length > 1) {
    throw new AxiError(
      `${matches.length} designs are named '${ref}': ${matches.map((m) => normalizeDesign(m).id).join(", ")}`,
      "VALIDATION_ERROR",
      ["Pass the design ID instead of its name"],
    );
  }
  return toResolvedDesign(ref, matches[0]);
}

/**
 * Pick the Kubernetes context to target. Meshery's `contexts` query takes
 * context IDs, not connection IDs, so `--context` is resolved to one here. Fails
 * before any deploy call when no single cluster can be targeted.
 */
async function resolveK8sContext(
  flag: string | undefined,
): Promise<K8sContext> {
  const payload = await serverGetJson<Record<string, unknown>>({
    path: API.k8sContexts,
    query: { page: 0, pagesize: 100 },
  });
  const contexts = Array.isArray(payload["contexts"])
    ? (payload["contexts"] as K8sContext[])
    : [];
  if (contexts.length === 0) {
    throw new AxiError(
      "No Kubernetes cluster is connected to Meshery",
      "NOT_FOUND",
      [
        "mesheryctl-axi connection list --kind kubernetes",
        "Connect a cluster with `mesheryctl system config <platform>` and retry",
      ],
    );
  }
  const matches =
    flag === undefined
      ? contexts
      : contexts.filter(
          (c) => c.id === flag || c.name === flag || c.connectionId === flag,
        );
  if (matches.length === 1) return matches[0];
  const describe = (list: K8sContext[]) =>
    list.map((c) => `${c.name} (${c.id})`).join(", ");
  if (matches.length === 0) {
    throw new AxiError(
      `Kubernetes context not found: ${flag}. Available: ${describe(contexts)}`,
      "NOT_FOUND",
    );
  }
  throw new AxiError(
    `${matches.length} Kubernetes contexts match: ${describe(matches)}`,
    "VALIDATION_ERROR",
    ["Pass --context <id> to choose one"],
  );
}

/** Parse a design's stored document, which is YAML or JSON text. */
function parseDesign(design: ResolvedDesign): Record<string, unknown> {
  let doc: unknown;
  try {
    doc = parseYaml(design.patternFile);
  } catch (e) {
    throw new AxiError(
      `Design '${design.name}' could not be parsed: ${e instanceof Error ? e.message : String(e)}`,
      "UNKNOWN",
    );
  }
  if (!doc || typeof doc !== "object") {
    throw new AxiError(
      `Design '${design.name}' has no readable content`,
      "UNKNOWN",
    );
  }
  return doc as Record<string, unknown>;
}

/** Kind of a component in a design or dry-run result. */
function componentKind(component: Record<string, unknown>): string {
  return String(asRecord(component["component"])["kind"] ?? "");
}

/** One row per component from a deploy or undeploy response. */
export function deployRows(
  payload: Record<string, unknown>,
  context: string,
): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const systems of Object.values(payload)) {
    if (!Array.isArray(systems)) continue;
    for (const system of systems) {
      const summary = asRecord(system)["Summary"];
      if (!Array.isArray(summary)) continue;
      for (const entry of summary.map(asRecord)) {
        // The server carries on past a failed prerequisite, so it is not a result.
        if (entry["IsPrerequisite"] === true) continue;
        const success = entry["Success"] === true;
        rows.push({
          component: String(entry["CompName"] ?? ""),
          kind: String(entry["Kind"] ?? ""),
          context,
          success,
          // Error is a Go error and does not serialize usefully; Message has the text.
          error: success ? null : String(entry["Message"] || "failed"),
        });
      }
    }
  }
  return rows;
}

/** Error text from one dry-run result. */
function dryRunError(result: Record<string, unknown>): string | null {
  if (result["success"] === true) return null;
  const error = asRecord(result["error"]);
  const causes = Array.isArray(error["Causes"])
    ? error["Causes"].map((c) => asRecord(c)["Message"]).filter(Boolean)
    : [];
  return causes.length > 0
    ? causes.join("; ")
    : String(error["Status"] || "failed");
}

/**
 * One row per design component from a dry-run response. The response is keyed
 * by display name, so components that share one overwrite each other: a design
 * component with no result is reported with `success: null`, never as passed.
 */
export function dryRunRows(
  payload: Record<string, unknown>,
  context: string,
  designComponents: Record<string, unknown>[],
): ResultRow[] {
  const response = payload["dryRunResponse"];
  if (!response || typeof response !== "object") {
    throw new AxiError(
      `Unexpected dry-run response: ${JSON.stringify(payload).slice(0, 200)}`,
      "UNKNOWN",
    );
  }
  const rows: ResultRow[] = [];
  const reported = new Set<unknown>();
  for (const [name, byContext] of Object.entries(asRecord(response))) {
    for (const result of Object.values(asRecord(byContext)).map(asRecord)) {
      const component = asRecord(result["component"]);
      reported.add(component["id"]);
      rows.push({
        component: name,
        kind: componentKind(component),
        context,
        success: result["success"] === true,
        error: dryRunError(result),
      });
    }
  }
  for (const component of designComponents) {
    if (reported.has(component["id"])) continue;
    if (asRecord(component["metadata"])["isAnnotation"] === true) continue;
    rows.push({
      component: String(component["displayName"] ?? ""),
      kind: componentKind(component),
      context,
      success: null,
      error: "no dry-run result: server reports one result per display name",
    });
  }
  return rows;
}

/** `design deploy` and `design undeploy`, including `--dry-run`. */
async function runDeployment(
  args: string[],
  action: "deploy" | "undeploy",
): Promise<string> {
  const ref = getPositional(args, 0, ["--context"]);
  if (!ref) {
    throw new AxiError(
      `Design name or ID is required: mesheryctl-axi design ${action} <name|id>`,
      "VALIDATION_ERROR",
    );
  }
  const contextFlag = flagValue(args, ["--context"], action);
  // --dry-run is a bare boolean flag, like --full: the --dry-run=<value> form
  // passes flag validation but hasFlag would read it as "not a dry run", so
  // reject it here rather than silently running a real deploy.
  const dryRunValue = args.find((arg) => arg.startsWith("--dry-run="));
  if (dryRunValue) {
    throw new AxiError(
      `${dryRunValue} is invalid; --dry-run does not take a value`,
      "VALIDATION_ERROR",
      ["mesheryctl-axi design deploy <name|id> --dry-run"],
    );
  }
  const dryRun = action === "deploy" && hasFlag(args, "--dry-run");

  const design = await resolveDesign(ref);
  const context = await resolveK8sContext(contextFlag);
  const payload = await serverRequestJson<Record<string, unknown>>({
    method: action === "deploy" ? "POST" : "DELETE",
    path: API.designDeploy,
    query: {
      contexts: context.id,
      verify: action === "deploy" ? "true" : undefined,
      dryRun: dryRun ? "true" : undefined,
    },
    body: { patternFile: design.patternFile, patternId: design.id },
  });

  const components = parseDesign(design)["components"];
  const rows = dryRun
    ? dryRunRows(
        payload,
        context.name,
        Array.isArray(components) ? components.map(asRecord) : [],
      )
    : deployRows(payload, context.name);
  const failed = rows.filter((row) => row.success === false).length;
  const summary = {
    total: rows.length,
    succeeded: rows.filter((row) => row.success === true).length,
    failed,
    unverified: rows.filter((row) => row.success === null).length,
  };
  const label = dryRun ? "dry-run" : action;
  const hints = getSuggestions({
    domain: "design",
    action: label,
    name: design.id,
    context: contextFlag,
  });
  const report = [
    renderDetail(
      "design",
      { ...design, action: label, context: context.name },
      targetSchema,
    ),
    rows.length === 0
      ? emptyState("results")
      : renderList("results", rows, resultSchema),
    renderDetail("summary", summary, summarySchema),
  ];
  if (failed > 0) {
    throw new AxiPartialFailureError(
      `${failed} of ${rows.length} components failed ${label}`,
      renderOutput(report),
      dryRun
        ? [
            `mesheryctl-axi design content ${suggestionValue(design.id)} --format yaml`,
          ]
        : hints,
    );
  }
  return renderOutput([...report, renderHelp(hints)]);
}

/** One line per evaluation action. Actions either carry a whole `item` or a path update. */
function evaluationRow(
  action: Record<string, unknown>,
): Record<string, unknown> {
  const value = asRecord(action["value"]);
  const item = asRecord(value["item"]);
  const target = [
    componentKind(item) || item["kind"],
    item["displayName"] ?? item["id"] ?? value["id"],
  ]
    .filter(Boolean)
    .join(" ");
  const newValue = value["value"];
  const change =
    value["path"] === undefined
      ? null
      : `${String(value["path"])} -> ${typeof newValue === "string" ? newValue : JSON.stringify(newValue)}`.slice(
          0,
          200,
        );
  return { op: action["op"], target, change };
}

/** `design evaluate <name|id>`: run relationship evaluation and report its actions. */
async function evaluateDesign(args: string[]): Promise<string> {
  const ref = getPositional(args);
  if (!ref) {
    throw new AxiError(
      "Design name or ID is required: mesheryctl-axi design evaluate <name|id>",
      "VALIDATION_ERROR",
    );
  }
  const design = await resolveDesign(ref);
  // Server API: mesheryctl design evaluate prints its actions only as text.
  const payload = await serverRequestJson<Record<string, unknown>>({
    method: "POST",
    path: API.designEvaluate,
    body: { design: parseDesign(design) },
  });
  const actions = payload["actions"] ?? [];
  if (!Array.isArray(actions)) {
    throw new AxiError(
      `Unexpected evaluation response: ${JSON.stringify(payload).slice(0, 200)}`,
      "UNKNOWN",
    );
  }
  const rows = actions.map((a) => evaluationRow(asRecord(a)));
  return renderOutput([
    renderDetail("design", design, [field("id"), field("name")]),
    rows.length === 0
      ? emptyState("actions")
      : renderList("actions", rows, actionSchema),
    renderHelp(
      getSuggestions({ domain: "design", action: "evaluate", name: design.id }),
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
    case "evaluate":
      rejectUnknownFlags(
        args.slice(1),
        DESIGN_FLAGS.evaluate,
        "design",
        "evaluate",
      );
      return evaluateDesign(args.slice(1));
    case "deploy":
    case "undeploy":
      rejectUnknownFlags(args.slice(1), DESIGN_FLAGS[sub], "design", sub, [
        "--context",
      ]);
      return runDeployment(args.slice(1), sub);
    default:
      throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
        "Available subcommands: list, view, content, import, evaluate, deploy, undeploy",
        "mesheryctl-axi design --help",
      ]);
  }
}
