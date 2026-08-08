/**
 * `GET /e/login` — the page that turns `POST /e/account/login` into something
 * a human can reach.
 *
 * Same shape as `signup.test.ts`: the REAL @react-router/dev pipeline through
 * `createRequestHandler`, request in, HTML out, no component mocking. What is
 * asserted is the bytes a scriptless browser receives.
 *
 * Login carries MORE security weight than signup, not less, because it is the
 * route where credentials are typed:
 *
 * 1. **It must not become an account-enumeration oracle.** `api/entrants.py`'s
 *    login route answers ONE 401 for every cause (unknown address, no password
 *    set, wrong password) and pays the Argon2 cost on the miss too, so neither
 *    body nor timing tells a caller which it was. This tier is not allowed to
 *    add the distinction back, and the only way it could is a loader that reads
 *    an address off the URL and renders differently for it. So the document is
 *    rendered for a "fresh" and an "already registered" address and compared
 *    BYTE FOR BYTE. The structural half is stronger: no `action` export, so
 *    node is never handed the 401/303 it could branch on at all.
 * 2. **CSRF with no session.** There is none — obtaining one is what this page
 *    is for — so `sw_play_csrf` IS the mechanism. `login_body` calls
 *    `require_form_csrf` on every form post, which refuses a body carrying
 *    neither candidate secret; this side's duty is to ship a token that is
 *    really the digest of the nonce on this very response, which is asserted on
 *    the wire because from inside node a right and a wrong token look alike.
 * 3. **`next` must not be an open redirect.** The backend validates it
 *    (`next_target` / `_SAFE_NEXT`), and this page renders it, so this page
 *    validates it too — a crafted absolute URL must not reach the markup, where
 *    a human reads it and a scanner flags the origin.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { formCsrfToken } from '../app/lib/formCsrf.server';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchPath(path: string, mode = 'development'): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, mode)(new Request(`http://entrant.test${path}`));
}

const render = async (path = '/e/login') => (await fetchPath(path)).text();

/** The tag that declares `name`, whatever order React serialised it in. */
const inputNamed = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

/** Every `href` in the document, so the link controls derive rather than list. */
const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('the login form, unhydrated', () => {
  it('is a plain form posting straight to the FastAPI login route', async () => {
    // Not to an RR7 action: the credential goes browser -> nginx -> FastAPI on
    // one origin and node holds it at no point. Same posture as `signup.tsx`
    // and `entry.form.tsx`.
    const html = await render();

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('action="/e/account/login"');
    // A form with no submit control cannot be submitted without script, which
    // every other assertion here would sail straight past.
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('names the fields exactly as LoginRequest reads them', async () => {
    // `api/entrants.py:LoginRequest` — `email` and `password`, and `StrictModel`
    // forbids extras, so a third domain field here would be a 422.
    const html = await render();

    expect(inputNamed(html, 'email')).toContain('type="email"');
    expect(inputNamed(html, 'email')).toContain('required=""');
    // A `type="text"` password box is shoulder-surfing plus a browser that
    // offers to remember it as a username.
    expect(inputNamed(html, 'password')).toContain('type="password"');
    expect(inputNamed(html, 'password')).toContain('required=""');
    // No `minLength` on the password: this is not the box that sets one, and a
    // client-side length rule here tells an attacker the shape of stored
    // secrets while blocking a legacy account whose password predates the rule.
    expect(inputNamed(html, 'password')).not.toContain('minlength');
  });

  it('carries the double-submit token as a hidden field named by FORM_FIELD', async () => {
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="[0-9a-f]{64}"/,
    );
  });

  it('renders a token that is the digest of the nonce it just set', async () => {
    // The end-to-end control. Everything else can be green while the form
    // carries a token derived from a nonce nobody holds — indistinguishable
    // from inside node. The browser is where the two meet, so they are checked
    // against the real document response.
    const res = await fetchPath('/e/login');
    const html = await res.text();

    const setCookie = res.headers.get('set-cookie') ?? '';
    const nonce = /sw_play_csrf=([^;]+)/.exec(setCookie)?.[1];
    const rendered = /name="_csrf" value="([0-9a-f]{64})"/.exec(html)?.[1];

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');

    expect(nonce).toBeTruthy();
    expect(rendered).toBeTruthy();
    expect(rendered).toBe(formCsrfToken(nonce as string));
    // Non-vacuity: not two undefineds agreeing, and not the empty "no proof
    // available" value `formCsrfToken('')` returns — which `require_form_csrf`
    // refuses, so shipping it would make every unhydrated login a refusal.
    expect(rendered).not.toBe('');
    expect(rendered).not.toBe(formCsrfToken('some-other-nonce'));
  });

  it('sends the document with Cache-Control: no-store', async () => {
    // **The React Router trap.** `getDocumentHeaders` copies only `Set-Cookie`
    // out of a loader's ResponseInit unless the route exports `headers`, so
    // `mintFormCsrf`'s `Cache-Control: no-store` reaches the loader result and
    // stops there. Asserted on the REAL document response, never on the mint's
    // return value: that is the only place the drop is observable. This
    // document carries BOTH halves of a double-submit, so a shared cache that
    // stored it would replay one visitor's nonce and matching token to the next.
    const res = await fetchPath('/e/login');

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('spells its width as a max-w column, never an arbitrary w-[…] value', async () => {
    // A Tailwind SPELLING check, not viewport coverage — it can only see which
    // utilities were written (see the same note in `signup.test.ts`). R11 is
    // not closed by this test; what it buys is that the column is declared
    // `max-w-*` and no fixed width literal has been pasted anywhere.
    const html = await render();

    expect(html).toMatch(/<main[^>]*class="[^"]*\bmax-w-/);
    for (const attr of html.match(/class="[^"]*"/g) ?? []) {
      expect(attr).not.toMatch(/\b(min-)?w-\[\d/);
    }
  });
});

// ---- the reachability half: F-E1-2-E1 is not closed by an unlinked page ----

describe('the account pages are reachable by link', () => {
  it('login offers a link to signup, and it is node-owned', async () => {
    const html = await render();

    expect(hrefs(html)).toContain('/e/signup');
  });

  it('the entry page offers both, so a visitor without an account has a path', async () => {
    // R8-E removed the old links because they pointed at POST-only routes and
    // 405'd, which left the signup page reachable only by typing its URL.
    // Both pages now exist; this is the wiring, and it is asserted on the
    // entry page's own document.
    const html = await fetchEntry();

    expect(hrefs(html)).toContain('/e/login?next=/e/spring-open');
    expect(hrefs(html)).toContain('/e/signup');
  });

  it.each([['login'], ['signup'], ['entry']] as const)(
    'the %s page offers no link into a FastAPI-owned prefix',
    async (page) => {
      // **Derived, not listed.** Every `/e/account/*` URL is POST-only
      // (ruling R8-A gives nginx the whole prefix), so an `<a href>` to any of
      // them is a 405 in the entrant's face — the exact defect R8-E removed.
      // Reading every href out of the document means a link pasted to a route
      // invented tomorrow is a finding too, without a line being added here.
      // The entry page is the one that matters most now: its footer holds the
      // sign-out FORM, and the whole point is that no `<a href>` ever appears
      // beside it. `logout.test.ts` derives that prohibition — links AND
      // non-POST form actions — from every route module on disk.
      const html =
        page === 'entry'
          ? await fetchEntry()
          : page === 'signup'
            ? await fetchSignup()
            : await render('/e/login');
      const links = hrefs(html);

      // Non-vacuity, and specifically NOT `links.length > 0`: the dev-mode
      // document ships four `modulepreload` hrefs of its own, so that spelling
      // would have passed over an ErrorBoundary with no content at all (it
      // did, first). At least one link must be an in-tier `/e/` one.
      expect(links.filter((h) => h.startsWith('/e/')).length).toBeGreaterThan(0);
      expect(links.filter((h) => h.startsWith('/e/account/'))).toEqual([]);
      expect(links.filter((h) => h.startsWith('/e/api/'))).toEqual([]);
    },
  );
});

// ---- `next`: the page renders it, so the page validates it -----------------

describe('next is a same-origin entrant path or it is discarded', () => {
  it('carries a safe next through to the hidden field', async () => {
    const html = await render('/e/login?next=/e/spring-open');

    expect(inputNamed(html, 'next')).toContain('value="/e/spring-open"');
  });

  it.each([
    ['https://evil.example/steal', 'an absolute URL'],
    ['//evil.example/steal', 'a scheme-relative URL'],
    ['/e/../admin', 'a traversal out of the prefix'],
    ['/admin/tournaments', 'another prefix on this origin'],
    ['http:/e/x', 'a scheme with one slash'],
  ])('discards %s (%s)', async (crafted) => {
    // An open redirect on a login route is a phishing primitive: the victim
    // types real credentials on the real origin and is handed to an attacker's
    // page afterwards. `next_target` refuses these on the backend; this page
    // must not put them in the markup either, and it MATCHES an allowlist
    // rather than stripping — a stripper has to anticipate every encoding.
    const html = await render(`/e/login?next=${encodeURIComponent(crafted)}`);

    expect(html).not.toContain('evil.example');
    expect(inputNamed(html, 'next')).toContain('value="/e/login"');
  });
});

// ---- the enumeration oracle ------------------------------------------------

describe('login is not an account-enumeration oracle', () => {
  it('renders byte-identically for a fresh and an already-registered address', async () => {
    // Two DIFFERENT addresses fed in as two documents' worth of input, not the
    // same one twice — the latter compares a constant to itself. The way this
    // tier would reintroduce the distinction the backend refuses to make is a
    // `?email=` prefill (or a "we could not find that account" hop) that the
    // loader reads and branches on.
    const fresh = await render('/e/login?email=nobody-has-this@example.test');
    const taken = await render('/e/login?email=already-registered@example.test');

    // The digest is the ONE legitimately-per-render value. Masking anything
    // else would be masking the finding.
    const mask = (html: string) => html.replace(/[0-9a-f]{64}/g, '<CSRF>');

    expect(mask(fresh)).toBe(mask(taken));
    // Non-vacuity: a real page, not two error pages or two empty strings
    // agreeing, and the mask has not eaten the document.
    expect(mask(fresh)).toContain('action="/e/account/login"');
    expect(mask(fresh)).toContain('<CSRF>');
    expect(mask(fresh).length).toBeGreaterThan(500);
  });

  it('never sees the answer it could leak: no action export, no node-tier POST', async () => {
    // The stronger half. The byte comparison proves the loader does not branch
    // TODAY on an input it is handed; this proves node is never handed the
    // backend's answer at all. An `action` here would put the 401-vs-303 in
    // node's hands, and rendering "no account with that address" from it is
    // then one edit away — an edit the byte test cannot see, because the
    // distinguishing document would be the POST response.
    const route = (await vite.ssrLoadModule('/app/routes/login.tsx')) as Record<
      string,
      unknown
    >;

    expect(route.action).toBeUndefined();
    // Non-vacuity: the module really loaded, and the exports it SHOULD have are
    // there. Without this a typo'd path passes against an empty object.
    expect(typeof route.loader).toBe('function');
    expect(typeof route.headers).toBe('function');
    expect(typeof route.default).toBe('function');
  });

  it('reads the URL for `next` and nothing else that names a person', async () => {
    // `signup.tsx` proves this with a zero-arity loader; this one cannot,
    // because it legitimately reads one query field. So the property is
    // asserted at the seam instead: the ONLY search parameter that reaches the
    // rendered document is `next`, and it arrives validated. A prefill added
    // later — `?email=`, `?account=`, a flash message keyed by address — shows
    // up here as a value that survived into the markup.
    const html = await render(
      '/e/login?email=leaked@example.test&error=NO_SUCH_ACCOUNT&next=/e/spring-open',
    );

    expect(html).not.toContain('leaked@example.test');
    expect(html).not.toContain('NO_SUCH_ACCOUNT');
    // Non-vacuity: the one parameter that IS allowed through did arrive, so
    // this is not passing because the loader ignores the query string entirely.
    expect(inputNamed(html, 'next')).toContain('value="/e/spring-open"');
  });
});

// ---- the entry page fixture, kept at the bottom: it is scaffolding ---------

/**
 * The entry page's document, for the link assertions above. It needs the real
 * `GET /e/api/page/{slug}` projection, so the shape is the one
 * `entry.loader.test.ts` pins — trimmed to the keys `entry.tsx` reads.
 */
async function withApi<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const { vi } = await import('vitest');
  // `apiGet` reads this; without it the loader throws and the ErrorBoundary
  // renders a document with no links, which is how the first version of the
  // link assertion "passed" its non-vacuity check on modulepreload hrefs.
  process.env.API_BASE_URL = 'http://backend:8000';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  try {
    return await run();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function fetchEntry(): Promise<string> {
  return withApi(ENTRY_PAGE, async () => {
    const html = await (await fetchPath('/e/spring-open')).text();
    // The fixture really rendered — otherwise every assertion made against
    // this document is made against an error page.
    expect(html).toContain('Spring Open');
    return html;
  });
}

/** The signup document, for the derived link control only. `signup.test.ts`
 * owns everything else about that page; the `EntrantConfigDTO` shape is its
 * fixture's, trimmed to what the loader reads. */
async function fetchSignup(): Promise<string> {
  return withApi({ turnstileSiteKey: '3x00000000000000000000FF', authMode: 'cloud' }, async () => {
    const html = await (await fetchPath('/e/signup')).text();
    expect(html).toContain('action="/e/account/signup"');
    return html;
  });
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
  entrants: [],
  viewer: { signedIn: false, email: null, formCsrf: '' },
});
