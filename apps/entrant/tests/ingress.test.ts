/**
 * The ingress contract, asked of the nginx config rather than grepped from it
 * (Task 22, extended by SP-HOST-1).
 *
 * Every assertion below runs the real matching rules over the real files:
 * `resolve()` implements nginx's exact-then-longest-prefix order and
 * `forwardedCookie()` executes the config's own `map` regexes. The three
 * mutations this suite exists to catch were each verified RED against a
 * running nginx before the suite was written — see task-22-report.md:
 *
 *   - `/e/` repointed at `backend:8000` (the state that shipped): every
 *     node-owned route reaches FastAPI, which serves none of them.
 *   - `proxy_set_header Cookie $http_cookie`: the operator's `sw_session`
 *     arrives at the node process.
 *   - `location = /robots.txt` deleted: the origin root serves the SPA's
 *     index.html and the file is inert again.
 *
 * SP-HOST-1 added a fourth thing worth catching, and it is the reason the
 * suite is now organised by TIER: the operator console and the public entrant
 * site are two `server` blocks on two ports, published as two hostnames, so
 * that a browser treats them as two ORIGINS. The assertions that matter most
 * here are the ones about what is ABSENT from a tier — the play tier has no
 * `/api/` location, and the console tier has no `/e/` — because an origin
 * boundary is made of absences.
 *
 * What this suite does NOT prove: that nginx is configured the way this model
 * says it is. `nginx -t` and a container run cover that, and the SP-HOST-1
 * ledger records both.
 */
import { describe, expect, it } from 'vitest';
import type { RouteConfigEntry } from '@react-router/dev/routes';

import routes from '../app/routes';
import rrConfig from '../react-router.config';
import viteConfig from '../vite.config';
import { contains } from './helpers/cidr';
import { nodePaths } from './helpers/nodePaths';
import {
  assertModelHolds,
  assertOneServerBlockPerTier,
  backendPrefixes,
  directive,
  forwardedCookie,
  headersSnippet,
  listenPorts,
  locations,
  proxyPass,
  proxySetHeader,
  resolve,
  serverBlockCount,
  sharedSource,
  tierSource,
  upstreamFor,
} from './helpers/nginxConf';

const ENTRANT = 'entrant:3000';
const BACKEND = 'backend:8000';

const CONSOLE = locations(tierSource('console'));
const PLAY = locations(tierSource('play'));

/** Where a URL lands on a given tier. */
const onConsole = (path: string) => resolve(path, CONSOLE);
const onPlay = (path: string) => resolve(path, PLAY);

describe('the model still describes the files', () => {
  it('parses a plausible number of locations per tier and no unmodelled construct', () => {
    // Non-vacuity: an empty parse would make every routing assertion below
    // pass by never matching anything.
    for (const all of [CONSOLE, PLAY]) {
      expect(all.length).toBeGreaterThan(4);
      expect(all.some((l) => l.kind === 'exact')).toBe(true);
      expect(all.some((l) => l.kind === 'prefix')).toBe(true);
      expect(() => assertModelHolds(all)).not.toThrow();
    }
  });

  it('keeps exactly one server block per tier file, and none in the shared one', () => {
    // THE ASSERTION THIS MODULE'S CORRECTNESS RESTS ON (SP-HOST-1 F-8).
    // `locations()` does not track which `server {}` encloses a location, so
    // two blocks in one file would merge the tiers and leave every routing
    // assertion here green while describing a config nginx never serves —
    // including, specifically, "the operator API is unreachable from the
    // public origin", which would go from proven to assumed without a single
    // test turning red.
    expect(() => assertOneServerBlockPerTier()).not.toThrow();
    expect(serverBlockCount(sharedSource())).toBe(0);
    expect(serverBlockCount(tierSource('console'))).toBe(1);
    expect(serverBlockCount(tierSource('play'))).toBe(1);
  });

  it('resolves by longest prefix, not by source order', () => {
    // The property the whole R8-A split rests on, stated on a case with a
    // known answer: `/e/api/x` is matched by BOTH `/e/` and `/e/api/`.
    expect(onPlay('/e/api/x').path).toBe('/e/api/');
    expect(onPlay('/e/anything-else').path).toBe('/e/');
  });
});

describe('SP-HOST-1: the two tiers are two ports, and neither can serve the other', () => {
  it('listens on one port per tier, and they differ', () => {
    // Two ports is what lets the tunnel publish two HOSTNAMES from one
    // container, which is what makes the browser see two ORIGINS. Derived
    // from the `listen` directives so the CSP maps below can be checked
    // against them rather than against a repeated literal.
    expect(listenPorts('console')).toEqual([8080]);
    expect(listenPorts('play')).toEqual([8081]);
  });

  it('gives the public tier NO route to the operator API', () => {
    // The routing half of the origin boundary. `/api/` must not resolve to a
    // proxy on the play tier — it falls through to the catch-all, which
    // returns 404 and reaches no upstream at all.
    for (const path of ['/api/tournaments', '/api/auth/login', '/api/display/x']) {
      const landing = onPlay(path);
      expect(landing.path).toBe('/');
      expect(proxyPass(landing)).toBeNull();
      expect(landing.body).toMatch(/return\s+404\s*;/);
    }
    // ...and no location on that tier proxies to anything but the two
    // upstreams it is allowed to reach.
    for (const location of PLAY.filter((l) => proxyPass(l) !== null)) {
      expect({
        path: location.path,
        host: new URL(proxyPass(location) as string).host,
      }).toEqual({ path: location.path, host: expect.stringMatching(/^(entrant:3000|backend:8000)$/) });
    }
  });

  it('gives the public tier no filesystem to serve from and no SPA to fall back to', () => {
    // `root` is unset in play.conf, and the catch-all returns rather than
    // `try_files`. A fallback that served the operator bundle here would be
    // the split undone by the one location nobody reads.
    expect(directive('root', tierSource('play'))).toEqual([]);
    // Comments stripped first: this file EXPLAINS that it has no `try_files`,
    // and a scanner that cannot tell prose from a directive punishes a file
    // for documenting itself.
    expect(tierSource('play').replace(/^\s*#.*$/gm, '')).not.toMatch(/try_files/);
    expect(onPlay('/anything-at-all').body).toMatch(/return\s+404\s*;/);
  });

  it('gives the operator tier no route to the entrant surface', () => {
    // The other half. `/e/...` on the console host is a stale link to a
    // surface that moved hosts; the SPA's own 404 route is the honest answer,
    // and crucially it reaches neither node nor the entrant API.
    for (const path of ['/e/', '/e/summer-open', '/e/api/config', '/e/account/login']) {
      const landing = onConsole(path);
      expect(landing.path).toBe('/');
      expect(proxyPass(landing)).toBeNull();
    }
    expect(backendPrefixes(CONSOLE)).toEqual([]);
  });

  it('names no hostname in any conf file', () => {
    // Invariant I1: the domain is configuration, never code. These files are
    // baked into an image at build time, so a hostname here could not be
    // changed by a deployment even if it wanted to. The tunnel does hostname
    // routing; `server_name localhost` constrains nothing and is not meant
    // to, because each port carries exactly one server block.
    const sources = [sharedSource(), tierSource('console'), tierSource('play')];
    for (const source of sources) {
      const code = source.replace(/^\s*#.*$/gm, '');
      // The only absolute URLs permitted are compose-network service names,
      // plus Turnstile's origin — a THIRD-PARTY host named in a CSP, which is
      // the opposite of a deployment hostname: it is fixed by Cloudflare, the
      // same in every deployment, and cannot be configuration.
      for (const [url] of code.matchAll(/https?:\/\/[^\s;"']+/g)) {
        expect(url).toMatch(
          /^(http:\/\/(backend:8000|entrant:3000)|https:\/\/challenges\.cloudflare\.com)/,
        );
      }
      expect(directive('server_name', source).every((v) => v === 'localhost')).toBe(true);
    }
  });
});

describe('redirects stay relative, because nginx cannot see the public origin', () => {
  // THE BUG THIS EXISTS FOR SHIPPED (2026-08-24, live on the play host).
  //
  // nginx defaults to `absolute_redirect on` and rebuilds Location from the
  // request host plus ITS OWN listen port and scheme. Behind the tunnel that
  // is wrong twice over, and the bare domain answered
  //   Location: http://play.<domain>:8081/e/
  // — a port Cloudflare does not serve, over a scheme the browser did not
  // use. Typing the bare hostname hung. Deep links to `/e/…` were fine, which
  // is precisely why every smoke check missed it.
  //
  // Verified against a real container before and after the one-line fix, on
  // all three affected paths.

  it('turns absolute redirects off, once, in http context', () => {
    // http context and not per-server: the reason is identical for both tiers
    // and a per-server pair is two places for the next tier to forget.
    expect(directive('absolute_redirect', sharedSource())).toEqual(['off']);
  });

  it('lets no tier turn it back on', () => {
    // `absolute_redirect` is valid in server and location context too, so the
    // http-level setting is overridable. Nothing may override it.
    for (const tier of ['console', 'play'] as const) {
      expect({ tier, override: directive('absolute_redirect', tierSource(tier)) })
        .toEqual({ tier, override: [] });
    }
  });

  it('writes every redirect target as a path, never an absolute URL', () => {
    // Belt and braces, and it catches the OTHER way to reintroduce the bug:
    // `absolute_redirect off` governs what nginx BUILDS, not what a
    // `return 301 https://…;` says outright. Derived from the configs so a
    // third redirect added later is covered without touching this file.
    const returns = [...CONSOLE, ...PLAY].flatMap((l) =>
      [...l.body.matchAll(/\breturn\s+30[12]\s+(\S+?)\s*;/g)].map((m) => ({
        path: l.path,
        target: m[1],
      })),
    );
    // Non-vacuity: the play tier ships two of these (`= /e` and `= /`).
    expect(returns.length).toBeGreaterThanOrEqual(2);
    for (const r of returns) {
      expect(r).toEqual({ path: r.path, target: expect.stringMatching(/^\//) });
    }
  });

  it('NEGATIVE CONTROL: the matcher sees an absolute target as a finding', () => {
    // If the regex above stopped matching, the loop would pass over a pasted
    // `return 301 https://play.example.com/e/;` and prove nothing.
    const sample = 'location = / { return 301 https://play.example.com/e/; }';
    const hits = [...sample.matchAll(/\breturn\s+30[12]\s+(\S+?)\s*;/g)].map((m) => m[1]);
    expect(hits).toEqual(['https://play.example.com/e/']);
    expect(hits.every((t) => t.startsWith('/'))).toBe(false);
  });
});

describe('ruling R8-A: the /e/ prefix is split across two tiers of the PLAY host', () => {
  it('names exactly the two FastAPI prefixes', () => {
    expect(backendPrefixes(PLAY)).toEqual(['/e/account/', '/e/api/']);
  });

  it.each(nodePaths(routes as RouteConfigEntry[]))(
    'sends the node-owned route %s to the entrant tier',
    (path) => {
      // DERIVED from app/routes.ts: a route added tomorrow is checked
      // tomorrow, with no list for anyone to remember to update. `:slug` is
      // substituted because nginx matches URLs, not route patterns.
      expect(upstreamFor(path.replace(/:\w+/g, 'sample'), PLAY)).toBe(ENTRANT);
    },
  );

  it.each(backendPrefixes(PLAY))('sends %s to FastAPI', (prefix) => {
    expect(upstreamFor(`${prefix}whatever`, PLAY)).toBe(BACKEND);
  });

  it('preserves the request URI to node, which mounts on the /e/ basename', () => {
    // A trailing `/` on this proxy_pass would strip the prefix and every
    // request would be "No route matches URL" — the app's basename is
    // `/e/`. nginx also refuses a URI part in the named location, so the
    // same mistake there fails `nginx -t` outright.
    expect(proxyPass(onPlay('/e/health'))).toBe(`http://${ENTRANT}`);
  });

  it('keeps the entrant surface on its own rate-limit zone', () => {
    for (const path of ['/e/health', '/e/api/x', '/e/account/login', '/robots.txt']) {
      expect(onPlay(path).body).toMatch(/limit_req\s+zone=sw_entries/);
    }
  });

  it('applies the shared security-headers snippet on every entrant path', () => {
    for (const path of ['/e/health', '/e/api/x', '/e/account/login', '/robots.txt']) {
      expect(onPlay(path).body).toContain('snippets/security-headers.conf');
    }
  });
});

describe('the rate-limit bucket cannot be chosen by the client', () => {
  // The zones used to key on `map $http_cf_connecting_ip $sw_limit_key`,
  // justified by a premise stated in the file: "nginx publishes no host port
  // in any shipped stack, so the only route in is cloudflared, which
  // overwrites the header". The premise was FALSE — `docker-compose.yml`
  // publishes `${FRONTEND_HOST_PORT:-80}:8080` and
  // `docker-compose.release.yml` publishes `80:8080` — so on those stacks a
  // client sends `CF-Connecting-IP: <random>` per request, every zone becomes
  // a fresh bucket, and `sw_auth`/`sw_entries`/`sw_display` limit nothing at
  // all.
  //
  // The replacement is nginx's own realip module, which believes the header
  // ONLY from a peer in `set_real_ip_from` — so there is no premise left to
  // keep true. These assertions are the ones that go red if the map comes
  // back.
  //
  // SP-HOST-1 moved all of it into `http-shared.conf`: a `limit_req_zone` may
  // be declared once, and both tiers meter. Re-run here against that file,
  // which is a re-run and not a relaxation — the ingress moved, the property
  // did not.

  it('keys every zone on the connection address, never on a header', () => {
    const zones = directive('limit_req_zone', sharedSource());
    // Non-vacuity: an empty list would make the loop below trivially true.
    expect(zones.length).toBeGreaterThan(2);
    for (const zone of zones) {
      expect(zone, 'a $http_* key is client-chosen: one header per request = one bucket per request').toMatch(
        /^\$binary_remote_addr\s/,
      );
    }
  });

  it('rewrites that address from CF-Connecting-IP only for a trusted peer', () => {
    expect(directive('real_ip_header', sharedSource())).toEqual(['CF-Connecting-IP']);
    const trusted = directive('set_real_ip_from', sharedSource());
    expect(trusted.length).toBeGreaterThan(0);
    for (const range of trusted) {
      // The negative control that matters: a range covering the internet
      // (`0.0.0.0/0`, or a "temporary" widening) restores the spoof outright,
      // and every other assertion here would stay green.
      expect(contains(range, '203.0.113.7'), `${range} trusts the public internet`).toBe(false);
    }
  });

  it('overwrites the header on the way upstream, on every path that proxies, on BOTH tiers', () => {
    // nginx forwards client request headers verbatim unless told otherwise,
    // so without this the backend — which trusts THIS proxy — would receive
    // whatever CF-Connecting-IP the client typed. `$remote_addr` is the
    // address realip has already vouched for: the real client behind the
    // tunnel, the socket peer everywhere else.
    const proxying = [...CONSOLE, ...PLAY].filter((l) => proxyPass(l) !== null);
    expect(proxying.length).toBeGreaterThan(5);
    for (const location of proxying) {
      expect({
        path: location.path,
        header: proxySetHeader(location, 'CF-Connecting-IP'),
      }).toEqual({ path: location.path, header: '$remote_addr' });
    }
  });
});

describe('the forwarded Host keeps its port', () => {
  // `$host` is the Host header with the PORT STRIPPED. The node tier
  // reconstructs its own URL from what arrives (`@react-router/express`
  // builds `${req.protocol}://${req.hostname}${port}${req.originalUrl}`), and
  // React Router 7 runs `throwIfPotentialCSRFAttack` on every action request,
  // comparing that URL's origin to the browser's `Origin`. On any non-default
  // port they disagree — `http://localhost` vs `http://localhost:8090` — so
  // EVERY entrant action POST answered 400 through this proxy. Proven by
  // isolating the single variable against the running stack: the same POST
  // with `origin: http://localhost` answered 200.
  //
  // It broke a shipped feature independently: `/e/sitemap.xml` published
  // `<loc>http://localhost/e/…</loc>` — an unreachable URL.
  //
  // 443 and 80 hide it, which is why the cloudflared self-host stack was fine
  // and dev was not. It also gets sharper under SP-HOST-1: the play tier
  // listens on 8081, so a laptop reaching it reaches a non-default port by
  // construction.
  it('forwards $http_host, not $host, from every location that proxies', () => {
    const proxying = [...CONSOLE, ...PLAY].filter((l) => proxyPass(l) !== null);
    expect(proxying.length).toBeGreaterThan(5);
    for (const location of proxying) {
      expect(
        { path: location.path, host: proxySetHeader(location, 'Host') },
      ).toEqual({ path: location.path, host: '$http_host' });
    }
  });
});

describe('the operator session cannot reach the node process', () => {
  // Since SP-HOST-1 the browser does not send `sw_session` to the play host
  // at all — it is host-only, and the two tiers are two origins. This
  // allowlist is therefore no longer the load-bearing control, and it stays
  // anyway: it is what makes the property hold for a request that arrives
  // some OTHER way (a host-published port in a dev stack, a hand-written
  // jar). A control removed because the layer above it currently makes it
  // redundant is a control absent the day that layer moves.
  const OPERATOR = 'sw_session=OPERATOR-SESSION-VALUE';

  it('forwards only the entrant cookies, whatever else is in the jar', () => {
    const forwarded = forwardedCookie(
      `${OPERATOR}; sw_play_session=PLAY1; sw_play_csrf=NONCE1`,
    );
    expect(forwarded).toContain('sw_play_session=PLAY1');
    expect(forwarded).toContain('sw_play_csrf=NONCE1');
    expect(forwarded).not.toContain('OPERATOR-SESSION-VALUE');
  });

  it('sends no Cookie header at all when only an operator session is present', () => {
    expect(forwardedCookie(OPERATOR)).toBeNull();
    expect(forwardedCookie('')).toBeNull();
  });

  it('anchors each cookie name to a boundary', () => {
    // Without `(?:^|;\s*)` a visitor-set `evil_sw_play_session` is harvested
    // as if it were the real one.
    expect(forwardedCookie('evil_sw_play_session=SPOOFED')).toBeNull();
  });

  it('does not rewrite a differently-cased cookie into a real-looking one', () => {
    // Cookie names are case-sensitive (RFC 6265 §4.1.1). Under `~*` this
    // returned `sw_play_session=UPPER` — a cookie the browser and the
    // backend both consider a different cookie, laundered into the real
    // name on its way to node.
    expect(forwardedCookie('SW_PLAY_SESSION=UPPER')).toBeNull();
  });

  it('never forwards a cookie on the anonymous-by-definition route', () => {
    // A robots fetch is by definition anonymous and has no business carrying
    // a credential. An explicitly empty value makes nginx omit the header
    // entirely. (This used to cover the `@entrant_assets` fallback too; that
    // location is gone — the entrant tier emits `/e/assets/*` now, which
    // rides `location /e/` and its allowlist like every other node path.)
    expect(proxySetHeader(onPlay('/robots.txt'), 'Cookie')).toBe('');
  });
});

describe('the operator session cannot reach the entrant API either', () => {
  // The 2026-08-10 browser pass. `sw_session` was stopped at the node tier
  // and waved through to FastAPI's half of the same split prefix, where the
  // backend's CSRF middleware read its mere PRESENCE and switched off the
  // only proof channel a scriptless form has — so a director who had signed
  // into the console could not log in, sign up or enter on the public site.
  // The backend fix is the one that has to be right (local dev has no
  // nginx); this is the tier that makes the collision impossible to have.
  const OPERATOR = 'sw_session=OPERATOR-SESSION-VALUE';
  const prefixes = backendPrefixes(PLAY);

  it.each(prefixes)('forwards only the entrant cookies to %s', (prefix) => {
    const forwarded = forwardedCookie(
      `${OPERATOR}; sw_play_session=PLAY1; sw_play_csrf=NONCE1`,
      `${prefix}anything`,
    );
    expect(forwarded).toContain('sw_play_session=PLAY1');
    expect(forwarded).toContain('sw_play_csrf=NONCE1');
    expect(forwarded).not.toContain('OPERATOR-SESSION-VALUE');
    expect(forwarded).not.toContain('sw_session=');
  });

  it.each(prefixes)('sends no Cookie at all to %s for an operator-only jar', (prefix) => {
    expect(forwardedCookie(OPERATOR, `${prefix}anything`)).toBeNull();
  });

  it.each(prefixes)('launders no near-miss cookie name into %s', (prefix) => {
    // The boundary the `~*`-to-`~` tightening was about, asked of the new
    // locations: an allowlist that harvested `evil_sw_play_session` or
    // rewrote `SW_PLAY_SESSION` would hand the backend a cookie the browser
    // never sent under that name. `evil_sw_session` / `sw_session_x` are the
    // other direction — neither is on the list, so neither is forwarded, and
    // neither can be mistaken for the operator cookie downstream.
    const path = `${prefix}anything`;
    expect(forwardedCookie('evil_sw_session=X; sw_session_x=Y', path)).toBeNull();
    expect(forwardedCookie('evil_sw_play_session=SPOOFED', path)).toBeNull();
    expect(forwardedCookie('SW_PLAY_SESSION=UPPER', path)).toBeNull();
    expect(forwardedCookie('sw_play_session_x=NOPE', path)).toBeNull();
  });

  it('leaves the operator API untouched — the allowlist is the entrant surface only', () => {
    // Negative control on reach: `/api/` is the console's own plane and MUST
    // keep carrying `sw_session`, or this "fix" signs every director out.
    expect(proxySetHeader(onConsole('/api/tournaments'), 'Cookie')).toBeNull();
    expect(forwardedCookie(OPERATOR, '/api/tournaments', 'console')).toBe(OPERATOR);
  });
});

describe('RFC 9309: robots.txt is served from the origin root of BOTH hosts', () => {
  it('maps the play root path onto the app copy, exactly and only', () => {
    const root = onPlay('/robots.txt');
    expect(root.kind).toBe('exact');
    expect(proxyPass(root)).toBe(`http://${ENTRANT}/e/robots.txt`);
    // One body, not two: the app's own path still serves the same file.
    expect(upstreamFor('/e/robots.txt', PLAY)).toBe(ENTRANT);
    // A near miss must NOT be captured by the exact match — and on this tier
    // the fallthrough is a 404, not an SPA.
    expect(onPlay('/robots.txt.bak').path).toBe('/');
  });

  it('refuses the whole operator origin, from the operator origin', () => {
    // The console host used to have no robots of its own: the origin-root
    // file proxied into the entrant app, whose body spoke for both tiers
    // (`Disallow: /` then `Allow: /e/`). Split apart, that body belongs to
    // the play host and this host needs its own — and it is not made
    // redundant by Cloudflare Access, because §4a requires two Bypass rules
    // for the display plane and a leaked capability link is exactly what
    // those make crawlable.
    const root = onConsole('/robots.txt');
    expect(root.kind).toBe('exact');
    expect(proxyPass(root)).toBeNull();
    expect(root.body).toMatch(/Disallow: \//);
    expect(root.body).not.toMatch(/Allow: /);
  });
});

describe('bare paths reach the entrant tier, not a dead end', () => {
  it('redirects the trailing-slash-less /e instead of letting it fall through', () => {
    // `/e` matched no location, so it fell through to `location /` — the
    // operator SPA's index.html and a blank operator route, which is verbatim
    // the symptom the explicit `/e/` block exists to prevent. And `/e` is a
    // plausible mistyping of a poster URL.
    const bare = onPlay('/e');
    expect(bare.kind).toBe('exact');
    expect(bare.body).toMatch(/return\s+301\s+\/e\/\s*;/);
    // A near miss must NOT be captured by the exact match.
    expect(onPlay('/elsewhere').path).toBe('/');
  });

  it('redirects the bare play origin onto the discovery page', () => {
    // Someone who types the play hostname into a phone should land on
    // discovery, not a 404. A redirect rather than a second mount point, so
    // there is one canonical URL per page and the sitemap stays honest.
    const root = onPlay('/');
    expect(root.kind).toBe('exact');
    expect(root.body).toMatch(/return\s+301\s+\/e\/\s*;/);
  });
});

describe('the two tiers no longer collide on /assets/', () => {
  // Both used to emit `/assets/<hash>` at the ORIGIN ROOT, where the operator
  // SPA's asset directory answered first and 404'd every entrant asset — so
  // entrant pages arrived unstyled in every deployed stack, with no 500
  // anywhere to notice. nginx papered over it with `try_files $uri
  // @entrant_assets`, which was also the one route into the node tier with no
  // `limit_req` on it. Fixed at the source: `vite.config.ts` sets
  // `base: '/e/'`, so the collision, the fallback and the unmetered path are
  // all gone. Under SP-HOST-1 the two are on separate origins as well, but
  // `base` is still what stops the entrant tier asking its own host for a
  // path it does not serve.

  it('emits its assets under a prefix nginx already routes to the node tier', () => {
    // DERIVED from the config that decides it, not from a literal: `base` is
    // what `@react-router/dev` uses as `publicPath` (the prefix stamped onto
    // every emitted URL) and what `@react-router/serve` mounts its static
    // dirs at. Reverting it to `/` fails here rather than in a browser.
    expect(viteConfig.base).toBe(rrConfig.basename);
    expect(upstreamFor(`${viteConfig.base}assets/app-hash.css`, PLAY)).toBe(ENTRANT);
    // ...and it is metered and cookie-filtered like every other node path,
    // because it is `location /e/` that answers it.
    expect(onPlay(`${viteConfig.base}assets/x.js`).path).toBe('/e/');
  });

  it('leaves the operator bundle on disk with no fallback into node', () => {
    // The negative half. A `try_files` here — or any named location for it to
    // reach — is the collision workaround coming back.
    const assets = onConsole('/assets/x.js');
    expect(proxyPass(assets)).toBeNull();
    expect(assets.body).not.toMatch(/try_files/);
    expect([...CONSOLE, ...PLAY].filter((l) => l.kind === 'named')).toEqual([]);
  });
});

describe('SP-HOST-1 D-6: the public tier carries the tighter CSP', () => {
  // One `security-headers.conf`, included by every location on both tiers,
  // with three directives varying by `$server_port`. A per-tier COPY was the
  // obvious alternative and is the wrong one: nginx cannot OVERRIDE an
  // add_header, so a variant means duplicating the whole list (drift), and
  // two Content-Security-Policy headers are enforced as their INTERSECTION,
  // which would silently tighten the other tier too.
  const snippet = headersSnippet();
  const shared = sharedSource();

  /** A `map $server_port $name { … }` as {key: value}. */
  function portMap(name: string): Record<string, string> {
    const open = shared.indexOf(`map $server_port $${name}`);
    expect(open, `no map for $${name}`).toBeGreaterThan(-1);
    const body = shared.slice(open, shared.indexOf('}', open));
    return Object.fromEntries(
      [...body.matchAll(/^\s*(default|\d+)\s+"([^"]*)"\s*;/gm)].map((m) => [m[1], m[2]]),
    );
  }

  it('varies exactly the three directives that should differ, and no others', () => {
    for (const name of ['sw_connect_src', 'sw_frame_ancestors', 'sw_frame_options']) {
      expect(snippet, `${name} is not interpolated into a header`).toContain(`$${name}`);
    }
    // Everything the two tiers share stays a literal in the one list. If
    // `script-src` or `form-action` ever becomes per-tier, that is a decision
    // that should break this test and be argued rather than slid in.
    expect(snippet).toContain("script-src 'self'$sw_turnstile_origin");
    expect(snippet).toContain("form-action 'self'");
    expect(snippet).toContain("object-src 'none'");
  });

  it('keys each map on the PLAY tier’s real listen port', () => {
    // Derived, not repeated. A tier that moved ports while these maps stayed
    // put would silently serve the console policy to the public internet, and
    // nothing else in the suite would notice.
    const playPort = String(listenPorts('play')[0]);
    for (const name of ['sw_connect_src', 'sw_frame_ancestors', 'sw_frame_options']) {
      expect(Object.keys(portMap(name)).sort()).toEqual(['default', playPort].sort());
    }
  });

  it('gives the public tier the stricter value in every case', () => {
    const playPort = String(listenPorts('play')[0]);
    expect(portMap('sw_connect_src')).toEqual({ default: "'self'", [playPort]: "'none'" });
    expect(portMap('sw_frame_ancestors')).toEqual({ default: "'self'", [playPort]: "'none'" });
    expect(portMap('sw_frame_options')).toEqual({ default: 'SAMEORIGIN', [playPort]: 'DENY' });
  });

  it('defaults to the OPERATOR value, so a new tier fails safe-ish rather than public-strict', () => {
    // The direction matters. `default` is what an unlisted port gets, and the
    // console policy is the looser of the two — but it is also exactly what
    // shipped before the split, so a mis-keyed map is a regression to the
    // status quo rather than a new hole. The public tier is the one that has
    // to opt IN, which is the safe direction for the surface facing the
    // internet.
    expect(portMap('sw_connect_src').default).toBe("'self'");
    expect(portMap('sw_frame_options').default).toBe('SAMEORIGIN');
  });

  it('still sends the security headers from every location on both tiers', () => {
    // SEC-02: nginx drops the inherited add_header list in any location that
    // declares one of its own, so the snippet has to be re-included there.
    // The maps change the POLICY's value, never whether it is sent.
    //
    // Bare redirects are excluded, and only they: a `return 301` emits a
    // Location header and no body, so there is no document for a CSP or a
    // frame policy to govern. Anything that serves or proxies content is in
    // scope, which is what the filter says — a location that stopped
    // including the snippet could not slip through by adding a `return`,
    // because it would have to drop its `proxy_pass` to do so.
    const rendersSomething = [...CONSOLE, ...PLAY].filter(
      (l) => !/^\s*return\s+30[12]\s/m.test(l.body.trim()),
    );
    expect(rendersSomething.length).toBeGreaterThan(8);
    for (const location of rendersSomething) {
      expect({ path: location.path, included: location.body.includes('security-headers.conf') })
        .toEqual({ path: location.path, included: true });
    }
  });
});
