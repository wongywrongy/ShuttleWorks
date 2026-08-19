/**
 * Every URL path this node app serves, derived from `app/routes.ts`.
 *
 * Lifted out of `routeConfig.test.ts` when a second caller appeared: the R8-A
 * overlap guard asks "does node claim a path inside a FastAPI prefix", and the
 * signup form's `next` control asks "is this value a path node actually
 * serves". Both questions are the same derivation, and a second hand-rolled
 * copy would answer them differently the first time the route table grew a
 * shape the copy did not flatten.
 */
import type { RouteConfigEntry } from '@react-router/dev/routes';

import config from '../../react-router.config';

/** Basename included, children flattened, layout routes (no `path`) skipped. */
export function nodePaths(
  entries: RouteConfigEntry[],
  prefix = config.basename ?? '/',
): string[] {
  return entries.flatMap((entry) => {
    const here = entry.path === undefined ? prefix : `${prefix.replace(/\/$/, '')}/${entry.path}`;
    return [
      ...(entry.path === undefined ? [] : [here]),
      ...nodePaths(entry.children ?? [], here),
    ];
  });
}
