/**
 * The ingress contract, asked of `frontend/nginx.conf` rather than grepped
 * from it (Task 22).
 *
 * Every assertion below runs the real matching rules over the real file:
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
 * What this suite does NOT prove: that nginx is configured the way this
 * model says it is. `nginx -t` and a container run cover that, and the
 * report records both.
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
  backendPrefixes,
  directive,
  forwardedCookie,
  locations,
  proxyPass,
  proxySetHeader,
  resolve,
  upstreamFor,
} from './helpers/nginxConf';

const ENTRANT = 'entrant:3000';
const BACKEND = 'backend:8000';

describe('the model still describes the file', () => {
  it('parses a plausible number of locations and no unmodelled construct', () => {
    // Non-vacuity: an empty parse would make every routing assertion below
    // pass by never matching anything.
    const all = locations();
    expect(all.length).toBeGreaterThan(5);
    expect(all.some((l) => l.kind === 'exact')).toBe(true);
    expect(all.some((l) => l.kind === 'prefix')).toBe(true);
    expect(() => assertModelHolds(all)).not.toThrow();
  });

  it('resolves by longest prefix, not by source order', () => {
    // The property the whole R8-A split rests on, stated on a case with a
    // known answer: `/e/api/x` is matched by BOTH `/e/` and `/e/api/`.
    expect(resolve('/e/api/x').path).toBe('/e/api/');
    expect(resolve('/e/anything-else').path).toBe('/e/');
  });
});

describe('ruling R8-A: the /e/ prefix is split across two tiers', () => {
  it('names exactly the two FastAPI prefixes', () => {
    expect(backendPrefixes()).toEqual(['/e/account/', '/e/api/']);
  });

  it.each(nodePaths(routes as RouteConfigEntry[]))(
    'sends the node-owned route %s to the entrant tier',
    (path) => {
      // DERIVED from app/routes.ts: a route added tomorrow is checked
      // tomorrow, with no list for anyone to remember to update. `:slug` is
      // substituted because nginx matches URLs, not route patterns.
      expect(upstreamFor(path.replace(/:\w+/g, 'sample'))).toBe(ENTRANT);
    },
  );

  it.each(backendPrefixes())('sends %s to FastAPI', (prefix) => {
    expect(upstreamFor(`${prefix}whatever`)).toBe(BACKEND);
  });

  it('preserves the request URI to node, which mounts on the /e/ basename', () => {
    // A trailing `/` on this proxy_pass would strip the prefix and every
    // request would be "No route matches URL" — the app's basename is
    // `/e/`. nginx also refuses a URI part in the named location, so the
    // same mistake there fails `nginx -t` outright.
    expect(proxyPass(resolve('/e/health'))).toBe(`http://${ENTRANT}`);
  });

  it('keeps the entrant surface on its own rate-limit zone', () => {
    for (const path of ['/e/health', '/e/api/x', '/e/account/login', '/robots.txt']) {
      expect(resolve(path).body).toMatch(/limit_req\s+zone=sw_entries/);
    }
  });

  it('applies the shared security-headers snippet on every entrant path', () => {
    for (const path of ['/e/health', '/e/api/x', '/e/account/login', '/robots.txt']) {
      expect(resolve(path).body).toContain('snippets/security-headers.conf');
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

  it('keys every zone on the connection address, never on a header', () => {
    const zones = directive('limit_req_zone');
    // Non-vacuity: an empty list would make the loop below trivially true.
    expect(zones.length).toBeGreaterThan(2);
    for (const zone of zones) {
      expect(zone, 'a $http_* key is client-chosen: one header per request = one bucket per request').toMatch(
        /^\$binary_remote_addr\s/,
      );
    }
  });

  it('rewrites that address from CF-Connecting-IP only for a trusted peer', () => {
    expect(directive('real_ip_header')).toEqual(['CF-Connecting-IP']);
    const trusted = directive('set_real_ip_from');
    expect(trusted.length).toBeGreaterThan(0);
    for (const range of trusted) {
      // The negative control that matters: a range covering the internet
      // (`0.0.0.0/0`, or a "temporary" widening) restores the spoof outright,
      // and every other assertion here would stay green.
      expect(contains(range, '203.0.113.7'), `${range} trusts the public internet`).toBe(false);
    }
  });

  it('overwrites the header on the way upstream, on every path that proxies', () => {
    // nginx forwards client request headers verbatim unless told otherwise,
    // so without this the backend — which trusts THIS proxy — would receive
    // whatever CF-Connecting-IP the client typed. `$remote_addr` is the
    // address realip has already vouched for: the real client behind the
    // tunnel, the socket peer everywhere else.
    const proxying = locations().filter((l) => proxyPass(l) !== null);
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
  // and dev was not.
  it('forwards $http_host, not $host, from every location that proxies', () => {
    const proxying = locations().filter((l) => proxyPass(l) !== null);
    expect(proxying.length).toBeGreaterThan(5);
    for (const location of proxying) {
      expect(
        { path: location.path, host: proxySetHeader(location, 'Host') },
      ).toEqual({ path: location.path, host: '$http_host' });
    }
  });
});

describe('the operator session cannot reach the node process', () => {
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
    expect(proxySetHeader(resolve('/robots.txt'), 'Cookie')).toBe('');
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
  const prefixes = backendPrefixes();

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
    expect(proxySetHeader(resolve('/api/tournaments'), 'Cookie')).toBeNull();
    expect(forwardedCookie(OPERATOR, '/api/tournaments')).toBe(OPERATOR);
  });
});

describe('RFC 9309: robots.txt is served from the origin root', () => {
  it('maps the root path onto the app copy, exactly and only', () => {
    const root = resolve('/robots.txt');
    expect(root.kind).toBe('exact');
    expect(proxyPass(root)).toBe(`http://${ENTRANT}/e/robots.txt`);
    // One body, not two: the app's own path still serves the same file.
    expect(upstreamFor('/e/robots.txt')).toBe(ENTRANT);
    // A near miss must NOT be captured by the exact match.
    expect(resolve('/robots.txt.bak').path).toBe('/');
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
  // all gone.

  it('emits its assets under a prefix nginx already routes to the node tier', () => {
    // DERIVED from the config that decides it, not from a literal: `base` is
    // what `@react-router/dev` uses as `publicPath` (the prefix stamped onto
    // every emitted URL) and what `@react-router/serve` mounts its static
    // dirs at. Reverting it to `/` fails here rather than in a browser.
    expect(viteConfig.base).toBe(rrConfig.basename);
    expect(upstreamFor(`${viteConfig.base}assets/app-hash.css`)).toBe(ENTRANT);
    // ...and it is metered and cookie-filtered like every other node path,
    // because it is `location /e/` that answers it.
    expect(resolve(`${viteConfig.base}assets/x.js`).path).toBe('/e/');
  });

  it('leaves the operator bundle on disk with no fallback into node', () => {
    // The negative half. A `try_files` here — or any named location for it to
    // reach — is the collision workaround coming back.
    const assets = resolve('/assets/x.js');
    expect(proxyPass(assets)).toBeNull();
    expect(assets.body).not.toMatch(/try_files/);
    expect(locations().filter((l) => l.kind === 'named')).toEqual([]);
  });
});
