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
 * Only `playing`/`started` — `called` is deliberately excluded, players are
 * still walking to the court. Feeds counts (`playing`, `courtsFree`) and
 * conflict detection. */
export function occupiesCourtNow(status: OccupancyStatus): boolean {
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
): Map<number, CourtState> {
  const byCourt = new Map<number, OccupancyMatchLike[]>();
  for (const m of matches) {
    if (m.court == null || !occupiesCourtNow(m.status)) continue;
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
export function deriveDisputes(matches: readonly OccupancyMatchLike[]): CourtDispute[] {
  const byCourt = new Map<number, OccupancyMatchLike[]>();
  for (const m of matches) {
    if (m.court == null || !occupiesCourtNow(m.status)) continue;
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
