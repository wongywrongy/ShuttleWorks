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
import { EYEBROW_CLASS, TEXT_MUTED_SM } from '../../../lib/utils';

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
            { value: m ? m.total : '–', label: 'matches' },
            { value: m ? m.scheduled : '–', label: 'scheduled' },
            { value: first?.timeLabel ?? '–', label: 'first match' },
          ]}
        />
      </div>
      {/* The phase's primary CTA ("Open live day") lives in the page header
          (G3.1) — the panel keeps only its secondary action. */}
      <div>
        <Button variant="outline" onClick={() => onNavigate(seg.plan)}>
          Review the plan
        </Button>
      </div>
    </section>
  );
}

function LivePanel({ summary }: PanelProps) {
  const m = summary.signals?.matches;
  const nextUp = summary.signals?.nextUp ?? [];
  // Play-through progress (played = terminally-resolved, the same state the
  // phase reads). Optional on older payloads — the bar simply doesn't render.
  const played = m?.played;
  const showProgress = m != null && played != null && m.total > 0;
  const pct = showProgress
    ? Math.round((Math.min(played, m.total) / m.total) * 100)
    : 0;
  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Progress</SectionLabel>
        {/* Played / Remaining / Total (W1.2): "matches" and "scheduled"
            duplicated whenever everything was scheduled. Remaining counts
            down as played counts up; total anchors both. The Hub inspector
            speaks the same triplet. */}
        <Figures
          items={
            m && played != null
              ? [
                  { value: played, label: 'played' },
                  { value: Math.max(0, m.total - played), label: 'remaining' },
                  { value: m.total, label: 'total' },
                ]
              : [
                  { value: m ? m.total : '–', label: 'matches' },
                  { value: m ? m.scheduled : '–', label: 'scheduled' },
                ]
          }
        />
        {showProgress ? (
          <div
            role="progressbar"
            aria-label="Matches played"
            aria-valuemin={0}
            aria-valuemax={m.total}
            aria-valuenow={Math.min(played, m.total)}
            data-testid="overview-played-progress"
            className="mt-3 h-1.5 max-w-80 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className="h-full rounded-full bg-status-success-fg"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        {/* The live line (OV-4, the inspector's mirror): the triplet is
            planning information; what LIVE is asked is "is anything
            happening, and is a court free". Only while something is. */}
        {m?.playing != null && m.playing > 0 ? (
          <p
            data-testid="overview-live-line"
            className="mt-2 text-xs text-muted-foreground"
          >
            <span className="font-medium text-status-live">
              {m.playing} on court
            </span>
            {m.courtsFree != null
              ? ` · ${m.courtsFree} court${m.courtsFree === 1 ? '' : 's'} free`
              : ''}
          </p>
        ) : null}
      </div>
      {/* "Open live day" lives in the page header (G3.1). */}
      {nextUp.length > 0 ? (
        <div>
          <SectionLabel>Up next</SectionLabel>
          <NextUpList
            items={nextUp}
            linkFor={(n) =>
              n.matchId && n.source
                ? `/tournaments/${summary.id}/operations/live?select=${n.source}:${n.matchId}`
                : null
            }
          />
        </div>
      ) : null}
    </section>
  );
}

function CompletePanel({ summary, onNavigate }: PanelProps) {
  const m = summary.signals?.matches;
  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Results</SectionLabel>
        <Figures items={[{ value: m ? m.total : '–', label: 'matches played' }]} />
      </div>
      {/* "View results" / "View draws" lives in the page header (G3.1) and is
          the right featured action for COMPLETE. Backup is Administration's
          job, not the phase's next step — a quiet link, not a button
          (SP-OPCON-1 SWP-3). */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('ws-sync')}
          className="text-sm text-accent underline underline-offset-2 hover:no-underline"
        >
          Back up this event
        </button>
      </div>
    </section>
  );
}

/**
 * The three entries phases (E4, program Phase 9).
 *
 * One panel rather than three components, because the three phases are one
 * surface at three moments and the difference between them is which numbers
 * are worth showing and what the next action is. Splitting them would give
 * three files that had to be kept saying the same thing.
 *
 * **Every figure is a count the server already made.** Nothing here derives
 * a number from another number: the panel that computed `total - confirmed`
 * would be a second definition of "outstanding" living one layer away from
 * the one the attention codes use.
 */
function EntriesPanel({
  summary,
  onNavigate,
  phase,
}: PanelProps & { phase: WorkspacePhase }) {
  const e = summary.signals?.entries;

  // `announced` is the honest empty state: the page is public, the window
  // has not opened, and there is nothing to count. Figures of zero would be
  // three noughts pretending to be information.
  if (phase === 'announced') {
    return (
      <section className="space-y-5">
        <div>
          <SectionLabel>Entries</SectionLabel>
          <p className={TEXT_MUTED_SM}>
            The entry page is published and not open yet. Nobody can enter
            until an event&rsquo;s window opens.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onNavigate('ws-sharing')}>
            Entry page settings
          </Button>
        </div>
      </section>
    );
  }

  const figures =
    phase === 'entries_review'
      ? [
          { value: e ? e.total : '–', label: 'entries' },
          { value: e ? e.pending + e.waitlisted : '–', label: 'to decide' },
          { value: e ? e.uncommitted : '–', label: 'to commit' },
        ]
      : [
          { value: e ? e.total : '–', label: 'entries' },
          { value: e ? e.confirmed : '–', label: 'confirmed' },
          { value: e ? e.waitlisted : '–', label: 'waitlisted' },
        ];

  return (
    <section className="space-y-5">
      <div>
        <SectionLabel>Entries</SectionLabel>
        <Figures items={figures} />
        <p className="mt-2 text-xs text-muted-foreground">
          {phase === 'entries_review'
            ? 'Entries have closed. Confirm what you are keeping, then commit it to the roster.'
            : 'Entries are open. Confirmed entries reach the roster when you commit them.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onNavigate('entries')}>Open the entries desk</Button>
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
    // E4: the three entries phases share one panel — see its own note.
    case 'announced':
    case 'entries_open':
    case 'entries_review':
      return <EntriesPanel {...props} phase={phase} />;
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
