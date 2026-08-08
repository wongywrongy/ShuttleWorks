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

import config from '../react-router.config';
import routes from '../app/routes';

/**
 * The prefixes nginx gives FastAPI. Written out, not derived: they ARE the
 * ruling, and there is no machine-readable copy of it to read from until the
 * ingress pass (Task 22) writes one into `nginx.conf`.
 */
const BACKEND_PREFIXES = ['/e/api/', '/e/account/'];

/** Every URL path this app serves, basename included, children flattened. */
function nodePaths(entries: RouteConfigEntry[], prefix = config.basename ?? '/'): string[] {
  return entries.flatMap((entry) => {
    const here = entry.path === undefined ? prefix : `${prefix.replace(/\/$/, '')}/${entry.path}`;
    return [
      ...(entry.path === undefined ? [] : [here]),
      ...nodePaths(entry.children ?? [], here),
    ];
  });
}

describe('node routes and the FastAPI prefixes do not overlap (R8-A)', () => {
  const paths = nodePaths(routes as RouteConfigEntry[]);

  it('enumerates the real route table', () => {
    // Non-vacuity. An empty list would make every assertion below pass, and
    // the shapes are pinned so a basename drop or a flatten bug is visible
    // here rather than as silent green.
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('/e/signup');
    expect(paths.every((p) => p.startsWith('/e/'))).toBe(true);
  });

  it.each(BACKEND_PREFIXES)('claims no path under %s', (prefix) => {
    expect(paths.filter((p) => p.startsWith(prefix))).toEqual([]);
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
