/**
 * The Overview's primary column, keyed by lifecycle phase (SP-UI-1 3e).
 *
 * The page's job is "what state is this event in, and what do I do next" —
 * and the answer changes over the lifecycle, so the body is a PANEL MAP
 * rather than one static dashboard. `phasePanel` is the seam: future phases
 * (the planned Entries capability adds pre-event ones) arrive as new entries
 * here, not as a redesign.
 *
 * `default:` returns the setup panel. An unknown phase must render something
 * useful, never crash — `resolvePhase` already narrows to the known
 * vocabulary, and this is the second belt.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system';
import type { AppTab } from '../../../store/uiStore';
import type { TournamentSummaryDTO } from '../../../api/dto';
import type { WorkspacePhase } from '../../../platform/domain/lifecycle';
import type { ChecklistStep } from '../../../platform/domain/setupChecklist';
import { checklistProgress } from '../../../platform/domain/setupChecklist';
import { SetupChecklist } from '../../../components/control-plane/SetupChecklist';
import { NextUpList } from '../../../components/control-plane/NextUpList';
import { EYEBROW_CLASS } from '../../../lib/utils';

interface PanelProps {
  summary: TournamentSummaryDTO;
  steps: ChecklistStep[];
  onNavigate: (segment: AppTab) => void;
}

/** The engine segments for this workspace's kind. Meet and Bracket share the
 *  archetypes; only the segment names differ. */
function segments(kind: TournamentSummaryDTO['kind']) {
  const br = kind === 'bracket';
  return {
    plan: (br ? 'bracket-schedule' : 'schedule') as AppTab,
    run: (br ? 'bracket-live' : 'live') as AppTab,
    matches: (br ? 'bracket-matches' : 'matches') as AppTab,
  };
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={`mb-2 ${EYEBROW_CLASS} text-ink-faint`}>{children}</div>;
}

/** A compact figure row — replaces the oversized stat cards, which spent the
 *  page's most visual weight on its least information. */
function Figures({ items }: { items: { value: number | string; label: string }[] }) {
  return (
    <dl data-testid="overview-figures" className="flex items-baseline gap-6">
      {items.map((f) => (
        <div key={f.label}>
          <dd className="text-xl font-semibold leading-none sw-num text-foreground">{f.value}</dd>
          <dt className="mt-1 text-2xs uppercase tracking-[0.06em] text-text-muted">{f.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** One-line "setup is done" summary — the checklist collapses once every step
 *  is behind the operator; restating four ✓ rows is noise. */
function ReadySummary({ steps }: { steps: ChecklistStep[] }) {
  const progress = checklistProgress(steps);
  if (!progress) return null;
  return (
    <p data-testid="overview-ready-summary" className="text-sm text-text-secondary">
      <span aria-hidden className="mr-1.5 text-status-live">
        ✓
      </span>
      Setup complete · {progress.ready} of {progress.total} steps
    </p>
  );
}

function SetupPanel({ summary, steps, onNavigate }: PanelProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-text-muted">No readiness signals yet.</p>;
  }
  const progress = checklistProgress(steps);
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between">
        <SectionLabel>Set up this event</SectionLabel>
        {progress ? (
          <span className="text-2xs sw-num text-text-muted">
            {progress.ready} / {progress.total}
          </span>
        ) : null}
      </div>
      <SetupChecklist steps={steps} onAction={onNavigate} testId="overview-checklist" />
      {summary.signals?.attention?.some((a) => a.code === 'NO_MODULES_ENABLED') ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => onNavigate('ws-modules')}>
            Enable a module
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ReadyPanel({ summary, steps, onNavigate }: PanelProps) {
  const seg = segments(summary.kind);
  const m = summary.signals?.matches;
  const first = summary.signals?.nextUp?.[0];
  return (
    <section className="space-y-5">
      <ReadySummary steps={steps} />
      <div>
        <SectionLabel>Schedule</SectionLabel>
        <Figures
          items={[
            { value: m ? m.total : '—', label: 'matches' },
            { value: m ? m.scheduled : '—', label: 'scheduled' },
            { value: first?.timeLabel ?? '—', label: 'first match' },
          ]}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onNavigate(seg.run)}>Open live day</Button>
        <Button variant="outline" onClick={() => onNavigate(seg.plan)}>
          Review the plan
        </Button>
      </div>
    </section>
  );
}

function LivePanel({ summary, onNavigate }: PanelProps) {
  const seg = segments(summary.kind);
  const m = summary.signals?.matches;
  const nextUp = summary.signals?.nextUp ?? [];
  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>In progress</SectionLabel>
        <Figures
          items={[
            { value: m ? m.total : '—', label: 'matches' },
            { value: m ? m.scheduled : '—', label: 'scheduled' },
          ]}
        />
      </div>
      <div>
        <Button onClick={() => onNavigate(seg.run)}>Open live day</Button>
      </div>
      {nextUp.length > 0 ? (
        <div>
          <SectionLabel>Next up</SectionLabel>
          <NextUpList items={nextUp} />
        </div>
      ) : null}
    </section>
  );
}

function CompletePanel({ summary, onNavigate }: PanelProps) {
  const seg = segments(summary.kind);
  const m = summary.signals?.matches;
  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Results</SectionLabel>
        <Figures items={[{ value: m ? m.total : '—', label: 'matches played' }]} />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onNavigate(seg.matches)}>View results</Button>
        <Button variant="outline" onClick={() => onNavigate('ws-sync')}>
          Back up this event
        </Button>
      </div>
    </section>
  );
}

/**
 * The panel map. Keyed on the phase string; the default branch is the
 * unknown-phase safety net.
 */
export function PhasePanels({ phase, ...props }: PanelProps & { phase: WorkspacePhase }) {
  switch (phase) {
    case 'ready':
      return <ReadyPanel {...props} />;
    case 'live':
      return <LivePanel {...props} />;
    case 'complete':
      return <CompletePanel {...props} />;
    case 'setup':
    default:
      return <SetupPanel {...props} />;
  }
}
