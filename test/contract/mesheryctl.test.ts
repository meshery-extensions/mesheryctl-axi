import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";
import { MESHERYCTL_CONTRACT_CASES } from "../../src/contract.js";
import { resolveMesheryctlBin } from "../../src/mesheryctl.js";

/**
 * Contract suite: every argv the wrapper sends to `mesheryctl` must exist on
 * a real `mesheryctl` release. Skipped unless MESHERYCTL_CONTRACT=1 so the
 * default suite stays hermetic; CI runs this file with the flag set after
 * installing the latest mesheryctl release. See issue #7.
 */
const enabled = process.env["MESHERYCTL_CONTRACT"] === "1";

interface HelpResult {
  combined: string;
  exitCode: number;
}

function runHelp(bin: string, args: string[]): Promise<HelpResult> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { encoding: "utf8" },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        resolve({
          combined: `${stdout ?? ""}\n${stderr ?? ""}`,
          exitCode: typeof code === "number" ? code : error ? 1 : 0,
        });
      },
    );
  });
}

describe.runIf(enabled)("mesheryctl argv contract", () => {
  for (const c of MESHERYCTL_CONTRACT_CASES) {
    it(`${c.axi}: mesheryctl ${c.path.join(" ")} accepts ${c.flags.join(", ")}`, async () => {
      const bin = resolveMesheryctlBin();
      const { combined, exitCode } = await runHelp(bin, [...c.path, "--help"]);
      expect(
        combined,
        `${c.axi} sends ${JSON.stringify(c.argv)} but the subcommand is missing: ${combined.slice(0, 300)}`,
      ).not.toMatch(/unknown command/i);
      expect(
        exitCode,
        `${c.axi}: mesheryctl ${c.path.join(" ")} --help exited ${exitCode}: ${combined.slice(0, 300)}`,
      ).toBe(0);
      for (const flag of c.flags) {
        expect(
          combined,
          `${c.axi} sends ${flag} but mesheryctl ${c.path.join(" ")} does not list it`,
        ).toContain(flag);
      }
    });
  }
});
