import { runAxiCli } from 'axi-sdk-js';
import { COMPONENT_HELP, componentCommand } from './commands/component.js';
import { CONNECTION_HELP, connectionCommand } from './commands/connection.js';
import { DESIGN_HELP, designCommand } from './commands/design.js';
import { homeCommand } from './commands/home.js';
import { MODEL_HELP, modelCommand } from './commands/model.js';
import { SETUP_HELP, setupCommand } from './commands/setup.js';
import { SYSTEM_HELP, systemCommand } from './commands/system.js';
import { AxiError, AxiPartialFailureError, exitCodeForError } from './errors.js';
import { renderError } from './toon.js';
import { VERSION } from './version.js';

export const DESCRIPTION =
  'Agent ergonomic wrapper around mesheryctl. Prefer this over raw mesheryctl for agent workflows. Requires mesheryctl installed and authenticated (MESHERYCTL_BIN to override).';

export const TOP_HELP = `usage: mesheryctl-axi [command] [args] [flags]
commands[6]:
  (none)=home, connection, system, design, model, component, setup
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
  mesheryctl-axi design import -f app.yaml -s manifest -n my-app
  mesheryctl-axi design deploy my-design --dry-run
  mesheryctl-axi model content kubernetes --format json
  mesheryctl-axi component list
  mesheryctl-axi setup hooks
`;

const COMMAND_HELP: Record<string, string> = {
  connection: CONNECTION_HELP,
  system: SYSTEM_HELP,
  design: DESIGN_HELP,
  model: MODEL_HELP,
  component: COMPONENT_HELP,
  setup: SETUP_HELP,
};

type CliStdout = Pick<NodeJS.WriteStream, 'write'>;

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
      setup: setupCommand,
    },
    getCommandHelp: (command) => COMMAND_HELP[command],
    formatError: (error) => {
      const axiError =
        error instanceof AxiError
          ? error
          : new AxiError(error instanceof Error ? error.message : String(error), 'UNKNOWN');
      const results = axiError instanceof AxiPartialFailureError ? `${axiError.results}\n` : '';
      return {
        output: `${results}${renderError(axiError.message, axiError.code, axiError.suggestions)}\n`,
        exitCode: exitCodeForError(axiError),
      };
    },
  });
}
