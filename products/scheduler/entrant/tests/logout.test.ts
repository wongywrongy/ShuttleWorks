/**
 * `GET /e/logout` — the page that turns `POST /e/account/logout` into something
 * a signed-in human can reach.
 *
 * Same shape as `login.test.ts`: the REAL @react-router/dev pipeline through
 * `createRequestHandler`, request in, HTML out, no component mocking. What is
 * asserted is the bytes a scriptless browser receives.
 *
 * Logout's whole security weight sits in one place: **it must be a POST, and
 * only a POST.** A GET logout is CSRF-able by construction — an `<img src>`, a
 * link prefetch, or a scanner walking the site signs the entrant out — and it
 * is exactly the kind of harmless-looking convenience that ships. So:
 *
 * 1. The page's only form is `method="post"`, and no document in this tier
 *    links to `/e/account/logout` with an `<a href>`. The second half is
 *    derived from every route module on disk, not listed, so a link pasted
 *    tomorrow is a finding without a line being added here.
 * 2. The `_csrf` field carries the digest of the `sw_play_csrf` nonce set on
 *    this very response — the same channel `login.tsx` uses, and the one
 *    `logout_form_csrf` (`api/entrants.py:271`) accepts. Node never reads the
 *    session cookie, so a session-derived digest is not available to it and
 *    the nonce is the whole proof-of-intent.
 * 3. `next` is rendered unconditionally. `logout`'s own fallback is
 *    `/e/account/login` (`api/entrants.py:569`), which is POST-only — a 405 in
 *    the entrant's face after a *successful* logout. The page therefore always
 *    names a node-owned GET.
 *
 * That the session is genuinely destroyed — not merely un-cookied — is proved
 * where it can be: against the real backend, in
 * `products/scheduler/tests/test_entrant_auth_routes.py`
 * (`test_a_form_logout_kills_the_session_and_lands_on_a_node_owned_get`),
 * which replays the pre-logout token and requires a 401.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { formCsrfToken } from '../app/lib/formCsrf.server';
import { readAppSource, routeFiles } from './helpers/sourceGuards';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchPath(path: string, mode = 'development'): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, mode)(new Request(`http://entrant.test${path}`));
}

const render = async (path = '/e/logout') => (await fetchPath(path)).text();

/** The tag that declares `name`, whatever order React serialised it in. */
const inputNamed = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

/** Every `href` in the document, so the link controls derive rather than list. */
const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/**
 * Lines that link — rather than post — to the backend's account prefix.
 *
 * Both `href="…"` and `href={…}` spellings, because the entry page writes the
 * template-literal form and a guard that only sees one of them is not a guard.
 */
const accountHrefLines = (source: string): string[] =>
  source
    .split('\n')
    .filter((line) => /href=\{?[`'"][^`'"]*\/e\/account\//.test(line))
    .map((line) => line.trim());

describe('the logout form, unhydrated', () => {
  it('is a plain form posting straight to the FastAPI logout route', async () => {
    const html = await render();

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('action="/e/account/logout"');
    // A form with no submit control cannot be submitted without script, which
    // every other assertion here would sail straight past.
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('offers no way to sign out with a GET', async () => {
    // The property this page exists to get right. A `method="get"` form is
    // the same defect as an `<a href>` to the POST route wearing a button:
    // the browser turns the fields into a query string and any prefetch,
    // scanner or `<img>` that reaches the URL signs the entrant out.
    const html = await render();

    expect(html).not.toMatch(/<form[^>]*method="get"/i);
    // Exactly one form, so "no GET form" is not true merely because a second
    // form went unnoticed.
    expect(html.match(/<form\b/g)).toHaveLength(1);
    expect(hrefs(html).filter((h) => h.startsWith('/e/account/'))).toEqual([]);
  });

  it('carries the double-submit token as a hidden field named by FORM_FIELD', async () => {
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="[0-9a-f]{64}"/,
    );
  });

  it('renders a token that is the digest of the nonce it just set', async () => {
    // The end-to-end control, as on login: everything else can be green while
    // the form carries a token derived from a nonce nobody holds, which is
    // indistinguishable from inside node. `logout_form_csrf` accepts *either*
    // candidate secret, and the play nonce is the only one node can produce —
    // it never reads the session cookie.
    const res = await fetchPath('/e/logout');
    const html = await res.text();

    const setCookie = res.headers.get('set-cookie') ?? '';
    const nonce = /sw_play_csrf=([^;]+)/.exec(setCookie)?.[1];
    const rendered = /name="_csrf" value="([0-9a-f]{64})"/.exec(html)?.[1];

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    expect(nonce).toBeTruthy();
    expect(rendered).toBe(formCsrfToken(nonce as string));
    // Non-vacuity: not two undefineds agreeing, and not the empty "no proof
    // available" value, which `require_form_csrf` refuses — shipping it would
    // make every unhydrated logout a refusal.
    expect(rendered).not.toBe('');
    expect(rendered).not.toBe(formCsrfToken('some-other-nonce'));
  });

  it('names a node-owned GET as the post-logout destination', async () => {
    // `logout`'s own fallback is `/e/account/login` (`api/entrants.py:569`),
    // which is POST-only: a successful sign-out would end on a 405. So the
    // field is rendered unconditionally and the value is a node route.
    const html = await render();

    expect(inputNamed(html, 'next')).toContain('value="/e/login"');
  });

  it('sends the document with Cache-Control: no-store', async () => {
    // **The React Router trap.** `getDocumentHeaders` copies only `Set-Cookie`
    // out of a loader's ResponseInit unless the route exports `headers`, so
    // `mintFormCsrf`'s `Cache-Control: no-store` reaches the loader result and
    // stops there. Asserted on the REAL document response, never on the mint's
    // return value: that is the only place the drop is observable.
    const res = await fetchPath('/e/logout');

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('spells its width as a max-w column, never an arbitrary w-[…] value', async () => {
    // R11, to the extent a Tailwind SPELLING check can carry it (same note as
    // `login.test.ts`): the column is declared `max-w-*` and no fixed width
    // literal has been pasted anywhere, so neither width degrades.
    const html = await render();

    expect(html).toMatch(/<main[^>]*class="[^"]*\bmax-w-/);
    for (const attr of html.match(/class="[^"]*"/g) ?? []) {
      expect(attr).not.toMatch(/\b(min-)?w-\[\d/);
    }
  });
});

describe('node is never handed the logout answer', () => {
  it('exports no action, and a loader that cannot read the request', async () => {
    const route = (await vite.ssrLoadModule('/app/routes/logout.tsx')) as Record<
      string,
      unknown
    >;

    // An `action` here would put node in the credential path: the browser
    // would post the session cookie to node, which would have to relay it.
    expect(route.action).toBeUndefined();
    // Zero-arity, `signup.tsx`'s proof: there is no parameter through which
    // an inbound cookie could reach this loader at all. Stronger than "it
    // does not read one today".
    expect((route.loader as (...args: unknown[]) => unknown).length).toBe(0);
    // Non-vacuity: the module really loaded and has the exports it should.
    expect(typeof route.headers).toBe('function');
    expect(typeof route.default).toBe('function');
  });
});

// ---- the reachability half: an unlinked page closes nothing ----------------

describe('signing out is reachable, and only ever by POST', () => {
  it('the entry page — the page a signed-in entrant is on — links to it', async () => {
    // Rendered unconditionally, exactly like the sign-in link beside it:
    // `viewer.signedIn` is `false` on every server-rendered page because
    // node's fetch is always anonymous, so a gate would hide the link from
    // everyone. Reaching a logout page while signed out is harmless — the
    // route is idempotent.
    const html = await fetchEntry();

    expect(hrefs(html)).toContain('/e/logout');
  });

  it.each(routeFiles())('%s links to no /e/account/ URL', (relative) => {
    // **Derived from disk, not listed.** Every `/e/account/*` route is
    // POST-only (R8-A gives nginx the whole prefix), so an `<a href>` to one
    // is a 405 — and for logout specifically it is worse than a 405: were the
    // ingress ever to answer the GET, following a link would sign the entrant
    // out. A route file added tomorrow is covered with no line added here.
    expect(accountHrefLines(readAppSource(relative))).toEqual([]);
  });

  it('the account-href guard is not vacuous, both JSX spellings included', () => {
    // Real fixture text of the exact defect, in the two forms this codebase
    // writes. Without the second line the template-literal spelling — which
    // `entry.tsx` uses for its sign-in link — would sail straight through.
    const linked = [
      '<a className="underline" href="/e/account/logout">Sign out</a>',
      '<a href={`/e/account/login?next=/e/${slug}`}>Sign in</a>',
      '<form method="post" action="/e/account/logout">',
    ].join('\n');

    expect(accountHrefLines(linked)).toEqual([
      '<a className="underline" href="/e/account/logout">Sign out</a>',
      '<a href={`/e/account/login?next=/e/${slug}`}>Sign in</a>',
    ]);
  });
});

// ---- the entry page fixture, kept at the bottom: it is scaffolding ---------

/**
 * The entry page's document, for the link assertion above. Needs the real
 * `GET /e/api/page/{slug}` projection, so the shape is the one
 * `entry.loader.test.ts` pins — trimmed to the keys `entry.tsx` reads.
 */
async function fetchEntry(): Promise<string> {
  const { vi } = await import('vitest');
  process.env.API_BASE_URL = 'http://backend:8000';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(ENTRY_PAGE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  try {
    const html = await (await fetchPath('/e/spring-open')).text();
    // The fixture really rendered — otherwise every assertion made against
    // this document is made against an error page with no links at all.
    expect(html).toContain('Spring Open');
    return html;
  } finally {
    vi.unstubAllGlobals();
  }
}

const ENTRY_PAGE = Object.freeze({
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: null,
    regulationsText: null,
    regulationsVersion: 3,
    paymentInstructions: null,
    feeSchedule: {},
  },
  policy: {
    maxEventsPerPerson: 2,
    disciplineCaps: null,
    collectPhone: false,
    waiverRequired: false,
  },
  events: [],
  entrants: [],
  viewer: { signedIn: false, email: null, formCsrf: '' },
});
