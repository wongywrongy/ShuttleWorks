/**
 * The header's two session states, and the cache posture they force (SP-P7 §3.8).
 *
 * The shell used to render `My entries` AND `Sign in` to everybody, because
 * ruling R8-D says node never relays credentials and that was read as "node
 * can never know anything". It knows one thing now: whether a cookie by a
 * given NAME is present. That is not a relay (nothing is sent onward, nothing
 * is authenticated) and the argument lives in `app/lib/session.server.ts`.
 *
 * `sourceGuards.ts` names a helper of exactly this shape as the known blind
 * spot in its relay scan — "a new helper that wraps `request.headers.get(
 * 'cookie')` needs its own coverage (or this scan needs to grow), not an
 * assumption that this file would catch it". This file is that coverage, at
 * three altitudes: the function, the document, and the ingress that has to
 * deliver the cookie for any of it to work.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { ENTRANT_SESSION_COOKIE, hasEntrantSession } from '../app/lib/session.server';
import { forwardedCookie } from './helpers/nginxConf';
import { readAppSource } from './helpers/sourceGuards';
import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = { ...entryPageFixture, viewer: { signedIn: false, email: null, formCsrf: '' } };
const CONFIG = { turnstileSiteKey: '3x00000000000000000000FF', authMode: 'cloud' };

/** A plausible session cookie. The VALUE is never meant to matter. */
const SESSION = `${ENTRANT_SESSION_COOKIE}=s%3Aabc123.def456`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

function stubUpstream() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (url.endsWith('/e/api/config')) return json(CONFIG);
      if (url.includes('/e/api/pages'))
        return json({ tournaments: [], counts: { takingEntries: 0, completed: 0 }, now: null });
      if (url.endsWith('/e/api/page/spring-open')) return json(PAGE);
      return json({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'x' } }, 404);
    }),
  );
}

async function fetchPath(path: string, cookie?: string): Promise<Response> {
  stubUpstream();
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`, cookie ? { headers: { cookie } } : undefined),
  );
}

/** The header row only, so body links (the entry form has its own "Sign in")
 *  can never be mistaken for the nav state under test. */
function header(html: string): string {
  return html.slice(0, html.indexOf('</header>'));
}

// ---- the function ---------------------------------------------------------

describe('hasEntrantSession', () => {
  const req = (cookie?: string) =>
    new Request('http://entrant.test/e/', cookie ? { headers: { cookie } } : undefined);

  it('is false with no Cookie header at all', () => {
    expect(hasEntrantSession(req())).toBe(false);
  });

  it('is true when the session cookie is present', () => {
    expect(hasEntrantSession(req(SESSION))).toBe(true);
  });

  it('finds it among others, first or last', () => {
    expect(hasEntrantSession(req(`other=1; ${SESSION}; third=3`))).toBe(true);
    expect(hasEntrantSession(req(`${SESSION}; other=1`))).toBe(true);
  });

  it('matches the cookie NAME, not a substring anywhere in the header', () => {
    // The `includes()` spelling of this function would answer true to all
    // three. A cookie called `not_sw_play_session` belongs to nobody, and a
    // value that happens to contain the name is somebody else's data.
    expect(hasEntrantSession(req(`not_${ENTRANT_SESSION_COOKIE}=x`))).toBe(false);
    expect(hasEntrantSession(req(`other=${ENTRANT_SESSION_COOKIE}=x`))).toBe(false);
    expect(hasEntrantSession(req(`${ENTRANT_SESSION_COOKIE}_old=x`))).toBe(false);
  });

  it('is a boolean, so it cannot carry the credential it looked at', () => {
    // The return TYPE is the guarantee this module rests on. A `string | null`
    // here would be one refactor away from a header value.
    expect(typeof hasEntrantSession(req(SESSION))).toBe('boolean');
  });

  it('never lets the cookie VALUE out — the source reads the name only', () => {
    // Structural, because no behavioural test can see a value that is merely
    // read and dropped. The module may look at the inbound header exactly
    // once, and must never return, log or interpolate what it found.
    const source = readAppSource('lib/session.server.ts');
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(stripped.match(/headers\s*\.\s*get\s*\(/g)).toHaveLength(1);
    // Returning the binding itself, rather than a predicate over it. Written
    // to allow `return header.split(';').some(…)`, which returns a boolean.
    expect(stripped).not.toMatch(/return\s+header\s*(;|\?\?|\|\|)/);
    expect(stripped).not.toMatch(/console\./);
    // Nothing may interpolate the header into a string, which is how a value
    // reaches a log line, a URL or a header on the way out.
    expect(stripped).not.toMatch(/\$\{\s*header\b/);
    // `.split(';')` then `.startsWith(name=)` is the whole read. Splitting on
    // `=` would be reaching for the half this module must never hold.
    expect(stripped).not.toMatch(/split\s*\(\s*['"`]=/);
  });
});

// ---- the document ---------------------------------------------------------

describe('the header renders exactly one session state', () => {
  it('signed out: offers Sign in, and no My entries link at all', async () => {
    const html = header(await (await fetchPath('/e/')).text());

    expect(html).toMatch(/href="\/e\/login"[^>]*>\s*Sign in\s*</);
    // The §7 trap: a nav item pointing at an authed page is a state leak, and
    // clicking it just bounces to sign-in, which reads as broken.
    expect(html).not.toContain('/e/me/entries');
  });

  it('signed in: offers My entries, and no Sign in link at all', async () => {
    const html = header(await (await fetchPath('/e/', SESSION)).text());

    expect(html).toMatch(/href="\/e\/me\/entries"[^>]*>\s*My entries\s*</);
    expect(html).not.toContain('href="/e/login"');
  });

  it('the two states are the same header, differing only in that link', async () => {
    // Non-vacuity in the useful direction: if the signed-in branch had thrown
    // the shell away, both assertions above could pass on a broken page.
    const out = header(await (await fetchPath('/e/')).text());
    const inn = header(await (await fetchPath('/e/', SESSION)).text());

    for (const shell of ['ShuttleWorks', 'role="search"', 'Tournaments']) {
      expect(out).toContain(shell);
      expect(inn).toContain(shell);
    }
    expect(out).not.toEqual(inn);
  });

  it('an unrecognised cookie is a stranger', async () => {
    const html = header(await (await fetchPath('/e/', 'unrelated=1; theme=dark')).text());

    expect(html).toMatch(/href="\/e\/login"/);
    expect(html).not.toContain('/e/me/entries');
  });

  it('falls back to signed out where root has no loader data (unmatched URL)', async () => {
    // Root's ErrorBoundary renders INSTEAD of `Root`, so no provider exists
    // and `EntrantSessionContext`'s default decides. Signed out is the
    // fail-safe: a way in, rather than a link that would 401.
    const html = await (await fetchPath('/e/a/b/c', SESSION)).text();

    expect(html).not.toContain('/e/me/entries');
  });
});

// ---- the cache posture the branch forces ----------------------------------

describe('a viewer-dependent document never lands in a shared cache', () => {
  it('every document varies on Cookie', async () => {
    for (const path of ['/e/', '/e/spring-open', '/e/login']) {
      expect((await fetchPath(path)).headers.get('vary')).toContain('Cookie');
    }
  });

  it('a plain document is private', async () => {
    // Without this a CDN could store one visitor's document and replay the
    // signed-in header to the next. Cloudflare routinely ignores `Vary` on
    // anything but `Accept-Encoding`, so `private` is the half that bites.
    expect((await fetchPath('/e/')).headers.get('cache-control')).toBe('private');
  });

  it('does not weaken a route that already said no-store', async () => {
    // The CSRF-minting routes carry both halves of a double-submit token and
    // send `no-store` through their own `headers` export. Overwriting that
    // with `private` would let a browser cache reuse one visitor's nonce.
    expect((await fetchPath('/e/login')).headers.get('cache-control')).toContain('no-store');
  });
});

// ---- the ingress that has to deliver the cookie ---------------------------

describe('nginx actually forwards the cookie this all depends on', () => {
  it('passes the entrant session cookie through to the node upstream', () => {
    // The whole feature reads `false` for everybody, silently and forever, if
    // the play tier stops forwarding this cookie name to node. Run against the
    // real conf and the real regexes, not a copy of them.
    expect(forwardedCookie(`${SESSION}; junk=1`, '/e/')).toContain(
      `${ENTRANT_SESSION_COOKIE}=`,
    );
  });

  it('still drops the operator session on the way (SP-HOST-1)', () => {
    // Non-vacuity, and the property that matters more: the allowlist is an
    // allowlist. If it forwarded everything, the assertion above would pass
    // while the origin boundary had gone.
    expect(forwardedCookie('sw_session=operator-secret', '/e/') ?? '').not.toContain(
      'sw_session=operator-secret',
    );
  });
});
