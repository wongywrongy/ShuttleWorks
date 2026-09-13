/** Public Schedule / Live projection, mirrored from entries_site.py. */
import type { PersonReferenceDTO } from "./person.types";
import type { UnresolvedSideDTO } from "./side";
import { formatCalendarDay } from "./format";
export type ScheduleState =
  | "scheduled"
  | "called"
  | "live"
  | "delayed"
  | "completed"
  | "walkover"
  | "retired"
  | "cancelled";

export interface ScheduleDayFacetDTO {
  day: string;
  count: number;
}

export interface ScheduleSideDTO {
  participantKey: string | null;
  /** Ordered identities on this side. A dead ref is deliberately unlinked. */
  persons: PersonReferenceDTO[];
  placeholder: string | null;
  seed?: number | null;
  unresolved?: UnresolvedSideDTO | null;
}

export interface ScheduleMatchDTO {
  matchKey: string;
  source: "bracket" | "meet";
  eventCode: string;
  /** The SHARED human match reference (state-and-formatting §6.1, "One
   *  reference, both tiers") — the identical string the operator's match
   *  list shows for this match, e.g. `MS R32·11`. `shortReference` drops the
   *  event code for a view whose event is already unambiguous (a single
   *  draw: `R16·2 · 10:00 · Court 3`). Both are null when the coordinates
   *  cannot name a match; nothing is rendered then — never a row number,
   *  never `Match n`. */
  reference?: string | null;
  shortReference?: string | null;
  /** The AUTHORITATIVE outcome (contract §3.5/§5.1 rule 3): which side won,
   *  from the recorded result. A renderer must never count games instead —
   *  retirement and walkover contradict the ledger outright. */
  winnerSide?: "A" | "B" | null;
  discipline: string | null;
  roundLabel: string | null;
  /**
   * ``null`` means the persisted status was unrecognised (contract §2.2):
   * the match is omitted from state facets and rendered with no state
   * chip. Never coerced to "scheduled" server-side (D7).
   */
  status: ScheduleState | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  court: number | null;
  sides: ScheduleSideDTO[];
  score: number[][] | null;
  /** The points of the game IN PLAY, `[a, b]`, as the desk last recorded
   *  them (public refinement 2026-09-12). Present only on a live match whose
   *  match state carries a running score with results published; absent
   *  otherwise, and never a claim about a finished game. */
  liveScore?: [number, number] | null;
  walkover: boolean;
  updatedAt: string | null;
}

export interface ScheduleFacetsDTO {
  days: ScheduleDayFacetDTO[];
  events: string[];
  courts: number[];
  states: ScheduleState[];
}

export interface ScheduleMatchesDTO {
  published: boolean;
  items: ScheduleMatchDTO[];
  facets: ScheduleFacetsDTO;
  page: number;
  pageSize: number;
  total: number;
  timeZone: string;
  updatedAt: string | null;
  revision: string;
}

export const SCHEDULE_STATES: readonly ScheduleState[] = Object.freeze([
  "scheduled",
  "called",
  "live",
  "delayed",
  "completed",
  "walkover",
  "retired",
  "cancelled",
]);

/**
 * The tier's one match-state speller (contract §2.3). ``null`` — an
 * unrecognised persisted status — renders no chip at all (§2.2); callers
 * must not fall back to a guessed word.
 */
export function scheduleStateLabel(
  state: ScheduleState | null | undefined,
): string | null {
  switch (state) {
    case "scheduled":
      return "Scheduled";
    case "called":
      return "Called";
    case "live":
      return "On court";
    case "delayed":
      return "Delayed";
    case "completed":
      return "Completed";
    case "walkover":
      return "Walkover";
    case "retired":
      return "Retired";
    case "cancelled":
      return "Cancelled";
    case null:
    case undefined:
      return null;
  }
}

/**
 * The **schedule** domain's public state (contract §3.1) — distinct from
 * match state. Exactly two public strings exist, ever: "Scheduled" when an
 * approved time exists (independent of whether a side is still pending —
 * a match with an approved 14:00 slot and an unresolved "Winner of QF1"
 * side is still "Scheduled · 14:00"), and "Time to be confirmed" when it
 * does not. A solver proposal is not an approved slot; only a value the
 * wire already carries as the match's published time counts.
 */
export type SchedulePublicState = "scheduled" | "time_tbc";

export function schedulePublicState(match: {
  scheduledTime: string | null;
}): SchedulePublicState {
  return match.scheduledTime !== null ? "scheduled" : "time_tbc";
}

export function schedulePublicStateLabel(state: SchedulePublicState): string {
  return state === "scheduled" ? "Scheduled" : "Time to be confirmed";
}

/** A server timestamp older than this should be explained to a spectator. */
export function scheduleIsStale(
  updatedAt: string | null,
  now = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) && now - parsed > 30 * 60 * 1000;
}

/**
 * D11: redirects to the entrant time authority (`lib/format.ts`) instead of
 * a second, `Intl`-backed formatter — `day` is a bare calendar date (the
 * schedule day facet), never an instant, so there is no timezone to apply
 * beyond the day the wire already names.
 */
export function scheduleDateLabel(day: string): string {
  return formatCalendarDay(day);
}
