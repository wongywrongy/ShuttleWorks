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
  TournamentSummaryDTO,
  TournamentCreateDTO,
  TournamentUpdateDTO,
  TournamentMemberDTO,
  BackupListDTO,
  BackupCreatedDTO,
  Advisory,
  Proposal,
  ScheduleHistoryEntry,
  Suggestion,
  InviteCreateDTO,
  InviteCreatedDTO,
  InviteSummaryDTO,
  InviteResolveDTO,
  InviteAcceptedDTO,
  CommandRequestDTO,
  CommandResponseDTO,
  CommandConflictDTO,
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

    // Attach the Supabase JWT to every outgoing request. ``getSession``
    // returns the current cached session (Supabase handles automatic
    // refresh, so we read at request time rather than caching here).
    // When the Supabase client is null (no env config — local dev /
    // pytest), the backend's ``get_current_user`` is in synthetic-user
    // mode and doesn't need a header.
    this.client.interceptors.request.use(async (config) => {
      const { supabase } = await import('../lib/supabase');
      if (!supabase) return config;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        config.headers.set?.('Authorization', `Bearer ${token}`);
      }
      return config;
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
   * Generate optimized schedule.
   * Stateless compute — no tournament_id needed; the full problem is in the body.
   */
  async generateSchedule(request: GenerateScheduleRequest): Promise<ScheduleDTO> {
    const response = await this.client.post<ScheduleDTO>('/schedule', request);
    return response.data;
  }

  // ---- Multi-tournament CRUD (Step 2) ----------------------------------

  /** List all tournaments (newest first). */
  async listTournaments(): Promise<TournamentSummaryDTO[]> {
    const response = await this.client.get<TournamentSummaryDTO[]>('/tournaments');
    return response.data;
  }

  /** Create an empty tournament. Returns the summary row including the new id. */
  async createTournament(body: TournamentCreateDTO): Promise<TournamentSummaryDTO> {
    const response = await this.client.post<TournamentSummaryDTO>('/tournaments', body);
    return response.data;
  }

  /** Fetch a tournament's summary (id, name, status, dates). */
  async getTournament(tid: string): Promise<TournamentSummaryDTO> {
    const response = await this.client.get<TournamentSummaryDTO>(`/tournaments/${tid}`);
    return response.data;
  }

  /** Partial update: name / status / tournamentDate. */
  async updateTournament(
    tid: string,
    body: TournamentUpdateDTO,
  ): Promise<TournamentSummaryDTO> {
    const response = await this.client.patch<TournamentSummaryDTO>(
      `/tournaments/${tid}`,
      body,
    );
    return response.data;
  }

  /** Delete a tournament. CASCADE wipes match-states + backups. */
  async deleteTournament(tid: string): Promise<void> {
    await this.client.delete(`/tournaments/${tid}`);
  }

  // ---- Invite links (Step 7) -------------------------------------------

  /** Owner-only. Generates an invite link granting ``role``. */
  async createInvite(
    tid: string,
    body: InviteCreateDTO,
  ): Promise<InviteCreatedDTO> {
    const r = await this.client.post<InviteCreatedDTO>(
      `/tournaments/${tid}/invites`,
      body,
    );
    return r.data;
  }

  /** Owner-only. Lists every invite (active + revoked + expired). */
  async listInvites(tid: string): Promise<InviteSummaryDTO[]> {
    const r = await this.client.get<InviteSummaryDTO[]>(
      `/tournaments/${tid}/invites`,
    );
    return r.data;
  }

  /** Viewer-level. Lists every member of the tournament. */
  async listMembers(tid: string): Promise<TournamentMemberDTO[]> {
    const r = await this.client.get<TournamentMemberDTO[]>(
      `/tournaments/${tid}/members`,
    );
    return r.data;
  }

  /** Public lookup. Returns tournament name + role + valid flag. The
   *  call goes through the same axios instance so the interceptor
   *  still tries to attach an Authorization header when a session
   *  exists — backend ignores it on this route. */
  async resolveInvite(token: string): Promise<InviteResolveDTO> {
    const r = await this.client.get<InviteResolveDTO>(`/invites/${token}`);
    return r.data;
  }

  /** Auth required. Adds the current user to the tournament with the
   *  invite's role (idempotent; never downgrades). */
  async acceptInvite(token: string): Promise<InviteAcceptedDTO> {
    const r = await this.client.post<InviteAcceptedDTO>(
      `/invites/${token}/accept`,
    );
    return r.data;
  }

  /** Owner-only. Stamps ``revoked_at`` on the invite. */
  async revokeInvite(token: string): Promise<void> {
    await this.client.delete(`/invites/${token}`);
  }

  // ---- Two-phase commit (proposal pipeline) ----------------------------

  /** Create a warm-restart proposal — same body as warm-restart, but
   *  the result is stashed server-side for review and not committed
   *  until ``commitProposal`` is called. */
  async createWarmRestartProposal(
    tid: string,
    request: WarmRestartRequest,
  ): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      `/tournaments/${tid}/schedule/proposals/warm-restart`,
      request,
    );
    return response.data;
  }

  /** Create a repair proposal for a given disruption. */
  async createRepairProposal(tid: string, request: RepairRequest): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      `/tournaments/${tid}/schedule/proposals/repair`,
      request,
    );
    return response.data;
  }

  /** Manual-edit proposal (drag-drop). Pins one match to a new
   *  slot/court via warm-restart with a high stay-close weight. */
  async createManualEditProposal(
    tid: string,
    request: ManualEditProposalRequest,
  ): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      `/tournaments/${tid}/schedule/proposals/manual-edit`,
      request,
    );
    return response.data;
  }

  /** Director-action proposal: delay_start, insert_blackout, remove_blackout. */
  async createDirectorActionProposal(
    tid: string,
    request: DirectorActionRequest,
  ): Promise<Proposal> {
    const response = await this.client.post<Proposal>(
      `/tournaments/${tid}/schedule/director-action`,
      request,
    );
    return response.data;
  }

  /** Atomically apply a proposal. 409 if the committed schedule has
   *  advanced since the proposal was created (operator must re-review). */
  async commitProposal(tid: string, id: string): Promise<CommitProposalResponse> {
    const response = await this.client.post<CommitProposalResponse>(
      `/tournaments/${tid}/schedule/proposals/${id}/commit`,
    );
    return response.data;
  }

  /** Discard a proposal without committing. */
  async cancelProposal(tid: string, id: string): Promise<void> {
    await this.client.delete(`/tournaments/${tid}/schedule/proposals/${id}`);
  }

  /** Fetch a single proposal by id (used by SuggestionPreview). */
  async getProposal(tid: string, id: string): Promise<Proposal> {
    const response = await this.client.get<Proposal>(
      `/tournaments/${tid}/schedule/proposals/${id}`,
    );
    return response.data;
  }

  /** Live-operations advisories. Polled on a 15s cadence by useAdvisories. */
  async getAdvisories(tid: string): Promise<Advisory[]> {
    const response = await this.client.get<Advisory[]>(
      `/tournaments/${tid}/schedule/advisories`,
    );
    return response.data;
  }

  /** Pre-computed re-optimization proposals from the SuggestionsWorker. */
  async getSuggestions(tid: string): Promise<Suggestion[]> {
    const response = await this.client.get<Suggestion[]>(
      `/tournaments/${tid}/schedule/suggestions`,
    );
    return response.data;
  }

  /** Apply a suggestion — commits the underlying proposal atomically. */
  async applySuggestion(tid: string, id: string): Promise<CommitProposalResponse> {
    const response = await this.client.post<CommitProposalResponse>(
      `/tournaments/${tid}/schedule/suggestions/${id}/apply`,
    );
    return response.data;
  }

  /** Dismiss a suggestion — drops it and cancels the underlying proposal. */
  async dismissSuggestion(tid: string, id: string): Promise<void> {
    await this.client.post(`/tournaments/${tid}/schedule/suggestions/${id}/dismiss`);
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
   * Fetch a tournament's persisted state blob.
   * Returns `null` when the row exists but has no data yet (HTTP 204).
   */
  async getTournamentState(tid: string): Promise<TournamentStateDTO | null> {
    const response = await this.client.get<TournamentStateDTO>(
      `/tournaments/${tid}/state`,
      { validateStatus: (s) => s === 200 || s === 204 },
    );
    if (response.status === 204) return null;
    return response.data;
  }

  /** Overwrite a tournament's state blob. Returns the stamped state. */
  async putTournamentState(
    tid: string,
    state: TournamentStateDTO,
  ): Promise<TournamentStateDTO> {
    const response = await this.client.put<TournamentStateDTO>(
      `/tournaments/${tid}/state`,
      state,
    );
    return response.data;
  }

  /** List rolling backups (newest first). */
  async listTournamentBackups(tid: string): Promise<BackupListDTO> {
    const res = await this.client.get<BackupListDTO>(
      `/tournaments/${tid}/state/backups`,
    );
    return res.data;
  }

  /** Snapshot the current state into the backup pool. */
  async createTournamentBackup(tid: string): Promise<BackupCreatedDTO> {
    const res = await this.client.post<BackupCreatedDTO>(
      `/tournaments/${tid}/state/backup`,
    );
    return res.data;
  }

  /** Restore from a named backup. Returns the newly-current state. */
  async restoreTournamentBackup(
    tid: string,
    filename: string,
  ): Promise<TournamentStateDTO> {
    const res = await this.client.post<TournamentStateDTO>(
      `/tournaments/${tid}/state/restore/${encodeURIComponent(filename)}`,
    );
    return res.data;
  }

  // ---- Match State Management ------------------------------------------

  /** Get all match states for the tournament. */
  async getMatchStates(tid: string): Promise<Record<string, MatchStateDTO>> {
    const response = await this.client.get<Record<string, MatchStateDTO>>(
      `/tournaments/${tid}/match-states`,
    );
    return response.data;
  }

  /** Get a single match state, or a synthetic 'scheduled' default. */
  async getMatchState(tid: string, matchId: string): Promise<MatchStateDTO> {
    const response = await this.client.get<MatchStateDTO>(
      `/tournaments/${tid}/match-states/${matchId}`,
    );
    return response.data;
  }

  /**
   * Read the canonical ``matches.version`` for a match via the legacy
   * match-state route's ETag header. Returns 0 when the match has
   * never been written (the implicit pre-write convention from Step D).
   *
   * The command queue's submit path uses this on first interaction
   * with each match — subsequent commands read the version from the
   * Zustand cache (populated by CommandResponse.version). One
   * roundtrip per never-before-seen match; sub-millisecond cache hits
   * after.
   */
  async getMatchVersion(tid: string, matchId: string): Promise<number> {
    const response = await this.client.get(
      `/tournaments/${tid}/match-states/${matchId}`,
      { validateStatus: () => true },
    );
    if (response.status >= 200 && response.status < 300) {
      const etag = response.headers['etag'] ?? response.headers['ETag'];
      if (typeof etag === 'string') {
        const stripped = etag.replace(/^W\//, '').replace(/^"|"$/g, '');
        const parsed = parseInt(stripped, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return 0;
  }

  /** Update a match state. */
  async updateMatchState(
    tid: string,
    matchId: string,
    update: Partial<MatchStateDTO>,
  ): Promise<MatchStateDTO> {
    const response = await this.client.put<MatchStateDTO>(
      `/tournaments/${tid}/match-states/${matchId}`,
      { matchId, ...update },
    );
    return response.data;
  }

  /** Reset all match states for the tournament. */
  async resetMatchStates(tid: string): Promise<void> {
    await this.client.post(`/tournaments/${tid}/match-states/reset`);
  }

  /**
   * Shallow health probe. Used by Step G's reachability hook to drive
   * the ConnectionIndicator. Returns true when the backend responds
   * 2xx, false otherwise (any error, any non-2xx). Doesn't throw —
   * the caller wants a boolean, not exception handling.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get('/health', { timeout: 3000 });
      return r.status >= 200 && r.status < 300;
    } catch {
      return false;
    }
  }

  /**
   * Step F: submit an idempotent operator command.
   *
   * Returns a discriminated-union normalised against the four
   * outcomes the prompt's spec calls out: ``ok`` (200 with current
   * state), ``staleVersion`` and ``conflict`` (both 409, different
   * recovery), and ``networkError`` (anything else). The command
   * queue's flush loop branches on ``kind`` to pick its rollback /
   * retry behaviour.
   */
  async submitCommand(
    tid: string,
    body: CommandRequestDTO,
  ): Promise<
    | {
        kind: 'ok';
        matchStatus: string;
        matchVersion: number;
        courtId: number | null;
        timeSlot: number | null;
      }
    | { kind: 'staleVersion'; message: string }
    | { kind: 'conflict'; message: string }
    | { kind: 'networkError'; message: string }
  > {
    try {
      const response = await this.client.post<CommandResponseDTO>(
        `/tournaments/${tid}/commands`,
        body,
      );
      const r = response.data;
      return {
        kind: 'ok',
        matchStatus: r.status,
        matchVersion: r.version,
        courtId: r.court_id,
        timeSlot: r.time_slot,
      };
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: CommandConflictDTO };
        message?: string;
      };
      const status = axiosErr.response?.status;
      const data = axiosErr.response?.data;
      if (status === 409 && data) {
        if (data.error === 'stale_version') {
          return { kind: 'staleVersion', message: data.message };
        }
        if (data.error === 'conflict') {
          return { kind: 'conflict', message: data.message };
        }
      }
      return {
        kind: 'networkError',
        message: axiosErr.message ?? 'submit failed',
      };
    }
  }

  /** Download match states as a JSON file. */
  async exportMatchStates(tid: string): Promise<Blob> {
    const response = await this.client.get(
      `/tournaments/${tid}/match-states/export/download`,
      { responseType: 'blob' },
    );
    return response.data;
  }

  /** Import match states from an uploaded JSON file. */
  async importMatchStates(
    tid: string,
    file: File,
  ): Promise<{ message: string; matchCount: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post(
      `/tournaments/${tid}/match-states/import/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  }

  /** Bulk import match states from a dictionary (used for v2.0 export). */
  async importMatchStatesBulk(
    tid: string,
    matchStates: Record<string, MatchStateDTO>,
  ): Promise<{ message: string; importedCount: number }> {
    const response = await this.client.post(
      `/tournaments/${tid}/match-states/import-bulk`,
      matchStates,
    );
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
