/**
 * The `/e/{slug}` loader, and the one line in it that unlocks a database index.
 *
 * `UNIQUE (tournament_id, account_id, idempotency_key)` has never fired for a
 * real entrant: a native form cannot send a header, so the column was always
 * NULL (spec §4). Minting the key HERE — in the loader that renders the form,
 * once per rendered form — is what makes it reachable, and is also why a
 * double-click cannot mint two. Both properties are pinned below.
 *
 * The rest of this file is the tier-level half of the fetch layer's promise:
 * `apiFetch.server.ts` refuses to send a credential, and these assert that the
 * loader above it never hands one down or copies one back.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { loader } from '../app/routes/entry';
import {
  credentialRelayLines,
  libFiles,
  moduleScopedMutableBindings,
  readAppSource,
  routeFiles,
} from './helpers/sourceGuards';

/**
 * The REAL `GET /e/api/page/{slug}` projection (`api/entries_json.py:175-188`),
 * not the brief's flat one — nested `{tournament, org, venue, page, policy,
 * events, entrants, viewer}`, `entryCount` rather than `entered`, and
 * `{name, eventId}` entrant rows. See the report for the deviation.
 */
const PAGE = {
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: 'Entries close on the 1st.',
    regulationsText: 'BWF laws apply.',
    regulationsVersion: 3,
    paymentInstructions: 'Bank transfer on the day.',
    feeSchedule: { '2': 2500 },
  },
  policy: {
    maxEventsPerPerson: 2,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 7,
    },
  ],
  entrants: [{ name: 'Ada Lovelace', eventId: '11111111-1111-4111-8111-111111111111' }],
  viewer: { signedIn: true, email: 'ada@example.com', formCsrf: 'csrf-token-abc' },
};

const sent: Request[] = [];

function stubJson(body: unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as RequestInfo, init));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

/** The backend's uniform 404 — identical code and message for an unknown slug
 * and a closed page alike (`api/entries_public.py:219-226`). */
function notFoundBody() {
  return { detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found' } };
}

function get(slug: string | undefined, headers: HeadersInit = {}) {
  return loader({
    request: new Request(`http://entrant.test/e/${slug ?? ''}`, { headers }),
    params: slug === undefined ? {} : { slug },
  });
}

beforeEach(() => {
  sent.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('entry loader', () => {
  it('returns the public projection for the slug', async () => {
    vi.stubGlobal('fetch', stubJson(PAGE));

    const data = await get('spring-open');

    expect(data.page.tournament.name).toBe('Spring Open');
    expect(data.page.events[0].entryCount).toBe(7);
    expect(sent[0].url).toBe('http://backend:8000/e/api/page/spring-open');
  });

  it('mints an Idempotency-Key of at most 64 characters', async () => {
    // 64 is the backend's `Header(..., max_length=64)` on the submit route
    // (`api/entries_public.py:1088-1090`). A longer key is a 422 the entrant
    // cannot act on, so the bound is asserted, not assumed.
    vi.stubGlobal('fetch', stubJson(PAGE));

    const data = await get('spring-open');

    expect(data.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(data.idempotencyKey.length).toBeLessThanOrEqual(64);
  });

  it('mints a fresh key per render, so two loads are two submissions', async () => {
    vi.stubGlobal('fetch', stubJson(PAGE));

    const first = await get('spring-open');
    const second = await get('spring-open');

    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('holds one key steady WITHIN a render, so a double-click is a replay', async () => {
    // The whole point. The key must be a plain value on the loader's result —
    // a getter that minted per access would give the two POSTs of a
    // double-click two different keys and record two entries, which is the
    // defect the database index exists to catch and cannot.
    vi.stubGlobal('fetch', stubJson(PAGE));

    const data = await get('spring-open');
    const descriptor = Object.getOwnPropertyDescriptor(data, 'idempotencyKey');

    expect(descriptor?.get).toBeUndefined();
    expect(data.idempotencyKey).toBe(data.idempotencyKey);
  });

  it('404s a missing slug param without calling the API at all', async () => {
    vi.stubGlobal('fetch', stubJson(PAGE));

    await expect(get(undefined)).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && thrown.status === 404,
    );
    expect(sent).toEqual([]);
  });

  it('answers an unknown slug and a closed page byte-identically', async () => {
    // Non-enumeration, inherited and preserved. The backend already refuses to
    // distinguish the two, so feeding it the SAME payload twice would prove
    // nothing — the distinction is fed in deliberately, as two different
    // upstream codes, and the loader must flatten it. That models both a
    // future backend that stops being uniform and, more immediately, a loader
    // that starts echoing `err.code` into the body it throws.
    async function thrown(code: string): Promise<Response> {
      vi.stubGlobal('fetch', stubJson({ detail: { code, message: code } }, 404));
      return (await get('whatever').catch((e: unknown) => e)) as Response;
    }

    const unknownSlug = await thrown('TOURNAMENT_NOT_FOUND');
    const closedPage = await thrown('ENTRY_PAGE_CLOSED');

    expect(unknownSlug).toBeInstanceOf(Response);
    expect(unknownSlug.status).toBe(404);
    expect([...unknownSlug.headers.keys()]).toEqual([...closedPage.headers.keys()]);
    expect(await unknownSlug.text()).toBe(await closedPage.text());
  });

  it('carries no upstream detail into the 404 it throws', async () => {
    // A 404 whose body names the backend or the failing module would leak the
    // internal topology onto a public page.
    vi.stubGlobal(
      'fetch',
      stubJson({ detail: 'EntryPage lookup failed at /app/api/entries_json.py:214' }, 404),
    );

    const response = (await get('nope').catch((e: unknown) => e)) as Response;
    const body = await response.text();

    expect(body).not.toContain('entries_json.py');
    expect(body).not.toContain('backend:8000');
    expect(body).not.toContain('TOURNAMENT_NOT_FOUND');
  });

  it('sends no Cookie upstream even when the inbound request carries one', async () => {
    // Relay abstinence, behavioural half. The loader is handed a real session
    // cookie and must arrive at the API with the allowlist and nothing else.
    vi.stubGlobal('fetch', stubJson(PAGE));

    await get('spring-open', { cookie: 'sw_entrant_session=secret; other=1' });

    expect(sent[0].headers.get('cookie')).toBeNull();
    expect([...sent[0].headers.keys()]).toEqual(['accept']);
  });

  // Enumerated from disk (`routeFiles()`), not hardcoded to `entry.tsx`: every
  // route module under app/routes/ is covered the moment it lands, with no
  // human step. A failure here names the offending file.
  describe.each(routeFiles())('route-tier relay guards: %s', (relative) => {
    it('declares no credential relay at all — structural, not behavioural', () => {
      // The half that actually bites. `apiGet`'s signature happens to leave no
      // room for a forwarded header today, so the behavioural test above would
      // stay green even if a loader hand-rolled `fetch` with the entrant's
      // cookie. This scans the module for the shapes that would do it: reading
      // an inbound header, naming a cookie, attaching headers to an outgoing
      // Response, or calling `fetch` directly.
      expect(credentialRelayLines(readAppSource(relative))).toEqual([]);
    });

    it('declares no mutable binding at module scope', () => {
      // Same hazard as `apiFetch.server.ts`: one node process, many entrants,
      // and module scope is shared by all of them. A per-request value cached
      // at module scope here would be a cross-USER leak of somebody's page —
      // or of somebody's idempotency key.
      expect(moduleScopedMutableBindings(readAppSource(relative))).toEqual([]);
    });
  });

  // `app/lib/` runs in the same process as the routes and holds the shared
  // helpers, which is where a cache is most likely to be added "just for
  // speed". The relay guard is deliberately NOT applied here — `apiFetch.
  // server.ts` legitimately calls `fetch` and sets headers; it has its own
  // dedicated coverage in `apiFetch.server.test.ts`.
  describe.each(libFiles())('lib-tier module state: %s', (relative) => {
    it('declares no mutable binding at module scope', () => {
      expect(moduleScopedMutableBindings(readAppSource(relative))).toEqual([]);
    });
  });

  it('the module-state guard is not vacuous, annotated containers included', () => {
    // Real fixture text of the exact defect. The third line is the one that
    // used to sail through: `new Map<string, number>()` is the same shared,
    // mutable, cross-request container as `new Map()`, but the pattern
    // required the parenthesis to follow the name immediately. Found by
    // mutating a route file in Task 17, where the bare spelling went red and
    // the annotated one beside it did not.
    const shared = [
      'let lastEcho: FormEcho | null = null;',
      'const seen = new Map();',
      'const seenTotals = new Map<string, number>();',
      'const pending = new Set<string>();',
      'export const cache = {};',
    ].join('\n');

    expect(moduleScopedMutableBindings(shared)).toEqual([
      'let lastEcho: FormEcho | null = null;',
      'const seen = new Map();',
      'const seenTotals = new Map<string, number>();',
      'const pending = new Set<string>();',
      'export const cache = {};',
    ]);
    // ...and the safe-to-share form still is not a finding.
    expect(moduleScopedMutableBindings('const G = Object.freeze([1]);')).toEqual([]);
  });

  it('the relay guard is not vacuous: a forwarding loader goes red', () => {
    // Real fixture text of the exact defect, not a description of it.
    const forwarding = [
      "const jar = request.headers.get('cookie') ?? '';",
      "return new Response(body, { headers: { cookie: jar } });",
    ].join('\n');

    expect(credentialRelayLines(forwarding)).toEqual([
      "const jar = request.headers.get('cookie') ?? '';",
      'return new Response(body, { headers: { cookie: jar } });',
    ]);
  });

});

// ---- request level: the route as the browser gets it ----------------------

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string, mode = 'development'): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, mode)(new Request(`http://entrant.test${path}`));
}

describe('GET /e/{slug}', () => {
  it('server-renders the page and the key, with no JavaScript in play', async () => {
    // The upstream response carries a Set-Cookie so the assertion below has
    // something it could actually fail on — a loader that copied every
    // upstream header onto its own Response would have left a bare `stubJson`
    // (content-type only) unable to catch it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify(PAGE), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'sw_entrant_session=leaked',
          },
        });
      }),
    );

    const res = await fetchEntrant('/e/spring-open');
    const body = await res.text();

    expect(res.status).toBe(200);
    // Asserted on the SERVER response, before any hydration — the no-JS
    // posture of spec §7. The key is in the markup, in the hidden field the
    // backend reads (`api/entries_json.py:617`), because the form has to be
    // able to carry it without a script.
    expect(body).toContain('Spring Open');
    expect(body).toMatch(
      /name="idempotencyKey" value="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/,
    );
    // Node renders; it never relays a credential back down either. `apiGet`
    // returns parsed JSON, so the upstream Response never escapes
    // `apiFetch.server.ts` — this pins that property against a real
    // upstream Set-Cookie, not an absent one.
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('renders a not-found page for a 404, leaking neither cause nor topology', async () => {
    vi.stubGlobal('fetch', stubJson(notFoundBody(), 404));

    const res = await fetchEntrant('/e/does-not-exist');
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).toContain('This entry page is not available');
    expect(body).not.toContain('TOURNAMENT_NOT_FOUND');
    expect(body).not.toContain('backend:8000');
  });

  it('renders no upstream prose when the API fails outright', async () => {
    // Asserted against the PRODUCTION handler, deliberately. Running this at
    // `'development'` first was worth doing: React Router serializes the
    // thrown error's message AND its full absolute-path stack into
    // `window.__reactRouterContext` there, so the assertion below went red on
    // "API responded 500" even though the ErrorBoundary itself rendered only
    // fixed copy. That is React Router's documented dev affordance and it does
    // not ship — `'production'` replaces the payload with a bare
    // "Unexpected Server Error". The shipped mode is the one worth pinning;
    // the dev behaviour is noted so nobody re-discovers it as a leak.
    vi.stubGlobal(
      'fetch',
      stubJson({ detail: 'IntegrityError at /app/api/entries_json.py:214' }, 500),
    );

    const res = await fetchEntrant('/e/spring-open', 'production');
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('entries_json.py');
    expect(body).not.toContain('API responded');
    expect(body).not.toContain('apiFetch.server');
    expect(body).not.toContain('backend:8000');
  });
});
