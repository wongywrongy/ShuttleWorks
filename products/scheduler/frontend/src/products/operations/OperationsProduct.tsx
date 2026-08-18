/**
 * OperationsProduct — the unified Operations surface.
 *
 * Mounted by `ModuleOutlet` for an Operations segment. A match is a match —
 * meet and bracket fold into one `OpsBlock` list that drives:
 *   - Plan: UnifiedOpsBoard (drag) + UnifiedOpsList + OpsDetailRail, under
 *     the PlanToolbar (solve verbs, the proposal economy, exports, plan-ready)
 *     with the advisory/stale/suggestions banners and solve telemetry
 *     (SP-CONSOLE-4 B1 migrations).
 *   - Live (Run): RunSurface — the interactive run console. RunSurface owns
 *     its own selection, inspector, and seam-hook calls.
 *
 * Lifecycle (CMP-1, `lifecycleMatrix`): COMPLETE renders Plan in review
 * mode (solver + proposal actions absent). `engines` says which engines
 * this workspace runs — single-engine workspaces arrive here after the
 * SP-CONSOLE-4 routing flip; actions render per engine.
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
import { useCurrentSlot } from '../../hooks/useCurrentSlot';
import { useActivityLog } from '../../hooks/useActivityLog';
import { EYEBROW_CLASS } from '../../lib/utils';
import { slotToTime } from '../../lib/time';
import { bracketOccupiedWindows } from '../../lib/bracketOccupancy';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { Advisory } from '../../api/dto';
import { BracketScheduleModal } from '../bracket/BracketScheduleModal';
import { AdvisoryBanner } from '../../components/status/AdvisoryBanner';
import { meetToOpsBlocks, bracketToOpsBlocks, parseOpsKey, type OpsBlock } from './opsBlock';
import { UnifiedOpsBoard } from './UnifiedOpsBoard';
import { UnifiedOpsList } from './UnifiedOpsList';
import { OpsDetailRail } from './OpsDetailRail';
import { DetailDock, DetailPanel } from '../../components/control-plane';
import { RunSurface } from './run/RunSurface';
import { useMeetRunOps } from './run/useMeetRunOps';
import type { OperationalAction } from './operationalWriteback';
import { isLiveSegment } from './operationsSegments';
import { useAction } from '../../hooks/useAction';
import { PlanToolbar } from './plan/PlanToolbar';
import { PlanDialogHost } from './plan/PlanDialogHost';
import { SolveTelemetryPanel } from './plan/SolveTelemetryPanel';
import { ClosedCourtsStrip } from './plan/ClosedCourtsStrip';
import { StaleBanner } from './plan/StaleBanner';
import { SuggestionsRail } from './plan/SuggestionsRail';
import { dialogForAdvisory, type PlanDialog } from './plan/planDialogs';
import { opsPlanMode } from './lifecycleMatrix';

export interface OperationsEngines {
  meet: boolean;
  bracket: boolean;
}

export function OperationsProduct({ engines }: { engines?: OperationsEngines }) {
  const tid = useTournamentId();
  return (
    <BracketApiProvider key={tid} tournamentId={tid}>
      <OperationsBody engines={engines ?? { meet: true, bracket: true }} />
    </BracketApiProvider>
  );
}

function OperationsBody({ engines }: { engines: OperationsEngines }) {
  const tid = useTournamentId();
  const activeTab = useUiStore((s) => s.activeTab);
  const pushToast = useUiStore((s) => s.pushToast);
  const phase = useUiStore((s) => s.activeTournamentPhase);
  const isLive = isLiveSegment(activeTab);
  const review = opsPlanMode(phase) === 'plan-review';

  // Meet live-day seams for the Run surface (C4) — mounting useMeetRunOps
  // ALSO keeps the meet match-states converged with the backend while any
  // Operations surface is open (useLiveTracking's load + 5s poll subsumed
  // the old useMatchStateSync mount; one loader, not two). Without that
  // convergence the board painted 'scheduled' over playing matches and the
  // inspector offered state-machine-illegal actions → "Cannot transition" 409s.
  const meetOps = useMeetRunOps();
  // Feed the Alerts & Activity trail from match-state transitions, from
  // whichever Operations surface is open (a Plan-side repair's state changes
  // show up in Run's trail too).
  useActivityLog();

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

  // ---- scheduling inputs (Plan only; the toolbar owns the solve calls) ----
  const currentSlot = useCurrentSlot();
  const [scheduling, setScheduling] = useState(false);
  // Cross-engine coordination: the courts the bracket already occupies, as
  // [court, fromSlot, toSlot] windows, so a meet re-solve schedules around
  // them (no double-booking). Passing the polled snapshot's windows keeps
  // the solve in lockstep with what this surface renders.
  const bracketWindows = useMemo<number[][]>(() => bracketOccupiedWindows(data), [data]);
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

  // ---- planFinalized — Plan-side "plan ready" toggle (Task 17) ----
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

  // ---- Plan dialogs (SP-CONSOLE-4 B1): one state, three openers ----
  const [planDialog, setPlanDialog] = useState<PlanDialog | null>(null);

  // Run-side alert Review (C4): the advisory economy's dialogs live on Plan,
  // so reviewing from Run switches to the Plan segment and opens the one the
  // suggested action names.
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const onRunAdvisoryReview = useCallback(
    (advisory: Advisory) => {
      const dialog = dialogForAdvisory(advisory);
      if (!dialog) return;
      setActiveTab('schedule');
      setPlanDialog(dialog);
    },
    [setActiveTab],
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

  const title = isLive ? 'Live day' : 'Plan';
  const subtitle = isLive
    ? 'Run the floor: by court, then the queue'
    : review
      ? 'The day is complete: review how it ran'
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
          <PlanToolbar
            phase={phase}
            meetEnabled={engines.meet}
            bracketEnabled={engines.bracket}
            bracketWindows={bracketWindows}
            schedulableCount={schedulableCount}
            onOpenScheduleNext={() => setScheduling(true)}
            planFinalized={!!planFinalized}
            planFinalizePending={planFinalizeAction.pending}
            onTogglePlanFinalized={() => void planFinalizeAction.run()}
            onOpenDialog={setPlanDialog}
          />
        ) : (
          // Run: keep the readiness indicator (Plan → Run handoff) in the single
          // header — Run runs what Plan produced; the toggle itself lives on Plan.
          <div>
            {planFinalized ? (
              <span
                data-testid="run-plan-finalized"
                className="inline-flex items-center rounded-full border border-status-done/30 bg-status-done/10 px-2.5 py-0.5 text-xs font-medium text-status-done"
              >
                Plan finalized · ready for live day
              </span>
            ) : (
              <span data-testid="run-plan-pending" className="text-xs text-muted-foreground">
                Plan not finalized
              </span>
            )}
          </div>
        )}
      </header>

      {/* Plan-side banners (B1): the pending-decision advisory routes into the
          same dialogs the toolbar opens; stale + suggestions self-hide. */}
      {!isLive && engines.meet ? (
        <>
          <StaleBanner />
          <AdvisoryBanner
            readOnly={review}
            onReview={(advisory) => {
              const dialog = dialogForAdvisory(advisory);
              if (dialog) setPlanDialog(dialog);
            }}
          />
          {!review ? <SuggestionsRail /> : null}
        </>
      ) : null}

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
              meetOps={engines.meet ? meetOps : undefined}
              onAdvisoryReview={engines.meet ? onRunAdvisoryReview : undefined}
            />
          ) : (
            // PLAN = planning surface. Closed-courts strip + drag board +
            // solve telemetry + the searchable matches list + a docked detail
            // rail (DetailDock reflows the board beside it; overlay fallback
            // on narrow viewports).
            <div className="relative flex h-full min-h-0">
              <div className="h-full min-h-0 min-w-0 flex-1 overflow-auto">
                {engines.meet ? (
                  <ClosedCourtsStrip onOpenDirector={() => setPlanDialog({ kind: 'director' })} />
                ) : null}
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
                {engines.meet ? <SolveTelemetryPanel /> : null}
                <UnifiedOpsList
                  blocks={blocks}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  searchable
                />
              </div>

              <DetailDock open={selectedBlock != null} width={320}>
                {selectedBlock ? (
                  // Pane chrome: identity header, close, Esc, and dialog
                  // semantics when the dock demotes itself to an overlay.
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
                      onRequestMove={
                        review ? undefined : (matchId) => setPlanDialog({ kind: 'move', matchId })
                      }
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

      {!isLive ? (
        <PlanDialogHost dialog={planDialog} onClose={() => setPlanDialog(null)} />
      ) : null}
    </div>
  );
}
