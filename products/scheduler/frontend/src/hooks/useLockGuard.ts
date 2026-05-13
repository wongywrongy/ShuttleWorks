/**
 * Lock guard hook for protecting the committed schedule from
 * accidental edits.
 *
 * When a schedule is generated it becomes locked. Editing config /
 * players / matches requires explicit confirmation to unlock — and the
 * unlock clears the schedule (the next generate / replan starts fresh).
 *
 * The confirmation flow used to be a bare ``window.confirm``. It is now
 * a real modal — the ``UnlockModalHost`` component (rendered by
 * ``AppShell``) reads ``unlockModalState`` from the store and renders
 * ``<UnlockModal />`` whenever a guard is active. ``confirmUnlock`` here
 * sets that state with a resolver and returns a Promise that resolves
 * with the operator's choice.
 */
import { useCallback } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';

export function useLockGuard() {
  const isScheduleLocked = useTournamentStore((state) => state.isScheduleLocked);
  const unlockSchedule = useTournamentStore((state) => state.unlockSchedule);
  const setUnlockModalState = useUiStore((state) => state.setUnlockModalState);

  /**
   * Request to unlock the schedule.
   *
   * If the schedule is unlocked already, resolves immediately with
   * `true`. Otherwise opens the global UnlockModal and resolves with
   * the operator's choice. On `true`, the schedule is also cleared
   * (matching the legacy behaviour) before resolving.
   */
  const confirmUnlock = useCallback(
    (actionDescription?: string): Promise<boolean> => {
      if (!isScheduleLocked) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        setUnlockModalState({
          open: true,
          actionDescription,
          resolve: (confirmed: boolean) => {
            if (confirmed) {
              unlockSchedule();
            }
            setUnlockModalState(null);
            resolve(confirmed);
          },
        });
      });
    },
    [isScheduleLocked, unlockSchedule, setUnlockModalState],
  );

  return {
    isLocked: isScheduleLocked,
    confirmUnlock,
  };
}
