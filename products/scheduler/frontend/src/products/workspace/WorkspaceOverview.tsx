/**
 * Workspace Overview — the default landing inside a workspace, and the
 * control plane's answer to "what state is this event in, and what do I do
 * next, right now".
 *
 * It is a PHASE-KEYED COMMAND CENTER (SP-UI-1), not a status report:
 *   - a lifecycle stepper is the page's spine (it replaced a "1/4 steps"
 *     progress bar, which measured setup completeness and called it the
 *     event's state);
 *   - the primary column is a panel chosen by `signals.phase`, so the page
 *     changes as the event does, and future lifecycle phases slot in as data;
 *   - readiness and "needs attention" are ONE merged, actionable checklist
 *     instead of two lists stating the same fact set;
 *   - the rail carries phase-agnostic facts, each linking to its owning
 *     surface.
 *
 * The oversized stat triplet is gone in `setup`: `0 / 0 / 2` on a draft event
 * spent the page's most visual weight on its least information.
 *
 * Everything except the display-sharing state reads the server-computed
 * `summary.signals` — the same source the Hub uses, so the two surfaces can
 * never disagree about an event.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import type { AppTab } from '../../store/uiStore';
import { apiClient } from '../../api/client';
import { buildChecklist } from '../../platform/domain/setupChecklist';
import { resolvePhase, visiblePhases } from '../../platform/domain/overviewPhase';
import { PhaseStepper } from '../../components/control-plane/PhaseStepper';
import { OverviewHeader } from './overview/OverviewHeader';
import { OverviewRail } from './overview/OverviewRail';
import { PhasePanels } from './overview/PhasePanels';
import { buildRailRows } from './overview/railRows';

/**
 * Whether a public display link exists. `null` while unknown — not loaded yet,
 * or the caller is a viewer without permission to see the token. Mirrors
 * SharingTab's `displayTokenDenied`: a denied read is not "not shared", so the
 * rail says nothing rather than something wrong.
 */
function useDisplayShared(tid: string | null): boolean | null {
  const [shared, setShared] = useState<boolean | null>(null);
  useEffect(() => {
    if (!tid) return;
    let alive = true;
    apiClient
      .getDisplayToken(tid)
      .then((t) => {
        if (alive) setShared(Boolean(t?.token));
      })
      .catch(() => {
        if (alive) setShared(null);
      });
    return () => {
      alive = false;
    };
  }, [tid]);
  return shared;
}

export function WorkspaceOverview({ summary }: { summary: TournamentSummaryDTO | null }) {
  const navigate = useNavigate();
  const displayShared = useDisplayShared(summary?.id ?? null);

  if (!summary) {
    return (
      <div data-testid="workspace-overview" className="p-6 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  const phase = resolvePhase(summary);
  const phases = visiblePhases(summary);
  const steps = buildChecklist(summary);
  const railRows = buildRailRows(summary, displayShared);
  const go = (segment: AppTab) => navigate(`/tournaments/${summary.id}/${segment}`);

  // The phase's primary CTA, hoisted to the header (G3.1). During LIVE this
  // is the single most important control in the product — it must not sit
  // mid-page below the stats. The panels keep their secondary actions.
  const br = summary.kind === 'bracket';
  const headerAction =
    phase === 'ready' || phase === 'live' ? (
      <Button onClick={() => go(br ? 'bracket-live' : 'live')}>Open live day</Button>
    ) : phase === 'complete' ? (
      <Button onClick={() => go(br ? 'bracket-matches' : 'matches')}>View results</Button>
    ) : null;

  return (
    <div
      data-testid="workspace-overview"
      className="mx-auto w-full max-w-[1180px] px-8 py-6"
    >
      <OverviewHeader summary={summary} action={headerAction} />

      {/* The spine: only the phases that exist for this workspace. */}
      {phases.length > 0 ? (
        <div className="mt-5 border-y border-rule-soft py-2.5">
          <PhaseStepper
            phases={phases}
            current={phase}
            archived={summary.status === 'archived'}
          />
        </div>
      ) : null}

      {/* Full content width with a sane max — not a narrow column floating in
          a wide canvas. */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PhasePanels phase={phase} summary={summary} steps={steps} onNavigate={go} />
        <OverviewRail rows={railRows} onNavigate={go} />
      </div>
    </div>
  );
}
