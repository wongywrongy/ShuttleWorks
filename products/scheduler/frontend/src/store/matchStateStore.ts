/**
 * Match state — persisted to /match-state on every mutation (no debounce).
 *
 * Live-ops match transitions (called / started / finished + actual
 * start/end timestamps + scores) flush immediately because the
 * mutations carry user intent that must not be lost.
 *
 * Step F additions (architecture-adjustment arc): a
 * ``pendingCommandsByMatchId`` map tracks every match that has an
 * in-flight idempotent command via the operator command queue. Step
 * G's pending-badge UI subscribes by selector. ``applyOptimisticStatus``
 * is the write-through path used during optimistic apply — the
 * canonical server state lands later via ``setMatchState``.
 */
import { create } from 'zustand';
import type { LiveScheduleState, MatchStateDTO } from '../api/dto';

type LegacyStatus = 'scheduled' | 'called' | 'started' | 'finished';

/**
 * Step G addition: a server-rejected command leaves a record here so
 * the inline ConflictBanner can render. One entry per match — a
 * second conflict overwrites the first (no log; YAGNI per the
 * prompt's "inline and dismissible" framing).
 */
export interface ConflictRecord {
  flavour: 'stale_version' | 'conflict';
  message: string;
  occurredAt: number;
}

interface MatchStateState {
  matchStates: Record<string, MatchStateDTO>;
  liveState: LiveScheduleState | null;
  /** match_id → queued command_id for in-flight optimistic actions. */
  pendingCommandsByMatchId: Record<string, string>;
  /** match_id → last unresolved conflict (Step G). */
  recentConflictsByMatchId: Record<string, ConflictRecord>;
  /**
   * match_id → canonical ``matches.version`` last observed.
   *
   * Populated from ``CommandResponse.version`` after each successful
   * command + from the legacy match-state route's ETag header on
   * pre-submit reads. The ``useCommandQueue`` hook reads from here
   * to set ``seen_version`` on outbound commands; absence means the
   * frontend hasn't observed the match yet and falls back to a
   * roundtrip read.
   */
  canonicalVersionsByMatchId: Record<string, number>;

  setMatchStates: (states: Record<string, MatchStateDTO>) => void;
  setMatchState: (matchId: string, state: MatchStateDTO) => void;
  setCurrentTime: (time: string) => void;
  setLastSynced: (time: string) => void;
  reset: () => void;

  // Step F: command-queue integration.
  setPendingCommand: (matchId: string, commandId: string) => void;
  clearPendingCommand: (matchId: string) => void;
  applyOptimisticStatus: (matchId: string, status: LegacyStatus) => void;

  // Step G: conflict-record bookkeeping.
  recordConflict: (
    matchId: string,
    flavour: ConflictRecord['flavour'],
    message: string,
  ) => void;
  dismissConflict: (matchId: string) => void;

  // Post-audit: canonical version tracking for the command queue.
  setMatchVersion: (matchId: string, version: number) => void;
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
  pendingCommandsByMatchId: {},
  recentConflictsByMatchId: {},
  canonicalVersionsByMatchId: {},

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

  reset: () =>
    set({
      matchStates: {},
      liveState: null,
      pendingCommandsByMatchId: {},
      recentConflictsByMatchId: {},
      canonicalVersionsByMatchId: {},
    }),

  setPendingCommand: (matchId, commandId) =>
    set((prev) => ({
      pendingCommandsByMatchId: {
        ...prev.pendingCommandsByMatchId,
        [matchId]: commandId,
      },
    })),

  clearPendingCommand: (matchId) =>
    set((prev) => {
      const next = { ...prev.pendingCommandsByMatchId };
      delete next[matchId];
      return { pendingCommandsByMatchId: next };
    }),

  applyOptimisticStatus: (matchId, status) =>
    set((prev) => {
      const existing = prev.matchStates[matchId] ?? { matchId, status: 'scheduled' as LegacyStatus };
      const next: MatchStateDTO = { ...existing, matchId, status };
      const newMatchStates = { ...prev.matchStates, [matchId]: next };
      return {
        matchStates: newMatchStates,
        liveState: buildLiveState(newMatchStates),
      };
    }),

  recordConflict: (matchId, flavour, message) =>
    set((prev) => ({
      recentConflictsByMatchId: {
        ...prev.recentConflictsByMatchId,
        [matchId]: { flavour, message, occurredAt: Date.now() },
      },
    })),

  dismissConflict: (matchId) =>
    set((prev) => {
      const next = { ...prev.recentConflictsByMatchId };
      delete next[matchId];
      return { recentConflictsByMatchId: next };
    }),

  setMatchVersion: (matchId, version) =>
    set((prev) => ({
      canonicalVersionsByMatchId: {
        ...prev.canonicalVersionsByMatchId,
        [matchId]: version,
      },
    })),
}));
