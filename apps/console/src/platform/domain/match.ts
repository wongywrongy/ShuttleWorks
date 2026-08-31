/**
 * Match — the canonical cross-module match contract.
 *
 * "A match is a match — the only difference is where it came from." Every
 * surface that shows scheduled play (Operations Plan + Run boards, the matches
 * list, the detail panels) speaks THIS shape. The two engines stay separate at
 * the source (ADR 0006): `MatchDTO` (meet) and `PlayUnitDTO` (bracket) are the
 * engine-native inputs, and a single pair of adapters folds them into `Match`
 * (see `meetToMatch` / `bracketToMatch` in `modules/operations/opsBlock.ts`).
 *
 * This formalizes the shape that already existed implicitly as `OpsBlock` — it
 * is now a NAMED, documented, single contract (see ADR 0009), with `OpsBlock`
 * kept as a deprecated alias so existing imports keep working.
 *
 * Status vocabulary: `Match.status` uses the ENGINE vocab (`started`/`finished`)
 * because that is what both engines persist. View-models that need the operator
 * vocab (`playing`/`done`) — e.g. `RunMatch` / the Run state machine — map at
 * their own seam; that split is intentional, not an omission.
 */

import type { MatchIdentity } from './matchIdentity';

/** Which engine a match originated from. */
export type MatchSource = 'meet' | 'bracket';

/** Unified lifecycle status (engine vocab). Bracket has no distinct `called`;
 *  meet emits all four. View-models remap to operator vocab as needed. */
export type MatchStatus = 'scheduled' | 'called' | 'started' | 'finished';

export interface Match {
  /** Engine of origin — decides chip tint and which API an action routes to. */
  source: MatchSource;
  /** Engine-native id (`MatchDTO.id` / `PlayUnitDTO.id`). */
  id: string;
  /** `${source}:${id}` — the stable cross-module key (dnd-kit id, React key,
   *  placement key). Always build it with `matchKey`. */
  key: string;
  /** F-UNI-21/22: decomposed human identity; render through the one formatter. */
  identity: MatchIdentity;
  /** Key for `getEventColor` (event rank / discipline). */
  colorKey?: string;
  /** Assigned court (1-based) when scheduled, else undefined. */
  court?: number;
  /** PLANNED slot index when scheduled, else undefined. */
  slot?: number;
  /** Duration in slots (>= 1). */
  span: number;
  status: MatchStatus;
  /** Resolved display names for each side (TBD / feeder / Bye already applied). */
  sideA: string;
  sideB: string;
  /** Every person physically on court for this match — meet player ids, or a
   *  bracket participant expanded into its `members` (a doubles pair is two
   *  people, and both are busy). Deduped; order carries no meaning.
   *
   *  Empty when identity is unknown (TBD sides, unresolved feeders) — NEVER
   *  undefined. The run desk uses this to refuse putting one player on two
   *  courts, and an optional field would make that check fail open (debt D20).
   *  `sideA`/`sideB` above stay DISPLAY strings; these are the identities
   *  behind them. */
  playerIds: string[];
  /** Recorded score once finished (SP-OPCON-1 SWP-1). Both engines speak the
   *  same set shape (ADR 0006): meet fills `sideA`/`sideB` from the live
   *  match state (its aggregate), bracket derives them as sets-won from the
   *  result's set list and carries the sets. Absent while unplayed — and for
   *  a score-less finish (walkover/retirement), where `done` alone is the
   *  truth and renderers must not paint a fabricated 0–0. */
  score?: {
    sideA: number;
    sideB: number;
    sets?: { sideA: number; sideB: number }[];
  };
  /** True once a result exists / the match is finished (no more reschedule). */
  done: boolean;
  /** True once the match has been started on court. */
  started: boolean;
  /** ACTUAL play-head slot (when known) — distinct from the PLANNED `slot`.
   *  Present once started/finished; the live board spans chips from here.
   *  Undefined → callers fall back to the planned slot. */
  actualStartSlot?: number;
  /** ACTUAL end slot (when known) — present once finished. */
  actualEndSlot?: number;
}

/** The one place the cross-module match key is shaped. */
export function matchKey(source: MatchSource, id: string): string {
  return `${source}:${id}`;
}

/** Split a `${source}:${id}` key back into parts; null on a malformed key. */
export function parseMatchKey(key: string): { source: MatchSource; id: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const source = key.slice(0, i);
  if (source !== 'meet' && source !== 'bracket') return null;
  return { source, id: key.slice(i + 1) };
}
