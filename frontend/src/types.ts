export type WinnerSide = "A" | "B" | "none";

export interface Participant {
  id: string;
  name: string;
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

export interface TournamentDTO {
  format: "se" | "rr";
  courts: number;
  total_slots: number;
  duration_slots: number;
  rest_between_rounds: number;
  interval_minutes: number;
  participants: Participant[];
  play_units: PlayUnitDTO[];
  rounds: string[][];
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

export interface CreateTournamentIn {
  format: "se" | "rr";
  participants: Participant[];
  courts: number;
  total_slots: number;
  duration_slots: number;
  rest_between_rounds: number;
  rr_rounds: number;
  interval_minutes: number;
  time_limit_seconds: number;
}
