import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelImport } from "../src/commands/model-import.js";
import { setMesheryctlRunner } from "../src/mesheryctl.js";

afterEach(() => setMesheryctlRunner(undefined));

describe("model import subprocess boundary", () => {
  it.each([
    [], ["-f"], ["--file="], ["-f", "  "], ["--unknown", "path"],
    ["-f", "--file"], ["-f", "one", "two"], ["-f", "one", "-f", "two"],
  ].map(args => ({ args })))("rejects $args before invoking mesheryctl", async ({ args }) => {
    const runner = vi.fn();
    setMesheryctlRunner(runner);
    await expect(runModelImport(args)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(runner).not.toHaveBeenCalled();
  });

  // The SUMMARY line is reported in issue #68. Stream placement and error
  // messages below are synthetic; these are runner tests, not envtest captures.
  const summary = "SUMMARY: Imported model infisical-operator (7 components)";
  it.each([
    { stdout: summary, stderr: "", exitCode: 0 },
    { stdout: summary, stderr: "entity registration failed", exitCode: 0 },
    { stdout: "registry diagnostic", stderr: "internal server error", exitCode: 1 },
  ])("keeps import evidence from both streams ($exitCode, $stderr)", async result => {
    const runner = vi.fn(async () => result);
    setMesheryctlRunner(runner);
    expect(await runModelImport(["-f", "./my model"])).toEqual(result);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]).toEqual([
      expect.any(String), ["model", "import", "--file", "./my model"], expect.any(Object),
    ]);
  });

  it("rejects an empty report even on exit zero", async () => {
    setMesheryctlRunner(async () => ({ stdout: " ", stderr: "", exitCode: 0 }));
    await expect(runModelImport(["--file=./model"])).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});
