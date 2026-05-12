// TypeScript types matching the FastAPI schemas

export type SolverStatus =
  | "optimal"
  | "feasible"
  | "infeasible"
  | "unknown"
  | "model_invalid";

export interface PlayerInput {
  id: string;
  name: string;
  availability: [number, number][];
  restSlots: number;
  restIsHard: boolean;
  restPenalty?: number;
}

export interface MatchInput {
  id: string;
  eventCode: string;
  durationSlots: number;
  sideA: string[];
  sideB: string[];
}

export interface PreviousAssignment {
  matchId: string;
  slotId: number;
  courtId: number;
  locked: boolean;
  pinnedSlotId?: number | null;
  pinnedCourtId?: number | null;
}

export interface ScheduleConfig {
  totalSlots: number;
  courtCount: number;
  intervalMinutes: number;
  defaultRestSlots: number;
  freezeHorizonSlots: number;
  currentSlot: number;
  softRestEnabled: boolean;
  restSlackPenalty?: number;
  disruptionPenalty: number;
  lateFinishPenalty: number;
  courtChangePenalty: number;
}

export interface SolverOptions {
  timeLimitSeconds: number;
  numWorkers: number;
  logProgress: boolean;
}

export interface ScheduleRequest {
  config: ScheduleConfig;
  players: PlayerInput[];
  matches: MatchInput[];
  previousAssignments: PreviousAssignment[];
  solverOptions?: SolverOptions;
}

export interface Assignment {
  matchId: string;
  slotId: number;
  courtId: number;
  durationSlots: number;
  moved: boolean;
  previousSlotId?: number | null;
  previousCourtId?: number | null;
}

export interface SoftViolation {
  type: string;
  matchId?: string | null;
  playerId?: string | null;
  description: string;
  penaltyIncurred: number;
}

export interface ScheduleResponse {
  status: SolverStatus;
  objectiveScore?: number | null;
  runtimeMs: number;
  assignments: Assignment[];
  softViolations: SoftViolation[];
  infeasibleReasons: string[];
  unscheduledMatches: string[];
  movedCount: number;
  lockedCount: number;
}

export interface HealthResponse {
  status: string;
  version: string;
}
