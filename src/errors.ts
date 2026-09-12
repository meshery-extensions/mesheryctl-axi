import { AxiError, exitCodeForError } from 'axi-sdk-js';

export type ErrorCode =
  'NOT_FOUND' | 'AUTH_REQUIRED' | 'VALIDATION_ERROR' | 'MESHERYCTL_NOT_INSTALLED' | 'UNKNOWN';

export { AxiError, exitCodeForError };

export function mesheryctlNotInstalledError(): AxiError {
  return new AxiError(
    'mesheryctl is not installed - see https://docs.meshery.io/installation (set MESHERYCTL_BIN to override)',
    'MESHERYCTL_NOT_INSTALLED',
    [
      'Install mesheryctl: https://docs.meshery.io/installation',
      'Or set MESHERYCTL_BIN to an executable mesheryctl binary'
    ]
  );
}

export function mapMesheryctlError(stderr: string, exitCode: number): AxiError {
  const text = stderr.trim();
  const first = text.split('\n')[0] ?? '';

  if (/auth|login|token|unauthorized|unauthenticated/i.test(text)) {
    return new AxiError(first || 'Meshery authentication required', 'AUTH_REQUIRED', [
      'Run `mesheryctl system login` (or provider login) and retry'
    ]);
  }
  if (/not found|no such|does not exist/i.test(text)) {
    return new AxiError(first || 'Resource not found', 'NOT_FOUND');
  }
  return new AxiError(first || `mesheryctl exited with code ${exitCode}`, 'UNKNOWN');
}


