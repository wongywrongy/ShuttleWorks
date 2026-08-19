/**
 * `GET /e/signup` — the page that closes F-E1-2-E1.
 *
 * The backend has had `POST /e/account/signup` since SP-E1-2 and the logged-out
 * entry page NAMED it, but nothing ever rendered a form, so no human could
 * self-serve an entrant account. This suite asserts the bytes a scriptless
 * browser receives, through the REAL @react-router/dev pipeline and
 * `createRequestHandler` — request in, HTML out, no component mocking — the
 * same shape `entry.render.test.ts` takes.
 *
 * Three properties carry the security weight, and each is written so that a
 * plausible regression turns it red:
 *
 * 1. **Signup is not an account-enumeration oracle.** The backend answers a
 *    uniform 202/303 whether or not the address is registered
 *    (`api/entrants.py`, module docstring). This tier must not reintroduce the
 *    distinction, and the way it would be reintroduced is a loader that reads
 *    the address off the URL and renders different copy. So the document is
 *    rendered for a "fresh" and an "already registered" address and compared
 *    BYTE FOR BYTE, with only the per-render CSRF digest masked.
 * 2. **CSRF on a pre-session page.** There is no session yet; the `sw_play_csrf`
 *    nonce is what stands in for one. Asserted on the wire — the cookie the
 *    browser will store against the hidden field the browser will post back —
 *    because a token derived from a nonce nobody holds is indistinguishable,
 *    from inside node, from the right one.
 * 3. **No node-tier relay.** The form posts straight to FastAPI, and the module
 *    exports no `action`, so node never sees the credential OR the outcome it
 *    could branch on. The enumerated guards in `entry.loader.test.ts`
 *    (`routeFiles()`) already scan this file for relay shapes and module state;
 *    they cover it the moment it lands, with no line to add.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';
import type { RouteConfigEntry } from '@react-router/dev/routes';

import { formCsrfToken } from '../app/lib/formCsrf.server';
import routes from '../app/routes';
import { nodePaths } from './helpers/nodePaths';

/**
 * The REAL `GET /e/api/config` projection — `EntrantConfigDTO` in
 * `api/entries_json.py`: exactly two keys, `turnstileSiteKey` and `authMode`.
 *
 * **Deliberately NOT `1x00000000000000000000AA`**, which is Cloudflare's
 * always-passes dummy AND `app/config.py`'s default. Asserting the default
 * would be a control that cannot fail: a page that skipped the fetch and
 * hardcoded the sitekey — the exact second-source-of-truth this route exists
 * to prevent — would render the same bytes and stay green. `3x000…FF` is
 * Cloudflare's documented "always blocks" dummy, so it is a real key that is
 * unmistakably NOT the default.
 */
const CONFIG = {
  turnstileSiteKey: '3x00000000000000000000FF',
  authMode: 'cloud',
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

function stubConfig(body: unknown = CONFIG, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

async function fetchSignup(
  path = '/e/signup',
  mode = 'development',
): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, mode)(new Request(`http://entrant.test${path}`));
}

async function render(path?: string): Promise<string> {
  stubConfig();
  return (await fetchSignup(path)).text();
}

describe('the signup form, unhydrated', () => {
  it('is a plain form posting straight to the FastAPI signup route', async () => {
    // Not to an RR7 action: every entrant write is browser -> nginx -> FastAPI
    // on one origin, so node never holds the credential. Same posture as
    // `entry.form.tsx`, for the same reason.
    const html = await render();

    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain('action="/e/account/signup"');
    // A form with no submit control is unsubmittable without script — the
    // whole point of this tier, and a gap every other assertion here would
    // sail past.
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('names the fields exactly as SignupRequest reads them', async () => {
    // `api/entrants.py:SignupRequest` — `email`, `password`, optional
    // `displayName` and `phone`. Camel-case on the wire, because `_payload`
    // hands the form dict straight to the pydantic model without a rename.
    const html = await render();

    for (const name of ['email', 'password', 'displayName', 'phone']) {
      expect(html).toMatch(new RegExp(`<input[^>]*name="${name}"`));
    }
    // Order-agnostic: React 19 emits `type=` BEFORE `name=` on an input, so an
    // ordered regex would pass or fail on the serializer's whim rather than on
    // the contract. (It failed on exactly that first.)
    const tag = (name: string) =>
      html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

    // The password box must be a password box. A `type="text"` here is
    // shoulder-surfing plus a browser that offers to remember it as a
    // username, and nothing else in this file would notice.
    expect(tag('password')).toContain('type="password"');
    expect(tag('email')).toContain('type="email"');
    // Required in the markup itself, so the browser refuses an empty post
    // without a script to tell it to.
    expect(tag('password')).toContain('required=""');
    expect(tag('email')).toContain('required=""');
  });

  it('carries the double-submit token as a hidden field', async () => {
    // `_csrf` is `app/form_csrf.FORM_FIELD`, rendered from `FORM_FIELD` rather
    // than a literal so the cross-tier pin on that constant is load-bearing.
    // 64 hex characters, not a fixed string: the nonce is fresh per render.
    const html = await render();

    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="_csrf"[^>]*value="[0-9a-f]{64}"/,
    );
  });

  it('renders a token that is the digest of the nonce it just set', async () => {
    // The end-to-end control. Everything else can be green while the form
    // carries a token derived from a nonce nobody holds — from inside node the
    // two are indistinguishable. The browser is the only place they meet, so
    // they are checked here against the real document response.
    stubConfig();
    const res = await fetchSignup();
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
    // Non-vacuity: not two undefineds agreeing, and not the empty
    // "no proof available" value that `formCsrfToken('')` returns.
    expect(rendered).not.toBe('');
    expect(rendered).not.toBe(formCsrfToken('some-other-nonce'));
  });

  it('sends the document with Cache-Control: no-store', async () => {
    // **The React Router trap.** `getDocumentHeaders` copies only `Set-Cookie`
    // out of a loader's ResponseInit unless the route exports `headers`, so
    // `mintFormCsrf`'s `Cache-Control: no-store` reaches the loader result and
    // stops there. Asserted on the REAL document response, never on the mint's
    // return value — that is the only place the drop is observable. A document
    // carrying both halves of a double-submit is a per-visitor secret in HTML
    // clothing: any shared cache that stored it would replay one visitor's
    // nonce AND its matching token to the next.
    stubConfig();
    const res = await fetchSignup();

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('renders the Turnstile widget with the sitekey from /e/api/config', async () => {
    // The sitekey is fetched, never a second env var on the node service: its
    // pair (the secret) is validated only in the backend, and a sitekey that
    // drifts from its secret fails the challenge for every honest entrant
    // while looking like a Cloudflare outage (`entrant_config` docstring).
    stubConfig();
    const res = await fetchSignup();
    const html = await res.text();

    expect(html).toContain(`data-sitekey="${CONFIG.turnstileSiteKey}"`);
    // Not the `app/config.py` default: see the fixture. A page that hardcoded
    // the sitekey instead of fetching it would render that one.
    expect(html).not.toContain('1x00000000000000000000AA');
    expect(html).toContain('cf-turnstile');
    expect(html).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
  });

  it('says out loud that the human check needs JavaScript', async () => {
    // The one genuine no-JS gap in this phase, and it is pre-existing: the
    // backend refuses an empty `turnstileToken` outright
    // (`services/turnstile.verify_turnstile`), and the widget that produces
    // one is a script. A scriptless visitor would otherwise fill the whole
    // form in and be told "the human check did not pass", which reads as an
    // accusation rather than as a missing capability.
    expect(await render()).toContain('needs JavaScript');
  });

  it('posts a `next` that node itself serves, so the 303 is not a 405', async () => {
    // Without the hidden field the backend falls back to
    // `next_target(next_raw, "/e/account/login")` (`api/entrants.py:466`),
    // which is POST-only — so a SUCCESSFUL signup ended on a 405, the last
    // screen an entrant should ever meet. The field is the fix; this is its
    // control, and deleting the field turns it red.
    //
    // **Derived, not the literal.** Asserting `value="/e/login"` here would
    // rot the day the login page moves, and would go green again for any
    // other string somebody typed. What actually matters is the property:
    // the value is a path THIS app serves as a GET. So it is checked against
    // `app/routes.ts` through the same `nodePaths` derivation the R8-A
    // overlap guard uses — which, by that guard, is also proof it is not
    // inside a FastAPI prefix.
    const html = await render();
    const next = /<input[^>]*name="next"[^>]*value="([^"]*)"/.exec(html)?.[1];
    const served = nodePaths(routes as RouteConfigEntry[]);

    // Non-vacuity on both sides: the field really is in the document, and the
    // route table really was read (an empty list would make `toContain` the
    // only thing failing, which is the right failure — but a `next` of `''`
    // must not pass either).
    expect(next).toBeTruthy();
    expect(served.length).toBeGreaterThan(0);
    expect(served).toContain(next);
  });

  it('spells its width as a max-w column, never an arbitrary w-[…] value', async () => {
    // **This is a Tailwind SPELLING check, not viewport coverage.** It reads
    // class attributes in server-rendered markup, so the only thing it can
    // see is which utilities were written. It cannot fail on any of the ways
    // this page would really overflow at 360px — a wide table, a long
    // unbroken string, a `grid-cols-` that does not collapse — because none
    // of those are a width literal. Real width verification needs layout,
    // i.e. a browser; this tier has none, and R11 is not closed by this test.
    //
    // What it does buy: the column is declared `max-w-*` rather than fixed,
    // and no `w-[720px]`/`min-w-[40rem]` literal has been pasted in anywhere
    // in the document. (`min-w-0` is deliberately not a finding — it is the
    // OPPOSITE hazard, and the design system ships it on `Notice`.)
    const html = await render();

    expect(html).toMatch(/<main[^>]*class="[^"]*\bmax-w-/);
    for (const attr of html.match(/class="[^"]*"/g) ?? []) {
      expect(attr).not.toMatch(/\b(min-)?w-\[\d/);
    }
  });

  it('renders no upstream prose when the config read fails outright', async () => {
    // Asserted against the PRODUCTION handler: React Router serializes the
    // thrown error's message and its absolute-path stack into
    // `window.__reactRouterContext` in development, which does not ship.
    stubConfig({ detail: 'settings read failed at /app/api/entries_json.py:320' }, 500);

    const res = await fetchSignup('/e/signup', 'production');
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('entries_json.py');
    expect(body).not.toContain('API responded');
    expect(body).not.toContain('backend:8000');
  });
});

// ---- the enumeration oracle, and why this is where it is checked ----------

describe('signup is not an account-enumeration oracle', () => {
  it('renders byte-identically for a fresh and an already-registered address', async () => {
    // The backend answers a uniform 202 (303 for a form post) on BOTH
    // branches, spends an Argon2id hash on both so timing is not the oracle
    // either, and hands out no cookie on either. The way THIS tier would
    // reintroduce the distinction is a loader that reads the address off the
    // URL — from a `?email=` prefill, or from a "we sent you a link" hop — and
    // renders different copy for one of them.
    //
    // So the two addresses are fed in as two DIFFERENT documents' worth of
    // input and the rendered bytes are compared with nothing masked but the
    // per-render CSRF digest, which is fresh by design. Not "the same input
    // twice": that would be a tautology comparing a constant to itself.
    const fresh = await render('/e/signup?email=nobody-has-this@example.test');
    const taken = await render('/e/signup?email=already-registered@example.test');

    // The digest is the ONE legitimately-per-render value. Masking anything
    // else here would be masking the finding.
    const mask = (html: string) => html.replace(/[0-9a-f]{64}/g, '<CSRF>');

    expect(mask(fresh)).toBe(mask(taken));
    // Non-vacuity: the masked documents must be a real page, not two empty
    // strings or two error pages agreeing.
    expect(mask(fresh)).toContain('action="/e/account/signup"');
    expect(mask(fresh)).toContain('<CSRF>');
    // ...and the mask must not have eaten the whole document.
    expect(mask(fresh).length).toBeGreaterThan(500);
  });

  it('never sees the answer it could leak: no action export, no node-tier POST', async () => {
    // Structural, and the stronger half. The byte-comparison above proves the
    // loader does not branch TODAY on an input it is handed; this proves node
    // is never handed the backend's answer at all. An `action` export here
    // would put the 202/303 in node's hands, and rendering "that address is
    // taken" from it is then one edit away — an edit the byte test cannot see,
    // because the distinguishing document would be the POST response.
    const route = (await vite.ssrLoadModule('/app/routes/signup.tsx')) as Record<
      string,
      unknown
    >;

    expect(route.action).toBeUndefined();
    // Non-vacuity: the module really did load, and the exports it SHOULD have
    // are there. Without this, a typo'd path would make the assertion above
    // pass against an empty object.
    expect(typeof route.loader).toBe('function');
    expect(typeof route.headers).toBe('function');
    expect(typeof route.default).toBe('function');
  });

  it('carries the destination the entrant arrived with, without free text (E3)', async () => {
    // The journey the demo walk broke: on `/e/{slug}/enter`, "Sign in"
    // carried a `next` and "create one" did not, so signing up dropped the
    // entrant on a generic page with nothing linking back to the tournament
    // they were entering.
    //
    // What travels is a SLUG in the path — one segment, no free-form
    // destination — and this page composes the URL from it. The composed
    // value then goes through `safeNext`, the same allowlist `login.tsx`
    // validates against and the byte-identical twin of the backend's
    // `_SAFE_NEXT`, so the destination is checked at both tiers exactly as
    // the sign-in path's already is.
    const html = await render('/e/signup/spring-open');
    const next = /<input[^>]*name="next"[^>]*value="([^"]*)"/.exec(html)?.[1];

    expect(next).toBe('/e/spring-open/enter/created');
    // Same property the constant-`next` control below asserts, param-aware:
    // whatever this page posts, node serves it as a GET.
    const served = nodePaths(routes as RouteConfigEntry[]).map(
      (path) => new RegExp(`^${path.replace(/:[A-Za-z][A-Za-z0-9]*/g, '[^/]+')}$`),
    );
    expect(served.length).toBeGreaterThan(0);
    expect(served.some((pattern) => pattern.test(next!))).toBe(true);
    // …and the way back to a sign-in keeps the same journey.
    expect(html).toContain('href="/e/login?next=/e/spring-open/enter/signed-in"');
  });

  it('discards a crafted destination for the constant (E3)', async () => {
    // A slug is one path segment and is percent-encoded before it is
    // composed, so anything that is not slug-shaped stops being a path this
    // tier owns and `safeNext` hands back the fallback. The open-redirect
    // property is the reason the destination was a hard-coded constant in the
    // first place, and it is unchanged: nothing an attacker writes reaches
    // the `next` field.
    // A bare `..` is deliberately NOT in this list: a URL containing one is
    // normalised away before the request is ever made (`/e/signup/..` is
    // `/e/`), which is the same reason `safeNext` excludes it separately
    // rather than trusting the pattern. The encoded form below is the one
    // that can actually arrive.
    for (const crafted of ['%2F%2Fevil.example', 'https:%2F%2Fevil.example', '%2e%2e%2fadmin']) {
      const html = await render(`/e/signup/${crafted}`);
      const next = /<input[^>]*name="next"[^>]*value="([^"]*)"/.exec(html)?.[1];

      expect(next).toBe('/e/login/created');
      expect(html).not.toContain('evil.example');
    }
  });

  it('takes no argument through which an address could reach the loader', async () => {
    // `mintFormCsrf.length === 0` is pinned for the same reason in
    // `formCsrf.server.test.ts`: a function with no parameters is
    // structurally incapable of reading its caller's input. This loader
    // renders a fixed form and fetches one public projection; it has no
    // business being handed the request at all, and a zero-arity signature is
    // the cheapest possible proof that it is not.
    const route = (await vite.ssrLoadModule('/app/routes/signup.tsx')) as {
      loader: (...args: unknown[]) => unknown;
    };

    expect(route.loader.length).toBe(0);
  });
});

// ---- the document title (F-E1-2-E1 follow-up, browser-verified 2026-08-12) -

describe('the sign-up page titles its browser tab', () => {
  it('renders a non-empty <title>', async () => {
    // Same gap `login.test.ts` pins, on the sibling page `root.tsx`'s own
    // fallback-title comment names right alongside it: no `meta` export meant
    // no `<title>` element at all in the real SSR HTML, not merely an empty
    // one.
    const html = await render();

    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });
});
