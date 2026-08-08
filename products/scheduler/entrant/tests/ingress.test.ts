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
import { nodePaths } from './helpers/nodePaths';
import {
  assertModelHolds,
  backendPrefixes,
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
    expect(all.some((l) => l.kind === 'named')).toBe(true);
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

  it('never forwards a cookie on the anonymous-by-definition routes', () => {
    // The robots fetch and the asset fallback: both reach node, neither has
    // any business carrying a credential. An explicitly empty value makes
    // nginx omit the header entirely.
    const anonymous = [
      resolve('/robots.txt'),
      locations().find((l) => l.kind === 'named')!,
    ];
    for (const location of anonymous) {
      expect(proxySetHeader(location, 'Cookie')).toBe('');
    }
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

describe('the two tiers share /assets/ on one origin', () => {
  it('falls back to the entrant upstream when the operator bundle has no such file', () => {
    // Vite's `base` is `/` for both builds, so the entrant app's SSR HTML
    // references `/assets/*` at the ROOT. Without this fallback every
    // entrant page arrives unstyled and unhydrated — a 404 per asset, and
    // no 500 anywhere to notice.
    const assets = resolve('/assets/x.js');
    expect(assets.body).toMatch(/try_files\s+\$uri\s+@\w+;/);
    const fallbackName = /try_files\s+\$uri\s+(@\w+);/.exec(assets.body)![1];
    const fallback = locations().find((l) => l.path === fallbackName);
    expect(fallback).toBeDefined();
    expect(proxyPass(fallback!)).toBe(`http://${ENTRANT}`);
    // No Cache-Control of its own: react-router-serve already sends
    // `immutable, max-age=1y`, and add_header would send a second one.
    expect(fallback!.body).not.toMatch(/add_header\s+Cache-Control/);
  });
});
