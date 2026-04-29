/**
 * Demo tournament loader.
 *
 * One-click overwrite of the active tournament with a curated fixture.
 * Two fixtures live under ``./samples`` — a 2-school dual meet (20
 * players each, 5 events) and a 3-school tri meet (10 players each,
 * 5 events), each with a pre-baked schedule so the operator can poke
 * around without running the solver. Loading shows a confirm step
 * because the action wipes the current tournament.
 */
import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Hint } from '../../components/Hint';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { DUAL_DEMO } from './samples/dual';
import { TRI_DEMO } from './samples/tri';
import type { DemoFixture } from './samples/dual';

export function DemoLoader() {
  const pushToast = useAppStore((s) => s.pushToast);

  const [pending, setPending] = useState<'dual' | 'tri' | null>(null);

  const apply = (fixture: DemoFixture, kind: 'dual' | 'tri') => {
    // Direct setState rather than per-slice actions because we want a
    // single atomic swap of every persisted field — and there's no
    // ``setGroups`` action on the store. The persistence hook
    // (``useTournamentState``) sees the change as one update and
    // debounces a single PUT.
    //
    // Crucially, we ALSO reset every piece of ephemeral / live /
    // proposal-pipeline state. Without this, leftovers from the
    // previous tournament leak into the demo:
    //   • advisories referencing match IDs that no longer exist
    //   • match-states keyed to deleted matches (live tab shows
    //     wrong colors)
    //   • activeProposal from an abandoned dialog re-opens stale
    //   • scheduleVersion accumulates across tournaments so commit
    //     concurrency checks misfire
    //   • isScheduleLocked stays at whatever it was
    //   • solver HUD / logs / pending-pin from the previous solve
    useAppStore.setState({
      // New tournament data
      config: fixture.config,
      groups: fixture.groups,
      players: fixture.players,
      matches: fixture.matches,
      schedule: fixture.schedule,
      scheduleIsStale: false,
      scheduleStats: null,
      // Demo arrives with a finalized schedule, so the lock should be
      // engaged from the moment it lands — config edits then prompt
      // for explicit unlock instead of silently invalidating it.
      isScheduleLocked: true,
      // Fresh tournament starts at version 0 with no history.
      scheduleVersion: 0,
      scheduleHistory: [],
      // Drop any in-flight proposal-pipeline / advisory state.
      activeProposal: null,
      advisories: [],
      pendingAdvisoryReview: null,
      // Drop live-tracking state — match IDs from prior tournament
      // are gone, and starting from "all scheduled" is correct.
      matchStates: {},
      liveState: null,
      // Drop solver session leftovers.
      isGenerating: false,
      generationProgress: null,
      generationError: null,
      solverLogs: [],
      solverHud: { phase: null, solutionCount: 0, elapsedMs: 0 },
      pendingPin: null,
      lastValidation: null,
      // Active tab not changed — the operator clicked Load on the
      // Setup page, leaving them there is the right default.
    });
    pushToast({
      level: 'success',
      message: `Loaded ${kind === 'dual' ? 'Dual' : 'Tri'} demo`,
      detail: fixture.config.tournamentName ?? '',
    });
    setPending(null);
  };

  return (
    <div className="space-y-3">
      <Hint id="demos.intro" variant="info">
        Loading a demo overwrites the active tournament. Save or export
        first if you want to keep the current data.
      </Hint>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DemoCard
          kind="dual"
          fixture={DUAL_DEMO}
          summary="2 schools · 20 players each · 5 events · 15 matches"
          confirm={pending === 'dual'}
          onArm={() => setPending('dual')}
          onCancel={() => setPending(null)}
          onLoad={() => apply(DUAL_DEMO, 'dual')}
        />
        <DemoCard
          kind="tri"
          fixture={TRI_DEMO}
          summary="3 schools · 10 players each · 5 events · 30 matches"
          confirm={pending === 'tri'}
          onArm={() => setPending('tri')}
          onCancel={() => setPending(null)}
          onLoad={() => apply(TRI_DEMO, 'tri')}
        />
      </div>
    </div>
  );
}

function DemoCard({
  kind,
  fixture,
  summary,
  confirm,
  onArm,
  onCancel,
  onLoad,
}: {
  kind: 'dual' | 'tri';
  fixture: DemoFixture;
  summary: string;
  confirm: boolean;
  onArm: () => void;
  onCancel: () => void;
  onLoad: () => void;
}) {
  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {kind === 'dual' ? 'Dual demo' : 'Tri demo'}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
        {fixture.config.tournamentName}
      </div>
      <div className="mt-0.5 text-2xs text-muted-foreground">{summary}</div>
      <div className="mt-3 flex items-center gap-2">
        {confirm ? (
          <>
            <button
              type="button"
              onClick={onLoad}
              className={`${INTERACTIVE_BASE} rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:brightness-110`}
            >
              Confirm — overwrite current
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={`${INTERACTIVE_BASE} rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent`}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onArm}
            className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110`}
          >
            Load {kind} demo
          </button>
        )}
      </div>
    </div>
  );
}
