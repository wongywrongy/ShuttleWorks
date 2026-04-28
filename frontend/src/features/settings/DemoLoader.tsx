/**
 * Demo tournament loader.
 *
 * One-click overwrite of the active tournament with a curated fixture.
 * Two fixtures live under ``./samples`` — a 4-school dual meet and a
 * 3-school tri meet, each with a pre-baked schedule so the operator
 * can poke around without running the solver. Loading shows a confirm
 * step because the action wipes the current tournament.
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
    useAppStore.setState({
      config: fixture.config,
      groups: fixture.groups,
      players: fixture.players,
      matches: fixture.matches,
      schedule: fixture.schedule,
      scheduleIsStale: false,
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
          summary="4 schools · 16 players · 24 matches"
          confirm={pending === 'dual'}
          onArm={() => setPending('dual')}
          onCancel={() => setPending(null)}
          onLoad={() => apply(DUAL_DEMO, 'dual')}
        />
        <DemoCard
          kind="tri"
          fixture={TRI_DEMO}
          summary="3 schools · 18 players · 9 tri matches"
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
