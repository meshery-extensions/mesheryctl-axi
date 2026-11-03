import { AxiError } from "./errors.js";

function flagEqualsPrefix(flag: string): string {
  return `${flag}=`;
}

/** Get a flag's value from --flag value or --flag=value without modifying args. */
export function getFlag(args: string[], name: string): string | undefined {
  const equalsPrefix = flagEqualsPrefix(name);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === name) {
      if (i + 1 >= args.length) return undefined;
      return args[i + 1].startsWith("-") ? undefined : args[i + 1];
    }
    if (arg.startsWith(equalsPrefix)) {
      return arg.slice(equalsPrefix.length);
    }
  }
  return undefined;
}

/** Get all values for repeatable flags, including comma-separated values. */
export function getFlagValues(
  args: string[],
  names: readonly string[],
): string[] {
  const values: string[] = [];
  const nameSet = new Set(names);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (nameSet.has(arg)) {
      const value = args[i + 1];
      if (value !== undefined && !value.startsWith("-")) {
        values.push(
          ...value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        );
      }
      continue;
    }
    for (const name of names) {
      const prefix = flagEqualsPrefix(name);
      if (arg.startsWith(prefix)) {
        values.push(
          ...arg
            .slice(prefix.length)
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        );
        break;
      }
    }
  }
  return values;
}

/** Check if a boolean flag is present. */
export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

/** Get the sole positional argument, rejecting accidental unquoted names. */
export function getSinglePositional(
  args: string[],
  valueFlags: readonly string[],
  command: string,
): string | undefined {
  const positionals: string[] = [];
  let afterSeparator = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!afterSeparator && arg === "--") {
      afterSeparator = true;
    } else if (!afterSeparator && valueFlags.includes(arg)) {
      if (args[i + 1] !== undefined && !args[i + 1].startsWith("-")) i++;
    } else if (!afterSeparator && arg.startsWith("-")) {
      continue;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    throw new AxiError(
      `mesheryctl-axi ${command} accepts at most one positional argument`,
      "VALIDATION_ERROR",
      [`Quote names containing spaces, e.g. mesheryctl-axi ${command} "Pod Liveness"`],
    );
  }
  return positionals[0];
}

/**
 * Reject unknown flags. Positionals and --help/-h always pass; -- ends scanning.
 * Throws VALIDATION_ERROR with structured suggestions.
 */
export function rejectUnknownFlags(
  args: string[],
  known: readonly string[],
  command: string,
  sub: string,
): void {
  const knownSet = new Set(known);
  const unknown: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === "--") break;
    if (!tok.startsWith("-")) continue;
    const name = tok.split("=", 1)[0];
    if (name === "--help" || name === "-h") continue;
    if (knownSet.has(name)) continue;
    if (!unknown.includes(name)) unknown.push(name);
  }
  if (unknown.length === 0) return;
  const list = unknown.join(", ");
  throw new AxiError(
    `unknown flag${unknown.length > 1 ? "s" : ""} for mesheryctl-axi ${command} ${sub}: ${list}`,
    "VALIDATION_ERROR",
    [
      `mesheryctl-axi ${command} ${sub} [flags]`,
      `mesheryctl-axi ${command} ${sub} --help`,
    ],
  );
}
