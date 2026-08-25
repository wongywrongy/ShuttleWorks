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

// SP-DM-3 P1: the two standings row shapes are taken from the generated
// OpenAPI types rather than hand-mirrored (R-DM-9(c), applied to the shapes
// whose divergence count is already zero). A generated alias cannot drift, so
// these two need no parity entry - see api/__tests__/dtoParity.test.ts.
import type { components } from './dto.generated';

export type WinnerSide = "A" | "B" | "none";

export interface Participant {
  id: string;
  name: string;
  members?: string[] | null;
  /** Seed number (1 = top seed); null/absent = unseeded. Mirrors backend
   *  `ParticipantOut.seed` so an echo through the upsert preserves seeds. */
  seed?: number | null;
}

interface ParticipantInput {
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

interface CreateTournamentIn {
  courts: number;
  total_slots: number;
  rest_between_rounds: number;
  interval_minutes: number;
  time_limit_seconds: number;
  start_time?: string | null;
  events: EventIn[];
}

interface BracketSlotDTO {
  participant_id: string | null;
  feeder_play_unit_id: string | null;
  /** Loser routing (draw-formats program): 'loser' means the LOSER of the
   *  feeder play unit takes this slot (double elim / Monrad / compass drops).
   *  Winner slots omit the field entirely — back-compat by omission. */
  feeder_take?: 'loser' | null;
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
  /** Optimistic-concurrency token echoed back as ``seen_version`` when
   *  recording a result (SP-F3). Optional for older fixtures; the backend
   *  always serializes it (defaults to 1 for a freshly generated match). */
  version?: number;
  /** Segment code for multi-segment formats (DE/Monrad/compass): 'W', 'L',
   *  'GF', 'P5_8', compass letters… Absent/null for se/rr units. */
  segment?: string | null;
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

/** One set's score in a Sets-mode bracket result. */
export interface BracketSetScore {
  sideA: number;
  sideB: number;
}

/** Opaque set-by-set score blob carried on a Sets-mode bracket result.
 *  Mirrors the meet's `sets` shape (api/dto.ts `SetScore`) so both engines
 *  speak the same score JSON — see ADR 0006. */
export interface BracketScore {
  sets: BracketSetScore[];
}

export interface ResultDTO {
  play_unit_id: string;
  winner_side: WinnerSide;
  walkover: boolean;
  finished_at_slot: number | null;
  /** Present only when the bracket Engine runs in Sets mode. */
  score?: BracketScore | null;
  /** Contingency annotation only — does not affect advancement/BYE
   *  routing, which stays keyed off `walkover`. */
  reason?: 'walkover' | 'retired' | 'forfeit' | null;
}

/** One named draw segment of a multi-segment format (DE 'W'/'L'/'GF',
 *  Monrad plates, compass directions). Ordered for stacked rendering. */
export interface SegmentDTO {
  id: string;
  label: string;
  order: number;
  /** Round-major play-unit ids within this segment. */
  rounds: string[][];
  /** Final classification positions this segment decides (Monrad). */
  positions?: number[] | null;
}

/** One row of a standings table (RR / Swiss / group pools) — BWF tie-break
 *  chain is applied backend-side; `position` is the resolved rank.
 *
 *  Aliases the wire schema `StandingRow` (snake_case — NOT the camelCase
 *  `StandingRowDTO` schema, which is a different display shape). OpenAPI
 *  marks the eight counter fields non-required because they carry dataclass
 *  defaults, but openapi-typescript renders them as required with `@default`
 *  doc tags, and the backend always emits all nine — so the generated type
 *  is honest as-is and needs no `Required<>` wrapper. SP-DM-3 P1,
 *  `bracket/standings.py`. */
export type StandingRowDTO = components['schemas']['StandingRow'];

interface EventDTO {
  id: string;
  discipline: string;
  /** Draw format id ('se' | 'rr' | 'de' | 'monrad' | …) — widened to string
   *  with the format registry; unknown ids must render, not crash. */
  format: string;
  bracket_size: number | null;
  participant_count: number;
  rounds: string[][];
  /** Per-event status sent by the backend since A.4. Optional for
   *  backwards compat — old draws without the column default to 'draft'. */
  status?: BracketEventStatus;
  /** Per-draw configuration echoes (draw-formats program) — ALL optional so
   *  older fixtures/snapshots stay valid. */
  seeded_count?: number | null;
  rr_rounds?: number | null;
  /** Format-specific config blob (grand_final_reset, consolation,
   *  swiss_rounds, …) as persisted on the event row. */
  config?: Record<string, unknown>;
  /** Multi-segment structure for DE/Monrad/compass; null/absent otherwise. */
  segments?: SegmentDTO[] | null;
  /** Standings for has-standings formats (rr/swiss); null/absent otherwise. */
  standings?: StandingRowDTO[] | null;
  /** This event's own participant rows (SP-D7 S3, additive — optional for
   *  older fixtures). Unlike the flat `TournamentDTO.participants`, this
   *  attributes DRAFT entries to their event, so the roster can derive
   *  Events badges pre-generate and echo an event's current participants
   *  through `eventUpsert` safely. */
  participants?: Participant[];
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

/** One bracket assignment cell — solver-produced or operator-chosen. */
interface BracketAssignmentInput {
  play_unit_id: string;
  slot_id: number;
  court_id: number;
  duration_slots: number;
}

/** One near-optimal alternative the streaming solve kept; the operator
 *  picks one before committing the round (Task F2). Snake-case sibling of
 *  the meet's ``ScheduleCandidate``. */
export interface BracketScheduleCandidate {
  solution_id: string;
  objective_score: number;
  found_at_seconds: number;
  assignments: BracketAssignmentInput[];
}

export interface ScheduleNextOut {
  status: string;
  play_unit_ids: string[];
  started_at_current_slot: number;
  runtime_ms: number;
  infeasible_reasons: string[];
  // Candidate pool — empty from the batch endpoint, populated by the
  // streaming endpoint's terminal ``complete`` event.
  candidates: BracketScheduleCandidate[];
}

/** Body of ``POST /bracket/schedule-next/commit``. */
export interface BracketCommitRoundIn {
  assignments: BracketAssignmentInput[];
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

interface BracketValidationConflict {
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
  /** Registry-validated format id — widened to string (backend 422s unknowns). */
  format: string;
  bracket_size?: number | null;
  seeded_count?: number;
  rr_rounds?: number;
  duration_slots?: number;
  /** Format-specific config blob (target:'config' picker fields). */
  config?: Record<string, unknown>;
  participants: Array<{
    id: string;
    name: string;
    members?: string[];
    seed?: number;
  }>;
}

/** PATCH /tournaments/{tid}/bracket/events/{event_id} body — draft-only
 *  config edits that avoid the upsert-wipes-participants trap. Returns the
 *  same tournament-shaped DTO as the upsert. */
export interface BracketEventPatchIn {
  format?: string;
  bracket_size?: number | null;
  seeded_count?: number;
  rr_rounds?: number;
  duration_slots?: number;
  config?: Record<string, unknown>;
}

/** POST /tournaments/{tid}/bracket/events/{event_id}/generate body. */
export interface BracketEventGenerateIn {
  wipe?: boolean;
}
