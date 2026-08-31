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
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { BracketApiProvider, useBracketApi } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useTournamentStore } from '../../store/tournamentStore';
import { useMatchStateStore } from '../../store/matchStateStore';
import { useUiStore } from '../../store/uiStore';
import { useCurrentSlot } from '../../hooks/useCurrentSlot';
import { useActivityLog } from '../../hooks/useActivityLog';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { slotToTime } from '../../lib/time';
import { bracketOccupiedWindows } from '../../lib/bracketOccupancy';
import type { Advisory } from '../../api/dto';
import { BracketScheduleModal } from '../bracket/BracketScheduleModal';
import { AdvisoryBanner } from '../../components/status/AdvisoryBanner';
import { meetToOpsBlocks, bracketToOpsBlocks } from './opsBlock';
import { UnifiedOpsBoard } from './UnifiedOpsBoard';
import { UnifiedOpsList } from './UnifiedOpsList';
import { DetailDock, MatchInspector } from '../../components/control-plane';
import { RunSurface } from './run/RunSurface';
import { useMeetRunOps } from './run/useMeetRunOps';
import { isLiveSegment } from './operationsSegments';
import { useAction } from '../../hooks/useAction';
import { PlanToolbar } from './plan/PlanToolbar';
import { PlanDialogHost } from './plan/PlanDialogHost';
import { SolveTelemetryPanel } from './plan/SolveTelemetryPanel';
import { ClosedCourtsStrip } from './plan/ClosedCourtsStrip';
import { PlanCallList } from './plan/PlanCallList';
import { StaleBanner } from './plan/StaleBanner';
import { SuggestionsRail } from './plan/SuggestionsRail';
import { dialogForAdvisory, type PlanDialog } from './plan/planDialogs';
import { opsPlanMode, showPlanReadinessChips } from './lifecycleMatrix';
import { SyncHealthIndicator } from '../../components/SyncHealthIndicator';
import { resolvePlanView } from './plan/planView';
import { STATE_WORD } from '../../lib/stateWords';

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
  const phase = useUiStore((s) => s.activeTournamentPhase);
  const isLive = isLiveSegment(activeTab);
  const review = opsPlanMode(phase) === 'plan-review';
  // The Plan segment paired with whichever Live segment is active — the two
  // Operations segments come in per-engine pairs (`live`/`schedule`,
  // `bracket-live`/`bracket-schedule`), so the SIG-2 blocker routes back to
  // the Plan the operator actually came from.
  const planSegment = activeTab === 'bracket-live' ? 'bracket-schedule' : 'schedule';

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
  //
  // NOT-YET-LOADED IS NOT EMPTY (D1's third site): while `data` is null the
  // snapshot is unknown, and passing `[]` would short-circuit the solve-time
  // fetch in `resolveClosedWindows` with the positive claim "no occupancy".
  // Pass undefined so the hook fetches the authoritative snapshot instead.
  const bracketWindows = useMemo<number[][] | undefined>(
    () => (data ? bracketOccupiedWindows(data) : undefined),
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

  // Wall-clock label for a slot — operators think in time ("9:15"), not slot
  // indices ("S8"). Shared by BOTH boards so the time axis reads identically.
  const formatSlot = useCallback(
    (s: number) => (config ? slotToTime(s, config) : `S${s}`),
    [config],
  );

  const blocks = useMemo(() => [...meetBlocks, ...bracketBlocks], [meetBlocks, bracketBlocks]);
  const planView = useMemo(
    () => resolvePlanView(blocks, config, schedule),
    [blocks, config, schedule],
  );
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
  const title = isLive ? 'Live day' : 'Plan';
  // COPY-2: the Plan toolbar owns the one complete-day review statement.
  // Permanent instructional subtitles were removed from this header; the one
  // drag hint the product keeps lives next to the grid it describes
  // (UnifiedOpsBoard).
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`${EYEBROW_CLASS} text-muted-foreground`}>{title}</span>
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
          <div className="flex items-center gap-3">
            <SyncHealthIndicator
              lastSyncedAt={meetOps.lastSyncedAt ?? null}
              error={meetOps.syncError}
              terminal={meetOps.pollTerminal}
            />
            {!showPlanReadinessChips(phase) ? null : planFinalized ? (
              <span
                data-testid="run-plan-finalized"
                className="inline-flex items-center rounded-full border border-status-done/30 bg-status-done/10 px-2.5 py-0.5 text-xs font-medium text-status-done"
              >
                Plan finalized · ready for live day
              </span>
            ) : (
              /* SIG-2: this is the blocker that stops the day running — until
                 the plan is marked ready nothing is late, the board is not
                 "running", and the floor has no authority behind it. It used
                 to be the quietest thing on the screen: muted grey text in the
                 top-right, while the RESOLVED state above it got a full tinted
                 pill. Weight follows consequence now, and it carries the route
                 to the existing Plan control rather than inventing a second
                 way to finalize. */
              <span
                data-testid="run-plan-pending"
                className="inline-flex items-center gap-2 rounded-full border border-status-warning/40 bg-status-warning/10 px-2.5 py-0.5 text-xs font-medium text-status-warning"
              >
                Plan not finalized
                <Link
                  to={`/tournaments/${tid}/${planSegment}`}
                  data-testid="run-plan-pending-link"
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                >
                  Open Plan
                </Link>
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
              restMinutes={config?.defaultRestMinutes}
              onDeckCount={config?.onDeckCount}
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
                {/* CP4 (ADR 0015): in queue mode Plan shows the solve's real
                    output — an ordered call list — because a court x time grid
                    drawn from a queue solve is a fiction the day contradicts
                    within one match. If the solve FELL BACK to pinned
                    (closed-court windows, CP8-v1), the grid is the honest
                    view again, with a banner saying why. */}
                {planView.mode === 'call-list' ? (
                  <PlanCallList
                    blocks={blocks}
                    courtCount={courtCount}
                    pinnedCourts={Object.entries(config?.courtOverrides ?? {})
                      .filter(([, v]) => v === 'pinned')
                      .map(([k]) => Number(k))
                      .sort((a, b) => a - b)}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    formatSlot={formatSlot}
                  />
                ) : (
                  <>
                    {planView.effectivePolicy === 'pinned' && config?.courtPolicy === 'queue' ? (
                      <div
                        data-testid="plan-policy-fallback"
                        className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground"
                      >
                        Closed-court windows made this solve court-tied, so the
                        grid below is the real plan. Queue mode resumes once the
                        closures clear.
                      </div>
                    ) : null}
                    {planView.mode === 'list' ? (
                      <div
                        data-testid="plan-grid-unavailable"
                        className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground"
                      >
                        No court and time assignments are available. Matches remain in the list below;
                        no placement has been inferred.
                      </div>
                    ) : (
                      <>
                        {planView.unassignedCount > 0 ? (
                          <div
                            data-testid="plan-unassigned-notice"
                            className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground"
                          >
                            {planView.unassignedCount} match{planView.unassignedCount === 1 ? '' : 'es'}
                            {' '}{planView.unassignedCount === 1 ? 'lacks' : 'lack'} a court and time assignment and
                            remain in the list below.
                          </div>
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
                      </>
                    )}
                  </>
                )}
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
                  <MatchInspector
                    match={{
                      key: selectedBlock.key,
                      id: selectedBlock.id,
                      identity: selectedBlock.identity,
                      status: selectedBlock.done
                        ? STATE_WORD.done
                        : selectedBlock.started
                          ? STATE_WORD.live
                          : selectedBlock.court != null
                            ? STATE_WORD.scheduled
                            : 'Awaiting court',
                      sideA: selectedBlock.sideA,
                      sideB: selectedBlock.sideB,
                      assignment: {
                        court: selectedBlock.court != null ? `C${selectedBlock.court}` : null,
                        planned: selectedBlock.slot != null ? formatSlot(selectedBlock.slot) : null,
                        actualStart:
                          selectedBlock.actualStartSlot != null
                            ? formatSlot(selectedBlock.actualStartSlot)
                            : null,
                        actualEnd:
                          selectedBlock.actualEndSlot != null
                            ? formatSlot(selectedBlock.actualEndSlot)
                            : null,
                      },
                      result: selectedBlock.score
                        ? {
                            summary: `${selectedBlock.score.sideA}–${selectedBlock.score.sideB}`,
                            sets: selectedBlock.score.sets,
                          }
                        : null,
                    }}
                    defaultFacet="assignment"
                    onClose={() => setSelectedKey(null)}
                    testId="ops-detail-panel"
                    actions={{
                      assignment:
                        selectedBlock.source === 'meet' && !selectedBlock.done && !review ? (
                          <button
                            type="button"
                            className={`${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`}
                            data-testid="ops-rail-move-btn"
                            onClick={() => setPlanDialog({ kind: 'move', matchId: selectedBlock.id })}
                          >
                            Move or postpone…
                          </button>
                        ) : null,
                    }}
                  />
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
