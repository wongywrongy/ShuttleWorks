/**
 * Hard reset across every store — the user-facing "Reset tournament"
 * escape hatch in `DataSettings`.
 *
 * Wipes tournament data, live match state, and ephemeral UI state in
 * one shot. Stays in `hooks/` because stores are independent: a
 * cross-store reset is application-level coordination, not store-level
 * behavior. Theme + density survive (they live in `usePreferencesStore`
 * and intentionally outlive a tournament wipe).
 */
import { useCallback } from 'react';

import { useMatchStateStore } from '../store/matchStateStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore } from '../store/uiStore';

export function useClearAllData(): () => void {
  return useCallback(() => {
    useTournamentStore.getState().reset();
    useMatchStateStore.getState().reset();
    useUiStore.getState().reset();
  }, []);
}
