/**
 * OperationsProduct — the unified (both-engines) Operations surface.
 *
 * Mounted by `ModuleOutlet` ONLY when both Meet and Bracket are enabled,
 * for an Operations segment (Courts / Live). It is its own product because
 * it needs BOTH engines' data: Meet rows come from the global tournament +
 * match-state stores, while Bracket rows need `useBracket`, which only
 * resolves inside `BracketApiProvider` (the meet surfaces never mount it).
 *
 * Write-back routes per row by `OperationalMatch.source`:
 *   - Meet  → `useCommandQueue` (start / finish), the same path the single-
 *     engine Live surface uses.
 *   - Bracket → `useBracketResultQueue` (record winner), the SP-F3 queue.
 *
 * Single-engine workspaces never reach here — they keep their existing
 * engine-specific Operations surfaces untouched.
 */
import { useCallback, useMemo } from 'react';
import { BracketApiProvider } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useCommandQueue } from '../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../hooks/useBracketResultQueue';
import {
  bracketToOperational,
  meetMatchesToOperational,
  type OperationalMatch,
} from '../../lib/operations/operationalMatch';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { UnifiedCourtsView } from './UnifiedCourtsView';
import { UnifiedLiveView } from './UnifiedLiveView';
import {
  routeOperationalAction,
  type OperationalAction,
  type OperationalWritebackRouter,
} from './operationalWriteback';
import { isLiveSegment } from './operationsSegments';

export function OperationsProduct() {
  const tid = useTournamentId();
  // Key on the tournament id so switching workspaces remounts the provider
  // + ``useBracket`` (mirrors BracketTab) — otherwise bracket data stays
  // stale from the previous tournament until the first poll resolves.
  return (
    <BracketApiProvider key={tid} tournamentId={tid}>
      <OperationsBody />
    </BracketApiProvider>
  );
}

function OperationsBody() {
  const activeTab = useUiStore((s) => s.activeTab);
  const pushToast = useUiStore((s) => s.pushToast);

  // ---- Meet rows (global stores) ----
  const matches = useTournamentStore((s) => s.matches);
  const schedule = useTournamentStore((s) => s.schedule);
  const players = useTournamentStore((s) => s.players);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const playerNameById = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p.name])),
    [players],
  );
  const meetRows = useMemo(
    () => meetMatchesToOperational(matches, schedule, matchStates, playerNameById),
    [matches, schedule, matchStates, playerNameById],
  );

  // ---- Bracket rows (polled snapshot) ----
  const { data, setData } = useBracket();
  const bracketRows = useMemo(
    () => (data ? bracketToOperational(data) : []),
    [data],
  );

  // ---- Write-back router ----
  const { submit: meetSubmit } = useCommandQueue();
  const { submit: bracketSubmit } = useBracketResultQueue({
    // Optimistic apply is deferred to the next poll/settle — keep the row
    // visually unchanged until the server's authoritative DTO lands.
    onOptimistic: () => {},
    onSettled: (dto: BracketTournamentDTO) => setData(dto),
    onConflict: (kind, message) =>
      pushToast({
        level: kind === 'stale_version' ? 'warn' : 'error',
        message:
          kind === 'stale_version'
            ? 'Result already recorded'
            : 'Could not record result',
        detail: message,
      }),
  });

  const router = useMemo<OperationalWritebackRouter>(
    () => ({
      meet: (matchId, action) => {
        // Meet honours the lifecycle verbs; record-winner is bracket-only.
        if (action.kind === 'call') return meetSubmit('call_to_court', matchId);
        if (action.kind === 'start') return meetSubmit('start_match', matchId);
        if (action.kind === 'finish') return meetSubmit('finish_match', matchId);
        return undefined;
      },
      bracket: (matchId, action) => {
        if (action.kind !== 'recordWinner') return undefined;
        const pu = data?.play_units.find((u) => u.id === matchId);
        return bracketSubmit({
          matchId,
          winnerSide: action.winnerSide,
          seenVersion: pu?.version ?? 0,
        });
      },
    }),
    [meetSubmit, bracketSubmit, data],
  );

  const onAction = useCallback(
    (row: OperationalMatch, action: OperationalAction) =>
      routeOperationalAction(row, action, router),
    [router],
  );

  return isLiveSegment(activeTab) ? (
    <UnifiedLiveView meet={meetRows} bracket={bracketRows} onAction={onAction} />
  ) : (
    <UnifiedCourtsView meet={meetRows} bracket={bracketRows} />
  );
}
