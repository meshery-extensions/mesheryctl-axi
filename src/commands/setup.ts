import { AxiError, installSessionStartHooks } from "axi-sdk-js";
import { renderHelp, renderOutput } from "../toon.js";

export const SETUP_HELP = `usage: mesheryctl-axi setup hooks
Install or repair agent SessionStart hooks for mesheryctl-axi ambient context.

examples:
  mesheryctl-axi setup hooks
`;

export async function setupCommand(args: string[]): Promise<string> {
  if (args.length !== 1 || args[0] !== "hooks") {
    throw new AxiError("Unknown setup action", "VALIDATION_ERROR", [
      "Run `mesheryctl-axi setup hooks`",
    ]);
  }

  installSessionStartHooks();

  return renderOutput([
    "hooks:\n  status: installed\n  integrations: Claude Code, Codex, OpenCode",
    renderHelp([
      "Restart your agent session to receive mesheryctl-axi ambient context",
    ]),
  ]);
}
