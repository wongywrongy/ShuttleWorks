/**
 * Bracket-side DTOs — types that round-trip the
 * ``/tournaments/{tid}/bracket/*`` API surface added in PR 2 of the
 * backend-merge arc. Moved from ``products/tournament/frontend/src/types.ts``
 * in PR 3 of the same arc; the tournament-product frontend is retired in
 * this PR. The historical type names (CreateTournamentIn / TournamentDTO /
 * ScheduleNextOut) are kept as aliases for the bracket-prefixed ones so
 * any in-flight imports from before the move don't break — new code
 * should prefer the prefixed names.
 */
export type WinnerSide = "A" | "B" | "none";

export interface Participant {
  id: string;
  name: string;
  members?: string[] | null;
}

export interface ParticipantInput {
  id: string;
  name: string;
  members?: string[];
  seed?: number;
}

export interface EventIn {
  id: string;
  discipline: string;
  format: "se" | "rr";
  participants: ParticipantInput[];
  seeded_count?: number | null;
  bracket_size?: number | null;
  rr_rounds: number;
  duration_slots: number;
  randomize?: boolean;
}

export interface CreateTournamentIn {
  courts: number;
  total_slots: number;
  rest_between_rounds: number;
  interval_minutes: number;
  time_limit_seconds: number;
  start_time?: string | null;
  events: EventIn[];
}

export interface BracketSlotDTO {
  participant_id: string | null;
  feeder_play_unit_id: string | null;
}

export interface PlayUnitDTO {
  id: string;
  event_id: string;
  round_index: number;
  match_index: number;
  side_a: string[] | null;
  side_b: string[] | null;
  duration_slots: number;
  dependencies: string[];
  slot_a: BracketSlotDTO;
  slot_b: BracketSlotDTO;
}

export interface AssignmentDTO {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
  duration_slots: number;
  actual_start_slot: number | null;
  actual_end_slot: number | null;
  started: boolean;
  finished: boolean;
}

export interface ResultDTO {
  play_unit_id: string;
  winner_side: WinnerSide;
  walkover: boolean;
  finished_at_slot: number | null;
}

export interface EventDTO {
  id: string;
  discipline: string;
  format: "se" | "rr";
  bracket_size: number | null;
  participant_count: number;
  rounds: string[][];
  /** Per-event status sent by the backend since A.4. Optional for
   *  backwards compat — old draws without the column default to 'draft'. */
  status?: BracketEventStatus;
}

export interface TournamentDTO {
  courts: number;
  total_slots: number;
  rest_between_rounds: number;
  interval_minutes: number;
  start_time: string | null;
  events: EventDTO[];
  participants: Participant[];
  play_units: PlayUnitDTO[];
  assignments: AssignmentDTO[];
  results: ResultDTO[];
}

export interface ScheduleNextOut {
  status: string;
  play_unit_ids: string[];
  started_at_current_slot: number;
  runtime_ms: number;
  infeasible_reasons: string[];
}

// Bracket-prefixed aliases (new names for the same shapes — used by the
// scheduler-backend client; the legacy names above stay for the ported
// components that still ``import { TournamentDTO } from "../types"`` and
// friends until they're modernised).
export type BracketCreateIn = CreateTournamentIn;
export type BracketTournamentDTO = TournamentDTO;
export type BracketScheduleNextOut = ScheduleNextOut;

export interface BracketImportCsvParams {
  courts: number;
  total_slots: number;
  interval_minutes: number;
  rest_between_rounds: number;
  start_time?: string;
  time_limit_seconds?: number;
}

// ---- Interactive scheduling (sub-project #1) ---------------------------
// Wire types for POST /tournaments/{tid}/bracket/validate and /pin.
// snake_case to match the bracket API surface (see api/brackets.py).

export interface BracketValidateIn {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
}

export interface BracketPinIn {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
}

export interface BracketValidationConflict {
  type: string;
  description: string;
  play_unit_id: string | null;
  other_play_unit_id: string | null;
  player_id: string | null;
  court_id: number | null;
  slot_id: number | null;
}

export interface BracketValidationOut {
  feasible: boolean;
  conflicts: BracketValidationConflict[];
}

// ---- Per-event status + upsert/generate DTOs (sub-project A.8) ----------

/** Per-event lifecycle status. */
export type BracketEventStatus = 'draft' | 'generated' | 'started';

/** POST /tournaments/{tid}/bracket/events/{event_id} body. */
export interface BracketEventUpsertIn {
  discipline: string;
  format: 'se' | 'rr';
  bracket_size?: number | null;
  seeded_count?: number;
  rr_rounds?: number;
  duration_slots?: number;
  participants: Array<{
    id: string;
    name: string;
    members?: string[];
    seed?: number;
  }>;
}

/** POST /tournaments/{tid}/bracket/events/{event_id}/generate body. */
export interface BracketEventGenerateIn {
  wipe?: boolean;
}
