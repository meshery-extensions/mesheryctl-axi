import { AxiError } from "./errors.js";
import { loadMesheryAuth, type ResolvedMesheryAuth } from "./config.js";

export type ServerGetOptions = {
  path: string;
  query?: Record<string, string | number | undefined>;
  /** Skip auth cookies (e.g. /api/system/version). */
  anonymous?: boolean;
  auth?: ResolvedMesheryAuth;
};

export type ServerFetcher = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

let fetcherOverride: ServerFetcher | undefined;
let authOverride: ResolvedMesheryAuth | undefined;

/** Inject fetch for tests. */
export function setServerFetcher(fetcher: ServerFetcher | undefined): void {
  fetcherOverride = fetcher;
}

/** Inject resolved auth for tests (skips config/token files). */
export function setServerAuth(auth: ResolvedMesheryAuth | undefined): void {
  authOverride = auth;
}

function buildUrl(
  endpoint: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const base = endpoint.replace(/\/$/, "");
  const rel = path.replace(/^\//, "");
  const url = new URL(`${base}/${rel}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * GET JSON from Meshery Server using the same cookie auth mesheryctl uses.
 * List paths use this interim bridge until mesheryctl lists support -o json
 * (meshery/meshery#21893).
 */
export async function serverGetJson<T = unknown>(
  options: ServerGetOptions,
): Promise<T> {
  const auth =
    options.auth ??
    authOverride ??
    (options.anonymous
      ? await loadMesheryAuth().catch(() => null)
      : await loadMesheryAuth());

  // Anonymous version probe still needs an endpoint; fall back to localhost.
  const endpoint =
    auth?.context.endpoint ??
    process.env["MESHERY_ENDPOINT"]?.replace(/\/$/, "") ??
    "http://localhost:9081";

  const url = buildUrl(endpoint, options.path, options.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (!options.anonymous && auth) {
    // Cookie names match mesheryctl pkg/utils AddAuthDetails.
    headers["Cookie"] =
      `token=${auth.tokenValue}; meshery-provider=${auth.providerValue}`;
  }

  const fetchImpl = fetcherOverride ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", headers });
  } catch (e) {
    throw new AxiError(
      `Unable to reach Meshery Server at ${endpoint}: ${e instanceof Error ? e.message : String(e)}`,
      "UNKNOWN",
      [
        "Ensure Meshery Server is running",
        "Check `mesheryctl system context view` endpoint",
      ],
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new AxiError(
      `Meshery authentication required (HTTP ${res.status})`,
      "AUTH_REQUIRED",
      ["Run `mesheryctl system login` (or provider login) and retry"],
    );
  }
  if (res.status === 404) {
    throw new AxiError(`Resource not found at ${options.path}`, "NOT_FOUND");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new AxiError(
      `Meshery Server error HTTP ${res.status}: ${body || res.statusText}`,
      "UNKNOWN",
    );
  }

  const text = await res.text();
  if (!text.trim()) {
    throw new AxiError("Unexpected empty Meshery Server response", "UNKNOWN");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AxiError(
      `Unexpected Meshery Server response: ${text.slice(0, 200)}`,
      "UNKNOWN",
    );
  }
}

/**
 * Convert 1-based user --page to mesheryctl's zero-based API page.
 * Defaults to page 0 / pagesize 10 when unset (mesheryctl display defaults).
 */
export function listQueryFromFlags(args: {
  page?: string;
  pagesize?: string;
}): { page: number; pagesize: number } {
  const pageOneBased = args.page ? Number.parseInt(args.page, 10) : 1;
  const pagesize = args.pagesize ? Number.parseInt(args.pagesize, 10) : 10;
  const page = Number.isFinite(pageOneBased)
    ? Math.max(0, pageOneBased - 1)
    : 0;
  return {
    page,
    pagesize: Number.isFinite(pagesize) && pagesize > 0 ? pagesize : 10,
  };
}
