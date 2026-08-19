/**
 * Per-engine RESULTS lock for the meet — the counterpart of the bracket's
 * `useBracketScheduleLock().isLocked`.
 *
 * Meet used to have no such signal. It surfaced only the committed-schedule
 * lock, so a meet mid-event with recorded scores showed an amber "saving will
 * clear the schedule" banner and still let a director change points-per-set —
 * while a bracket in exactly the same situation went read-only. Same
 * condition, two different answers, on two sibling Configuration surfaces.
 *
 * The condition is the same one the bracket uses: play has begun, so scores
 * either exist or are about to. A match that has been called but not started
 * does NOT lock — nothing is recorded yet and a late config fix is still
 * legitimate.
 *
 * Reads `matchStateStore`, which is only hydrated by surfaces that mount
 * `useMatchStateSync`/`useLiveTracking`. Configuration is not one of those, so
 * the caller must mount `useMatchStateSync(tid)` — the lightweight loader
 * built for exactly this ("any surface that RENDERS live state but doesn't
 * mount the full useLiveTracking machinery"), already used by
 * `OperationsProduct` and `DisplayLayoutEditor` for the same reason. Without
 * it the store is empty and this hook silently answers `false`.
 */
import type { MatchStateDTO } from '../api/dto';
import { useMatchStateStore } from '../store/matchStateStore';

/** Statuses that mean play has begun and results are at stake. `called` is
 *  deliberately absent — nothing is recorded yet at that point. Exported
 *  as the ONE definition of "results at stake": the per-event assignment
 *  guard (`useEventResultsGuard`) keys on the same set. */
export const RESULTS_AT_STAKE: ReadonlySet<MatchStateDTO['status']> = new Set([
  'started',
  'finished',
]);

export function useMeetResultsLock(): boolean {
  return useMatchStateStore((s) =>
    Object.values(s.matchStates).some((m) => RESULTS_AT_STAKE.has(m.status)),
  );
}
