/**
 * Bracket API Provider + hook — gives ported tournament-product
 * components a tournament-scoped ``api`` object that doesn't require
 * each call site to thread ``tournament_id`` through itself.
 *
 * ``BracketApiProvider`` is mounted at ``BracketTab`` (the entry point
 * for the bracket surface inside the scheduler shell); descendant
 * components read the curried namespace via ``useBracketApi()``.
 *
 * The actual HTTP work lives on ``apiClient`` — this layer just binds
 * the tournament_id once so handlers can call ``api.create(body)``
 * instead of ``apiClient.createBracket(tid, body)``.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { apiClient } from './client';
import { guardMutation } from '../hooks/useCanEdit';
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
  WinnerSide,
} from './bracketDto';
import type {
  SolverProgressEvent,
  SolverModelBuiltEvent,
  SolverPhaseEvent,
} from './dto';

export interface BracketApi {
  /** Resolves to ``null`` when no bracket is configured (404). */
  get: () => Promise<BracketTournamentDTO | null>;
  create: (body: BracketCreateIn) => Promise<BracketTournamentDTO>;
  remove: () => Promise<{ ok: boolean }>;
  scheduleNext: () => Promise<BracketScheduleNextOut>;
  /** Stream the next round's solve with live progress; resolves with the
   *  candidate pool. Does not persist — commit a choice via ``commitRound``. */
  scheduleNextWithProgress: (
    callbacks: {
      onProgress?: (event: SolverProgressEvent) => void;
      onModelBuilt?: (event: SolverModelBuiltEvent) => void;
      onPhase?: (event: SolverPhaseEvent) => void;
    },
    abortSignal?: AbortSignal,
    candidatePoolSize?: number,
  ) => Promise<BracketScheduleNextOut>;
  /** Persist the operator-chosen candidate's assignments for a round. */
  commitRound: (body: BracketCommitRoundIn) => Promise<BracketTournamentDTO>;
  recordResult: (body: {
    play_unit_id: string;
    winner_side: Exclude<WinnerSide, 'none'>;
    finished_at_slot?: number | null;
    walkover?: boolean;
    score?: BracketScore | null;
  }) => Promise<BracketTournamentDTO>;
  matchAction: (body: {
    play_unit_id: string;
    action: 'start' | 'finish' | 'reset';
    slot?: number;
  }) => Promise<BracketTournamentDTO>;
  validateMove: (body: BracketValidateIn) => Promise<BracketValidationOut>;
  pinMatch: (body: BracketPinIn) => Promise<BracketTournamentDTO>;
  importJson: (body: unknown) => Promise<BracketTournamentDTO>;
  importCsv: (
    text: string,
    params: BracketImportCsvParams,
  ) => Promise<BracketTournamentDTO>;
  exportJsonUrl: () => string;
  exportCsvUrl: () => string;
  exportIcsUrl: () => string;
  eventUpsert: (eventId: string, body: BracketEventUpsertIn) => Promise<BracketTournamentDTO>;
  eventGenerate: (eventId: string, body: BracketEventGenerateIn) => Promise<BracketTournamentDTO>;
  /** Draft-only per-draw config edit — never touches participants. */
  eventPatch: (eventId: string, body: BracketEventPatchIn) => Promise<BracketTournamentDTO>;
  /** Swiss: append the next round's pairings from current standings. */
  eventNextRound: (eventId: string) => Promise<BracketTournamentDTO>;
  eventDelete: (eventId: string) => Promise<void>;
  /** SP-G1 Task 9b: directly place a play unit on a court+slot without
   *  re-running the solver.  Creates for unscheduled units (no 409); overwrites
   *  existing.  Bracket analog of the meet's assign-court command. */
  assignCourt: (body: { play_unit_id: string; court_id: number; slot_id: number }) => Promise<BracketTournamentDTO>;
  /** SP-G1 Task 9b: return a play unit to the queue by removing its
   *  court assignment — no solver, no result change.  No-op when already
   *  unassigned. */
  unassign: (body: { play_unit_id: string }) => Promise<BracketTournamentDTO>;
}

const BracketApiContext = createContext<BracketApi | null>(null);
/** Exported only for the optional context-check in BracketRosterTab — not
 *  part of the public hook surface (use useBracketApi inside a provider). */
export { BracketApiContext };

export function BracketApiProvider({
  tournamentId,
  children,
}: {
  tournamentId: string;
  children: ReactNode;
}) {
  // Every bracket mutation is curried here, which makes this the ONE place the
  // whole product's write path can be gated (audit A2-followup). Before this,
  // the bracket product had no permission check at all: a viewer could press
  // Record result / Generate draw / Reset bracket and the request went out, came
  // back 403, and offered a retry that could never succeed. `guardMutation`
  // refuses client-side with a rejection shaped like that same 403, so call
  // sites behave identically — they just never touch the network.
  //
  // Reads and URL builders are deliberately NOT wrapped: a viewer must still be
  // able to see and export the draw. `validateMove` is a preview, not a write.
  const value = useMemo<BracketApi>(
    () => ({
      get: () => apiClient.getBracket(tournamentId),
      create: guardMutation((body) => apiClient.createBracket(tournamentId, body)),
      remove: guardMutation(() => apiClient.deleteBracket(tournamentId)),
      scheduleNext: guardMutation(() => apiClient.scheduleNextBracketRound(tournamentId)),
      scheduleNextWithProgress: guardMutation(
        (callbacks, abortSignal, candidatePoolSize) =>
          apiClient.scheduleNextBracketRoundWithProgress(
            tournamentId,
            callbacks,
            abortSignal,
            candidatePoolSize,
          ),
      ),
      commitRound: guardMutation((body) => apiClient.commitBracketRound(tournamentId, body)),
      recordResult: guardMutation((body) => apiClient.recordBracketResult(tournamentId, body)),
      matchAction: guardMutation((body) => apiClient.bracketMatchAction(tournamentId, body)),
      validateMove: (body) => apiClient.validateBracketMove(tournamentId, body),
      pinMatch: guardMutation((body) => apiClient.pinBracketMatch(tournamentId, body)),
      importJson: guardMutation((body) => apiClient.importBracketJson(tournamentId, body)),
      importCsv: guardMutation((text, params) =>
        apiClient.importBracketCsv(tournamentId, text, params),
      ),
      exportJsonUrl: () => apiClient.bracketExportJsonUrl(tournamentId),
      exportCsvUrl: () => apiClient.bracketExportCsvUrl(tournamentId),
      exportIcsUrl: () => apiClient.bracketExportIcsUrl(tournamentId),
      eventUpsert: guardMutation((eventId, body) =>
        apiClient.bracketEventUpsert(tournamentId, eventId, body),
      ),
      eventGenerate: guardMutation((eventId, body) =>
        apiClient.bracketEventGenerate(tournamentId, eventId, body),
      ),
      eventPatch: guardMutation((eventId, body) =>
        apiClient.bracketEventPatch(tournamentId, eventId, body),
      ),
      eventNextRound: guardMutation((eventId) =>
        apiClient.bracketEventNextRound(tournamentId, eventId),
      ),
      eventDelete: guardMutation((eventId) =>
        apiClient.bracketEventDelete(tournamentId, eventId),
      ),
      assignCourt: guardMutation((body) => apiClient.assignBracketCourt(tournamentId, body)),
      unassign: guardMutation((body) => apiClient.unassignBracketCourt(tournamentId, body)),
    }),
    [tournamentId],
  );
  return (
    <BracketApiContext.Provider value={value}>
      {children}
    </BracketApiContext.Provider>
  );
}

export function useBracketApi(): BracketApi {
  const ctx = useContext(BracketApiContext);
  if (!ctx) {
    throw new Error(
      'useBracketApi must be used inside a <BracketApiProvider tournamentId="...">',
    );
  }
  return ctx;
}
