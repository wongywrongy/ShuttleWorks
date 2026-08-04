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
  SolveJobDTO,
  SolveJobListDTO,
  SolverProgressEvent,
  SolverModelBuiltEvent,
  SolverPhaseEvent,
  ProposedMove,
  ValidationResponseDTO,
  TournamentStateDTO,
  TournamentSummaryDTO,
  WorkspaceModuleDTO,
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
  UserDTO,
  DisplayTokenDTO,
} from './dto';
import { SOLVE_JOB_TERMINAL_STATUSES } from './dto';
import type {
  BracketCreateIn,
  BracketTournamentDTO,
  BracketScheduleNextOut,
  BracketImportCsvParams,
  BracketValidateIn,
  BracketPinIn,
  BracketValidationOut,
  BracketEventUpsertIn,
  BracketEventGenerateIn,
  BracketEventPatchIn,
  BracketScore,
  BracketCommitRoundIn,
} from './bracketDto';

// Use /api proxy in dev, or explicit URL in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:8000');

// Toast-dedupe window. With four polling hooks running concurrently
// (useAdvisories every 15s, useSuggestions every 8s, useBracket every
// 2.5s, useLiveTracking every 5s) a single backend hiccup or a
// tournament-deleted-elsewhere produces a sticky error toast on every
// poll. Sticky toasts pile up forever — operators reported "the screen
// fills with red toasts". The interceptor now suppresses a toast if
// the same ``status:message`` pair was surfaced within this window.
const _ERROR_TOAST_DEDUPE_MS = 30_000;
const _recentErrorToasts = new Map<string, number>();
function _shouldSuppressErrorToast(key: string): boolean {
  const now = Date.now();
  // Garbage-collect entries older than the window so the map doesn't
  // grow unbounded over a long session.
  for (const [k, ts] of _recentErrorToasts) {
    if (now - ts > _ERROR_TOAST_DEDUPE_MS) {
      _recentErrorToasts.delete(k);
    }
  }
  const last = _recentErrorToasts.get(key);
  if (last !== undefined && now - last < _ERROR_TOAST_DEDUPE_MS) {
    return true;
  }
  _recentErrorToasts.set(key, now);
  return false;
}

interface GenerateScheduleRequest {
  config: TournamentConfig;
  players: PlayerDTO[];
  matches: MatchDTO[];
  previousAssignments?: any[];
  /** Hybrid coordination: extra [court, fromSlot, toSlot] windows the meet
   *  solve must avoid — the bracket's occupied courts. */
  closedCourtWindows?: number[][];
}

export interface SolveJobPollOptions {
  signal?: AbortSignal;
  /** Called with every observed job snapshot (submit + each poll). */
  onJob?: (job: SolveJobDTO) => void;
  /** Initial poll delay; grows 1.5× per round, capped at 2 s. */
  basePollMs?: number;
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
type DirectorActionKind =
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

/** Thrown when the server rejects a match-state mutation due to a
 *  stale or missing If-Match version (HTTP 412) or a state-machine
 *  transition conflict (HTTP 409). Callers can branch on `name` to
 *  decide whether to refetch + retry or roll back optimistic state. */
export class MatchVersionMismatch extends Error {
  override name = 'MatchVersionMismatch';
  readonly status: 412 | 409;
  readonly currentVersion?: number;
  constructor(status: 412 | 409, message: string, currentVersion?: number) {
    super(message);
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

/**
 * The axios response-error interceptor body, extracted to module scope so
 * it can be exercised directly in tests (mocking `apiClient`'s methods
 * bypasses this entirely — the interceptor never runs, so the toast logic
 * inside it, including the CONFIG_LOCKED/DRAW_STARTED suppression below,
 * would otherwise go untested). Registered as the reject handler on
 * `client.interceptors.response.use` in the `ApiClient` constructor.
 */
export function handleApiResponseError(error: any): never {
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
  // Promoted alongside `code` for CONFIG_LOCKED payloads: the tournament
  // state PUT's schedule-lock guard ships `extra={"fields": [...],
  // "schedules": [...]}` (backend/api/tournaments.py) so the frontend can
  // disclose exactly which committed schedule(s) a confirm-unlock will
  // clear, instead of guessing from its own module's local state.
  let fields: string[] | undefined;
  let schedules: string[] | undefined;
  if (error.response) {
    const detail = error.response.data?.detail;
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      code = typeof detail.code === 'string' ? detail.code : undefined;
      message = detail.message;
      if (Array.isArray(detail.fields)) fields = detail.fields;
      if (Array.isArray(detail.schedules)) schedules = detail.schedules;
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

  // CONFIG_LOCKED / DRAW_STARTED are raised ONLY by the tournament
  // state PUT's schedule-lock guard (backend/api/tournaments.py) —
  // and that funnel (`useTournamentState.forceSaveNow`) now owns their
  // UX end to end: CONFIG_LOCKED opens the unlock-confirm modal (and
  // on decline re-syncs quietly), DRAW_STARTED shows its own friendly
  // "started draw" toast. Letting THIS generic handler also toast the
  // raw backend string (which literally reads "...Retry with
  // ?clearSchedule=true...") would surface a second, scarier toast
  // alongside — or instead of — that dedicated handling.
  const isLockCode = code === 'CONFIG_LOCKED' || code === 'DRAW_STARTED';

  // Surface the failure exactly once, at the edge, so every hook /
  // component gets consistent UI without needing to handle it.
  // Dedupe identical (status, message) pairs within a 30s window
  // so polling hooks don't pile up sticky error toasts forever
  // when the backend returns the same error every poll cycle.
  // SP-CLOUD-2: a 401 mid-session means the cloud session expired or
  // was revoked. Broadcast so AuthProvider re-probes /auth/me (which
  // nulls the session in cloud mode → AuthGuard redirects to /login);
  // pollers stop via isTerminalPollError. getMe itself never lands
  // here (it maps 401 → null via validateStatus), so this can't loop.
  if (error.response?.status === 401) {
    try {
      window.dispatchEvent(new CustomEvent('sw:session-expired'));
    } catch {
      // non-browser test environments without CustomEvent — ignore
    }
    message = 'Your session has expired — please sign in again';
  }

  const dedupeKey = `${error.response?.status ?? 'NETWORK'}:${message}`;
  const suppress = isLockCode || _shouldSuppressErrorToast(dedupeKey);
  if (!suppress) {
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
  }

  const err = new Error(message) as Error & {
    requestId?: string;
    code?: string;
    fields?: string[];
    schedules?: string[];
    status?: number;
    response?: unknown;
    /** Set by this interceptor so the global
     *  ``window.onunhandledrejection`` handler in ``AppShell``
     *  doesn't surface a second toast for the same error. */
    __handled?: boolean;
  };
  if (requestId) err.requestId = requestId;
  if (code) err.code = code;
  if (fields) err.fields = fields;
  if (schedules) err.schedules = schedules;
  // Preserve the ORIGINAL axios response on the rebuilt error.
  // submitCommand classifies 409s by reading response.data.error
  // (conflict vs stale_version); without this passthrough every
  // rejection degraded to 'networkError', so the command queue
  // kept a permanently-rejected command 'pending' and replayed
  // it on every drain, forever (Phase-10 finding).
  if (error.response) err.response = error.response;
  // Promote the HTTP status so callers can branch on it without
  // pattern-matching the rebuilt ``message`` string. The
  // backend-merge arc's ``useBracket`` hook needs this to tell
  // "no bracket configured yet" (404) from a real server error.
  if (error.response?.status) err.status = error.response.status;
  err.__handled = true;
  throw err;
}

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        // CSRF double-submit shield: the backend refuses state-changing
        // requests that carry the session cookie without this header
        // (AUTH_CSRF_REQUIRED). Sending it on EVERY request is harmless
        // and simpler than special-casing methods.
        'X-ShuttleWorks-CSRF': '1',
      },
      // Session auth is an httpOnly cookie — the browser attaches it
      // only when credentials are enabled for cross-origin calls.
      withCredentials: true,
      timeout: 300000, // 5 minutes for large schedules
    });

    this.client.interceptors.response.use(
      (response) => response,
      handleApiResponseError,
    );
  }

  // ---- Auth (self-hosted cookie sessions, SP-CLOUD-2) ------------------

  /** Create an account. Sets the httpOnly session cookie on success. */
  async register(body: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserDTO> {
    const r = await this.client.post<UserDTO>('/auth/register', body);
    return r.data;
  }

  /** Email + password sign-in. Sets the httpOnly session cookie. */
  async login(body: { email: string; password: string }): Promise<UserDTO> {
    const r = await this.client.post<UserDTO>('/auth/login', body);
    return r.data;
  }

  /** Clears the session cookie server-side (204). */
  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
  }

  /**
   * Who am I? Local mode always answers 200 with the bootstrap
   * identity; cloud mode answers 401 when signed out — mapped to
   * ``null`` here (NOT an error) so the AuthProvider's mount probe
   * doesn't toast on every anonymous visit.
   */
  async getMe(): Promise<UserDTO | null> {
    const r = await this.client.get<UserDTO>('/auth/me', {
      validateStatus: (s) => s === 200 || s === 401,
    });
    if (r.status === 401) return null;
    return r.data;
  }

  async changePassword(body: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    await this.client.post('/auth/change-password', body);
  }

  /** Always 202 (no account-existence oracle). */
  async requestPasswordReset(email: string): Promise<void> {
    await this.client.post('/auth/request-password-reset', { email });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/reset-password', { token, newPassword });
  }

  // ---- Display capability tokens (owner-gated mint/rotate) -------------

  /** The workspace's public display link, minted on first ask. Owner-only. */
  async getDisplayToken(tid: string): Promise<DisplayTokenDTO> {
    const r = await this.client.get<DisplayTokenDTO>(
      `/tournaments/${tid}/display-token`,
    );
    return r.data;
  }

  /** Revoke-by-rotation: the old link dies the moment this returns. */
  async rotateDisplayToken(tid: string): Promise<DisplayTokenDTO> {
    const r = await this.client.post<DisplayTokenDTO>(
      `/tournaments/${tid}/display-token/rotate`,
    );
    return r.data;
  }

  // ---- Public display projection (token-authenticated, read-only) ------
  // The ONLY unauthenticated data plane: `/display/{token}/*` serves the
  // spectator board a projection, never the raw state blob.

  async getDisplaySummary(
    token: string,
  ): Promise<{ kind: string; name: string | null }> {
    const r = await this.client.get(
      `/display/${encodeURIComponent(token)}/summary`,
    );
    return r.data;
  }

  /** The meet-board projection. `null` when the workspace has no data yet (204). */
  async getDisplayState(token: string): Promise<TournamentStateDTO | null> {
    const r = await this.client.get<TournamentStateDTO>(
      `/display/${encodeURIComponent(token)}/state`,
      { validateStatus: (s) => s === 200 || s === 204 },
    );
    if (r.status === 204) return null;
    return r.data;
  }

  async getDisplayMatchStates(
    token: string,
  ): Promise<Record<string, MatchStateDTO>> {
    const r = await this.client.get<Record<string, MatchStateDTO>>(
      `/display/${encodeURIComponent(token)}/match-states`,
    );
    return r.data;
  }

  /** Bracket board read. `null` when no bracket is configured yet (404),
   *  mirroring ``getBracket``. */
  async getDisplayBracket(token: string): Promise<BracketTournamentDTO | null> {
    const r = await this.client.get(
      `/display/${encodeURIComponent(token)}/bracket`,
      { validateStatus: (s) => s === 200 || s === 404 },
    );
    if (r.status === 404) return null;
    return r.data;
  }

  // ---- Solve jobs (SP-CLOUD-1 async solve rail) ------------------------

  /** Submit a solve job (202). Stripe idempotency: a retry with the same
   *  key returns the original job, never a second solve. */
  async submitSolveJob(
    tid: string,
    request: GenerateScheduleRequest,
    idempotencyKey: string,
  ): Promise<SolveJobDTO> {
    const response = await this.client.post<SolveJobDTO>(
      `/tournaments/${tid}/solve-jobs`,
      request,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return response.data;
  }

  async getSolveJob(tid: string, jobId: string): Promise<SolveJobDTO> {
    const response = await this.client.get<SolveJobDTO>(
      `/tournaments/${tid}/solve-jobs/${jobId}`,
    );
    return response.data;
  }

  /** Recent jobs, newest first (bounded server-side). */
  async listSolveJobs(tid: string): Promise<SolveJobDTO[]> {
    const response = await this.client.get<SolveJobListDTO>(
      `/tournaments/${tid}/solve-jobs`,
    );
    return response.data.jobs;
  }

  async cancelSolveJob(tid: string, jobId: string): Promise<SolveJobDTO> {
    const response = await this.client.post<SolveJobDTO>(
      `/tournaments/${tid}/solve-jobs/${jobId}/cancel`,
    );
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

  // ---- Workspace modules (control-plane sub-project #1) ----------------

  /** The persisted module catalog for a workspace. */
  async getWorkspaceModules(tid: string): Promise<WorkspaceModuleDTO[]> {
    const response = await this.client.get<WorkspaceModuleDTO[]>(
      `/tournaments/${tid}/modules`,
    );
    return response.data;
  }

  /** Enable / disable / configure a workspace module. 409 (toasted by the
   *  interceptor) on dependency / last-operational / has-data / coming_soon
   *  rule violations. */
  async patchWorkspaceModule(
    tid: string,
    moduleId: string,
    body: { status?: string; config?: Record<string, unknown> | null },
  ): Promise<WorkspaceModuleDTO> {
    const response = await this.client.patch<WorkspaceModuleDTO>(
      `/tournaments/${tid}/modules/${moduleId}`,
      body,
    );
    return response.data;
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
   *  call goes through the same axios instance so the session cookie
   *  rides along when one exists — backend ignores it on this route. */
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
   * Run one solve through the job rail: submit (idempotency-keyed) and
   * poll until a terminal status.
   *
   * - ``succeeded`` and ``infeasible`` both resolve with the job's
   *   ScheduleDTO — its ``status`` field distinguishes them, which is
   *   exactly what the existing infeasible banner keys on.
   * - ``failed`` rejects with the job's structured error message.
   * - ``cancelled`` (or an aborted signal, which also requests a
   *   server-side cancel) rejects with an ``AbortError`` so callers
   *   keep treating user cancellation as silent.
   *
   * Transient poll failures are tolerated for a few consecutive rounds
   * (the job keeps solving server-side regardless); a submit that hits
   * the one-active-job rule surfaces as the interceptor's 409 toast.
   */
  async runSolveJob(
    tid: string,
    request: GenerateScheduleRequest,
    opts: SolveJobPollOptions = {},
  ): Promise<ScheduleDTO> {
    const job = await this.submitSolveJob(tid, request, crypto.randomUUID());
    opts.onJob?.(job);
    return this.pollSolveJob(tid, job, opts);
  }

  /**
   * Poll an already-submitted job to completion (also the resume path:
   * a reload mid-solve re-adopts the active job instead of losing it).
   * Terminal mapping is identical to ``runSolveJob``.
   */
  async pollSolveJob(
    tid: string,
    initial: SolveJobDTO,
    opts: SolveJobPollOptions = {},
  ): Promise<ScheduleDTO> {
    const { signal, onJob, basePollMs = 500 } = opts;
    const abortError = () => new DOMException('Solve cancelled', 'AbortError');

    let job = initial;
    let delayMs = basePollMs;
    let consecutivePollFailures = 0;
    while (!SOLVE_JOB_TERMINAL_STATUSES.has(job.status)) {
      if (signal?.aborted) {
        void this.cancelSolveJob(tid, job.id).catch(() => {});
        throw abortError();
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, 2_000);
      try {
        job = await this.getSolveJob(tid, job.id);
        consecutivePollFailures = 0;
        onJob?.(job);
      } catch (err) {
        // A dead poll must not kill a live solve — but five dead polls
        // in a row means we've genuinely lost the backend.
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= 5) throw err;
      }
    }

    if (job.status === 'succeeded' || job.status === 'infeasible') {
      if (!job.result) throw new Error('solve job finished without a result');
      return job.result;
    }
    if (job.status === 'cancelled') throw abortError();
    throw new Error(
      job.error?.message || job.error?.code || 'Solve failed',
    );
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

  /** Overwrite a tournament's state blob. Returns the stamped state.
   *  `clearSchedule` sanctions a scheduling-field edit by clearing the
   *  committed schedule(s) server-side, atomically with the write. */
  async putTournamentState(
    tid: string,
    state: TournamentStateDTO,
    opts?: { clearSchedule?: boolean },
  ): Promise<TournamentStateDTO> {
    const response = await this.client.put<TournamentStateDTO>(
      `/tournaments/${tid}/state`,
      state,
      opts?.clearSchedule ? { params: { clearSchedule: true } } : undefined,
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

  /**
   * Update a match state. Sends `If-Match: "<version>"` (RFC 7232
   * quoted form, matches the backend's `_parse_if_match_header`).
   *
   * Returns `{ state, version }` — `version` is the NEW canonical
   * version parsed from the response ETag. Cache it via
   * `matchStateStore.setMatchVersion` so the next mutation on the
   * same match doesn't pay the cold-read roundtrip.
   *
   * Throws `MatchVersionMismatch` on 412 (header missing or stale)
   * or 409 (state-machine conflict). All other failures propagate
   * via the axios interceptor's toast pipeline.
   */
  async updateMatchState(
    tid: string,
    matchId: string,
    update: Partial<MatchStateDTO>,
    version: number,
  ): Promise<{ state: MatchStateDTO; version: number }> {
    try {
      const response = await this.client.put<MatchStateDTO>(
        `/tournaments/${tid}/match-states/${matchId}`,
        { matchId, ...update },
        { headers: { 'If-Match': `"${version}"` } },
      );
      const etag = response.headers['etag'] ?? response.headers['ETag'];
      let newVersion = version + 1;
      if (typeof etag === 'string') {
        const stripped = etag.replace(/^W\//, '').replace(/^"|"$/g, '');
        const parsed = parseInt(stripped, 10);
        if (Number.isFinite(parsed)) newVersion = parsed;
      }
      return { state: response.data, version: newVersion };
    } catch (err) {
      // The axios response interceptor rewrites errors into a plain
      // ``Error`` with ``status`` promoted to a top-level field (see
      // client.ts response-interceptor). Tests, however, mock the raw
      // axios shape with ``err.response.status``. Check both forms so
      // both code paths reach the MatchVersionMismatch branch.
      const status =
        (err as { status?: number }).status ??
        (err as { response?: { status?: number } }).response?.status;
      if (status === 412 || status === 409) {
        const msg =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          (err as { message?: string }).message ??
          'Match version mismatch';
        throw new MatchVersionMismatch(status, msg);
      }
      throw err;
    }
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

  // ---- Brackets (backend-merge arc PR 2/3) -----------------------------
  // Tournament-product routes folded into the scheduler backend under
  // /tournaments/{tid}/bracket/*. Auth + role gating fire via the same
  // interceptor as every other method on this class — no separate client.

  async getBracket(tid: string): Promise<BracketTournamentDTO | null> {
    // 404 on this route means "no bracket configured yet" — that's
    // the operator's expected state on a brand-new tournament, NOT
    // an error. Tell axios to accept 404 as a non-error so the
    // shared interceptor doesn't surface a toast every 2.5s while
    // the polling hook is waiting for the operator to create the
    // bracket. Callers receive ``null`` for the not-yet-configured
    // case and the DTO for everything else.
    const response = await this.client.get(`/tournaments/${tid}/bracket`, {
      validateStatus: (s) => s === 200 || s === 404,
    });
    if (response.status === 404) return null;
    return response.data;
  }

  async createBracket(
    tid: string,
    body: BracketCreateIn,
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket`,
      body,
    );
    return response.data;
  }

  async deleteBracket(tid: string): Promise<{ ok: boolean }> {
    const response = await this.client.delete(`/tournaments/${tid}/bracket`);
    return response.data;
  }

  async scheduleNextBracketRound(
    tid: string,
  ): Promise<BracketScheduleNextOut> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/schedule-next`,
    );
    return response.data;
  }

  /**
   * Stream the next bracket round's solve over SSE, mirroring the meet's
   * ``generateScheduleWithProgress``. Feeds ``model_built`` / ``phase`` /
   * ``progress`` to the callbacks and resolves with the terminal
   * ``complete`` payload (a ``BracketScheduleNextOut`` carrying the
   * candidate pool). Unlike the batch route, this does NOT persist — the
   * caller commits a chosen candidate via ``commitBracketRound``.
   */
  async scheduleNextBracketRoundWithProgress(
    tid: string,
    callbacks: {
      onProgress?: (event: SolverProgressEvent) => void;
      onModelBuilt?: (event: SolverModelBuiltEvent) => void;
      onPhase?: (event: SolverPhaseEvent) => void;
    },
    abortSignal?: AbortSignal,
    candidatePoolSize?: number,
  ): Promise<BracketScheduleNextOut> {
    const query =
      candidatePoolSize != null ? `?candidate_pool_size=${candidatePoolSize}` : '';
    const url = `${API_BASE_URL}/tournaments/${tid}/bracket/schedule-next/stream${query}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Same CSRF shield as the axios default header — this bare
        // fetch() bypasses the axios instance, so it must carry the
        // session cookie + CSRF marker itself.
        'X-ShuttleWorks-CSRF': '1',
      },
      credentials: 'include',
      signal: abortSignal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

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

        const event = JSON.parse(dataMatch[1]);
        switch (event.type) {
          case 'model_built':
            callbacks.onModelBuilt?.(event as SolverModelBuiltEvent);
            break;
          case 'phase':
            callbacks.onPhase?.({ phase: event.phase });
            break;
          case 'progress':
            callbacks.onProgress?.(event as SolverProgressEvent);
            break;
          case 'complete':
            return event.result as BracketScheduleNextOut;
          case 'error':
            throw new Error(event.message);
          case 'done':
            break;
        }
      }
    }
    throw new Error('Bracket schedule stream ended without a result');
  }

  async commitBracketRound(
    tid: string,
    body: BracketCommitRoundIn,
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/schedule-next/commit`,
      body,
    );
    return response.data;
  }

  async recordBracketResult(
    tid: string,
    body: {
      play_unit_id: string;
      winner_side: 'A' | 'B';
      finished_at_slot?: number | null;
      walkover?: boolean;
      score?: BracketScore | null;
    },
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/results`,
      body,
    );
    return response.data;
  }

  async bracketMatchAction(
    tid: string,
    body: {
      play_unit_id: string;
      action: 'start' | 'finish' | 'reset';
      slot?: number;
    },
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/match-action`,
      body,
    );
    return response.data;
  }

  async validateBracketMove(
    tid: string,
    body: BracketValidateIn,
  ): Promise<BracketValidationOut> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/validate`,
      body,
    );
    return response.data;
  }

  async pinBracketMatch(
    tid: string,
    body: BracketPinIn,
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/pin`,
      body,
    );
    return response.data;
  }

  async importBracketJson(
    tid: string,
    body: unknown,
  ): Promise<BracketTournamentDTO> {
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/import`,
      body,
    );
    return response.data;
  }

  async importBracketCsv(
    tid: string,
    text: string,
    params: BracketImportCsvParams,
  ): Promise<BracketTournamentDTO> {
    const usp = new URLSearchParams();
    usp.set('courts', String(params.courts));
    usp.set('total_slots', String(params.total_slots));
    usp.set('interval_minutes', String(params.interval_minutes));
    usp.set('rest_between_rounds', String(params.rest_between_rounds));
    if (params.start_time) usp.set('start_time', params.start_time);
    if (params.time_limit_seconds !== undefined) {
      usp.set('time_limit_seconds', String(params.time_limit_seconds));
    }
    const response = await this.client.post(
      `/tournaments/${tid}/bracket/import.csv?${usp.toString()}`,
      text,
      { headers: { 'Content-Type': 'text/csv' } },
    );
    return response.data;
  }

  async bracketEventUpsert(
    tid: string,
    eventId: string,
    body: BracketEventUpsertIn,
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.post(
      `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}`,
      body,
    );
    return data;
  }

  async bracketEventGenerate(
    tid: string,
    eventId: string,
    body: BracketEventGenerateIn,
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.post(
      `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}/generate`,
      body,
    );
    return data;
  }

  /**
   * Draw-formats program: draft-only per-draw configuration edit
   * (seeding / bracket size / rr rounds / format config blob) that does
   * NOT touch participants — avoids the upsert-wipes-participants trap.
   */
  async bracketEventPatch(
    tid: string,
    eventId: string,
    body: BracketEventPatchIn,
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.patch(
      `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}`,
      body,
    );
    return data;
  }

  /**
   * Draw-formats program: generate the next Swiss round from current
   * standings (append-only; 409 while the current round is incomplete,
   * for non-progressive formats, drafts, or exhausted rounds).
   */
  async bracketEventNextRound(
    tid: string,
    eventId: string,
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.post(
      `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}/rounds/next`,
      {},
    );
    return data;
  }

  async bracketEventDelete(tid: string, eventId: string): Promise<void> {
    await this.client.delete(
      `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}`,
    );
  }

  /**
   * SP-G1 Task 9b: directly place a bracket play unit on a court+slot without
   * re-running the solver.  Creates an assignment for unscheduled units (no
   * 409) and overwrites an existing assignment.  The bracket analog of the
   * meet's assignCourt command.
   */
  async assignBracketCourt(
    tid: string,
    body: { play_unit_id: string; court_id: number; slot_id: number },
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.post<BracketTournamentDTO>(
      `/tournaments/${tid}/bracket/assign`,
      body,
    );
    return data;
  }

  /**
   * SP-G1 Task 9b: return a bracket play unit to the queue by removing its
   * court assignment — no solver, no result change.  No-op when the unit
   * has no assignment.
   */
  async unassignBracketCourt(
    tid: string,
    body: { play_unit_id: string },
  ): Promise<BracketTournamentDTO> {
    const { data } = await this.client.post<BracketTournamentDTO>(
      `/tournaments/${tid}/bracket/unassign`,
      body,
    );
    return data;
  }

  /**
   * SP-G1 Seam C: record a bracket result through the command interface.
   * POST /tournaments/{tid}/bracket/commands with kind:'record_result'.
   * Carries an optimistic-concurrency `seen_version` so the backend can
   * detect replays / stale writes.
   */
  async recordBracketResultCommand(
    tid: string,
    body: {
      id: string;
      play_unit_id: string;
      winner_side: 'A' | 'B';
      seen_version?: number;
      finished_at_slot?: number;
      score?: unknown;
      walkover?: boolean;
      reason?: 'walkover' | 'retired' | 'forfeit';
    },
  ): Promise<unknown> {
    const { data } = await this.client.post(
      `/tournaments/${tid}/bracket/commands`,
      { kind: 'record_result', ...body },
    );
    return data;
  }

  /**
   * SP-G1 plan-finalize seam: toggle the director's plan-finalized gate.
   * POST /tournaments/{tid}/plan-finalized.
   */
  async setPlanFinalized(tid: string, finalized: boolean): Promise<unknown> {
    const { data } = await this.client.post(
      `/tournaments/${tid}/plan-finalized`,
      { finalized },
    );
    return data;
  }

  bracketExportJsonUrl(tid: string): string {
    return `${API_BASE_URL}/tournaments/${tid}/bracket/export.json`;
  }

  bracketExportCsvUrl(tid: string): string {
    return `${API_BASE_URL}/tournaments/${tid}/bracket/export.csv`;
  }

  bracketExportIcsUrl(tid: string): string {
    return `${API_BASE_URL}/tournaments/${tid}/bracket/export.ics`;
  }
}

export const apiClient = new ApiClient();
