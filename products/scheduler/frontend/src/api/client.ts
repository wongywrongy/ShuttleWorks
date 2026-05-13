/**
 * Stateless API Client
 * Communicates with the stateless scheduling backend
 */
import axios, { type AxiosInstance } from 'axios';
import { useUiStore } from '../store/uiStore';
import type {
  TournamentConfig,
  PlayerDTO,
  MatchDTO,
  ScheduleDTO,
  ScheduleAssignment,
  MatchStateDTO,
  SolverProgressEvent,
  SolverModelBuiltEvent,
  SolverPhaseEvent,
  ProposedMove,
  ValidationResponseDTO,
  TournamentStateDTO,
  BackupListDTO,
  BackupCreatedDTO,
  Advisory,
  Proposal,
  ScheduleHistoryEntry,
  Suggestion,
} from './dto';

// Use /api proxy in dev, or explicit URL in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:8000');

interface GenerateScheduleRequest {
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  previousAssignments?: any[];
}

export type DisruptionType = 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';

export interface Disruption {
  type: DisruptionType;
  playerId?: string;
  courtId?: number;
  matchId?: string;
  extraMinutes?: number;
  /** Court closure window — only used when type === 'court_closed'.
   *  Both omitted → indefinite all-day closure; either or both set →
   *  time-bounded closure that gets stored in config.courtClosures. */
  fromTime?: string;
  toTime?: string;
  reason?: string;
}

export interface RepairRequest {
  originalSchedule: ScheduleDTO;
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  disruption: Disruption;
  nowIso?: string;
}

// Manual-edit (drag-drop) proposal — pins one match to a new slot/court.
export interface ManualEditProposalRequest {
  originalSchedule: ScheduleDTO;
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  matchId: string;
  pinnedSlotId: number;
  pinnedCourtId: number;
}

// Director-action proposal — runtime time-axis + court-state adjustments.
export type DirectorActionKind =
  | 'delay_start'
  | 'insert_blackout'
  | 'remove_blackout'
  | 'reopen_court';

export interface DirectorAction {
  kind: DirectorActionKind;
  /** delay_start: minutes to bump clockShiftMinutes by. */
  minutes?: number;
  /** insert_blackout: HH:mm wall-clock window start. */
  fromTime?: string;
  /** insert_blackout: HH:mm wall-clock window end. */
  toTime?: string;
  /** insert_blackout: optional human-readable reason ("Lunch", etc.). */
  reason?: string;
  /** remove_blackout: index into config.breaks. */
  blackoutIndex?: number;
  /** reopen_court: 1-indexed court id to drop from config.closedCourts. */
  courtId?: number;
}

export interface DirectorActionRequest {
  action: DirectorAction;
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  originalSchedule: ScheduleDTO;
  matchStates: Record<string, MatchStateDTO>;
}

// Commit a proposal → updated tournament state + the history entry it appended.
export interface CommitProposalResponse {
  state: TournamentStateDTO;
  historyEntry: ScheduleHistoryEntry;
}

export interface WarmRestartRequest {
  originalSchedule: ScheduleDTO;
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  /** 10 = Conservative (default), 5 = Balanced, 1 = Aggressive. */
  stayCloseWeight?: number;
  nowIso?: string;
}

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minutes for large schedules
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // User-initiated aborts: swallow silently. React Query / SWR-style
        // cancellations legitimately flow through here and shouldn't produce
        // a user-visible toast.
        if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
          throw error;
        }

        const requestId: string | undefined =
          error.response?.headers?.['x-request-id'] ??
          error.response?.headers?.['X-Request-ID'];

        // Backend errors now ship a structured ``detail`` of the form
        // ``{ code: 'STATE_CORRUPT', message: '...' }``. We extract the
        // code as the toast title and the message as the body. Older
        // routes that still pass a bare string ``detail`` keep working
        // — the code falls back to nothing and the string becomes the
        // message.
        let code: string | undefined;
        let message: string;
        if (error.response) {
          const detail = error.response.data?.detail;
          if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
            code = typeof detail.code === 'string' ? detail.code : undefined;
            message = detail.message;
          } else if (typeof detail === 'string') {
            message = detail;
          } else {
            message =
              error.response.data?.message ||
              `Server error ${error.response.status}`;
          }
        } else if (error.request) {
          message = 'No response from server. Is the backend running?';
        } else {
          message = error.message || 'An unexpected error occurred';
        }

        // Compose a single ``detail`` line containing the code (named,
        // not bytes) and the request id if known. The body of the toast
        // is the human message.
        const detailParts: string[] = [];
        if (code) detailParts.push(code);
        if (requestId) detailParts.push(`request ${requestId.slice(0, 8)}`);

        // Surface the failure exactly once, at the edge, so every hook /
        // component gets consistent UI without needing to handle it.
        try {
          useUiStore.getState().pushToast({
            level: 'error',
            message,
            detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
          });
        } catch {
          // The store may not be ready during very-early-lifecycle calls —
          // fall through to the thrown error below.
        }

        const err = new Error(message) as Error & {
          requestId?: string;
          code?: string;
        };
        if (requestId) err.requestId = requestId;
        if (code) err.code = code;
        throw err;
      }
    );
  }

  /**
   * Generate optimized schedule
   * This is the only API call - backend is stateless
   */
  async generateSchedule(request: GenerateScheduleRequest): Promise<ScheduleDTO> {
    const response = await this.client.post<ScheduleDTO>('/schedule', request);
    return response.data;
  }

  // ---- Two-phase commit (proposal pipeline) ----------------------------

  /** Create a warm-restart proposal — same body as warm-restart, but
   *  the result is stashed server-side for review and not committed
   *  until ``commitProposal`` is called. */
  async createWarmRestartProposal(request: WarmRestartRequest): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      '/schedule/proposals/warm-restart',
      request,
    );
    return response.data;
  }

  /** Create a repair proposal for a given disruption. */
  async createRepairProposal(request: RepairRequest): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      '/schedule/proposals/repair',
      request,
    );
    return response.data;
  }

  /** Manual-edit proposal (drag-drop). Pins one match to a new
   *  slot/court via warm-restart with a high stay-close weight. */
  async createManualEditProposal(request: ManualEditProposalRequest): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      '/schedule/proposals/manual-edit',
      request,
    );
    return response.data;
  }

  /** Director-action proposal: delay_start, insert_blackout, remove_blackout. */
  async createDirectorActionProposal(request: DirectorActionRequest): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      '/schedule/director-action',
      request,
    );
    return response.data;
  }

  /** Atomically apply a proposal. 409 if the committed schedule has
   *  advanced since the proposal was created (operator must re-review). */
  async commitProposal(id: string): Promise<CommitProposalResponse> {
    const response = await this.client.post<CommitProposalResponse>(
      `/schedule/proposals/${id}/commit`,
    );
    return response.data;
  }

  /** Discard a proposal without committing. */
  async cancelProposal(id: string): Promise<void> {
    await this.client.delete(`/schedule/proposals/${id}`);
  }

  /** Fetch a single proposal by id (used by SuggestionPreview to load the
   *  impact diff without committing). */
  async getProposal(id: string): Promise<Proposal> {
    const response = await this.client.get<Proposal>(`/schedule/proposals/${id}`);
    return response.data;
  }

  /** Live-operations advisories (overruns, no-shows, running-behind, etc.).
   *  Polled on a 15s cadence by the useAdvisories hook. */
  async getAdvisories(): Promise<Advisory[]> {
    const response = await this.client.get<Advisory[]>('/schedule/advisories');
    return response.data;
  }

  /** Pre-computed re-optimization proposals from the SuggestionsWorker.
   *  Polled every 8s by the useSuggestions hook; rendered in the
   *  SuggestionsRail. */
  async getSuggestions(): Promise<Suggestion[]> {
    const response = await this.client.get<Suggestion[]>('/schedule/suggestions');
    return response.data;
  }

  /** Apply a suggestion — commits the underlying proposal atomically.
   *  Returns the same shape as proposal commit. 409/410 surface as
   *  axios errors with response.status set; the rail handles them. */
  async applySuggestion(id: string): Promise<CommitProposalResponse> {
    const response = await this.client.post<CommitProposalResponse>(
      `/schedule/suggestions/${id}/apply`,
    );
    return response.data;
  }

  /** Dismiss a suggestion — drops it from the inbox and cancels the
   *  underlying proposal so it can't be applied later. */
  async dismissSuggestion(id: string): Promise<void> {
    await this.client.post(`/schedule/suggestions/${id}/dismiss`);
  }

  /**
   * Generate schedule with progress updates via Server-Sent Events.
   *
   * The backend emits these event types:
   *   - ``model_built`` (once) — model statistics
   *   - ``phase``                 — presolve | search | proving
   *   - ``progress`` (many)       — intermediate solution
   *   - ``complete``              — final ScheduleDTO
   *   - ``error``                 — solver exception
   *   - ``done``                  — stream terminator (always last)
   */
  async generateScheduleWithProgress(
    request: GenerateScheduleRequest,
    callbacks: {
      onProgress?: (event: SolverProgressEvent) => void;
      onModelBuilt?: (event: SolverModelBuiltEvent) => void;
      onPhase?: (event: SolverPhaseEvent) => void;
    } | ((event: SolverProgressEvent) => void),
    abortSignal?: AbortSignal
  ): Promise<ScheduleDTO> {
    // Back-compat: old call sites pass a single progress callback.
    const cb = typeof callbacks === 'function'
      ? { onProgress: callbacks }
      : callbacks;

    return new Promise((resolve, reject) => {
      const url = `${API_BASE_URL}/schedule/stream`;

      // Initial-handshake retry with backoff. A dropped-mid-stream failure
      // is *not* retried here because the solver has already started; a
      // reconnect would silently kick off a duplicate run. Instead we
      // surface a toast with a Retry action so the user stays in control.
      const BACKOFFS_MS = [500, 1_000, 2_000];

      const startFetch = async (attempt = 0): Promise<Response> => {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: abortSignal,
          });
          return r;
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
          if (attempt >= BACKOFFS_MS.length) throw err;
          await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
          return startFetch(attempt + 1);
        }
      };

      let reconnectToastId: string | null = null;
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      // The caller's AbortSignal should also tear down the reader so an
      // external cancel (e.g. the user starts a new solve mid-stream)
      // doesn't leak a dangling reader / listener.
      const onExternalAbort = () => {
        if (activeReader) {
          void activeReader.cancel().catch(() => {});
          activeReader = null;
        }
      };
      abortSignal?.addEventListener('abort', onExternalAbort, { once: true });

      startFetch()
        .then(async (response) => {
          // Clear the reconnecting toast once we have a response.
          if (reconnectToastId) {
            useUiStore.getState().dismissToast(reconnectToastId);
            reconnectToastId = null;
          }
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Response body is not readable');
          activeReader = reader;

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const messages = buffer.split('\n\n');
            buffer = messages.pop() || '';

            for (const message of messages) {
              if (!message.trim()) continue;
              const dataMatch = message.match(/^data: (.+)$/m);
              if (!dataMatch) continue;

              try {
                const event = JSON.parse(dataMatch[1]);
                switch (event.type) {
                  case 'model_built':
                    cb.onModelBuilt?.(event as SolverModelBuiltEvent);
                    break;
                  case 'phase':
                    cb.onPhase?.({ phase: event.phase });
                    break;
                  case 'progress':
                    cb.onProgress?.({
                      elapsed_ms: event.elapsed_ms,
                      current_objective: event.current_objective,
                      best_bound: event.best_bound,
                      solution_count: event.solution_count,
                      current_assignments: event.current_assignments,
                      gap_percent: event.gap_percent,
                      messages: event.messages,
                    });
                    break;
                  case 'complete':
                    resolve(event.result as ScheduleDTO);
                    return;
                  case 'error':
                    reject(new Error(event.message));
                    return;
                  case 'done':
                    // Stream terminator — no-op, resolve/reject already handled.
                    break;
                }
              } catch (e) {
                console.error('Failed to parse SSE event:', e);
              }
            }
          }
        })
        .catch((err: Error) => {
          // Silently swallow user-cancelled solves — the caller (useSchedule)
          // aborts on navigation or new-solve-click and doesn't want a toast.
          if (err.name === 'AbortError') {
            reject(err);
            return;
          }
          // Tear down the reader on any non-abort error so we never leak
          // a half-drained stream into the next attempt.
          if (activeReader) {
            void activeReader.cancel().catch(() => {});
            activeReader = null;
          }
          // Mid-stream failure: surface a Retry affordance so the user can
          // rerun the solve after fixing the network/backend. We deliberately
          // don't auto-retry here to avoid silent duplicate solves.
          try {
            useUiStore.getState().pushToast({
              level: 'error',
              message: 'Solver stream dropped',
              detail: err.message,
              actionLabel: 'Retry',
              onAction: () => {
                // Fire-and-forget — caller already saw this promise reject, so
                // the retry starts a fresh solve via the same request object.
                void this.generateScheduleWithProgress(request, callbacks, abortSignal);
              },
            });
          } catch {
            /* store unavailable — fall through */
          }
          reject(err);
        });
    });
  }

  /**
   * Fast feasibility check for a proposed drag-to-reschedule target.
   * Backed by the pure-Python /schedule/validate endpoint — no CP-SAT solve.
   */
  async validateMove(args: {
    config: TournamentConfig;
    players: PlayerDTO[];
    matches: MatchDTO[];
    assignments: ScheduleAssignment[];
    proposedMove: ProposedMove;
    previousAssignments?: any[];
    signal?: AbortSignal;
  }): Promise<ValidationResponseDTO> {
    const { signal, ...body } = args;
    const response = await this.client.post<ValidationResponseDTO>(
      '/schedule/validate',
      body,
      { signal },
    );
    return response.data;
  }

  /**
   * Fetch the server-side tournament state.
   * Returns `null` when the server has no state yet (HTTP 204).
   */
  async getTournamentState(): Promise<TournamentStateDTO | null> {
    const response = await this.client.get<TournamentStateDTO>(
      '/tournament/state',
      { validateStatus: (s) => s === 200 || s === 204 },
    );
    if (response.status === 204) return null;
    return response.data;
  }

  /** Overwrite the tournament state file. Returns the stamped state. */
  async putTournamentState(state: TournamentStateDTO): Promise<TournamentStateDTO> {
    const response = await this.client.put<TournamentStateDTO>(
      '/tournament/state',
      state,
    );
    return response.data;
  }

  /** List rolling backups of the tournament state (newest first). */
  async listTournamentBackups(): Promise<BackupListDTO> {
    const res = await this.client.get<BackupListDTO>('/tournament/state/backups');
    return res.data;
  }

  /** Snapshot the live file into the backup pool right now. */
  async createTournamentBackup(): Promise<BackupCreatedDTO> {
    const res = await this.client.post<BackupCreatedDTO>('/tournament/state/backup');
    return res.data;
  }

  /** Replace the live file with the named backup. Returns the newly-current state. */
  async restoreTournamentBackup(filename: string): Promise<TournamentStateDTO> {
    const res = await this.client.post<TournamentStateDTO>(
      `/tournament/state/restore/${encodeURIComponent(filename)}`,
    );
    return res.data;
  }

  // Match State Management (File-based)

  /**
   * Get all match states from the JSON file
   */
  async getMatchStates(): Promise<Record<string, MatchStateDTO>> {
    const response = await this.client.get<Record<string, MatchStateDTO>>('/match-states');
    return response.data;
  }

  /**
   * Get a single match state
   */
  async getMatchState(matchId: string): Promise<MatchStateDTO> {
    const response = await this.client.get<MatchStateDTO>(`/match-states/${matchId}`);
    return response.data;
  }

  /**
   * Update a match state in the file
   */
  async updateMatchState(matchId: string, update: Partial<MatchStateDTO>): Promise<MatchStateDTO> {
    const response = await this.client.put<MatchStateDTO>(`/match-states/${matchId}`, {
      matchId,
      ...update,
    });
    return response.data;
  }

  /**
   * Reset all match states (clear the file)
   */
  async resetMatchStates(): Promise<void> {
    await this.client.post('/match-states/reset');
  }

  /**
   * Export tournament state as downloadable JSON file
   */
  async exportMatchStates(): Promise<Blob> {
    const response = await this.client.get('/match-states/export/download', {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Import tournament state from JSON file
   */
  async importMatchStates(file: File): Promise<{ message: string; matchCount: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post('/match-states/import/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Bulk import match states from a dictionary (used for v2.0 tournament export)
   */
  async importMatchStatesBulk(matchStates: Record<string, MatchStateDTO>): Promise<{ message: string; importedCount: number }> {
    const response = await this.client.post('/match-states/import-bulk', matchStates);
    return response.data;
  }

}

export const apiClient = new ApiClient();
export default apiClient;
