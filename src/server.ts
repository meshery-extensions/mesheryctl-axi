import { AxiError } from "./errors.js";
import { loadMesheryAuth, type ResolvedMesheryAuth } from "./config.js";

export type ServerGetOptions = {
  path: string;
  query?: Record<string, string | number | readonly string[] | undefined>;
  /** Skip auth cookies (e.g. /api/system/version). */
  anonymous?: boolean;
  /** Extra HTTP statuses this endpoint uses for a missing resource. */
  notFoundStatuses?: readonly number[];
  auth?: ResolvedMesheryAuth;
};

export type ServerRequestOptions = ServerGetOptions & {
  method?: "GET" | "POST" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
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
  query?: Record<string, string | number | readonly string[] | undefined>,
): string {
  const base = endpoint.replace(/\/$/, "");
  const rel = path.replace(/^\//, "");
  const url = new URL(`${base}/${rel}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== "") url.searchParams.append(k, item);
        }
      } else if (v !== undefined && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

/** Read pagination total from current and legacy Meshery response envelopes. */
export function listTotal(
  payload: Record<string, unknown>,
): number | undefined {
  const value =
    payload["totalCount"] ?? payload["total_count"] ?? payload["total"];
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return undefined;
  }
  const total = typeof value === "number" ? value : Number(value);
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
  const hasMore =
    fullPage && (total === undefined || (page + 1) * pageSize < total);
  return hasMore ? page + 2 : undefined;
}

/**
 * Readable text for a failed request. Meshery reports failures as a MeshKit
 * JSON error whose useful reason is in longDescription, so prefer that over
 * the raw body.
 */
function serverErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const summary = typeof parsed["error"] === "string" ? parsed["error"] : "";
    const detail = Array.isArray(parsed["longDescription"])
      ? parsed["longDescription"].filter(Boolean).join("; ")
      : "";
    const text = [summary, detail].filter(Boolean).join(": ");
    if (text) return text;
  } catch {
    // Not JSON; fall through to the raw body.
  }
  return body.slice(0, 200);
}

/**
 * Call Meshery Server and parse its JSON reply, using the same cookie auth
 * mesheryctl uses. Commands use this interim bridge where mesheryctl cannot
 * give structured output or lacks a flag (e.g. meshery/meshery#21893).
 */
export async function serverRequestJson<T = unknown>(
  options: ServerRequestOptions,
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
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!options.anonymous && auth) {
    const target = new URL(url);
    const host = target.hostname;
    const loopback =
      host === "localhost" ||
      host === "localhost." ||
      host === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(host);
    if (target.protocol !== "https:" && !(target.protocol === "http:" && loopback)) {
      throw new AxiError(
        "Authenticated Meshery Server requests require HTTPS for non-loopback endpoints",
        "VALIDATION_ERROR",
        ["Configure an HTTPS endpoint in `mesheryctl system context`"],
      );
    }
    // Cookie names match mesheryctl pkg/utils AddAuthDetails.
    headers["Cookie"] =
      `token=${auth.tokenValue}; meshery-provider=${auth.providerValue}`;
  }

  const fetchImpl = fetcherOverride ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
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
  if (res.status === 404 || options.notFoundStatuses?.includes(res.status)) {
    throw new AxiError(`Resource not found at ${options.path}`, "NOT_FOUND");
  }
  if (!res.ok) {
    const detail = serverErrorDetail(await res.text());
    throw new AxiError(
      `Meshery Server error HTTP ${res.status}: ${detail || res.statusText}`,
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

/** GET JSON from Meshery Server. See {@link serverRequestJson}. */
export function serverGetJson<T = unknown>(
  options: ServerGetOptions,
): Promise<T> {
  return serverRequestJson<T>(options);
}

function positiveIntegerFlag(args: string[], name: string): number | undefined {
  let first: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg !== name && !arg.startsWith(`${name}=`)) continue;

    const value = arg === name ? args[i + 1] : arg.slice(name.length + 1);
    if (arg === name && value !== undefined && !value.startsWith("-")) i++;
    const number = value && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new AxiError(
        `${name} requires a positive whole number`,
        "VALIDATION_ERROR",
        [`Use ${name} <positive-integer>`],
      );
    }
    first ??= number;
  }
  return first;
}

/** Convert 1-based --page to the Server API's zero-based page. */
export function listQueryFromFlags(args: string[]): {
  page: number;
  pagesize: number;
} {
  const pageOneBased = positiveIntegerFlag(args, "--page") ?? 1;
  const requestedPageSize = positiveIntegerFlag(args, "--pagesize");
  const requestedLimit = positiveIntegerFlag(args, "--limit");
  const pagesize = requestedPageSize ?? requestedLimit ?? 10;
  return {
    page: pageOneBased - 1,
    // Meshery Server caps pageSize at 100; mirror that so next-page detection
    // uses the page size the server actually applied.
    pagesize: Math.min(pagesize, 100),
  };
}
