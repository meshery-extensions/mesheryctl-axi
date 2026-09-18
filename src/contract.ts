import { componentViewArgv } from "./commands/component.js";
import { connectionViewArgv } from "./commands/connection.js";
import { designViewArgv } from "./commands/design.js";
import { modelViewArgv } from "./commands/model.js";

/**
 * One wrapper-to-`mesheryctl` call the contract suite checks against a real
 * binary: the subcommand path must exist and every listed flag must appear in
 * its `--help` output. `argv` is the exact argv the wrapper sends (built by
 * the same builders the commands use, so the table cannot drift from them).
 */
export interface MesheryctlContractCase {
  /** Wrapper command, used in failure messages. */
  axi: string;
  /** Subcommand path probed as `mesheryctl <path...> --help`. */
  path: string[];
  /** Flags the wrapper passes that must be accepted by that subcommand. */
  flags: string[];
  /** Representative full argv the wrapper sends. */
  argv: string[];
}

function viewCase(
  axi: string,
  path: string[],
  argv: string[],
): MesheryctlContractCase {
  return { axi, path, flags: ["--output-format"], argv };
}

/**
 * Every argv this package sends to the `mesheryctl` binary. Lists, status,
 * and context go through the Server API or local config instead (see #5), so
 * only `view` calls appear here. Add a case here whenever a command starts
 * spawning a new `mesheryctl` subcommand or flag.
 */
export const MESHERYCTL_CONTRACT_CASES: MesheryctlContractCase[] = [
  viewCase("design view", ["design", "view"], designViewArgv("<name>", "json")),
  viewCase(
    "design content",
    ["design", "view"],
    designViewArgv("<name>", "yaml"),
  ),
  viewCase("model view", ["model", "view"], modelViewArgv("<name>", "json")),
  viewCase(
    "model content",
    ["model", "view"],
    modelViewArgv("<name>", "yaml"),
  ),
  viewCase(
    "component view",
    ["component", "view"],
    componentViewArgv("<name>", "json"),
  ),
  viewCase(
    "connection view",
    ["connection", "view"],
    connectionViewArgv("<id>", "json"),
  ),
];
