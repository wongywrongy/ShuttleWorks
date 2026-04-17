/**
 * Main application store using Zustand
 * Manages all app state with localStorage persistence
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TournamentConfig,
  PlayerDTO,
  RosterGroupDTO,
  MatchDTO,
  ScheduleDTO,
  MatchStateDTO,
  LiveScheduleState,
  ScheduleAssignment,
  SolverProgressEvent,
} from '../api/dto';

// Stats from schedule generation (persists across page navigation)
interface ScheduleGenerationStats {
  elapsed: number;
  solutionCount?: number;
  objectiveScore?: number;
  bestBound?: number;
  assignments: ScheduleAssignment[];
}

// Solver log entry (persists across page navigation)
export interface SolverLogEntry {
  id: number;
  message: string;
  timestamp: number;
  type: 'info' | 'solution' | 'violation' | 'stats' | 'progress';
}

// Tabs in the one-shell layout. Not persisted — reset to 'setup' on reload.
export type AppTab = 'setup' | 'roster' | 'matches' | 'schedule' | 'live' | 'tv';

// Phases emitted by /schedule/stream. null = idle.
export type SolverPhase = 'presolve' | 'search' | 'proving' | null;

// Persistent solver HUD state. Not persisted to localStorage.
export interface SolverHudState {
  phase: SolverPhase;
  numMatches?: number;
  numIntervals?: number;
  numNoOverlap?: number;
  numVariables?: number;
  solutionCount: number;
  objective?: number;
  bestBound?: number;
  gapPercent?: number;
  elapsedMs: number;
}

// In-flight drag target — optimistic pin before solver returns.
export interface PendingPin {
  matchId: string;
  slotId: number;
  courtId: number;
}

// Result of the last /schedule/validate call during a drag. null = no active check.
export interface ValidationSnapshot {
  matchId: string;
  slotId: number;
  courtId: number;
  feasible: boolean;
  conflicts: Array<{
    type: string;
    description: string;
    matchId?: string;
    otherMatchId?: string;
    playerId?: string;
    courtId?: number;
    slotId?: number;
  }>;
}

const DEFAULT_SOLVER_HUD: SolverHudState = {
  phase: null,
  solutionCount: 0,
  elapsedMs: 0,
};

interface AppState {
  // Shell — active tab. Not persisted.
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  // Solver HUD state — populated from /schedule/stream events. Not persisted.
  solverHud: SolverHudState;
  setSolverHud: (patch: Partial<SolverHudState>) => void;
  resetSolverHud: () => void;

  // In-flight drag pin (optimistic). Not persisted.
  pendingPin: PendingPin | null;
  setPendingPin: (pin: PendingPin | null) => void;

  // Last /schedule/validate result during an active drag. Not persisted.
  lastValidation: ValidationSnapshot | null;
  setLastValidation: (v: ValidationSnapshot | null) => void;

  // Tournament Configuration
  config: TournamentConfig | null;
  setConfig: (config: TournamentConfig) => void;

  // Roster Groups (Schools)
  groups: RosterGroupDTO[];
  addGroup: (group: RosterGroupDTO) => void;
  updateGroup: (id: string, updates: Partial<RosterGroupDTO>) => void;
  deleteGroup: (id: string) => void;

  // Players
  players: PlayerDTO[];
  addPlayer: (player: PlayerDTO) => void;
  updatePlayer: (id: string, updates: Partial<PlayerDTO>) => void;
  deletePlayer: (id: string) => void;
  importPlayers: (players: PlayerDTO[]) => void;
  setPlayers: (players: PlayerDTO[]) => void;

  // Matches
  matches: MatchDTO[];
  addMatch: (match: MatchDTO) => void;
  updateMatch: (id: string, updates: Partial<MatchDTO>) => void;
  deleteMatch: (id: string) => void;
  importMatches: (matches: MatchDTO[]) => void;
  setMatches: (matches: MatchDTO[]) => void;

  // Schedule — persisted to the server file via useTournamentState.
  schedule: ScheduleDTO | null;
  setSchedule: (schedule: ScheduleDTO | null) => void;

  // Staleness flag: `true` when the user has edited config/players/matches
  // after a schedule was generated. Cleared on setSchedule(non-null).
  scheduleIsStale: boolean;
  setScheduleStale: (stale: boolean) => void;

  // Schedule generation stats (persists across page navigation, not to localStorage)
  scheduleStats: ScheduleGenerationStats | null;
  setScheduleStats: (stats: ScheduleGenerationStats | null) => void;

  // Generation state (persists across page navigation for tab switching)
  isGenerating: boolean;
  generationProgress: SolverProgressEvent | null;
  generationError: string | null;
  setIsGenerating: (generating: boolean) => void;
  setGenerationProgress: (progress: SolverProgressEvent | null) => void;
  setGenerationError: (error: string | null) => void;

  // Solver logs (persists across page navigation)
  solverLogs: SolverLogEntry[];
  addSolverLog: (message: string, type: SolverLogEntry['type']) => void;
  clearSolverLogs: () => void;

  // Schedule lock state (prevent accidental edits after generation)
  isScheduleLocked: boolean;
  lockSchedule: () => void;
  unlockSchedule: () => void;

  // Live Tracking (Match States) - NOT persisted to localStorage, managed via file
  matchStates: Record<string, MatchStateDTO>;
  liveState: LiveScheduleState | null;
  setMatchStates: (states: Record<string, MatchStateDTO>) => void;
  setMatchState: (matchId: string, state: MatchStateDTO) => void;
  setCurrentTime: (time: string) => void;
  setLastSynced: (time: string) => void;

  // Data management
  clearAllData: () => void;
  exportData: () => string;
  importData: (jsonData: string) => void;
}

const DEFAULT_CONFIG: TournamentConfig = {
  intervalMinutes: 15,
  dayStart: '09:00',
  dayEnd: '17:00',
  breaks: [],
  courtCount: 2,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 }, // Default: 3 singles each, 2 doubles each per school
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeTab: 'setup' as AppTab,
      solverHud: DEFAULT_SOLVER_HUD,
      pendingPin: null,
      lastValidation: null,
      config: DEFAULT_CONFIG,
      groups: [],
      players: [],
      matches: [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
      isGenerating: false,
      generationProgress: null,
      generationError: null,
      solverLogs: [],
      isScheduleLocked: false,
      matchStates: {},
      liveState: null,

      // Shell actions
      setActiveTab: (activeTab) => set({ activeTab }),

      // Solver HUD actions
      setSolverHud: (patch) => set((state) => ({ solverHud: { ...state.solverHud, ...patch } })),
      resetSolverHud: () => set({ solverHud: DEFAULT_SOLVER_HUD }),

      // Pending pin actions
      setPendingPin: (pendingPin) => set({ pendingPin }),

      // Validation actions
      setLastValidation: (lastValidation) => set({ lastValidation }),

      // Config actions
      // Edits no longer nuke the schedule — they mark it stale. The stored
      // schedule remains visible (with a "stale" banner) until the user
      // explicitly re-solves or dismisses.
      setConfig: (config) => set({ config, scheduleIsStale: true }),

      // Group actions
      addGroup: (group) =>
        set((state) => ({ groups: [...state.groups, group] })),
      updateGroup: (id, updates) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, ...updates } : g
          ),
        })),
      deleteGroup: (id) => {
        const state = get();
        const playersInGroup = state.players.filter(p => p.groupId === id);
        if (playersInGroup.length > 0) {
          throw new Error(`Cannot delete group: ${playersInGroup.length} players assigned. Remove players first.`);
        }
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
        }));
      },

      // Player actions — edits mark the schedule stale rather than clearing it.
      addPlayer: (player) =>
        set((state) => ({ players: [...state.players, player], scheduleIsStale: true })),
      updatePlayer: (id, updates) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          scheduleIsStale: true,
        })),
      deletePlayer: (id) =>
        set((state) => ({
          players: state.players.filter((p) => p.id !== id),
          scheduleIsStale: true,
        })),
      importPlayers: (players) => set({ players, scheduleIsStale: true }),
      setPlayers: (players) => set({ players, scheduleIsStale: true }),

      // Match actions — edits mark the schedule stale rather than clearing it.
      addMatch: (match) =>
        set((state) => {
          const maxNumber = state.matches.reduce((max, m) => Math.max(max, m.matchNumber ?? 0), 0);
          const newMatch = match.matchNumber ? match : { ...match, matchNumber: maxNumber + 1 };
          return { matches: [...state.matches, newMatch], scheduleIsStale: true };
        }),
      updateMatch: (id, updates) =>
        set((state) => ({
          matches: state.matches.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
          scheduleIsStale: true,
        })),
      deleteMatch: (id) =>
        set((state) => ({
          matches: state.matches.filter((m) => m.id !== id),
          scheduleIsStale: true,
        })),
      importMatches: (matches) => {
        const numberedMatches = matches.map((m, index) => ({
          ...m,
          matchNumber: m.matchNumber ?? index + 1,
        }));
        set({ matches: numberedMatches, scheduleIsStale: true });
      },
      setMatches: (matches) => {
        const numberedMatches = matches.map((m, index) => ({
          ...m,
          matchNumber: m.matchNumber ?? index + 1,
        }));
        set({ matches: numberedMatches, scheduleIsStale: true });
      },

      // Schedule actions — setting a non-null schedule clears the stale flag
      // because a fresh solve reflects the current inputs by definition.
      setSchedule: (schedule) => set({
        schedule,
        scheduleIsStale: false,
        isScheduleLocked: schedule !== null,
      }),
      setScheduleStats: (scheduleStats) => set({ scheduleStats }),
      setScheduleStale: (scheduleIsStale) => set({ scheduleIsStale }),

      // Generation state actions
      setIsGenerating: (isGenerating) => set({ isGenerating }),
      setGenerationProgress: (generationProgress) => set({ generationProgress }),
      setGenerationError: (generationError) => set({ generationError }),

      // Solver logs actions
      addSolverLog: (message, type) => set((state) => {
        const newId = state.solverLogs.length > 0
          ? Math.max(...state.solverLogs.map(l => l.id)) + 1
          : 1;
        const newLog: SolverLogEntry = { id: newId, message, timestamp: Date.now(), type };
        // Keep last 50 logs
        return { solverLogs: [...state.solverLogs.slice(-49), newLog] };
      }),
      clearSolverLogs: () => set({ solverLogs: [] }),

      // Lock actions
      lockSchedule: () => set({ isScheduleLocked: true }),
      unlockSchedule: () => set({
        isScheduleLocked: false,
        schedule: null,
        scheduleStats: null,
      }),

      // Live Tracking (Match States) actions
      setMatchStates: (matchStates) => {
        const now = new Date().toISOString();
        set({
          matchStates,
          liveState: {
            currentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            matchStates,
            lastSynced: now,
          },
        });
      },
      setMatchState: (matchId, state) =>
        set((prev) => {
          const newMatchStates = { ...prev.matchStates, [matchId]: state };
          const now = new Date().toISOString();
          return {
            matchStates: newMatchStates,
            liveState: {
              currentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              matchStates: newMatchStates,
              lastSynced: now,
            },
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

      // Data management
      clearAllData: () =>
        set({
          config: DEFAULT_CONFIG,
          groups: [],
          players: [],
          matches: [],
          schedule: null,
        }),

      exportData: () => {
        const state = get();
        return JSON.stringify({
          config: state.config,
          groups: state.groups,
          players: state.players,
          matches: state.matches,
        }, null, 2);
      },

      importData: (jsonData) => {
        try {
          const data = JSON.parse(jsonData);
          set({
            config: data.config || DEFAULT_CONFIG,
            groups: data.groups || [],
            players: data.players || [],
            matches: data.matches || [],
            schedule: null, // Clear schedule on import
          });
        } catch (error) {
          console.error('Failed to import data:', error);
          throw new Error('Invalid JSON data');
        }
      },
    }),
    {
      name: 'scheduler-storage', // localStorage key
      partialize: (state) => ({
        // Only persist these fields (not schedule)
        config: state.config,
        groups: state.groups,
        players: state.players,
        matches: state.matches,
      }),
    }
  )
);
