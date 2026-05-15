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
import type {
  BracketCreateIn,
  BracketTournamentDTO,
  BracketScheduleNextOut,
  BracketImportCsvParams,
  BracketValidateIn,
  BracketPinIn,
  BracketValidationOut,
  WinnerSide,
} from './bracketDto';

export interface BracketApi {
  /** Resolves to ``null`` when no bracket is configured (404). */
  get: () => Promise<BracketTournamentDTO | null>;
  create: (body: BracketCreateIn) => Promise<BracketTournamentDTO>;
  remove: () => Promise<{ ok: boolean }>;
  scheduleNext: () => Promise<BracketScheduleNextOut>;
  recordResult: (body: {
    play_unit_id: string;
    winner_side: Exclude<WinnerSide, 'none'>;
    finished_at_slot?: number | null;
    walkover?: boolean;
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
  const value = useMemo<BracketApi>(
    () => ({
      get: () => apiClient.getBracket(tournamentId),
      create: (body) => apiClient.createBracket(tournamentId, body),
      remove: () => apiClient.deleteBracket(tournamentId),
      scheduleNext: () => apiClient.scheduleNextBracketRound(tournamentId),
      recordResult: (body) =>
        apiClient.recordBracketResult(tournamentId, body),
      matchAction: (body) => apiClient.bracketMatchAction(tournamentId, body),
      validateMove: (body) => apiClient.validateBracketMove(tournamentId, body),
      pinMatch: (body) => apiClient.pinBracketMatch(tournamentId, body),
      importJson: (body) => apiClient.importBracketJson(tournamentId, body),
      importCsv: (text, params) =>
        apiClient.importBracketCsv(tournamentId, text, params),
      exportJsonUrl: () => apiClient.bracketExportJsonUrl(tournamentId),
      exportCsvUrl: () => apiClient.bracketExportCsvUrl(tournamentId),
      exportIcsUrl: () => apiClient.bracketExportIcsUrl(tournamentId),
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
