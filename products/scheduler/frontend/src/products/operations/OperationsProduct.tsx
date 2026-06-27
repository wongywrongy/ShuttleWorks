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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useCommandQueue } from '../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../hooks/useBracketResultQueue';
import { useSchedule } from '../../hooks/useSchedule';
import { useCurrentSlot } from '../../hooks/useCurrentSlot';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { BracketScheduleModal } from '../bracket/BracketScheduleModal';
import { meetToOpsBlocks, bracketToOpsBlocks, parseOpsKey, type OpsBlock } from './opsBlock';
import { UnifiedOpsBoard } from './UnifiedOpsBoard';
import { UnifiedOpsList } from './UnifiedOpsList';
import { OpsDetailRail } from './OpsDetailRail';
import { LiveStatusBar } from './LiveStatusBar';
import { MatchDetailsPanel } from '../meet/control-center/MatchDetailsPanel';
import { formatSlotTime } from '../../lib/time';
import type { MatchStateDTO } from '../../api/dto';
import type { OperationalAction } from './operationalWriteback';
import { isLiveSegment } from './operationsSegments';

const schedBtn =
  `${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs ` +
  `font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;

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
  const { data, setData, refresh } = useBracket();
  const bracketApi = useBracketApi();
  const bracketBlocks = useMemo(() => (data ? bracketToOpsBlocks(data) : []), [data]);

  // ---- scheduling (Courts only) ----
  const { generateSchedule, loading: generating } = useSchedule();
  const currentSlot = useCurrentSlot();
  const [scheduling, setScheduling] = useState(false);
  // Cross-engine coordination: the courts the bracket already occupies, as
  // [court, fromSlot, toSlot] windows, so a meet re-solve schedules around
  // them (no double-booking). The bracket side coordinates server-side.
  const bracketWindows = useMemo<number[][]>(
    () =>
      (data?.assignments ?? []).map((a) => [
        a.court_id,
        a.slot_id,
        a.slot_id + a.duration_slots,
      ]),
    [data],
  );
  // Bracket play-units ready to schedule: both sides known, no court yet, no
  // result, all feeders resolved (mirrors the single-engine header count).
  const schedulableCount = useMemo(() => {
    if (!data) return 0;
    const assigned = new Set(data.assignments.map((a) => a.play_unit_id));
    const done = new Set(data.results.map((r) => r.play_unit_id));
    return data.play_units.filter(
      (pu) =>
        !assigned.has(pu.id) &&
        !done.has(pu.id) &&
        (pu.side_a?.length ?? 0) > 0 &&
        (pu.side_b?.length ?? 0) > 0 &&
        pu.dependencies.every((d) => done.has(d)),
    ).length;
  }, [data]);

  const blocks = useMemo(() => [...meetBlocks, ...bracketBlocks], [meetBlocks, bracketBlocks]);
  const courtCount = useMemo(() => {
    const fromCfg = config?.courtCount ?? data?.courts ?? 0;
    const fromBlocks = blocks.reduce((m, b) => Math.max(m, b.court ?? 0), 0);
    return Math.max(1, fromCfg, fromBlocks);
  }, [config?.courtCount, data?.courts, blocks]);

  // ---- selection (click → highlight + detail rail) ----
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedBlock = useMemo(
    () => blocks.find((b) => b.key === selectedKey) ?? null,
    [blocks, selectedKey],
  );
  // Keep the bracket store id in sync so the reused MatchDetailPanel (which
  // reads `bracketSelectedMatchId` from the store) tracks the selection.
  const setBracketSelectedMatchId = useUiStore((s) => s.setBracketSelectedMatchId);
  useEffect(() => {
    const p = selectedKey ? parseOpsKey(selectedKey) : null;
    setBracketSelectedMatchId(p?.source === 'bracket' ? p.id : null);
  }, [selectedKey, setBracketSelectedMatchId]);

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

  // ---- Meet detail: reuse the real MatchDetailsPanel so the meet match
  // keeps its full operator button set (Call / Start / Finish / Retire /
  // Score / …). Status changes route through the command queue. ----
  const groups = useTournamentStore((s) => s.groups);
  const playerNameMap = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const slotToTime = useCallback((s: number) => (config ? formatSlotTime(s, config) : String(s)), [config]);
  const meetUpdateStatus = useCallback(
    async (matchId: string, status: MatchStateDTO['status'], data?: Partial<MatchStateDTO>) => {
      const action: 'call_to_court' | 'start_match' | 'finish_match' | 'uncall' =
        status === 'called'
          ? 'call_to_court'
          : status === 'started'
            ? 'start_match'
            : status === 'finished'
              ? 'finish_match'
              : 'uncall';
      await meetSubmit(action, matchId, (data ?? {}) as Record<string, unknown>);
    },
    [meetSubmit],
  );
  const selMeetMatch =
    selectedBlock?.source === 'meet' ? matches.find((m) => m.id === selectedBlock.id) : undefined;
  const selMeetAssignment =
    selMeetMatch && schedule ? schedule.assignments.find((a) => a.matchId === selMeetMatch.id) : undefined;
  const showMeetPanel = isLive && !!selMeetMatch;

  const title = isLive ? 'Live' : 'Courts';
  const subtitle = isLive
    ? 'Run the floor — by court, then the queue'
    : 'Plan the day — drag to reschedule, generate, schedule rounds';

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
          <span className="text-xs text-muted-foreground/70">{subtitle}</span>
        </div>
        {/* Courts is the planning surface: build / adjust the plan. Live runs
            what Courts produced — no scheduling actions there. */}
        {!isLive ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={schedBtn}
              onClick={() => void generateSchedule(bracketWindows)}
              disabled={generating}
              data-testid="ops-generate-meet"
            >
              {generating ? 'Generating…' : schedule ? 'Re-solve meet' : 'Generate meet'}
            </button>
            {schedulableCount > 0 ? (
              <button
                type="button"
                className={schedBtn}
                onClick={() => setScheduling(true)}
                data-testid="ops-schedule-next"
              >
                Schedule next round ({schedulableCount})
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {blocks.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">
          No matches yet. Generate a schedule in Meet or draws in Bracket to populate Operations.
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {isLive ? (
            // LIVE = operations console. Court status is the hero; the queue
            // is support beneath it.
            <div className="flex h-full min-h-0 flex-col">
              <LiveStatusBar blocks={blocks} courtCount={courtCount} />
              <div className="min-h-0 flex-1 overflow-auto">
                {/* The court×time grid — the easy-to-view spatial map of the
                    whole floor; status rings + late. Click a block for its
                    details + actions. */}
                <UnifiedOpsBoard
                  blocks={blocks}
                  courtCount={courtCount}
                  currentSlot={currentSlot}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  interactive={false}
                  meet={{ config, matches, schedule }}
                  onBracketData={setData}
                />
                <div className="border-t border-border">
                  <div className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Queue
                  </div>
                  <UnifiedOpsList
                    blocks={blocks}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    onAction={onAction}
                  />
                </div>
              </div>
            </div>
          ) : (
            // COURTS = planning. Drag board + the matches overview list.
            <div className="h-full min-h-0 overflow-auto">
              <UnifiedOpsBoard
                blocks={blocks}
                courtCount={courtCount}
                currentSlot={currentSlot}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                interactive
                meet={{ config, matches, schedule }}
                onBracketData={setData}
              />
              <UnifiedOpsList blocks={blocks} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
          )}

          {/* Detail rail OVERLAYS the content so it never steals layout width
              (the source of the text cutoff at narrower viewports). */}
          {selectedBlock ? (
            <div className="absolute inset-y-0 right-0 z-20 flex bg-card shadow-xl">
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                aria-label="Close details"
                className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                ✕
              </button>
              <div className="min-h-0 w-80 max-w-[88vw] overflow-auto">
                {showMeetPanel ? (
                  <MatchDetailsPanel
                    assignment={selMeetAssignment}
                    match={selMeetMatch}
                    matchState={selMeetMatch ? matchStates[selMeetMatch.id] : undefined}
                    matches={matches}
                    matchStates={matchStates}
                    schedule={schedule}
                    players={players}
                    groups={groups}
                    config={config}
                    currentSlot={currentSlot}
                    playerNames={playerNameMap}
                    slotToTime={slotToTime}
                    onUpdateStatus={meetUpdateStatus}
                  />
                ) : (
                  <OpsDetailRail
                    block={selectedBlock}
                    data={data}
                    onBracketChange={setData}
                    onAction={onAction}
                    live={isLive}
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {scheduling ? (
        <BracketScheduleModal
          api={bracketApi}
          onClose={() => setScheduling(false)}
          onCommitted={refresh}
        />
      ) : null}
    </div>
  );
}
