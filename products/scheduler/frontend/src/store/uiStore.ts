/**
 * Ephemeral UI state — never serialised.
 *
 * Solver HUD, toast queue, drag-in-flight pins, validation snapshots,
 * generation progress, solver logs, proposal review state, advisories,
 * suggestions, and the unlock-modal handshake live here. Hydration on
 * mount does not restore any of these; a refresh always lands the
 * operator on a clean ephemeral slate.
 */
import { create } from 'zustand';
import type {
  Advisory,
  Proposal,
  ScheduleAssignment,
  SolverProgressEvent,
  Suggestion,
} from '../api/dto';

export type AppTab =
  | 'setup'
  | 'roster'
  | 'matches'
  | 'schedule'
  | 'live'
  | 'bracket'
  | 'tv'
  | 'bracket-draw'
  | 'bracket-schedule'
  | 'bracket-live';

export type SolverPhase = 'presolve' | 'search' | 'proving' | null;

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

export interface PendingPin {
  matchId: string;
  slotId: number;
  courtId: number;
}

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

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: string;
  level: ToastLevel;
  message: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number | null;
}

export interface SolverLogEntry {
  id: number;
  message: string;
  timestamp: number;
  type: 'info' | 'solution' | 'violation' | 'stats' | 'progress';
}

export interface ScheduleGenerationStats {
  elapsed: number;
  solutionCount?: number;
  objectiveScore?: number;
  bestBound?: number;
  assignments: ScheduleAssignment[];
}

export interface UnlockModalState {
  open: boolean;
  actionDescription?: string;
  resolve: (confirmed: boolean) => void;
}

const DEFAULT_SOLVER_HUD: SolverHudState = {
  phase: null,
  solutionCount: 0,
  elapsedMs: 0,
};

interface UiState {
  // Shell
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  // URL-derived tournament id. Set by ``TournamentPage`` on mount; read
  // by ``forceSaveNow`` and other module-level helpers that don't have
  // direct access to React Router params. NOT persisted — refreshing
  // the page re-derives it from the URL.
  activeTournamentId: string | null;
  setActiveTournamentId: (id: string | null) => void;

  // Active tournament's kind (meet | bracket). Fetched on mount by
  // ``useTournamentKind`` via the summary endpoint; ``null`` while
  // loading or when the request fails (the AppShell falls back to
  // meet-style chrome in that case). The TabBar reads this to filter
  // out meet-only tabs on a bracket-kind tournament and vice versa.
  activeTournamentKind: 'meet' | 'bracket' | null;
  setActiveTournamentKind: (kind: 'meet' | 'bracket' | null) => void;

  // Whether the active bracket-kind tournament has a generated draw.
  // Written by ``BracketTab`` from ``useBracket().data``; ``null`` when
  // no bracket surface is mounted (meet kind / dashboard). ``TabBar``
  // reads this to disable the Draw/Schedule/Live tabs until a draw
  // exists — ``TabBar`` lives outside ``BracketApiProvider`` so it
  // can't call ``useBracket`` itself.
  bracketDataReady: boolean | null;
  setBracketDataReady: (ready: boolean | null) => void;

  // Solver HUD
  solverHud: SolverHudState;
  setSolverHud: (patch: Partial<SolverHudState>) => void;
  resetSolverHud: () => void;

  // Drag pin (optimistic)
  pendingPin: PendingPin | null;
  setPendingPin: (pin: PendingPin | null) => void;

  // Validate-during-drag
  lastValidation: ValidationSnapshot | null;
  setLastValidation: (v: ValidationSnapshot | null) => void;

  // Server-persist status for the tournament snapshot.
  persistStatus: 'idle' | 'dirty' | 'saving' | 'error';
  lastSavedAt: string | null;
  lastSaveError: string | null;
  setPersistStatus: (status: 'idle' | 'dirty' | 'saving' | 'error') => void;
  setLastSavedAt: (iso: string | null) => void;
  setLastSaveError: (msg: string | null) => void;

  // Toasts
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;

  // Schedule-generation lifecycle (persists across tab switches, not to localStorage)
  scheduleStats: ScheduleGenerationStats | null;
  setScheduleStats: (stats: ScheduleGenerationStats | null) => void;
  isGenerating: boolean;
  generationProgress: SolverProgressEvent | null;
  generationError: string | null;
  setIsGenerating: (generating: boolean) => void;
  setGenerationProgress: (progress: SolverProgressEvent | null) => void;
  setGenerationError: (error: string | null) => void;

  // Solver logs (last 50, in-memory only)
  solverLogs: SolverLogEntry[];
  addSolverLog: (message: string, type: SolverLogEntry['type']) => void;
  clearSolverLogs: () => void;

  // Two-phase commit pipeline (ephemeral review state).
  activeProposal: Proposal | null;
  setActiveProposal: (proposal: Proposal | null) => void;
  advisories: Advisory[];
  setAdvisories: (advisories: Advisory[]) => void;
  suggestions: Suggestion[];
  setSuggestions: (suggestions: Suggestion[]) => void;
  pendingAdvisoryReview: Advisory | null;
  setPendingAdvisoryReview: (advisory: Advisory | null) => void;

  // Unlock-confirm modal handshake.
  unlockModalState: UnlockModalState | null;
  setUnlockModalState: (state: UnlockModalState | null) => void;

  // Hard reset — called by the `useClearAllData` hook so the three
  // stores reset together when the operator wipes the tournament.
  reset: () => void;
}

const INITIAL: Pick<
  UiState,
  | 'activeTab'
  | 'activeTournamentId'
  | 'activeTournamentKind'
  | 'bracketDataReady'
  | 'solverHud'
  | 'pendingPin'
  | 'lastValidation'
  | 'persistStatus'
  | 'lastSavedAt'
  | 'lastSaveError'
  | 'toasts'
  | 'scheduleStats'
  | 'isGenerating'
  | 'generationProgress'
  | 'generationError'
  | 'solverLogs'
  | 'activeProposal'
  | 'advisories'
  | 'suggestions'
  | 'pendingAdvisoryReview'
  | 'unlockModalState'
> = {
  activeTab: 'setup',
  activeTournamentId: null,
  activeTournamentKind: null,
  bracketDataReady: null,
  solverHud: DEFAULT_SOLVER_HUD,
  pendingPin: null,
  lastValidation: null,
  persistStatus: 'idle',
  lastSavedAt: null,
  lastSaveError: null,
  toasts: [],
  scheduleStats: null,
  isGenerating: false,
  generationProgress: null,
  generationError: null,
  solverLogs: [],
  activeProposal: null,
  advisories: [],
  suggestions: [],
  pendingAdvisoryReview: null,
  unlockModalState: null,
};

export const useUiStore = create<UiState>((set) => ({
  ...INITIAL,

  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveTournamentId: (activeTournamentId) => set({ activeTournamentId }),
  setActiveTournamentKind: (activeTournamentKind) => set({ activeTournamentKind }),
  setBracketDataReady: (bracketDataReady) => set({ bracketDataReady }),

  setSolverHud: (patch) =>
    set((state) => ({ solverHud: { ...state.solverHud, ...patch } })),
  resetSolverHud: () => set({ solverHud: DEFAULT_SOLVER_HUD }),

  setPendingPin: (pendingPin) => set({ pendingPin }),
  setLastValidation: (lastValidation) => set({ lastValidation }),

  setPersistStatus: (persistStatus) => set({ persistStatus }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  setLastSaveError: (lastSaveError) => set({ lastSaveError }),

  pushToast: (toast) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entry: Toast = {
      id,
      durationMs: toast.level === 'error' ? null : 5_000,
      ...toast,
    };
    set((state) => ({ toasts: [...state.toasts, entry] }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),

  setScheduleStats: (scheduleStats) => set({ scheduleStats }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationProgress: (generationProgress) => set({ generationProgress }),
  setGenerationError: (generationError) => set({ generationError }),

  addSolverLog: (message, type) =>
    set((state) => {
      const newId =
        state.solverLogs.length > 0
          ? Math.max(...state.solverLogs.map((l) => l.id)) + 1
          : 1;
      const newLog: SolverLogEntry = { id: newId, message, timestamp: Date.now(), type };
      return { solverLogs: [...state.solverLogs.slice(-49), newLog] };
    }),
  clearSolverLogs: () => set({ solverLogs: [] }),

  setActiveProposal: (activeProposal) => set({ activeProposal }),
  setAdvisories: (advisories) => set({ advisories }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setPendingAdvisoryReview: (pendingAdvisoryReview) =>
    set({ pendingAdvisoryReview }),
  setUnlockModalState: (unlockModalState) => set({ unlockModalState }),

  reset: () => set({ ...INITIAL }),
}));
