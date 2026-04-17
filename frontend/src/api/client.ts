/**
 * Stateless API Client
 * Communicates with the stateless scheduling backend
 */
import axios, { type AxiosInstance } from 'axios';
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
  MatchGenerationRule,
  TournamentStateDTO,
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
        if (error.response) {
          const message = error.response.data?.detail || error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          throw new Error('No response from server. Please check if the backend is running.');
        } else {
          throw new Error(error.message || 'An unexpected error occurred');
        }
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
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortSignal,
      })
        .then(async (response) => {
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
        .catch(reject);
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
   * Health check
   */
  async health(): Promise<{ status: string; version: string }> {
    const response = await this.client.get('/health');
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
   * Delete a match state from the file (reset to default)
   */
  async deleteMatchState(matchId: string): Promise<void> {
    await this.client.delete(`/match-states/${matchId}`);
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

  /**
   * Generate matches from a rule (placeholder - not yet implemented on backend)
   * @throws Error - Feature not yet implemented
   */
  async generateMatchesFromRule(_tournamentId: string, _rule: MatchGenerationRule): Promise<MatchDTO[]> {
    throw new Error('Auto-match generation is not yet implemented. Please create matches manually.');
  }
}

export const apiClient = new ApiClient();
export default apiClient;
