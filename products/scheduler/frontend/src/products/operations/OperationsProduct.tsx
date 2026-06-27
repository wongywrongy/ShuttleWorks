/**
 * OperationsProduct — the unified (both-engines) Operations surface.
 *
 * Mounted by `ModuleOutlet` ONLY when both Meet and Bracket are enabled, for
 * an Operations segment (Courts / Live). A match is a match — meet and bracket
 * fold into one `OpsBlock` list that drives:
 *   - UnifiedOpsBoard — one court×time board, drag-to-reschedule for BOTH
 *     engines (drop routes to meet `pinAndResolve` or bracket `pinMatch`).
 *   - UnifiedOpsList  — the sectioned working queue; row actions route by
 *     source (meet → command queue call/start/finish; bracket → start via
 *     matchAction, record winner via the F3 result queue).
 *
 * Courts shows the board + a read-only overview list; Live shows the board +
 * the action list. Single-engine workspaces never reach here.
 */
import { useCallback, useMemo, useState } from 'react';
import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useCommandQueue } from '../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../hooks/useBracketResultQueue';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { meetToOpsBlocks, bracketToOpsBlocks, type OpsBlock } from './opsBlock';
import { UnifiedOpsBoard } from './UnifiedOpsBoard';
import { UnifiedOpsList } from './UnifiedOpsList';
import type { OperationalAction } from './operationalWriteback';
import { isLiveSegment } from './operationsSegments';

export function OperationsProduct() {
  const tid = useTournamentId();
  return (
    <BracketApiProvider key={tid} tournamentId={tid}>
      <OperationsBody />
    </BracketApiProvider>
  );
}

function OperationsBody() {
  const activeTab = useUiStore((s) => s.activeTab);
  const pushToast = useUiStore((s) => s.pushToast);
  const isLive = isLiveSegment(activeTab);

  // ---- Meet blocks (global stores) ----
  const config = useTournamentStore((s) => s.config);
  const matches = useTournamentStore((s) => s.matches);
  const schedule = useTournamentStore((s) => s.schedule);
  const players = useTournamentStore((s) => s.players);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const nameById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const meetBlocks = useMemo(
    () => meetToOpsBlocks(matches, schedule, matchStates, nameById),
    [matches, schedule, matchStates, nameById],
  );

  // ---- Bracket blocks (polled snapshot) ----
  const { data, setData } = useBracket();
  const bracketApi = useBracketApi();
  const bracketBlocks = useMemo(() => (data ? bracketToOpsBlocks(data) : []), [data]);

  const blocks = useMemo(() => [...meetBlocks, ...bracketBlocks], [meetBlocks, bracketBlocks]);
  const courtCount = useMemo(() => {
    const fromCfg = config?.courtCount ?? data?.courts ?? 0;
    const fromBlocks = blocks.reduce((m, b) => Math.max(m, b.court ?? 0), 0);
    return Math.max(1, fromCfg, fromBlocks);
  }, [config?.courtCount, data?.courts, blocks]);

  // ---- selection (click → highlight; drives row + block emphasis) ----
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ---- write-back ----
  const { submit: meetSubmit } = useCommandQueue();
  const { submit: bracketSubmit } = useBracketResultQueue({
    onOptimistic: () => {},
    onSettled: (dto: BracketTournamentDTO) => setData(dto),
    onConflict: (kind, message) =>
      pushToast({
        level: kind === 'stale_version' ? 'warn' : 'error',
        message: kind === 'stale_version' ? 'Result already recorded' : 'Could not record result',
        detail: message,
      }),
  });

  const onAction = useCallback(
    (block: OpsBlock, action: OperationalAction) => {
      if (block.source === 'meet') {
        if (action.kind === 'call') return void meetSubmit('call_to_court', block.id);
        if (action.kind === 'start') return void meetSubmit('start_match', block.id);
        if (action.kind === 'finish') return void meetSubmit('finish_match', block.id);
        return;
      }
      // bracket
      if (action.kind === 'start') {
        void bracketApi.matchAction({ play_unit_id: block.id, action: 'start' }).then(setData).catch(() => {});
        return;
      }
      if (action.kind === 'recordWinner') {
        const pu = data?.play_units.find((u) => u.id === block.id);
        void bracketSubmit({ matchId: block.id, winnerSide: action.winnerSide, seenVersion: pu?.version ?? 0 });
      }
    },
    [meetSubmit, bracketApi, bracketSubmit, data, setData],
  );

  const title = isLive ? 'Live' : 'Courts';
  const subtitle = isLive
    ? 'Run Meet and Bracket matches from one queue'
    : 'Drag to reschedule — Meet and Bracket on one court plan';

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
          <span className="text-xs text-muted-foreground/70">{subtitle}</span>
        </div>
      </header>

      {blocks.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">
          No matches yet. Generate a schedule in Meet or draws in Bracket to populate Operations.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <UnifiedOpsBoard
            blocks={blocks}
            courtCount={courtCount}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            meet={{ config, matches, schedule }}
            onBracketData={setData}
          />
          <UnifiedOpsList
            blocks={blocks}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onAction={isLive ? onAction : undefined}
          />
        </div>
      )}
    </div>
  );
}
