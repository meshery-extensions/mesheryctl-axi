import { DESCRIPTION } from "./cli.js";

// Trigger string Claude Code (and other agents) match against to auto-load the skill.
// Kept terse and outcome-focused so it fires on "needs Meshery" intents.
export const SKILL_DESCRIPTION =
  "Operate Meshery through the mesheryctl-axi CLI - connections, system context and status, designs, models, and components with token-efficient TOON reporting. " +
  "Use whenever a task touches Meshery: listing or viewing connections, checking system status or context, working with designs, models, or components, " +
  "or invoking any other mesheryctl operation through the agent-ergonomic wrapper.";

export const SKILL_AUTHOR = "Meshery Authors";

// Extended frontmatter read by Nous Research's Hermes Agent harness
// (https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).
// Harnesses that don't know these fields (e.g. Claude Code) ignore them.
export const HERMES_TAGS = [
  "meshery",
  "kubernetes",
  "service-mesh",
  "cli",
  "devops",
];
export const HERMES_CATEGORY = "devops";

// Hard cap so a future regeneration cannot silently re-inflate the stub with
// CLI-owned instructions. Home, `--help`, and per-command help are the
// source of truth.
export const MAX_SKILL_MARKDOWN_CHARS = 2500;

function yamlDoubleQuote(value: string): string {
  return JSON.stringify(value);
}

/**
 * Render the installable SKILL.md for the mesheryctl-axi skill.
 *
 * This is a discovery stub, not a copy of CLI guidance. Installed skills go
 * stale; `mesheryctl-axi` (home), `mesheryctl-axi --help`, and
 * `mesheryctl-axi <command> --help` do not. Keep the body to what
 * mesheryctl-axi is, when to reach for it, and pointers at those commands.
 *
 * @returns full SKILL.md contents including YAML frontmatter
 */
export function createSkillMarkdown(): string {
  const markdown = `---
name: mesheryctl-axi
description: ${yamlDoubleQuote(SKILL_DESCRIPTION)}
user-invocable: false
author: ${SKILL_AUTHOR}
metadata:
  hermes:
    tags: [${HERMES_TAGS.join(", ")}]
    category: ${HERMES_CATEGORY}
---

# mesheryctl-axi

${DESCRIPTION}

Use mesheryctl-axi whenever a task touches Meshery: connections, system status and context, designs, models, or components.

## Current guidance lives in the CLI

Do not follow command, flag, or workflow instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- \`npx -y mesheryctl-axi\` for the content-first home (live context and system status)
- \`npx -y mesheryctl-axi --help\` for global flags and the command index
- \`npx -y mesheryctl-axi <command> --help\` for per-command usage
`;

  if (markdown.length > MAX_SKILL_MARKDOWN_CHARS) {
    throw new Error(
      `generated skill markdown is ${markdown.length} chars, above the ${MAX_SKILL_MARKDOWN_CHARS} cap`,
    );
  }

  return markdown;
}
