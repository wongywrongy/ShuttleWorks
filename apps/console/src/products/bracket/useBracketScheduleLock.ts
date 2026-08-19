/**
 * Per-engine schedule-lock signal for the bracket.
 *
 * The bracket schedules independently of the meet, so its lock state must
 * be ITS OWN — never the meet store's `isScheduleLocked` (locking the meet
 * schedule must not light up the bracket). The signal derives from the
 * bracket DTO: a draw whose event has `status === 'started'` is in play —
 * engine-config edits (scoring format, sets to win) would corrupt recorded
 * scores, so Configuration locks, mirroring the meet's committed-schedule
 * lock. `generated` (not yet started) draws do NOT lock: re-generating is
 * still cheap and the Draws tab owns that confirm.
 *
 * The backend does not expose an explicit lock flag yet; when it does,
 * this hook is the seam where it wires in.
 *
 * Two independent signals:
 *  - `isLocked` (hard lock) — a draw in play; scores exist and config
 *    edits would corrupt them. NEVER clearable — the backend enforces
 *    this with a 409 DRAW_STARTED regardless of what the client does,
 *    so the UI just disables the fieldset outright (no confirm to offer).
 *  - `hasSchedule` (soft lock) — a committed bracket schedule (assignments)
 *    exists. Scheduling-field edits would clear it, so saves route through
 *    the confirm-unlock modal (mirrors the meet's `useLockGuard`); the
 *    server then clears the schedule atomically with the config write.
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';

export function useBracketScheduleLock(
  data?: BracketTournamentDTO | null,
): { isLocked: boolean; hasSchedule: boolean } {
  const isLocked = Boolean(
    data?.events.some((ev) => (ev.status ?? 'draft') === 'started'),
  );
  const hasSchedule = (data?.assignments?.length ?? 0) > 0;
  return { isLocked, hasSchedule };
}
