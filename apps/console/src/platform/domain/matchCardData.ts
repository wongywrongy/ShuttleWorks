/**
 * MatchCardData — the tier-neutral data contract every match renderer
 * consumes (docs/reference/contracts/match-card.md §2). One shape; the
 * table row, `MatchCard`, the bracket node and the compact chip are
 * semantic renderers over it, never a second parallel model.
 */
import type { MatchIdentity } from './matchIdentity';
import type { Side } from './sides';

export type ScheduleState = 'slot_approved' | 'slot_pending';

export type MatchCardState =
  | 'pending'
  | 'ready'
  | 'scheduled'
  | 'called'
  | 'playing'
  | 'finished'
  | 'retired';

export type GameState = 'unplayed' | 'in_progress' | 'complete';

export interface Game {
  /** 1-based. */
  index: number;
  a: number;
  b: number;
  state: GameState;
  /** Present ONLY when `state === 'complete'`. */
  winner?: 'a' | 'b';
}

export type MatchOutcome =
  | { kind: 'in_play' }
  | { kind: 'decided'; winner: 'a' | 'b' }
  | { kind: 'retired'; winner: 'a' | 'b'; retiredSide: 'a' | 'b' }
  | { kind: 'walkover'; winner: 'a' | 'b'; absentSide: 'a' | 'b' }
  | { kind: 'cancelled' }
  | { kind: 'no_result' };

export interface CourtRef {
  id: number;
  label: string;
}

export interface CalendarDay {
  /** ISO calendar date, tournament-tz. */
  date: string;
}

export interface MatchCardData {
  identity: MatchIdentity;
  reference: string;
  eventLabel: string;
  roundLabel: string | null;
  /** Present ONLY where the view is not already tournament-scoped. */
  tournamentName?: string;

  sides: [Side, Side];

  scheduleState: ScheduleState;
  startsAt?: string; // ISO instant
  day?: CalendarDay;
  court?: CourtRef;

  matchState: MatchCardState;

  outcome: MatchOutcome;
  games: Game[];
  durationMinutes?: number;

  publication: {
    personsPublished: boolean;
    scoresPublished: boolean;
  };
}
