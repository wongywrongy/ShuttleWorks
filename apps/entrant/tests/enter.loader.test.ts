/**
 * The `/e/{slug}/enter` loader, and the one line in it that unlocks a
 * database index.
 *
 * `UNIQUE (tournament_id, account_id, idempotency_key)` has never fired for a
 * real entrant: a native form cannot send a header, so the column was always
 * NULL (spec §4). Minting the key HERE — in the loader that renders the form,
 * once per rendered form — is what makes it reachable, and is also why a
 * double-click cannot mint two. Both properties are pinned below.
 *
 * The rest of this file is the tier-level half of the fetch layer's promise:
 * `apiFetch.server.ts` refuses to send a credential, and these assert that the
 * loader above it never hands one down or copies one back — enumerated over
 * every route, component and lib module on disk.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { loader } from '../app/routes/enter';
import { formCsrfToken } from '../app/lib/formCsrf.server';
import {
  componentFiles,
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
 * one-field `{name}` entrant rows. See the report for the deviation.
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
  entrants: [{ name: 'Ada Lovelace' }],
  // **The anonymous viewer, which is the only one node can ever be handed.**
  // This read `{signedIn: true, formCsrf: 'csrf-token-abc'}` until Task 18b:
  // a shape the real backend cannot return to a caller that sends no cookie,
  // and this loader sends none by construction. Asserting against it meant
  // the suite was green over a projection that does not exist, which is why
  // an always-hidden form and an always-empty `_csrf` reached a cutover
  // review. `tests/test_entrant_ssr_contract.py` (backend suite) drives the
  // REAL `GET /e/api/page/{slug}` with no cookie, asserts exactly this shape,
  // and fails on any fixture in this directory that claims another.
  viewer: { signedIn: false, email: null, formCsrf: '' },
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

/** The loader's raw answer. It is a `data()` wrapper since R8-D, because the
 * loader now sets the `sw_play_csrf` nonce on the SSR document response. */
function getRaw(slug: string | undefined, headers: HeadersInit = {}) {
  return loader({
    request: new Request(`http://entrant.test/e/${slug ?? ''}/enter`, { headers }),
    params: slug === undefined ? {} : { slug },
  });
}

/** Just the payload, for the assertions that predate the wrapper. */
async function get(slug: string | undefined, headers: HeadersInit = {}) {
  return (await getRaw(slug, headers)).data;
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

  // Enumerated from disk (`routeFiles()` + `componentFiles()`), not
  // hardcoded: every route module under app/routes/ AND every component under
  // app/components/ (the SP-P6-2 inventory renders inside those routes) is
  // covered the moment it lands, with no human step. A failure here names the
  // offending file.
  describe.each([...routeFiles(), ...componentFiles()])('route-tier relay guards: %s', (relative) => {
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

  // Same enumeration, aimed at the OTHER trap this tier keeps walking into.
  // React Router's `getDocumentHeaders` copies only `Set-Cookie` out of a
  // loader's ResponseInit unless the route exports `headers`, so every route
  // that mints a nonce needs its own forwarder or its document — which
  // carries BOTH halves of a double-submit — goes out cacheable, and a shared
  // cache replays one visitor's nonce and matching token to the next. Both
  // minting routes today happen to export it; nothing detected the third.
  // This does. Source-level on purpose: the behavioural version needs a real
  // document per route, which is a request-level test somebody has to write.
  describe('every route that mints a form nonce forwards its headers', () => {
    const minting = routeFiles().filter((f) => /\bmintFormCsrf\s*\(/.test(readAppSource(f)));

    it('finds routes to check at all', () => {
      // Non-vacuity: a renamed helper would empty the list and quietly retire
      // the guard rather than fail it.
      expect(minting.length).toBeGreaterThan(0);
    });

    it.each(minting)('%s exports headers', (relative) => {
      expect(readAppSource(relative)).toMatch(/^export\s+(function\s+headers\b|const\s+headers\b)/m);
    });
  });

  // `app/lib/` runs in the same process as the routes and holds the shared
  // helpers, which is where a cache is most likely to be added "just for
  // speed". The relay guard is deliberately NOT applied here — `apiFetch.
  // server.ts` legitimately calls `fetch` and sets headers; it has its own
  // dedicated coverage in `apiFetch.server.test.ts`.
  describe.each(libFiles())('lib-tier module state: %s', (relative) => {
    it('declares no mutable binding at module scope', () => {
      // ONE narrow, argued exemption: `lib/sitemapCache.server.ts` legitimately
      // holds a module-scoped `let cache` — a public, unkeyed, per-deployment
      // sitemap cache, not a per-viewer one. The full argument for why that is
      // safe (and not the `stateEtags`-shaped hazard this guard exists to
      // catch) lives as a comment directly above the binding in that file.
      //
      // The exemption is an ALLOWLIST compared for equality, not a `return`
      // that skips the file. It used to be a skip, with the pin that kept it
      // honest ("the scanner finds exactly that one line") living over in
      // `tests/sitemapCache.test.ts` — so deleting or renaming that file left
      // this guard green and permanently blind to a second binding in the
      // exempted module. Stated here, a second `let` in that module reddens
      // the guard itself, and the exemption cannot be separated from its pin.
      const allowed =
        relative === 'lib/sitemapCache.server.ts' ? ['let cache: CacheEntry | null = null;'] : [];

      expect(moduleScopedMutableBindings(readAppSource(relative))).toEqual(allowed);
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

  it('the relay guard means what it says, not what capitalisation gave it', () => {
    // The guard passed every route file only because `loaderHeaders: Headers`
    // capitalises the TYPE and the pattern was case-sensitive. That is luck,
    // and the same harmless signature written in lower case would have gone
    // red — so the header-map pattern now matches the VALUE shape and is
    // case-insensitive. Both directions are proven here, because fixing it in
    // the permissive direction (drop the pattern) would also make every route
    // file pass.

    // 1. Genuine relays are still caught, in EITHER casing. None of these
    //    lines contains the word "cookie", so each one is caught by the
    //    header-map pattern specifically and not by a neighbour.
    for (const relay of [
      'return new Response(b, { headers: { authorization: t } });',
      'return new Response(b, { HEADERS: { AUTHORIZATION: t } });',
      'await apiPost(url, { headers: request.headers });',
      'await apiPost(url, { headers: new Headers(inbound) });',
    ]) {
      expect(credentialRelayLines(relay)).toEqual([relay]);
    }

    // 2. The benign `headers` forwarder — the real signature out of
    //    `login.tsx`/`signup.tsx`/`entry.tsx` — is not a finding, and is not a
    //    finding in lower case either. That second line is the whole point:
    //    before this change it was red.
    expect(
      credentialRelayLines('export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {'),
    ).toEqual([]);
    expect(
      credentialRelayLines('export function headers({ loaderheaders }: { loaderheaders: headers }) {'),
    ).toEqual([]);
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

describe('GET /e/{slug}/enter', () => {
  it('server-renders the complete page and key before optional enhancement', async () => {
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

    const res = await fetchEntrant('/e/spring-open/enter');
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
    //
    // The document DOES now carry a Set-Cookie of its own (R8-D): the
    // `sw_play_csrf` nonce node minted. That is not a relay — the nonce
    // names no principal, node did not read it from anywhere, and the
    // upstream cookie is still nowhere on this response. Asserted as an
    // exact allowlist rather than a "does not contain" so a future header
    // that happens to be appended after it cannot ride through.
    const cookies = res.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('sw_play_csrf=');
    expect(cookies).not.toContain('sw_entrant_session');
    expect(cookies).not.toContain('leaked');
  });

  it('renders a token that is the digest of the nonce it just set', async () => {
    // **The end-to-end control for R8-D, and the one that would have caught
    // the original defect on its own.** Everything else could be green while
    // the form carried a token derived from a nonce nobody holds — which is
    // indistinguishable, from inside node, from carrying the right one. The
    // browser is the only place the two meet, so they are checked here
    // against the real document response: the cookie the browser will store,
    // and the hidden field the browser will post back.
    vi.stubGlobal('fetch', stubJson(PAGE));

    const res = await fetchEntrant('/e/spring-open/enter');
    const html = await res.text();

    const setCookie = res.headers.get('set-cookie') ?? '';
    const nonce = /sw_play_csrf=([^;]+)/.exec(setCookie)?.[1];
    const rendered = /name="_csrf" value="([0-9a-f]{64})"/.exec(html)?.[1];

    // The attributes, asserted **on the wire**. `formCsrf.server.test.ts`
    // checks them on `mintFormCsrf()`'s return value, which proves what the
    // function intends and nothing about what React Router actually emits: a
    // `responseInit` that never reaches the document, or a header rewritten
    // in transit, is invisible to that test. `HttpOnly` is the load-bearing
    // one — without it the whole double-submit argument (a cross-site page
    // can make the browser send this cookie but can never read it) is gone.
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');

    // This document carries BOTH halves of the double-submit — the nonce in
    // `Set-Cookie` and its digest in the body — so a shared cache that stored
    // it would hand one visitor's pair to the next. See `mintFormCsrf`.
    expect(res.headers.get('cache-control')).toBe('no-store');

    expect(nonce).toBeTruthy();
    expect(rendered).toBeTruthy();
    expect(rendered).toBe(formCsrfToken(nonce as string));
    // Non-vacuity: the assertion above must not be two undefineds agreeing,
    // and it must not be satisfiable by the empty "no proof available" value
    // that `viewer.formCsrf` would have supplied.
    expect(rendered).not.toBe('');
    expect(rendered).not.toBe(formCsrfToken('some-other-nonce'));
  });

  it('renders the form even though the projection says signed out', async () => {
    // R8-E. `viewer.signedIn` is `false` on every SSR page, so gating on it
    // hid the form from everyone. The gate is gone; the write decides.
    vi.stubGlobal('fetch', stubJson(PAGE));

    const html = await (await fetchEntrant('/e/spring-open/enter')).text();

    expect(html).toContain('action="/e/api/submit/spring-open"');
    expect(html).not.toContain('/e/account/login');
  });

  it('renders a not-found page for a 404, leaking neither cause nor topology', async () => {
    vi.stubGlobal('fetch', stubJson(notFoundBody(), 404));

    const res = await fetchEntrant('/e/does-not-exist/enter');
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

    const res = await fetchEntrant('/e/spring-open/enter', 'production');
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('entries_json.py');
    expect(body).not.toContain('API responded');
    expect(body).not.toContain('apiFetch.server');
    expect(body).not.toContain('backend:8000');
  });
});
