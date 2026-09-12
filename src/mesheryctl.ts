import { execFile, type ExecFileException } from 'node:child_process';
import { AxiError, mapMesheryctlError, mesheryctlNotInstalledError } from './errors.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

/** Injectable spawn for tests. */
export type MesheryctlRunner = (
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<ExecResult>;

let runnerOverride: MesheryctlRunner | undefined;

/** Override the mesheryctl spawn implementation (tests). */
export function setMesheryctlRunner(runner: MesheryctlRunner | undefined): void {
  runnerOverride = runner;
}

/** Override the wrapped `mesheryctl` binary. Unset or blank keeps PATH lookup. */
export function resolveMesheryctlBin(): string {
  const fromEnv = process.env['MESHERYCTL_BIN']?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'mesheryctl';
}

function missingMesheryctlError(): AxiError {
  const overridden = process.env['MESHERYCTL_BIN']?.trim();
  if (overridden) {
    return new AxiError(
      `MESHERYCTL_BIN is not an executable mesheryctl binary: ${overridden}`,
      'MESHERYCTL_NOT_INSTALLED'
    );
  }
  return mesheryctlNotInstalledError();
}

/** Always-non-interactive child env. */
function childEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Discourage interactive prompts in mesheryctl / dependent libraries.
    CI: process.env['CI'] ?? '1',
    MESHERYCTL_AXI: '1',
    TERM: process.env['TERM'] ?? 'dumb'
  };
}

function defaultRunner(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<ExecResult> {
  return new Promise((resolve) => {
    // execFile does not attach a TTY; combined with CI/TERM=dumb this stays non-interactive.
    execFile(
      bin,
      args,
      {
        maxBuffer: MAX_BUFFER_BYTES,
        env,
        encoding: 'utf8'
      },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ stdout: '', stderr: 'ENOENT', exitCode: 127 });
          return;
        }
        const code = error?.code;
        const exitCode = typeof code === 'number' ? code : error ? 1 : 0;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode
        });
      }
    );
  });
}

async function run(args: string[]): Promise<ExecResult> {
  const bin = resolveMesheryctlBin();
  const env = childEnv();
  const runner = runnerOverride ?? defaultRunner;
  return runner(bin, args, env);
}

/** Execute mesheryctl and return parsed JSON. */
export async function mesheryctlJson<T = unknown>(args: string[]): Promise<T> {
  const result = await run(args);
  if (result.stderr === 'ENOENT') throw missingMesheryctlError();
  if (result.exitCode !== 0)
    throw mapMesheryctlError(result.stderr || result.stdout, result.exitCode);
  const text = result.stdout.trim();
  if (!text) {
    throw new AxiError('Unexpected empty mesheryctl JSON output', 'UNKNOWN');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AxiError(`Unexpected mesheryctl output: ${text.slice(0, 200)}`, 'UNKNOWN');
  }
}

/** Execute mesheryctl and return raw stdout (for YAML/JSON content retrieve). */
export async function mesheryctlExec(args: string[]): Promise<string> {
  const result = await run(args);
  if (result.stderr === 'ENOENT') throw missingMesheryctlError();
  if (result.exitCode !== 0)
    throw mapMesheryctlError(result.stderr || result.stdout, result.exitCode);
  return result.stdout;
}

/** Execute mesheryctl without throwing on non-zero (best-effort home slices). */
export async function mesheryctlRaw(args: string[]): Promise<ExecResult> {
  const result = await run(args);
  if (result.stderr === 'ENOENT') throw missingMesheryctlError();
  return result;
}

/**
 * Normalize mesheryctl JSON list payloads into a plain array.
 * Handles: bare arrays, `{ connections: [...] }`, `{ data: [...] }`, etc.
 */
export function asArray(payload: unknown, preferredKeys: string[] = []): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as Record<string, unknown>[];
      }
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        return value as Record<string, unknown>[];
      }
    }
  }
  return [];
}

/**
 * Normalize a single-item JSON payload into one object.
 */
export function asObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return payload[0] as Record<string, unknown>;
  }
  return {};
}
