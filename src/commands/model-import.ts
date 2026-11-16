import { AxiError } from "../errors.js";
import { mesheryctlRaw, type ExecResult } from "../mesheryctl.js";

/** One import source, always passed as data to execFile. */
export function modelImportArgv(args: string[]): string[] {
  const [flag, value] = args;
  let source: string | undefined;
  if (args.length === 2 && (flag === "-f" || flag === "--file") && !value.startsWith("-")) {
    source = value;
  } else if (args.length === 1 && (flag.startsWith("-f=") || flag.startsWith("--file="))) {
    source = flag.slice(flag.indexOf("=") + 1);
  }
  if (!source?.trim()) {
    throw new AxiError(
      "Model import requires exactly one source: mesheryctl-axi model import -f <source>",
      "VALIDATION_ERROR",
    );
  }
  return ["model", "import", "--file", source];
}

/** Preserve both streams: mesheryctl may print entity errors and still exit zero. */
export async function runModelImport(args: string[]): Promise<ExecResult> {
  const result = await mesheryctlRaw(modelImportArgv(args));
  if (result.exitCode === 0 && !result.stdout.trim() && !result.stderr.trim()) {
    throw new AxiError(
      "mesheryctl returned no import report. Check the registry before retrying.",
      "UNKNOWN",
    );
  }
  return result;
}
