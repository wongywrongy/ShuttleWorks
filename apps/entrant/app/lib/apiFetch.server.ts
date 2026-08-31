/**
 * Node's outbound HTTP to FastAPI — reads only, credentials never.
 *
 * **Why this is not `frontend/src/api/client.ts`** (spec §4). That module is
 * browser-coupled six ways over, and every one of them is per-tab state that
 * a shared node process would smear across concurrent entrants:
 *   - a Zustand toast singleton (`client.ts:6`, `:397`)
 *   - a module-scoped `stateEtags` Map (`:265`)
 *   - a module singleton export (`:1682`)
 *   - `withCredentials: true` (`:456`)
 *   - `window.dispatchEvent` on 401 (`:384-391`)
 *   - a relative base URL (`:79`), meaningless with no document to resolve it
 * `.dependency-cruiser.cjs`'s `entrant-no-operator-frontend` rule makes
 * reaching for it an error rather than a judgement call.
 *
 * **The header allowlist is the design.** Spec §3 rules out a deputy: every
 * entrant *write* goes browser → nginx → FastAPI directly, so nothing here
 * ever needs a cookie. Headers are BUILT rather than forwarded — an
 * allowlist cannot leak a header nobody remembered to strip — and the
 * response is reduced to parsed JSON so a `Set-Cookie` has nowhere to go.
 *
 * The only module-scoped value is frozen; everything else lives on the call
 * stack, so two concurrent requests share nothing.
 */

export const OUTBOUND_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  accept: 'application/json',
});

/** A non-2xx from FastAPI, carrying the structured payload's `code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    // Constructed, never copied from upstream: a bare `HTTPException(detail=
    // "…")`, a 422 validation list or an unhandled 500 can carry a path or a
    // stack frame, and an ErrorBoundary that renders `err.message` would then
    // put it on a public page. Callers branch on `status`/`code` and write
    // their own copy.
    super(`API responded ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The internal API origin. Absent is a deploy fault, not a default. */
export function apiBaseUrl(): string {
  const base = process.env.API_BASE_URL;
  if (!base) {
    throw new Error('API_BASE_URL is not set. The entrant server cannot reach the API.');
  }
  return base.replace(/\/+$/, '');
}

/** The `code` from `http_error`'s payload, which FastAPI nests under `detail`
 * (`apps/api/src/core/error_codes.py`, `http_error`). Anything else — a
 * plain-string `detail`, a 422 list, an empty body — is not a code we know.
 * Cited by symbol, not by line range: the old `:171-183` suffix had already
 * drifted, and a file-only citation that stays true beats one that rots. */
function errorCode(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

/** GET a public projection. There is no POST here on purpose (spec §3). */
export async function apiGet<T>(
  path: string,
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  // Pins "public projection only" in code, not just convention: a raw path
  // segment (e.g. a slug) concatenated below could otherwise steer the
  // request at a different backend route via `..` surviving URL normalization.
  // Query strings are allowed for public list projections (for example the
  // Schedule / Live filters), but fragments and dot segments are not.
  const [pathname, query = ''] = path.split('?');
  if (!/^\/e\/api\//.test(pathname) || pathname.includes('..') || query.includes('..') || path.includes('#') || path.indexOf('?') !== path.lastIndexOf('?')) {
    throw new Error(`apiGet: rejected non-public-projection path ${path}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'GET',
    // Spread, so a caller cannot mutate the shared allowlist into a leak.
    headers: { ...OUTBOUND_HEADERS },
    signal: init.signal,
    // A 3xx becomes an ApiError rather than a silent hop to wherever the
    // Location points.
    redirect: 'manual',
  });

  let parseFailed = false;
  const body: unknown = await response.json().catch(() => {
    parseFailed = true;
    return null;
  });

  if (!response.ok) {
    throw new ApiError(response.status, errorCode(body));
  }

  // A 2xx with an unparseable body (an ingress HTML page, a 204) must not
  // masquerade as `T` — that surfaces as a TypeError deep in a component
  // render instead of an ApiError at the boundary.
  if (parseFailed) {
    throw new ApiError(response.status, 'BAD_RESPONSE');
  }

  return body as T;
}
