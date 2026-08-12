/**
 * OperationsProduct — the unified (both-engines) Operations surface.
 *
 * Mounted by `ModuleOutlet` ONLY when both Meet and Bracket are enabled, for
 * an Operations segment (Courts / Live). A match is a match — meet and bracket
 * fold into one `OpsBlock` list that drives:
 *   - Courts (Plan): UnifiedOpsBoard (drag) + UnifiedOpsList + OpsDetailRail
 *     overlay. Scheduling actions (Generate / Schedule next round) live here.
 *   - Live (Run): RunSurface — the interactive run console. RunSurface owns
 *     its own selection, inspector, and seam-hook calls for the live branch.
 *
 * Single-engine workspaces never reach here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../api/client';
import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useCommandQueue } from '../../hooks/useCommandQueue';
import { useBracketResultQueue } from '../../hooks/useBracketResultQueue';
import { useSchedule } from '../../hooks/useSchedule';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { useCurrentSlot } from '../../hooks/useCurrentSlot';
import { useMatchStateSync } from '../../hooks/useMatchStateSync';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { slotToTime } from '../../lib/time';
import { bracketOccupiedWindows } from '../../lib/bracketOccupancy';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { BracketScheduleModal } from '../bracket/BracketScheduleModal';
import { meetToOpsBlocks, bracketToOpsBlocks, parseOpsKey, type OpsBlock } from './opsBlock';
import { UnifiedOpsBoard } from './UnifiedOpsBoard';
import { UnifiedOpsList } from './UnifiedOpsList';
import { OpsDetailRail } from './OpsDetailRail';
import { DetailDock, DetailPanel } from '../../components/control-plane';
import { RunSurface } from './run/RunSurface';
import type { OperationalAction } from './operationalWriteback';
import { isLiveSegment } from './operationsSegments';
import { useAction } from '../../hooks/useAction';

// `min-h-7` + `py-1`, not `h-7`: a fixed 28px box squeezed to its min-content
// width at 390px wrapped "Re-solve meet" onto two lines — 38px of text in a
// 28px box, spilling out over the header. The button now takes its content's
// height, and `whitespace-nowrap` + the header's `flex-wrap` (below) give it
// its content's width instead of a two-line label.
const schedBtnBase =
  `${INTERACTIVE_BASE} inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-sm px-2.5 py-1 text-xs ` +
  `font-medium disabled:cursor-not-allowed disabled:opacity-50`;
// "Re-solve meet" DISCARDS the plan that "Plan ready ✓" commits, and the two
// were the same size, the same accent fill, 8px apart. The glow marks intent;
// only the action that COMMITS has it. Solve actions are quiet.
const commitBtn =
  `${schedBtnBase} bg-accent text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`;
const solveBtn =
  `${schedBtnBase} border border-border-control bg-card text-foreground hover:bg-muted/40`;
// Armed re-solve. Destructive tone, not the commit glow: the operator is one
// press from throwing the plan away, and it must not look like the button
// beside it that keeps the plan.
const solveArmedBtn =
  `${schedBtnBase} border border-destructive bg-destructive/10 text-destructive`;

export function OperationsProduct() {
  const tid = useTournamentId();
  return (
    <BracketApiProvider key={tid} tournamentId={tid}>
      <OperationsBody />
    </BracketApiProvider>
  );
}

function OperationsBody() {
  const tid = useTournamentId();
  const activeTab = useUiStore((s) => s.activeTab);
  const pushToast = useUiStore((s) => s.pushToast);
  const isLive = isLiveSegment(activeTab);

  // Keep meet match-states converged with the backend while ANY Operations
  // surface is open. Without this the store went stale here (nothing on this
  // surface loaded it), so the board painted 'scheduled' over playing matches
  // and the inspector offered state-machine-illegal actions → user-visible
  // "Cannot transition …" 409s.
  useMatchStateSync(tid);

  // ---- Meet blocks (global stores) ----
  const config = useTournamentStore((s) => s.config);
  const matches = useTournamentStore((s) => s.matches);
  const schedule = useTournamentStore((s) => s.schedule);
  const players = useTournamentStore((s) => s.players);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const nameById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const meetBlocks = useMemo(
    () => meetToOpsBlocks(matches, schedule, matchStates, nameById, config),
    [matches, schedule, matchStates, nameById, config],
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
  // Passing the polled snapshot's windows here (rather than letting
  // useSchedule fetch its own) keeps the solve in lockstep with what this
  // surface is rendering.
  const bracketWindows = useMemo<number[][]>(
    () => bracketOccupiedWindows(data),
    [data],
  );
  // Armed because a re-solve replaces a plan the operator may have adjusted
  // by hand. Declared after bracketWindows: it closes over it.
  const reSolve = useConfirmClick(() => void generateSchedule(bracketWindows));
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

  // Wall-clock label for a slot — operators think in time ("9:15"), not slot
  // indices ("S8"). Shared by BOTH boards so the time axis reads identically.
  const formatSlot = useCallback(
    (s: number) => (config ? slotToTime(s, config) : `S${s}`),
    [config],
  );

  const blocks = useMemo(() => [...meetBlocks, ...bracketBlocks], [meetBlocks, bracketBlocks]);
  const courtCount = useMemo(() => {
    const fromCfg = config?.courtCount ?? data?.courts ?? 0;
    const fromBlocks = blocks.reduce((m, b) => Math.max(m, b.court ?? 0), 0);
    return Math.max(1, fromCfg, fromBlocks);
  }, [config?.courtCount, data?.courts, blocks]);

  // ---- planFinalized — Plan-side "ready to run" toggle (Task 17) ----
  const planFinalized = useTournamentStore((s) => s.planFinalized);
  const setPlanFinalized = useTournamentStore((s) => s.setPlanFinalized);

  // Wrapped in `useAction`: a rapid double-press used to fire TWO
  // `POST /plan-finalized` (audit C1), and the failure path was an empty catch
  // that reverted the toggle with no explanation (audit B). The wrapper gives a
  // synchronous in-flight lock and a visible failure; the revert stays here
  // because only this component knows what to revert to.
  const planFinalizeAction = useAction(
    useCallback(async () => {
      const newVal = !planFinalized;
      setPlanFinalized(newVal); // optimistic
      try {
        await apiClient.setPlanFinalized(tid, newVal);
      } catch (err) {
        setPlanFinalized(!newVal); // revert
        throw err; // ...and let the wrapper surface it
      }
    }, [planFinalized, setPlanFinalized, tid]),
    { errorMessage: 'Could not update the plan-ready state' },
  );

  // ---- Courts-only selection (Live uses RunSurface's own selection) ----
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedBlock = useMemo(
    () => blocks.find((b) => b.key === selectedKey) ?? null,
    [blocks, selectedKey],
  );
  // Keep the bracket store id in sync so OpsDetailRail's MatchDetailPanel
  // (bracket) tracks the Courts-branch selection.
  const setBracketSelectedMatchId = useUiStore((s) => s.setBracketSelectedMatchId);
  useEffect(() => {
    const p = selectedKey ? parseOpsKey(selectedKey) : null;
    setBracketSelectedMatchId(p?.source === 'bracket' ? p.id : null);
  }, [selectedKey, setBracketSelectedMatchId]);

  // ---- write-back (Courts branch OpsDetailRail; RunSurface owns its own) ----
  // These hooks serve the Courts (Plan) branch only — RunSurface mounts its own
  // useCommandQueue + useBracketResultQueue for the Live (Run) branch.
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

  const title = isLive ? 'Run' : 'Plan';
  const subtitle = isLive
    ? 'Run the floor: by court, then the queue'
    : 'Plan the day: drag to reschedule, generate, schedule rounds';

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`${EYEBROW_CLASS} text-muted-foreground`}>{title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        {/* Plan is the planning surface: build / adjust the plan. Run runs
            what Plan produced — no scheduling actions there. */}
        {!isLive ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={reSolve.armed ? solveArmedBtn : solveBtn}
              onClick={() => {
                // Only a RE-solve arms. Solving for the first time destroys
                // nothing, and arming it would teach the operator to click
                // twice out of habit, which is how an arm stops meaning
                // anything by the time it guards something.
                if (schedule) reSolve.press();
                else void generateSchedule(bracketWindows);
              }}
              onBlur={reSolve.reset}
              disabled={generating}
              data-testid="ops-generate-meet"
              title={
                schedule
                  ? 'Re-solve the meet: replaces the current plan'
                  : 'Solve the meet and place its matches'
              }
            >
              {generating
                ? 'Generating…'
                : reSolve.armed
                  ? 'Press again to replace the plan'
                  : schedule
                    ? 'Re-solve meet'
                    : 'Generate meet'}
            </button>
            {schedulableCount > 0 ? (
              <button
                type="button"
                className={solveBtn}
                onClick={() => setScheduling(true)}
                data-testid="ops-schedule-next"
              >
                Schedule next round ({schedulableCount})
              </button>
            ) : null}
            {/* The rule closes the solve group: commit must not be one 8px
                gap away from the action that throws the plan away. */}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            <button
              type="button"
              className={commitBtn}
              onClick={() => void planFinalizeAction.run()}
              disabled={planFinalizeAction.pending}
              aria-busy={planFinalizeAction.pending}
              data-testid="ops-plan-finalize-toggle"
            >
              {planFinalized ? 'Plan ready ✓' : 'Mark plan ready to run'}
            </button>
          </div>
        ) : (
          // Run: keep the readiness indicator (Plan → Run handoff) in the single
          // header — Run runs what Plan produced; the toggle itself lives on Plan.
          <div>
            {planFinalized ? (
              <span
                data-testid="run-plan-finalized"
                className="inline-flex items-center rounded-full border border-status-done/30 bg-status-done/10 px-2.5 py-0.5 text-xs font-medium text-status-done"
              >
                Plan finalized · ready to run
              </span>
            ) : (
              <span data-testid="run-plan-pending" className="text-xs text-muted-foreground">
                Plan not finalized
              </span>
            )}
          </div>
        )}
      </header>

      {blocks.length === 0 ? (
        <div className="px-4 py-8 text-sm text-muted-foreground">
          No matches yet. Generate a schedule in Meet or draws in Bracket to populate Operations.
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {isLive ? (
            // LIVE = Run surface. RunSurface owns its own selection + inspector
            // + seam-hook calls. Nothing from the Courts branch leaks in.
            <RunSurface
              blocks={blocks}
              bracketData={data}
              onBracketData={setData}
              courtCount={courtCount}
              currentSlot={currentSlot}
              planFinalized={planFinalized}
              formatSlot={formatSlot}
              slotMinutes={config?.intervalMinutes}
            />
          ) : (
            // COURTS = planning surface. Drag board + the matches overview list
            // + a docked detail rail. The rail is a real layout column
            // (DetailDock) — the board reflows beside it; on narrow
            // viewports the dock falls back to an overlay by itself, which
            // replaces the hand-rolled overlay workaround that lived here.
            <div className="relative flex h-full min-h-0">
              <div className="h-full min-h-0 min-w-0 flex-1 overflow-auto">
                <UnifiedOpsBoard
                  blocks={blocks}
                  courtCount={courtCount}
                  currentSlot={currentSlot}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  meet={{ config, matches, schedule }}
                  onBracketData={setData}
                  formatSlot={formatSlot}
                />
                <UnifiedOpsList blocks={blocks} selectedKey={selectedKey} onSelect={setSelectedKey} />
              </div>

              <DetailDock open={selectedBlock != null} width={320}>
                {selectedBlock ? (
                  // Pane chrome: identity header, close, Esc, and dialog
                  // semantics when the dock demotes itself to an overlay.
                  // Replaces a hand-rolled ✕ that only a mouse could find.
                  <DetailPanel
                    label="Match"
                    value={selectedBlock.label}
                    mono
                    onClose={() => setSelectedKey(null)}
                    testId="ops-detail-panel"
                  >
                    <OpsDetailRail
                      block={selectedBlock}
                      data={data}
                      onBracketChange={setData}
                      onAction={onAction}
                      live={false}
                    />
                  </DetailPanel>
                ) : null}
              </DetailDock>
            </div>
          )}
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
