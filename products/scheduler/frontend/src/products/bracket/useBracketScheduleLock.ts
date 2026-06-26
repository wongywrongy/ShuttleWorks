/**
 * Per-engine schedule-lock signal for the bracket.
 *
 * The bracket schedules independently of the meet, so its lock state must
 * be ITS OWN — never the meet store's `isScheduleLocked` (locking the meet
 * schedule must not light up the bracket). The backend does not expose a
 * bracket schedule-lock yet; this hook is the seam where it will wire in
 * (e.g. derived from a committed-schedule flag on the bracket DTO). It is
 * stubbed `false` for now so the lock affordance is present and ready —
 * the surfaces account for the capability even though it's a no-op today.
 */
export function useBracketScheduleLock(): { isLocked: boolean } {
  // TODO(bracket-backend): replace with the real committed-schedule flag
  // once the bracket schedule API exposes a lock state.
  return { isLocked: false };
}
