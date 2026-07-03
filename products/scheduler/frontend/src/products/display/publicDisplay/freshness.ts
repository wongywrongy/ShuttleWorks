/**
 * Spectator-calm freshness derivation for the public TV boards.
 *
 * Replaces operator-voiced connection language ("Live / Reconnecting… /
 * Offline") with a calmer three-state model driven purely by *how old*
 * the last successful sync is. The public board must never surface
 * technical/operator error language ("server", "backend", raw error
 * text) — it just says whether what's on screen is current.
 *
 *   live    — last successful sync is fresh.
 *   delayed — a bit behind; still worth trusting, framed gently.
 *   stale   — old enough spectators shouldn't rely on it (dim + caption
 *             it in the consuming page — see MeetDisplayPage).
 *
 * Pure and hook-free so it's trivially unit-testable and shared by both
 * `publicDisplay/useDisplaySync` (meet board) and
 * `bracketDisplay/useBracketDisplaySync` (bracket board).
 */

export type FreshnessState = 'live' | 'delayed' | 'stale';

/**
 * `delayed` kicks in once the last successful sync is this many multiples
 * of the poll interval old — i.e. roughly "missed a poll or two, plus a
 * retry". Keyed to `pollMs` (not a fixed constant) so a hook with a
 * slower cadence doesn't flip to `delayed` prematurely.
 */
export const DELAYED_MULTIPLIER = 2.5;

/**
 * `stale` kicks in after this long with no successful sync, regardless
 * of poll cadence. ~4 minutes — long enough that a single missed poll,
 * a brief network blip, or even several retries never trips it; only a
 * genuinely stuck connection does.
 */
export const STALE_MS = 240_000;

/**
 * Derive the spectator-facing freshness state from the age (in ms) of
 * the last *successful* sync and the hook's poll cadence. Stale takes
 * priority over delayed at the boundary where a very slow `pollMs`
 * would otherwise make the two thresholds cross.
 */
export function deriveFreshness(ageMs: number, pollMs: number): FreshnessState {
  if (ageMs >= STALE_MS) return 'stale';
  if (ageMs >= pollMs * DELAYED_MULTIPLIER) return 'delayed';
  return 'live';
}

/**
 * Spectator-facing caption shown under the `stale` freshness state on
 * both public boards (meet + bracket). Deliberately mechanism-free —
 * no connection/network framing, no operator vocabulary
 * (reconnect/offline/server/backend). See `freshness.test.ts` for the
 * guard that pins this.
 */
export const STALE_CAPTION = 'Results may be a few minutes behind.';
