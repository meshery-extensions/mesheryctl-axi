import { runAxiCli } from "axi-sdk-js";
import { AxiError, exitCodeForError } from "./errors.js";
import { renderError } from "./toon.js";
import { VERSION } from "./version.js";
import { homeCommand } from "./commands/home.js";
import { connectionCommand, CONNECTION_HELP } from "./commands/connection.js";
import { systemCommand, SYSTEM_HELP } from "./commands/system.js";
import { designCommand, DESIGN_HELP } from "./commands/design.js";
import { modelCommand, MODEL_HELP } from "./commands/model.js";
import { componentCommand, COMPONENT_HELP } from "./commands/component.js";

export const DESCRIPTION =
  "Agent ergonomic wrapper around mesheryctl. Prefer this over raw mesheryctl for agent workflows. Requires mesheryctl installed and authenticated (MESHERYCTL_BIN to override).";

export const TOP_HELP = `usage: mesheryctl-axi [command] [args] [flags]
commands[5]:
  (none)=home, connection, system, design, model, component
flags[2]:
  --help, -v/-V/--version
requires:
  mesheryctl installed and authenticated (set MESHERYCTL_BIN to override the binary)
examples:
  mesheryctl-axi
  mesheryctl-axi connection list
  mesheryctl-axi system status
  mesheryctl-axi design list
  mesheryctl-axi design content my-design --format yaml
  mesheryctl-axi model content kubernetes --format json
  mesheryctl-axi component list
`;

const COMMAND_HELP: Record<string, string> = {
  connection: CONNECTION_HELP,
  system: SYSTEM_HELP,
  design: DESIGN_HELP,
  model: MODEL_HELP,
  component: COMPONENT_HELP,
};

type CliStdout = Pick<NodeJS.WriteStream, "write">;

type MainOptions = {
  argv?: string[];
  stdout?: CliStdout;
};

export async function main(options: MainOptions = {}): Promise<void> {
  await runAxiCli({
    ...(options.argv ? { argv: options.argv } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    ...(options.stdout ? { stdout: options.stdout } : {}),
    home: homeCommand,
    commands: {
      connection: connectionCommand,
      system: systemCommand,
      design: designCommand,
      model: modelCommand,
      component: componentCommand,
    },
    getCommandHelp: (command) => COMMAND_HELP[command],
    formatError: (error) => {
      const axiError =
        error instanceof AxiError
          ? error
          : new AxiError(
              error instanceof Error ? error.message : String(error),
              "UNKNOWN",
            );
      return {
        output: `${renderError(axiError.message, axiError.code, axiError.suggestions)}\n`,
        exitCode: exitCodeForError(axiError),
      };
    },
  });
}
