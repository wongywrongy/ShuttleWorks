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
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';

export function useBracketScheduleLock(
  data?: BracketTournamentDTO | null,
): { isLocked: boolean } {
  const isLocked = Boolean(
    data?.events.some((ev) => (ev.status ?? 'draft') === 'started'),
  );
  return { isLocked };
}
