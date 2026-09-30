import { loadMesheryAuth, type ResolvedMesheryAuth } from './config.js';
import { AxiError } from './errors.js';

export type ServerGetOptions = {
  path: string;
  query?: Record<string, string | number | readonly string[] | undefined>;
  /** Skip auth cookies (e.g. /api/system/version). */
  anonymous?: boolean;
  auth?: ResolvedMesheryAuth;
};

export type ServerFetcher = (url: string, init: RequestInit) => Promise<Response>;

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
  query?: Record<string, string | number | readonly string[] | undefined>,
): string {
  const base = endpoint.replace(/\/$/, '');
  const rel = path.replace(/^\//, '');
  const url = new URL(`${base}/${rel}`);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== '') {
            url.searchParams.append(k, item);
          }
        }
      } else if (v !== undefined && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  return url.toString();
}

/** Read pagination total from current and legacy Meshery response envelopes. */
export function listTotal(payload: Record<string, unknown>): number | undefined {
  const value = payload['totalCount'] ?? payload['total_count'] ?? payload['total'];

  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return undefined;
  }

  const total = typeof value === 'number' ? value : Number(value);

  return Number.isInteger(total) && total >= 0 ? total : undefined;
}

/** Determine whether a list response has another page. */
export function nextPage(
  page: number,
  pageSize: number,
  itemCount: number,
  total?: number,
): number | undefined {
  const fullPage = itemCount === pageSize;
  const hasMore = fullPage && (total === undefined || (page + 1) * pageSize < total);

  return hasMore ? page + 2 : undefined;
}

/**
 * GET JSON from Meshery Server using the same cookie auth mesheryctl uses.
 * List paths use this interim bridge until mesheryctl lists support -o json
 * (meshery/meshery#21893).
 */
export async function serverGetJson<T = unknown>(options: ServerGetOptions): Promise<T> {
  const auth =
    options.auth ??
    authOverride ??
    (options.anonymous ? await loadMesheryAuth().catch(() => null) : await loadMesheryAuth());

  // Anonymous version probe still needs an endpoint; fall back to localhost.
  const endpoint =
    auth?.context.endpoint ??
    process.env['MESHERY_ENDPOINT']?.replace(/\/$/, '') ??
    'http://localhost:9081';

  const url = buildUrl(endpoint, options.path, options.query);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (!options.anonymous && auth) {
    // Cookie names match mesheryctl pkg/utils AddAuthDetails.
    headers['Cookie'] = `token=${auth.tokenValue}; meshery-provider=${auth.providerValue}`;
  }

  const fetchImpl = fetcherOverride ?? fetch;

  let res: Response;

  try {
    res = await fetchImpl(url, { method: 'GET', headers });
  } catch (e) {
    throw new AxiError(
      `Unable to reach Meshery Server at ${endpoint}: ${
        e instanceof Error ? e.message : String(e)
      }`,
      'UNKNOWN',
      ['Ensure Meshery Server is running', 'Check `mesheryctl system context view` endpoint'],
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new AxiError(`Meshery authentication required (HTTP ${res.status})`, 'AUTH_REQUIRED', [
      'Run `mesheryctl system login` (or provider login) and retry',
    ]);
  }

  if (res.status === 404) {
    throw new AxiError(`Resource not found at ${options.path}`, 'NOT_FOUND');
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);

    throw new AxiError(
      `Meshery Server error HTTP ${res.status}: ${body || res.statusText}`,
      'UNKNOWN',
    );
  }

  const text = await res.text();

  if (!text.trim()) {
    throw new AxiError('Unexpected empty Meshery Server response', 'UNKNOWN');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AxiError(`Unexpected Meshery Server response: ${text.slice(0, 200)}`, 'UNKNOWN');
  }
}

/**
 * Convert 1-based user --page to mesheryctl's zero-based API page.
 * Defaults to page 0 / pagesize 10 when unset (mesheryctl display defaults).
 */
export function listQueryFromFlags(args: { page?: string; pagesize?: string }): {
  page: number;
  pagesize: number;
} {
  const pageOneBased = args.page ? Number.parseInt(args.page, 10) : 1;
  const pagesize = args.pagesize ? Number.parseInt(args.pagesize, 10) : 10;

  const page = Number.isFinite(pageOneBased) ? Math.max(0, pageOneBased - 1) : 0;

  return {
    page,
    // Meshery Server caps pageSize at 100; mirror that so next-page detection
    // uses the page size the server actually applied.
    pagesize: Number.isFinite(pagesize) && pagesize > 0 ? Math.min(pagesize, 100) : 10,
  };
}
