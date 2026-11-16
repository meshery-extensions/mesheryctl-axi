export type SuggestionContext = {
  domain: "home" | "connection" | "system" | "design" | "model" | "component";
  action: string;
  isEmpty?: boolean;
  nextPage?: number;
  nextPageFlags?: readonly string[];
  /** Concrete resource name or ID to put in suggestions instead of <name>. */
  name?: string;
  /** Kubernetes context the command targeted, kept in follow-up commands. */
  context?: string;
};

/** Quote a value for a suggested shell command when it needs quoting. */
export function suggestionValue(value: string): string {
  return /^[A-Za-z0-9._:/-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Contextual next-step suggestions for help[] on success. */
export function getSuggestions(ctx: SuggestionContext): string[] {
  const { domain, action, isEmpty, nextPage, nextPageFlags = [] } = ctx;
  const name = ctx.name === undefined ? "<name>" : suggestionValue(ctx.name);
  const context =
    ctx.context === undefined
      ? ""
      : ` --context ${suggestionValue(ctx.context)}`;
  const hints: string[] = [];

  if (domain === "home") {
    return [
      "mesheryctl-axi connection list",
      "mesheryctl-axi system status",
      "mesheryctl-axi design list",
      "mesheryctl-axi model list",
    ];
  }

  if (isEmpty) {
    hints.push(
      `No ${domain} resources found - create one with mesheryctl or Meshery UI`,
    );
  }

  switch (domain) {
    case "connection":
      if (action === "list") hints.push("mesheryctl-axi connection view <id>");
      else hints.push("mesheryctl-axi connection list");
      break;
    case "system":
      if (action === "status") hints.push("mesheryctl-axi system context");
      else hints.push("mesheryctl-axi system status");
      break;
    case "design":
      if (action === "list") {
        hints.push("mesheryctl-axi design view <name>");
        hints.push("mesheryctl-axi design content <name> --format yaml");
      } else if (action === "view") {
        hints.push("mesheryctl-axi design content <name> --format yaml");
        hints.push("mesheryctl-axi design list");
      } else if (action === "import") {
        hints.push(`mesheryctl-axi design view ${name}`);
        hints.push(`mesheryctl-axi design content ${name} --format yaml`);
      } else if (action === "evaluate") {
        hints.push(`mesheryctl-axi design deploy ${name} --dry-run${context}`);
        hints.push(`mesheryctl-axi design content ${name} --format yaml`);
      } else if (action === "dry-run") {
        hints.push(`mesheryctl-axi design deploy ${name}${context}`);
      } else if (action === "deploy") {
        hints.push(`mesheryctl-axi design undeploy ${name}${context}`);
        hints.push(`mesheryctl-axi design view ${name}`);
      } else if (action === "undeploy") {
        hints.push(`mesheryctl-axi design deploy ${name}${context}`);
      } else {
        hints.push("mesheryctl-axi design list");
      }
      break;
    case "model":
      if (action === "list") {
        hints.push("mesheryctl-axi model view <name>");
        hints.push("mesheryctl-axi model content <name> --format json");
      } else if (action === "view") {
        hints.push("mesheryctl-axi model content <name> --format json");
        hints.push("mesheryctl-axi model list");
      } else {
        hints.push("mesheryctl-axi model list");
      }
      break;
    case "component":
      if (action === "list") hints.push("mesheryctl-axi component view <name>");
      else hints.push("mesheryctl-axi component list");
      break;
  }

  if (nextPage !== undefined) {
    const suffix =
      nextPageFlags.length > 0 ? ` ${nextPageFlags.join(" ")}` : "";
    hints.push(`mesheryctl-axi ${domain} list --page ${nextPage}${suffix}`);
  }

  return hints;
}
