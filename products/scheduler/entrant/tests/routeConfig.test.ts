/**
 * The ingress seam: node's route table must not reach into FastAPI's prefixes.
 *
 * Ruling R8-A (`react-router.config.ts`) splits one public origin by PREFIX:
 * `/e/api/` and `/e/account/` are proxied to FastAPI, everything else under
 * `/e/` falls through to this node process. nginx does longest-prefix matching
 * and nothing else — it cannot hand GET of one path to node and POST of the
 * same path to the backend. So a node route declared inside a backend prefix
 * is not "mostly fine, pending an ingress tweak": it is a 405 for every
 * visitor in every deployment that implements the ruling, and it is invisible
 * in development, where the Vite server answers everything.
 *
 * That is exactly how Task 19's signup page shipped at `/e/account/signup` —
 * green suite, reachable in dev, dead in production. The page moved to
 * `/e/signup`; its form still posts to `/e/account/signup`, which is the
 * backend's and always was.
 *
 * The node side is read from `app/routes.ts` rather than listed here, so a
 * route added inside a backend prefix fails on the day it lands with no line
 * for anyone to remember to add.
 */
import { describe, expect, it } from 'vitest';
import type { RouteConfigEntry } from '@react-router/dev/routes';

import routes from '../app/routes';
import { nodePaths } from './helpers/nodePaths';
import { backendPrefixes } from './helpers/nginxConf';

/**
 * The prefixes nginx gives FastAPI — now READ OUT OF `frontend/nginx.conf`
 * (Task 22 wrote the ruling into it) instead of copied here by hand. The
 * copy was the right call while the config did not implement the split, and
 * the wrong one the moment it did: two hand-maintained lists of the same
 * fact drift, and the drift is invisible in dev either way.
 *
 * Derived by asking which `/e/…` locations proxy to the backend, so adding a
 * third such prefix to the ingress extends this guard on the same day.
 */
const BACKEND_PREFIXES = backendPrefixes();

describe('node routes and the FastAPI prefixes do not overlap (R8-A)', () => {
  const paths = nodePaths(routes as RouteConfigEntry[]);

  it('enumerates the real route table', () => {
    // Non-vacuity. An empty list would make every assertion below pass, and
    // the shapes are pinned so a basename drop or a flatten bug is visible
    // here rather than as silent green.
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('/e/signup');
    expect(paths.every((p) => p.startsWith('/e/'))).toBe(true);
    // ...and the OTHER derivation. `it.each([])` generates no tests at all,
    // so an nginx.conf this helper could no longer read would delete the
    // overlap guard rather than fail it.
    expect(BACKEND_PREFIXES).toEqual(['/e/account/', '/e/api/']);
  });

  it.each(BACKEND_PREFIXES)('claims no path under %s', (prefix) => {
    expect(paths.filter((p) => p.startsWith(prefix))).toEqual([]);
  });

  it('answers the basename itself with a real page, never a blank 200', () => {
    // `/e/` once matched no route, so React Router fell back to `root.tsx`
    // and returned 200 with an empty <body> — a soft-404, indexable by a
    // crawler and a white screen to a human. SP-P6-1 gave it an honest 404;
    // SP-P6-2 makes it the front door: the index route IS discovery, and
    // `tests/discovery.render.test.ts` proves it answers 200 with content.
    const index = (routes as RouteConfigEntry[]).find((r) => r.index === true);
    expect(index?.file).toBe('routes/discovery.tsx');
  });

  it('is not vacuous: a route inside a backend prefix is a finding', () => {
    // The guard applied to a fixture of the exact defect — the route table as
    // Task 19 shipped it. Without this, a `nodePaths` that returned the
    // wrong shape (unprefixed, say) would let the real check pass forever.
    const shipped = nodePaths([{ path: 'account/signup', file: 'routes/signup.tsx' }]);

    expect(shipped).toEqual(['/e/account/signup']);
    expect(shipped.filter((p) => BACKEND_PREFIXES.some((b) => p.startsWith(b)))).toEqual([
      '/e/account/signup',
    ]);
  });
});
