/**
 * Match state — persisted to /match-state on every mutation (no debounce).
 *
 * Live-ops match transitions (called / started / finished + actual
 * start/end timestamps + scores) flush immediately because the
 * mutations carry user intent that must not be lost.
 */
import { create } from 'zustand';
import type { LiveScheduleState, MatchStateDTO } from '../api/dto';

interface MatchStateState {
  matchStates: Record<string, MatchStateDTO>;
  liveState: LiveScheduleState | null;

  setMatchStates: (states: Record<string, MatchStateDTO>) => void;
  setMatchState: (matchId: string, state: MatchStateDTO) => void;
  setCurrentTime: (time: string) => void;
  setLastSynced: (time: string) => void;
  reset: () => void;
}

function buildLiveState(matchStates: Record<string, MatchStateDTO>): LiveScheduleState {
  const now = new Date().toISOString();
  return {
    currentTime: new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    matchStates,
    lastSynced: now,
  };
}

export const useMatchStateStore = create<MatchStateState>((set) => ({
  matchStates: {},
  liveState: null,

  setMatchStates: (matchStates) =>
    set({ matchStates, liveState: buildLiveState(matchStates) }),

  setMatchState: (matchId, state) =>
    set((prev) => {
      const newMatchStates = { ...prev.matchStates, [matchId]: state };
      return {
        matchStates: newMatchStates,
        liveState: buildLiveState(newMatchStates),
      };
    }),

  setCurrentTime: (time) =>
    set((state) => ({
      liveState: state.liveState ? { ...state.liveState, currentTime: time } : null,
    })),
  setLastSynced: (time) =>
    set((state) => ({
      liveState: state.liveState ? { ...state.liveState, lastSynced: time } : null,
    })),

  reset: () => set({ matchStates: {}, liveState: null }),
}));
