/**
 * Court occupancy and dispute derivation — the console twin of
 * `apps/api/src/shared/court_occupancy.py`.
 *
 * Contract: `docs/reference/contracts/state-and-formatting.md` §4.
 *
 * Court occupancy is a THREE-value answer, not a boolean: a court is
 * `free`, `occupied` (exactly one match currently playing on it), or
 * `disputed` (two or more matches claim it as currently in play). This
 * module is the one authority `runtime/runModel.ts` (and any other console
 * surface that counts courts) reads from — replacing that file's own
 * conflict rule and the two independent "courts free" computations the
 * contract calls out as D1/D2/D3.
 *
 * `status` accepts either vocabulary the console carries around (the RunStatus
 * word `playing`/`done`, or the engine word `started`/`finished`/`retired`) —
 * the same "total, either spelling" leniency the backend authority offers —
 * so callers do not have to normalise before calling in.
 */

export type OccupancyStatus =
  | 'scheduled'
  | 'called'
  | 'playing'
  | 'started' // engine spelling of `playing`
  | 'done'
  | 'finished' // engine spelling of `done`
  | 'retired';

export type CourtState = 'free' | 'occupied' | 'disputed';

/**
 * Which "now" window a caller means (D19, contract §4.4).
 *
 * `'desk'` is the default and matches the backend authority exactly:
 * only `playing`/`started` occupies a court right now. It feeds counts
 * (`playing`, `courtsFree`) and conflict detection — the same predicate
 * `shared/court_occupancy.py`'s `occupies_court_now` names.
 *
 * `'board'` is the public display's own, deliberately WIDER window
 * (`publicDisplay/courtLanes.ts`'s former undocumented divergence): a
 * `called` match also counts as "now" so a court does not blink empty
 * during the walk-to-court gap between one match finishing and the next
 * being called. It is used only to decide what belongs in a board's Now
 * lane (never for occupancy counts, and never for the write-guard/
 * conflict-detection predicate, which stays `'desk'`).
 */
export type NowWindow = 'desk' | 'board';

export interface OccupancyMatchLike {
  id: string;
  status: OccupancyStatus;
  court?: number | null;
}

export interface CourtClaim {
  matchKey: string;
  matchIdentity?: string;
  status: OccupancyStatus;
  startedAt?: string | null;
  source?: 'meet' | 'bracket';
  version?: number;
}

export interface CourtDispute {
  courtId: number;
  claims: CourtClaim[];
  detectedAt?: string;
  resolution?: unknown;
}

/** True iff a match in `status` is actually occupying a court right now.
 *
 * Defaults to the `'desk'` window: only `playing`/`started` — `called` is
 * deliberately excluded, players are still walking to the court. Feeds
 * counts (`playing`, `courtsFree`) and conflict detection, which must
 * always use the `'desk'` window (never widen a write-guard or a dispute).
 *
 * Pass `nowWindow: 'board'` (D19) only when deciding what belongs in the
 * PUBLIC BOARD's Now lane: `called` also counts as "now" there, so a court
 * does not read empty during the walk-to-court gap. See `NowWindow`'s
 * doc comment. */
export function occupiesCourtNow(status: OccupancyStatus, nowWindow: NowWindow = 'desk'): boolean {
  if (nowWindow === 'board' && status === 'called') return true;
  return status === 'playing' || status === 'started';
}

/** True iff a match in `status` has a court committed to it — `called`,
 * `playing`/`started`, or a terminal state (`done`/`finished`/`retired`).
 * Feeds assignment decisions, not occupancy counts. */
export function holdsCourtCommitment(status: OccupancyStatus): boolean {
  return (
    status === 'called' ||
    status === 'playing' ||
    status === 'started' ||
    status === 'done' ||
    status === 'finished' ||
    status === 'retired'
  );
}

/** Bucket every court claimed by at least one currently-occupying match into
 * `occupied` (exactly one claimant) or `disputed` (two or more). A court
 * nobody claims is free by omission — never present in the returned map. */
export function deriveCourtStates(
  matches: readonly OccupancyMatchLike[],
  nowWindow: NowWindow = 'desk',
): Map<number, CourtState> {
  const byCourt = new Map<number, OccupancyMatchLike[]>();
  for (const m of matches) {
    if (m.court == null || !occupiesCourtNow(m.status, nowWindow)) continue;
    const list = byCourt.get(m.court) ?? [];
    list.push(m);
    byCourt.set(m.court, list);
  }
  const states = new Map<number, CourtState>();
  for (const [court, claimants] of byCourt) {
    states.set(court, claimants.length === 1 ? 'occupied' : 'disputed');
  }
  return states;
}

/** One `CourtDispute` per court with two or more current claimants. */
export function deriveDisputes(
  matches: readonly OccupancyMatchLike[],
  nowWindow: NowWindow = 'desk',
): CourtDispute[] {
  const byCourt = new Map<number, OccupancyMatchLike[]>();
  for (const m of matches) {
    if (m.court == null || !occupiesCourtNow(m.status, nowWindow)) continue;
    const list = byCourt.get(m.court) ?? [];
    list.push(m);
    byCourt.set(m.court, list);
  }
  const disputes: CourtDispute[] = [];
  for (const [court, claimants] of [...byCourt.entries()].sort((a, b) => a[0] - b[0])) {
    if (claimants.length < 2) continue;
    disputes.push({
      courtId: court,
      claims: claimants.map((m) => ({
        matchKey: m.id,
        status: m.status,
      })),
    });
  }
  return disputes;
}

/** Courts with no current claim at all. A disputed court is NOT free. */
export function courtsFree(courtCount: number, states: ReadonlyMap<number, CourtState>): number {
  return Math.max(courtCount - states.size, 0);
}

/** Number of courts in state `occupied` — feeds the `playing` count. A
 * disputed court contributes zero here (and one to `disputedCourtCount`). */
export function occupiedCourtCount(states: ReadonlyMap<number, CourtState>): number {
  let n = 0;
  for (const state of states.values()) if (state === 'occupied') n += 1;
  return n;
}

/** Number of courts in state `disputed`. */
export function disputedCourtCount(states: ReadonlyMap<number, CourtState>): number {
  let n = 0;
  for (const state of states.values()) if (state === 'disputed') n += 1;
  return n;
}

// ── planned occupancy (Plan surface) ──────────────────────────────────────
// The three functions above answer "what is on this court RIGHT NOW". The
// Plan surface asks a different question about the same resource: does the
// PLAN put two matches on one court at overlapping times? That is a clash in
// a schedule nobody has run yet, so it has nothing to do with `playing`
// status — it is pure interval arithmetic over court/slot/span. The backend
// twin is `find_planned_clashes` in `apps/api/src/shared/court_occupancy.py`,
// which the `plan-finalized` write boundary enforces.

export interface PlannedPlacement {
  /** Stable identifier for the placed match (`{source}:{id}` on the console). */
  key: string;
  court?: number | null;
  slot?: number | null;
  /** Slots the match occupies from `slot`. Defaults to 1. */
  span?: number | null;
}

export interface PlannedClash {
  courtId: number;
  /** First slot of the overlapping window. */
  slotId: number;
  /** Keys of every placement overlapping in that window, in placement order. */
  keys: string[];
}

/**
 * Every court whose plan puts two or more matches in overlapping slots.
 *
 * One entry per overlapping cluster (not per pair), keyed on the cluster's
 * earliest slot, ordered by court then slot. A placement without a court or
 * a slot is not placed, so it cannot clash.
 */
export function findPlannedClashes(
  placements: readonly PlannedPlacement[],
): PlannedClash[] {
  const byCourt = new Map<number, PlannedPlacement[]>();
  for (const p of placements) {
    if (p.court == null || p.slot == null) continue;
    const list = byCourt.get(p.court) ?? [];
    list.push(p);
    byCourt.set(p.court, list);
  }
  const clashes: PlannedClash[] = [];
  for (const [court, list] of [...byCourt.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    let cluster: PlannedPlacement[] = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      if (cluster.length > 1) {
        clashes.push({
          courtId: court,
          slotId: cluster[0].slot ?? 0,
          keys: cluster.map((p) => p.key),
        });
      }
      cluster = [];
      clusterEnd = -Infinity;
    };
    for (const p of sorted) {
      const start = p.slot ?? 0;
      const end = start + Math.max(1, p.span ?? 1);
      if (start < clusterEnd) {
        cluster.push(p);
        clusterEnd = Math.max(clusterEnd, end);
      } else {
        flush();
        cluster = [p];
        clusterEnd = end;
      }
    }
    flush();
  }
  return clashes;
}
