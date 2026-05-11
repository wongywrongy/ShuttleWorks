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
