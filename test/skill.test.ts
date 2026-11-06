import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { AxiError } from "../src/errors.js";
import { DESCRIPTION } from "../src/cli.js";
import { setupCommand, SETUP_HELP } from "../src/commands/setup.js";
import {
  createSkillMarkdown,
  HERMES_CATEGORY,
  HERMES_TAGS,
  MAX_SKILL_MARKDOWN_CHARS,
  SKILL_AUTHOR,
  SKILL_DESCRIPTION,
} from "../src/skill.js";

function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error("Missing frontmatter");
  }
  return parse(match[1], { strict: true }) as Record<string, unknown>;
}

function skillBody(markdown: string): string {
  const end = markdown.indexOf("\n---\n", 3);
  if (end < 0) {
    throw new Error("Missing frontmatter closer");
  }
  return markdown.slice(end + 5);
}

describe("createSkillMarkdown", () => {
  it("matches the committed skills/mesheryctl-axi/SKILL.md", () => {
    const committed = readFileSync(
      new URL("../skills/mesheryctl-axi/SKILL.md", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(createSkillMarkdown());
  });

  it("starts with valid YAML frontmatter and is not user-invocable", () => {
    const markdown = createSkillMarkdown();
    const frontmatter = parseFrontmatter(markdown);
    expect(frontmatter).toEqual({
      name: "mesheryctl-axi",
      description: SKILL_DESCRIPTION,
      "user-invocable": false,
      author: SKILL_AUTHOR,
      metadata: {
        hermes: {
          tags: HERMES_TAGS,
          category: HERMES_CATEGORY,
        },
      },
    });
    expect(markdown).not.toContain("$ARGUMENTS");
    expect(markdown).not.toContain("argument-hint:");
  });

  it("carries Hermes Agent metadata without env-var requirements", () => {
    const frontmatter = parseFrontmatter(createSkillMarkdown());
    const hermes = (frontmatter.metadata as { hermes: Record<string, unknown> })
      .hermes;
    expect(hermes.tags).toEqual([
      "meshery",
      "kubernetes",
      "service-mesh",
      "cli",
      "devops",
    ]);
    expect(hermes.category).toBe("devops");
    // mesheryctl-axi reads the existing mesheryctl config, not an API-key env var.
    expect(frontmatter).not.toHaveProperty("required_environment_variables");
  });

  it("stays a short stub that defers to the CLI", () => {
    const markdown = createSkillMarkdown();
    const body = skillBody(markdown);
    expect(markdown.length).toBeLessThanOrEqual(MAX_SKILL_MARKDOWN_CHARS);
    expect(body).toContain(DESCRIPTION);
    expect(body).toMatch(/whenever a task touches Meshery/i);
    expect(body).toContain("npx -y mesheryctl-axi");
    expect(body).toContain("npx -y mesheryctl-axi --help");
    expect(body).toContain("npx -y mesheryctl-axi <command> --help");
    expect(body).toMatch(/stale/i);
    expect(body).toMatch(
      /- `npx -y mesheryctl-axi <command> --help` for per-command usage\n$/,
    );
  });

  it("does not bake CLI-owned guidance into the skill", () => {
    const markdown = createSkillMarkdown();
    const body = skillBody(markdown);
    expect(body).not.toContain("connections[");
    expect(body).not.toContain("--fields");
    expect(body).not.toContain("--full");
    expect(body).not.toContain("help[]");
    expect(body).not.toMatch(/usage: mesheryctl-axi/);
  });
});

describe("setupCommand", () => {
  it("documents itself with SETUP_HELP", () => {
    expect(SETUP_HELP).toContain("usage: mesheryctl-axi setup hooks");
    expect(SETUP_HELP).toContain("mesheryctl-axi setup hooks");
  });

  it("rejects unknown setup actions with VALIDATION_ERROR", async () => {
    for (const args of [[], ["bogus"], ["hooks", "extra"]] as string[][]) {
      try {
        await setupCommand(args);
        expect.fail(`setup ${args.join(" ")} should throw`);
      } catch (e) {
        expect(e).toBeInstanceOf(AxiError);
        const err = e as AxiError;
        expect(err.code).toBe("VALIDATION_ERROR");
        expect(err.message).toContain("Unknown setup action");
        expect(err.suggestions.join(" ")).toContain("mesheryctl-axi setup hooks");
      }
    }
  });
});
