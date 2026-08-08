/**
 * The backend's reserved-slug set must cover every static top-level segment
 * node claims ahead of its `:slug` catch-all.
 *
 * `backend/api/entries.py`'s `_RESERVED_SLUGS` refuses a slug that node's
 * route table would shadow: React Router ranks every static route above
 * `:slug`, so a workspace called "login" would answer with the login page
 * forever, and its printed URL would be dead. The set was hand-written and
 * correct on the day — but it rots the instant someone adds
 * `route('about', 'routes/about.tsx')` to `app/routes.ts`, with nothing
 * anywhere failing. The bad slug is then accepted, printed on a poster, and
 * unreachable.
 *
 * So it is derived, not listed, exactly as `routeConfig.test.ts` one
 * directory over derives node's paths from the same `app/routes.ts` rather
 * than restating them. The frontend is where the authority lives (it is the
 * thing that shadows), so the frontend suite is where the check belongs; the
 * backend constant is read as text because there is no other machine-readable
 * copy of it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RouteConfigEntry } from '@react-router/dev/routes';

import routes from '../app/routes';

/**
 * Static top-level segments of the route table — the ones that can shadow a
 * slug.
 *
 * `:param` segments are dropped (they ARE the catch-all, not a competitor for
 * it), and so is anything containing a `.`: `sitemap.xml` and `robots.txt`
 * cannot collide because `_SLUG_RE` (`^[a-z0-9-]{3,60}$`) already rejects a
 * dot, which is exactly the argument the backend comment makes for leaving
 * them out.
 */
function shadowingSegments(entries: RouteConfigEntry[]): string[] {
  return entries
    .map((entry) => entry.path?.split('/')[0] ?? '')
    .filter((segment) => segment !== '' && !segment.startsWith(':') && !segment.includes('.'));
}

/** `_RESERVED_SLUGS = frozenset({...})`, parsed out of the backend source. */
function backendReservedSlugs(): string[] {
  const source = readFileSync(
    new URL('../../backend/api/entries.py', import.meta.url),
    'utf8',
  );
  const match = source.match(/_RESERVED_SLUGS\s*=\s*frozenset\(\{([^}]*)\}\)/);

  // FAIL CLOSED. A rename, a reformat onto several lines, or a move to another
  // module all make this regex miss — and a "no matches, nothing to check"
  // reading would leave this file green forever while asserting nothing. Zero
  // matches is a finding, not a pass.
  expect(match, '_RESERVED_SLUGS not found in backend/api/entries.py').not.toBeNull();

  return [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('backend _RESERVED_SLUGS covers what node shadows', () => {
  const segments = shadowingSegments(routes as RouteConfigEntry[]);
  const reserved = backendReservedSlugs();

  it('derives a non-empty set from each side', () => {
    // Non-vacuity on BOTH sides: an empty `segments` makes the real assertion
    // pass trivially, and an empty `reserved` would mean the parse silently
    // matched an empty frozenset.
    expect(segments).toContain('login');
    expect(reserved).toContain('login');
    // The two prefixes nginx hands FastAPI (R8-A) are reserved for a reason
    // node's route table cannot show: a request for them never reaches node
    // at all, so they are absent from `segments` and must be listed anyway.
    expect(reserved).toEqual(expect.arrayContaining(['api', 'account']));
  });

  it.each(segments)('reserves %s', (segment) => {
    expect(reserved).toContain(segment);
  });
});
