/**
 * Where a form post may send the browser — the tier-side half of
 * `next_target` (`api/entrants.py`).
 *
 * Lifted out of `routes/login.tsx` when the sign-UP page needed the same
 * check (E3): both pages render a destination into markup a human reads, and
 * a second hand-written copy of an open-redirect guard is how the two drift.
 * One module, one regex, both callers.
 */

/**
 * The one prefix the entrant tier owns — **byte-identical to `_SAFE_NEXT` in
 * `api/entrants.py`**, deliberately, because the two validate the same value
 * for the same reason at two tiers.
 *
 * Anchored, so `//host` and `https://host` both fail. Matching an allowlist
 * rather than stripping is the argued choice: a stripper has to anticipate
 * every encoding and a matcher does not.
 */
const SAFE_NEXT = /^\/e\/[A-Za-z0-9/_.~-]*$/;

/**
 * The post-form destination, or the caller's fallback.
 *
 * An open redirect on an account route is a phishing primitive: the victim
 * types real credentials on the real origin and is then handed to an
 * attacker's page carrying whatever the link said. The backend refuses a
 * crafted value; these pages RENDER one into the markup, so they refuse one
 * too rather than trusting that the far end will. `..` is excluded separately
 * because a browser normalises `/e/../admin` to `/admin` before the request
 * is ever made, so the traversal never even reaches the pattern.
 */
export function safeNext(raw: string | null, fallback: string): string {
  const value = raw ?? '';
  if (value.includes('..') || !SAFE_NEXT.test(value)) return fallback;
  return value;
}
