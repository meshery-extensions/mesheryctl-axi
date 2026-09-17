import { AxiError, exitCodeForError } from "axi-sdk-js";

export type ErrorCode =
  | "NOT_FOUND"
  | "AUTH_REQUIRED"
  | "VALIDATION_ERROR"
  | "MESHERYCTL_NOT_INSTALLED"
  | "MESHERYCTL_INCOMPATIBLE"
  | "UNKNOWN";

export { AxiError, exitCodeForError };

/** Minimum mesheryctl release this wrapper targets for view -o json paths. */
export const REQUIRED_MESHERYCTL_HINT = "v1.0.69+";

export function mesheryctlNotInstalledError(): AxiError {
  return new AxiError(
    "mesheryctl is not installed — see https://docs.meshery.io/installation (set MESHERYCTL_BIN to override)",
    "MESHERYCTL_NOT_INSTALLED",
    [
      "Install mesheryctl: https://docs.meshery.io/installation",
      "Or set MESHERYCTL_BIN to an executable mesheryctl binary",
    ],
  );
}

export function mesheryctlIncompatibleError(detail: string): AxiError {
  return new AxiError(detail, "MESHERYCTL_INCOMPATIBLE", [
    `Upgrade mesheryctl to ${REQUIRED_MESHERYCTL_HINT} (or newer)`,
    "Install: https://docs.meshery.io/installation",
    "List/status reporting uses the Meshery Server API when the CLI lacks -o json",
  ]);
}

export function mapMesheryctlError(stderr: string, exitCode: number): AxiError {
  const text = stderr.trim();
  const first = text.split("\n")[0] ?? "";

  if (/unknown flag|unknown command|unknown shorthand/i.test(text)) {
    return mesheryctlIncompatibleError(
      first ||
        `mesheryctl rejected a flag/command (need ${REQUIRED_MESHERYCTL_HINT})`,
    );
  }
  if (/auth|login|token|unauthorized|unauthenticated/i.test(text)) {
    return new AxiError(
      first || "Meshery authentication required",
      "AUTH_REQUIRED",
      ["Run `mesheryctl system login` (or provider login) and retry"],
    );
  }
  if (/not found|no such|does not exist/i.test(text)) {
    return new AxiError(first || "Resource not found", "NOT_FOUND");
  }
  return new AxiError(
    first || `mesheryctl exited with code ${exitCode}`,
    "UNKNOWN",
  );
}
