import { afterEach, describe, expect, it } from "vitest";
import { setMesheryctlRunner } from "../src/mesheryctl.js";
import { main } from "../src/cli.js";

afterEach(() => {
  setMesheryctlRunner(undefined);
});

describe("cli main", () => {
  it("unknown flag yields non-zero via thrown AxiError path in command", async () => {
    // Exercise formatError path by capturing stdout from main when a command throws.
    // runAxiCli catches errors and writes TOON - we assert via argv routing.
    let written = "";
    const stdout = {
      write: (chunk: string) => {
        written += chunk;
        return true;
      },
    };

    // Patch process.exitCode indirectly: runAxiCli sets exit and writes error output.
    const prevExitCode = process.exitCode;
    setMesheryctlRunner(async () => ({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    }));

    await main({ argv: ["connection", "list", "--totally-unknown"], stdout });

    expect(written).toContain("error");
    expect(written).toContain("VALIDATION_ERROR");
    expect(written).toContain("--totally-unknown");
    expect(written).toContain(
      "help[2]:\n  mesheryctl-axi connection list [flags]",
    );
    // exitCode should be non-zero after error formatting
    expect(Number(process.exitCode ?? 0)).toBeGreaterThan(0);
    process.exitCode = prevExitCode;
  });

  it("home writes description/bin header plus help", async () => {
    let written = "";
    const stdout = {
      write: (chunk: string) => {
        written += chunk;
        return true;
      },
    };
    setMesheryctlRunner(async () => ({
      stdout: "",
      stderr: "nope",
      exitCode: 1,
    }));
    await main({ argv: [], stdout });
    expect(written.toLowerCase()).toContain("description");
    expect(written).toMatch(/help\[\d+\]:/);
  });
});
