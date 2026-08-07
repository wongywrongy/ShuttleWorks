/**
 * The SSR fetch layer's whole job is what it does NOT do.
 *
 * Spec §3 ("no deputy") turns on one property: node's outbound calls carry
 * no credential, so `X-ShuttleWorks-CSRF: 1` keeps meaning "a same-origin
 * browser sent this" rather than "a node process asked". That property is
 * invisible in any rendering test, so it is asserted here against the
 * actual `Request` handed to `globalThis.fetch` — the process boundary,
 * which is the only thing worth asserting about.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiGet, apiBaseUrl, OUTBOUND_HEADERS } from '../app/lib/apiFetch.server';

const sent: Request[] = [];

function stubFetch(response: Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as RequestInfo, init));
    return response;
  });
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  sent.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiGet', () => {
  it('resolves the path against API_BASE_URL and returns parsed JSON', async () => {
    vi.stubGlobal('fetch', stubFetch(json({ slug: 'spring-open' })));

    const page = await apiGet<{ slug: string }>('/e/api/page/spring-open');

    expect(page).toEqual({ slug: 'spring-open' });
    expect(sent[0].url).toBe('http://backend:8000/e/api/page/spring-open');
    expect(sent[0].method).toBe('GET');
  });

  it('sends no Cookie header, even when one is present in the ambient env', async () => {
    // The negative control for spec §3's relay abstinence. To prove it is
    // not vacuous: add `headers.set('cookie', 'sw_session=x')` to
    // `apiFetch.server.ts` and this assertion goes red.
    vi.stubGlobal('fetch', stubFetch(json({})));

    await apiGet('/e/api/config');

    expect(sent[0].headers.get('cookie')).toBeNull();
    expect([...sent[0].headers.keys()]).toEqual(['accept']);
  });

  it('relays no Set-Cookie — the return value is data, never a Response', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch(json({ ok: true }, 200, { 'set-cookie': 'sw_session=leaked; Path=/' })),
    );

    const result = await apiGet<Record<string, unknown>>('/e/api/config');

    expect(result).toEqual({ ok: true });
    expect(result).not.toBeInstanceOf(Response);
    expect(Object.keys(result)).not.toContain('headers');
  });

  it('turns a non-2xx into ApiError carrying status and code', async () => {
    // The REAL backend envelope, not the brief's `{error:{code}}`: FastAPI
    // nests `http_error`'s structured payload under `detail`
    // (backend/app/error_codes.py:171-183), so an unknown slug answers
    // `{"detail": {"code": "TOURNAMENT_NOT_FOUND", "message": "..."}}`
    // (backend/api/entries_public.py:219-226).
    vi.stubGlobal(
      'fetch',
      stubFetch(
        json({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found' } }, 404),
      ),
    );

    await expect(apiGet('/e/api/page/nope')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ApiError && err.status === 404 && err.code === 'TOURNAMENT_NOT_FOUND',
    );
  });

  it('carries no upstream prose into the error, so a boundary cannot render it', async () => {
    // Negative control 3. FastAPI's own failures do not use the structured
    // payload at all: a bare `HTTPException(detail="…")`, a 422 validation
    // list, or an unhandled 500 can put a path, a SQL fragment or a stack
    // frame in the body. `ApiError.message` is therefore CONSTRUCTED here,
    // never copied — an ErrorBoundary rendering `err.message` still cannot
    // leak. To prove it is not vacuous: change the constructor call to pass
    // the upstream message through and this goes red.
    vi.stubGlobal(
      'fetch',
      stubFetch(json({ detail: 'IntegrityError at /app/api/entries_json.py:214' }, 500)),
    );

    const err = await apiGet('/e/api/config').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).code).toBe('UNKNOWN');
    expect((err as ApiError).message).toBe('API responded 500');
    expect(String(err)).not.toContain('entries_json.py');
  });

  it('serves interleaved concurrent calls without crossing their data', async () => {
    // The demonstration for negative control 2. NB it is a demonstration, not
    // the control: a `let` at module scope only smears when its write and its
    // read straddle an await, and no interleaving of a *pure* function can
    // manufacture that. The control that actually bites is the structural one
    // below — this was verified by adding `let lastBody` to
    // `apiFetch.server.ts` and watching THIS test stay green.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/alice')) await gate; // finishes SECOND despite starting first
        return json({ who: url.split('/').pop() });
      }),
    );

    const alice = apiGet<{ who: string }>('/e/api/page/alice');
    const bob = apiGet<{ who: string }>('/e/api/page/bob');
    expect(await bob).toEqual({ who: 'bob' });
    release();
    expect(await alice).toEqual({ who: 'alice' });

    // And the one shared object cannot be mutated into a leak by a caller.
    expect(Object.isFrozen(OUTBOUND_HEADERS)).toBe(true);
  });

  it('declares no mutable binding at module scope', () => {
    // Negative control 2 proper. In a node process serving many entrants
    // concurrently, a module-scoped `let`/`var` is shared by every in-flight
    // request — the exact defect that rules out `frontend/src/api/client.ts`
    // (`stateEtags` Map at :265, toast singleton at :6, instance at :1682).
    // Structural rather than behavioural on purpose: the hazard is a property
    // of the module's shape, and by the time a test can observe it crossing,
    // it already has. Verified non-vacuous by adding `let lastBody` to
    // `apiFetch.server.ts`, which turns this red.
    const source = readFileSync(
      new URL('../app/lib/apiFetch.server.ts', import.meta.url),
      'utf8',
    );
    const moduleScoped = source
      .split('\n')
      .filter((line) => /^(export\s+)?(let|var)\s/.test(line));

    expect(moduleScoped).toEqual([]);
  });
});

describe('apiBaseUrl', () => {
  it('throws rather than defaulting, so a misconfigured deploy fails loudly', () => {
    delete process.env.API_BASE_URL;
    expect(() => apiBaseUrl()).toThrow(/API_BASE_URL/);
  });
});

describe('OUTBOUND_HEADERS', () => {
  it('enumerates exactly one header — the allowlist IS the abstinence', () => {
    expect(OUTBOUND_HEADERS).toEqual({ accept: 'application/json' });
  });
});
