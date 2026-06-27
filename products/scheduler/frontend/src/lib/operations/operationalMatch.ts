/**
 * Phase B — the cross-engine Operations view-model.
 *
 * `OperationalMatch` is the normalized, engine-agnostic row the
 * Operations layer (Courts + Live) speaks. It folds the two engines'
 * native shapes into one vocabulary:
 *   - Meet:    MatchDTO + ScheduleDTO + MatchStateDTO
 *   - Bracket: PlayUnitDTO + AssignmentDTO (+ ResultDTO) via the
 *              polled BracketTournamentDTO snapshot.
 *
 * ## Scope of THIS increment (deliberately conservative)
 *
 * Only the view-model + the two adapters land here, plus a per-surface
 * source chip (see `SourceChip` / the Operations surface headers). The
 * single-engine Operations surfaces are NOT rewired to render through
 * this model yet — they keep their existing engine-specific render
 * paths untouched. These adapters are exercised by their unit tests.
 *
 * ## The hybrid merge (SP-F4)
 *
 *   - Dual load: `mergeOperational(...)` concatenates
 *     `meetMatchesToOperational(...)` + `bracketToOperational(...)` into
 *     ONE list sorted by court then slot (assigned rows first, waiting
 *     rows last). The unified `UnifiedCourtsView` / `UnifiedLiveView`
 *     surfaces render that list.
 *   - Per-row source chip: the `SourceChip` moves from the surface header
 *     onto each row, keyed on `OperationalMatch.source`.
 *   - Dual write-back: live actions (start / finish / record winner)
 *     route back to the correct engine's API by `source` — see
 *     `products/operations/operationalWriteback.ts`.
 *   - `slot` is the scheduled slot index, never derived from a wall
 *     clock. The "late" decoration (bracket `deriveChipState`) stays a
 *     render-time, clock-derived concern — these adapters are pure and
 *     deterministic (no `Date.now()`).
 */
import type {
  AssignmentDTO,
  BracketTournamentDTO,
  PlayUnitDTO,
  ResultDTO,
} from '../../api/bracketDto';
import type { MatchDTO, MatchStateDTO, ScheduleDTO } from '../../api/dto';
import { playUnitSideLabels } from '../../products/bracket/bracketLabels';

/** Which engine a normalized operational row originated from. */
export type OperationalSource = 'meet' | 'bracket';

/**
 * Lifecycle status, unified across engines.
 *
 * Meet emits all four (`MatchStateDTO.status`). Bracket has no distinct
 * `'called'` state in its DTO, so bracket rows only ever take
 * `scheduled | started | finished`.
 */
export type OperationalStatus = 'scheduled' | 'called' | 'started' | 'finished';

/** A side's two-team point tally (when an engine tracks one). */
export interface OperationalScore {
  sideA: number;
  sideB: number;
}

/**
 * The engine-agnostic Operations row. Names are resolved to display
 * strings (joined with `/` for doubles, `TBD` when a side is unknown)
 * so consumers never need an engine-specific id→name map.
 */
export interface OperationalMatch {
  /** Stable id — `MatchDTO.id` or `PlayUnitDTO.id`. */
  id: string;
  /** Originating engine. */
  source: OperationalSource;
  /** `C{court}` when assigned to a court, else undefined. */
  courtLabel?: string;
  /** 1-based court id when assigned, else undefined. Drives the court×time board. */
  court?: number;
  /** Scheduled slot index when assigned, else undefined. */
  slot?: number;
  /** Block width in slots on the board (the match's duration). Absent → 1. */
  span?: number;
  /** Display name for side A (`TBD` when unknown). */
  sideA: string;
  /** Display name for side B (`TBD` when unknown). */
  sideB: string;
  /** Point tally when the engine tracks one (meet only today). */
  score?: OperationalScore;
  /** Unified lifecycle status. */
  status: OperationalStatus;
}

// ---- Meet adapter ----------------------------------------------------------

const TBD = 'TBD';

function resolveMeetSide(
  ids: string[] | undefined,
  playerNameById: Record<string, string>,
): string {
  if (!ids || ids.length === 0) return TBD;
  return ids.map((id) => playerNameById[id] ?? id).join(' / ');
}

/**
 * Adapt the meet engine's native model to `OperationalMatch[]`.
 *
 * Emits ONE row per match — including unassigned ("waiting") matches —
 * so the operational list is complete. `playerNameById` resolves player
 * UUIDs to display names (build it from the tournament store's
 * `players`, e.g. via `usePlayerNames`); ids that don't resolve fall
 * back to the raw id.
 *
 * Pure: no clock reads. Court override (`actualCourtId`) wins over the
 * scheduled court, mirroring the live-ops display logic.
 */
export function meetMatchesToOperational(
  matches: MatchDTO[],
  schedule: ScheduleDTO | null,
  matchStates: Record<string, MatchStateDTO>,
  playerNameById: Record<string, string>,
): OperationalMatch[] {
  const assignmentByMatch = new Map(
    (schedule?.assignments ?? []).map((a) => [a.matchId, a]),
  );

  return matches.map((m) => {
    const assignment = assignmentByMatch.get(m.id);
    const state = matchStates[m.id];

    // Court override (actualCourtId) takes precedence over the planned court.
    const courtId = state?.actualCourtId ?? assignment?.courtId;
    // slot is the scheduled slot index only — never derived from a clock.
    const slot = assignment?.slotId;

    return {
      id: m.id,
      source: 'meet' as const,
      courtLabel: courtId != null ? `C${courtId}` : undefined,
      court: courtId != null ? courtId : undefined,
      slot,
      span: assignment?.durationSlots ?? 1,
      sideA: resolveMeetSide(m.sideA, playerNameById),
      sideB: resolveMeetSide(m.sideB, playerNameById),
      score: state?.score ? { sideA: state.score.sideA, sideB: state.score.sideB } : undefined,
      status: state?.status ?? 'scheduled',
    };
  });
}

// ---- Bracket adapter -------------------------------------------------------

function deriveBracketStatus(
  result: ResultDTO | undefined,
  assignment: AssignmentDTO | undefined,
): OperationalStatus {
  // Priority: finished → started → scheduled. Bracket has no 'called'
  // in its DTO, and 'late' is a clock-derived render decoration, not a
  // persisted status — both are excluded from the pure view-model.
  if (result) return 'finished';
  if (assignment?.actual_start_slot != null) return 'started';
  return 'scheduled';
}

/**
 * Adapt the bracket engine's polled snapshot to `OperationalMatch[]`.
 *
 * Emits ONE row per play-unit — including those with no court
 * assignment yet ("waiting") — so the operational list is complete.
 * Side names resolve through the shared `playUnitSideLabels` helper
 * (confirmed participants, feeder reference, or `Bye`/`TBD`).
 *
 * Bracket records only a winner (`ResultDTO.winner_side`), never a point
 * tally, so `score` is always undefined here — an expected asymmetry,
 * not a gap. Pure: no clock reads.
 */
export function bracketToOperational(data: BracketTournamentDTO): OperationalMatch[] {
  const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
  const assignmentByPu = new Map(data.assignments.map((a) => [a.play_unit_id, a]));
  const resultByPu = new Map(data.results.map((r) => [r.play_unit_id, r]));

  return data.play_units.map((pu: PlayUnitDTO) => {
    const assignment = assignmentByPu.get(pu.id);
    const result = resultByPu.get(pu.id);
    const { a: sideA, b: sideB } = playUnitSideLabels(pu, nameById);

    return {
      id: pu.id,
      source: 'bracket' as const,
      courtLabel: assignment ? `C${assignment.court_id}` : undefined,
      court: assignment ? assignment.court_id : undefined,
      slot: assignment?.slot_id,
      span: assignment?.duration_slots ?? 1,
      sideA,
      sideB,
      score: undefined,
      status: deriveBracketStatus(result, assignment),
    };
  });
}

// ---- Hybrid merge ----------------------------------------------------------

/** A row is "assigned" once it has both a court and a scheduled slot. */
function isAssigned(row: OperationalMatch): boolean {
  return row.courtLabel != null && row.slot != null;
}

/** Numeric court index parsed from the `C{n}` label. Unassigned rows (no
 *  label) sort to the end via `+Infinity`; an unparseable label does too. */
function courtSortKey(row: OperationalMatch): number {
  if (!row.courtLabel) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(row.courtLabel.replace(/^C/, ''), 10);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

/**
 * Concatenate the two engines' operational rows into ONE list for the
 * unified Operations surfaces, sorted by court then slot.
 *
 * Ordering contract (deterministic — the adapters are pure):
 *   1. Assigned rows (court + slot) come before waiting (unassigned) rows.
 *   2. Assigned rows sort by court index (numeric, so C2 precedes C10),
 *      then by slot.
 *   3. A cross-engine tie on the same court+slot is broken meet-before-
 *      bracket, then by id — purely to keep the order stable, never a
 *      claim that two matches truly share a court/slot.
 *   4. Waiting rows keep their concatenation order (meet rows first, then
 *      bracket rows) — stable, no clock dependency.
 */
export function mergeOperational(
  meet: OperationalMatch[],
  bracket: OperationalMatch[],
): OperationalMatch[] {
  return [...meet, ...bracket]
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const ax = isAssigned(x.row);
      const ay = isAssigned(y.row);
      if (ax !== ay) return ax ? -1 : 1; // assigned before waiting
      if (!ax) return x.index - y.index; // both waiting: stable concat order
      const cx = courtSortKey(x.row);
      const cy = courtSortKey(y.row);
      if (cx !== cy) return cx - cy;
      const sx = x.row.slot ?? 0;
      const sy = y.row.slot ?? 0;
      if (sx !== sy) return sx - sy;
      if (x.row.source !== y.row.source) return x.row.source === 'meet' ? -1 : 1;
      return x.row.id < y.row.id ? -1 : x.row.id > y.row.id ? 1 : 0;
    })
    .map((w) => w.row);
}
