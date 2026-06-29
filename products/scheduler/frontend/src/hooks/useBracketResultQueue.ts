/**
 * React-side wrapper around the IndexedDB bracket result queue (SP-F3).
 *
 * Mirrors ``useCommandQueue`` for bracket result writes. The flow:
 *
 *   1. Generate a UUID as the idempotency key.
 *   2. Apply the result optimistically to the caller's view-model.
 *   3. Enqueue the command in IndexedDB.
 *   4. Flush immediately (best-effort).
 *
 * Outcome handling:
 *   - **200 ok** — settle the view-model with the server's authoritative DTO.
 *   - **409 stale_version** — refetch the bracket + surface the conflict
 *     inline (a second operator already recorded a result here).
 *   - **409 conflict** — refetch + surface a permanent conflict.
 *   - **Network error** — leave the command pending; the next flush retries.
 *
 * Bracket has no ``matchStateStore`` (its match model is separate per ADR
 * 0006), so the view-model concerns (optimistic apply, settle, conflict
 * surface) are injected by the caller — the hook owns only the queue, the
 * UUID, the flush, and the outcome routing.
 */
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../api/client';
import type { BracketScore, BracketTournamentDTO } from '../api/bracketDto';
import {
  enqueue,
  flush,
  type BracketResultCommand,
  type BracketSubmitFn,
  type BracketSubmitResult,
} from '../lib/bracketCommandQueue';
import { useTournamentId } from './useTournamentId';

export interface BracketResultInput {
  matchId: string;
  winnerSide: 'A' | 'B';
  /** ``BracketMatch.version`` the client last observed (``PlayUnitDTO.version``). */
  seenVersion: number;
  finishedAtSlot?: number | null;
  walkover?: boolean;
  score?: BracketScore | null;
}

export interface BracketResultHandlers {
  /** Reflect the pending result in the caller's view-model immediately. */
  onOptimistic: (input: BracketResultInput) => void;
  /** Replace the caller's view-model with the server's authoritative DTO. */
  onSettled: (dto: BracketTournamentDTO) => void;
  /** Surface a conflict inline (stale_version is recoverable; conflict is not). */
  onConflict: (kind: 'stale_version' | 'conflict', message: string) => void;
}

export interface BracketResultOutcome {
  commandId: string;
  result: BracketSubmitResult;
}

export function useBracketResultQueue(handlers: BracketResultHandlers) {
  const tid = useTournamentId();
  const { onOptimistic, onSettled, onConflict } = handlers;

  const submit = useCallback(
    async (input: BracketResultInput): Promise<BracketResultOutcome> => {
      const commandId = uuidv4();

      // 2: optimistic apply — the operator sees the result land instantly,
      // replacing the old 2.5s poll for result writes.
      onOptimistic(input);

      const command: Omit<BracketResultCommand, 'attempts' | 'status'> = {
        id: commandId,
        kind: 'bracket_result',
        tournamentId: tid,
        matchId: input.matchId,
        winnerSide: input.winnerSide,
        finishedAtSlot: input.finishedAtSlot ?? null,
        walkover: input.walkover ?? false,
        score: input.score ?? null,
        seenVersion: input.seenVersion,
        createdAt: Date.now(),
      };
      await enqueue(command);

      // Seam C: route through the Operations command endpoint (SP-G1 Task 10).
      // The command `id` (queue-generated UUID) doubles as the idempotency key —
      // the backend deduplicates on it so a replay never re-runs advancement.
      //
      // The adapter wraps the raw response and maps axios 409 errors to the
      // typed BracketSubmitResult variants so the queue's conflict handling
      // (flush → markRejected → onConflict) is preserved exactly.
      const submitFn: BracketSubmitFn = async (cmd) => {
        try {
          const raw = await apiClient.recordBracketResultCommand(tid, {
            id: cmd.id,
            play_unit_id: cmd.matchId,
            winner_side: cmd.winnerSide,
            seen_version: cmd.seenVersion,
            finished_at_slot: cmd.finishedAtSlot ?? undefined,
            score: cmd.score,
            walkover: cmd.walkover,
          });
          return { kind: 'ok', dto: raw as BracketTournamentDTO };
        } catch (err: unknown) {
          const axiosErr = err as {
            response?: {
              status?: number;
              data?: { error?: string; message?: string; detail?: string };
            };
            message?: string;
          };
          const status = axiosErr.response?.status;
          const data = axiosErr.response?.data;
          if (status === 409) {
            if (data?.error === 'stale_version') {
              return { kind: 'staleVersion', message: data.message ?? 'stale version' };
            }
            return { kind: 'conflict', message: data?.message ?? data?.detail ?? 'conflict' };
          }
          return {
            kind: 'networkError',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      };

      const outcomes = await flush(submitFn);
      const own = outcomes.find((o) => o.id === commandId);
      const result: BracketSubmitResult = own?.result ?? {
        kind: 'networkError',
        message: 'no outcome — possibly absorbed by a concurrent flush',
      };

      switch (result.kind) {
        case 'ok':
          onSettled(result.dto);
          break;
        case 'staleVersion':
        case 'conflict': {
          const kind = result.kind === 'staleVersion' ? 'stale_version' : 'conflict';
          onConflict(kind, result.message);
          // Refetch so the optimistic result doesn't linger against the
          // authoritative state.
          try {
            const fresh = await apiClient.getBracket(tid);
            if (fresh) onSettled(fresh);
          } catch {
            // best-effort — the cross-client poll self-heals.
          }
          break;
        }
        case 'networkError':
          // Leave pending; the next flush retries.
          break;
      }

      return { commandId, result };
    },
    [tid, onOptimistic, onSettled, onConflict],
  );

  return { submit };
}
