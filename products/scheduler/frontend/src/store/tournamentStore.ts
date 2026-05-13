/**
 * Tournament data — persisted to the server-side snapshot at
 * ``/tournament-state`` via ``useTournamentState`` (debounced ~1s PUTs).
 *
 * Holds config, roster, matches, schedule, plus the two-phase commit
 * pipeline's version + history slices. Hydration on mount restores
 * everything in here from the server. Ephemeral UI state lives in
 * ``useUiStore``; live match states in ``useMatchStateStore``.
 */
import { create } from 'zustand';
import type {
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  ScheduleDTO,
  ScheduleHistoryEntry,
  TournamentConfig,
} from '../api/dto';

interface TournamentState {
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

  // Schedule
  schedule: ScheduleDTO | null;
  setSchedule: (schedule: ScheduleDTO | null) => void;
  setActiveCandidateIndex: (index: number) => void;

  // Staleness flag
  scheduleIsStale: boolean;
  setScheduleStale: (stale: boolean) => void;

  // Lock
  isScheduleLocked: boolean;
  lockSchedule: () => void;
  unlockSchedule: () => void;

  // Two-phase commit pipeline
  scheduleVersion: number;
  scheduleHistory: ScheduleHistoryEntry[];
  setScheduleVersion: (version: number) => void;
  setScheduleHistory: (history: ScheduleHistoryEntry[]) => void;

  // Data management
  reset: () => void;
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
  rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
  closedCourts: [],
  courtClosures: [],
  clockShiftMinutes: 0,
};

const INITIAL = {
  config: DEFAULT_CONFIG as TournamentConfig | null,
  groups: [] as RosterGroupDTO[],
  players: [] as PlayerDTO[],
  matches: [] as MatchDTO[],
  schedule: null as ScheduleDTO | null,
  scheduleIsStale: false,
  isScheduleLocked: false,
  scheduleVersion: 0,
  scheduleHistory: [] as ScheduleHistoryEntry[],
};

export const useTournamentStore = create<TournamentState>((set, get) => ({
  ...INITIAL,

  setConfig: (config) =>
    set((state) => {
      const prev = state.config;
      if (!prev) return { config, scheduleIsStale: state.scheduleIsStale };
      // Fields that are pure UI/metadata and never feed the solver —
      // changing them must NOT mark the schedule stale or trip the
      // lock guard. Scoring format is operator-side display logic;
      // every `tv*` knob lives only in the TV render path.
      const NON_SCHEDULING_KEYS: Array<keyof TournamentConfig> = [
        'scoringFormat',
        'setsToWin',
        'pointsPerSet',
        'deuceEnabled',
        'tvDisplayMode',
        'tvAccent',
        'tvPreset',
        'tvGridColumns',
        'tvCardSize',
        'tvShowScores',
      ];
      const changedKeys = (Object.keys(config) as Array<keyof TournamentConfig>).filter(
        (k) => JSON.stringify(config[k]) !== JSON.stringify(prev[k]),
      );
      const schedulingFieldsChanged = changedKeys.some(
        (k) => !NON_SCHEDULING_KEYS.includes(k),
      );
      return {
        config,
        scheduleIsStale: schedulingFieldsChanged ? true : state.scheduleIsStale,
      };
    }),

  addGroup: (group) => set((state) => ({ groups: [...state.groups, group] })),
  updateGroup: (id, updates) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    })),
  deleteGroup: (id) => {
    const state = get();
    const playersInGroup = state.players.filter((p) => p.groupId === id);
    if (playersInGroup.length > 0) {
      throw new Error(
        `Cannot delete group: ${playersInGroup.length} players assigned. Remove players first.`,
      );
    }
    set((state) => ({ groups: state.groups.filter((g) => g.id !== id) }));
  },

  addPlayer: (player) =>
    set((state) => ({ players: [...state.players, player], scheduleIsStale: true })),
  updatePlayer: (id, updates) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      scheduleIsStale: true,
    })),
  deletePlayer: (id) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== id),
      scheduleIsStale: true,
    })),
  importPlayers: (players) => set({ players, scheduleIsStale: true }),
  setPlayers: (players) => set({ players, scheduleIsStale: true }),

  addMatch: (match) =>
    set((state) => {
      const maxNumber = state.matches.reduce(
        (max, m) => Math.max(max, m.matchNumber ?? 0),
        0,
      );
      const newMatch = match.matchNumber ? match : { ...match, matchNumber: maxNumber + 1 };
      return { matches: [...state.matches, newMatch], scheduleIsStale: true };
    }),
  updateMatch: (id, updates) =>
    set((state) => ({
      matches: state.matches.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      scheduleIsStale: true,
    })),
  deleteMatch: (id) =>
    set((state) => ({
      matches: state.matches.filter((m) => m.id !== id),
      scheduleIsStale: true,
    })),
  importMatches: (matches) => {
    const numbered = matches.map((m, i) => ({ ...m, matchNumber: m.matchNumber ?? i + 1 }));
    set({ matches: numbered, scheduleIsStale: true });
  },
  setMatches: (matches) => {
    const numbered = matches.map((m, i) => ({ ...m, matchNumber: m.matchNumber ?? i + 1 }));
    set({ matches: numbered, scheduleIsStale: true });
  },

  setSchedule: (schedule) =>
    set({
      schedule,
      scheduleIsStale: false,
      isScheduleLocked: schedule !== null,
    }),
  setActiveCandidateIndex: (index) =>
    set((state) => {
      const s = state.schedule;
      if (!s || !s.candidates || index < 0 || index >= s.candidates.length) return {};
      const cand = s.candidates[index];
      return {
        schedule: {
          ...s,
          assignments: cand.assignments,
          activeCandidateIndex: index,
          objectiveScore: cand.objectiveScore,
        },
      };
    }),
  setScheduleStale: (scheduleIsStale) => set({ scheduleIsStale }),

  lockSchedule: () => set({ isScheduleLocked: true }),
  unlockSchedule: () =>
    set({ isScheduleLocked: false, schedule: null }),

  setScheduleVersion: (scheduleVersion) => set({ scheduleVersion }),
  setScheduleHistory: (scheduleHistory) => set({ scheduleHistory }),

  // Reset is scoped to this store. Wiping match-state + UI on a full
  // "Clear all data" is the job of `useClearAllData` in hooks/, which
  // composes all three stores so this one doesn't reach across the
  // persistence boundary.
  reset: () => set({ ...INITIAL, config: DEFAULT_CONFIG }),

  exportData: () => {
    const state = get();
    return JSON.stringify(
      {
        config: state.config,
        groups: state.groups,
        players: state.players,
        matches: state.matches,
      },
      null,
      2,
    );
  },

  importData: (jsonData) => {
    try {
      const data = JSON.parse(jsonData);
      set({
        config: data.config || DEFAULT_CONFIG,
        groups: data.groups || [],
        players: data.players || [],
        matches: data.matches || [],
        schedule: null,
      });
    } catch (error) {
      console.error('Failed to import data:', error);
      throw new Error('Invalid JSON data');
    }
  },
}));
