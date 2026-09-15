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
import type { EventProgressDTO, TournamentSummaryDTO } from '../../../api/dto';
import type { WorkspacePhase } from '../../../platform/domain/lifecycle';
import type { ChecklistStep } from '../../../platform/domain/setupChecklist';
import { checklistProgress } from '../../../platform/domain/setupChecklist';
import { SetupChecklist } from '../../../components/control-plane/SetupChecklist';
import { NextUpList } from '../../../components/control-plane/NextUpList';
import { EYEBROW_CLASS, TEXT_MUTED_SM } from '../../../lib/utils';
import { NAV_LINK_ROW, NavCaret } from '../../../components/NavCaret';

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
          <dt className="mt-1 text-xs uppercase tracking-[0.06em] text-text-muted">{f.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** A proportion bar. `label` is the accessible name — the bar is never the
 *  only statement of the number it draws, but a progressbar with no name is
 *  unreadable to anyone not looking at it. */
function Meter({
  value,
  max,
  label,
  testId,
  tone = 'bg-status-success-fg',
  className = '',
}: {
  value: number;
  max: number;
  label: string;
  testId?: string;
  tone?: string;
  className?: string;
}) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const pct = safeMax > 0 ? Math.round((safeValue / safeMax) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      data-testid={testId}
      className={`h-1.5 overflow-hidden rounded-full bg-surface-sunken ${className}`}
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Court occupancy during a live day (debt-log D16).
 *
 * The three-value answer the occupancy contract (§4.1) insists on: a court is
 * in play, free, or disputed, and a disputed court belongs to neither of the
 * other two. Renders only where the workspace has said how many courts it
 * has — `courtsFree` is null otherwise, and "0 courts free" would be a lie
 * about a workspace that simply has not said.
 */
function CourtOccupancy({ matches }: { matches: NonNullable<TournamentSummaryDTO['signals']>['matches'] }) {
  const free = matches?.courtsFree;
  if (matches == null || free == null) return null;
  const inPlay = matches.playing ?? 0;
  const disputed = matches.disputedCourts ?? 0;
  const total = inPlay + free + disputed;
  if (total === 0) return null;
  return (
    <div data-testid="overview-court-occupancy">
      <SectionLabel>Courts</SectionLabel>
      <Figures
        items={[
          { value: inPlay, label: 'in play' },
          { value: free, label: 'free' },
          ...(disputed > 0 ? [{ value: disputed, label: 'in conflict' }] : []),
        ]}
      />
      <Meter
        value={inPlay}
        max={total}
        label="Courts in play"
        testId="overview-courts-meter"
        tone="bg-status-live"
        className="mt-3 max-w-80"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="sw-num">
          {inPlay} of {total}
        </span>{' '}
        court{total === 1 ? '' : 's'} in play
      </p>
    </div>
  );
}

/**
 * Per-event play-through (debt-log D16).
 *
 * The workspace triplet says the day is half done without saying which half;
 * these rows say which events are finished and which are still running. Every
 * number is the server's count — the panel derives nothing, so a row can
 * never disagree with the total above it.
 */
function EventProgress({ events }: { events: EventProgressDTO[] }) {
  if (events.length === 0) return null;
  return (
    <div data-testid="overview-event-progress">
      <SectionLabel>Progress by event</SectionLabel>
      <ul className="divide-y divide-rule-soft">
        {events.map((event) => {
          const remaining = Math.max(0, event.total - event.played);
          return (
            <li
              key={event.code}
              data-testid={`overview-event-${event.code}`}
              className="flex items-center gap-3 py-2"
            >
              <span className="w-28 shrink-0 truncate text-sm font-medium text-foreground">
                {event.label || event.code}
              </span>
              <Meter
                value={event.played}
                max={event.total}
                label={`${event.label || event.code} matches played`}
                className="min-w-16 flex-1"
              />
              <span className="shrink-0 text-xs text-text-muted">
                <span className="sw-num">
                  {event.played} of {event.total}
                </span>{' '}
                played{remaining > 0 ? `, ${remaining} to go` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One-line "the setup steps are done" summary — the checklist collapses once
 *  every step is behind the operator; restating four ✓ rows is noise.
 *
 *  The claim is SCOPED to the checklist (D2). It used to read "Setup
 *  complete", which a workspace could show while the same page displayed an
 *  unresolved warning the checklist has no step for — a broad readiness claim
 *  covering checks it does not make. It now names exactly what it counted. */
function ReadySummary({ steps }: { steps: ChecklistStep[] }) {
  const progress = checklistProgress(steps);
  if (!progress) return null;
  return (
    <p data-testid="overview-ready-summary" className="text-sm text-text-secondary">
      <span aria-hidden className="mr-1.5 text-status-live">
        ✓
      </span>
      Setup steps done · {progress.ready} of {progress.total}
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
        {/* Named, not a bare "3 / 3": the fraction counts the steps in THIS
            checklist and nothing else, and an unscoped ratio on a page that
            can also be showing a warning reads as a verdict on the whole
            workspace (D2). */}
        {progress ? (
          <span data-testid="overview-setup-progress" className="text-2xs text-text-muted">
            <span className="sw-num">
              {progress.ready} of {progress.total}
            </span>{' '}
            setup steps done
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

/**
 * The Plan → Run handoff blocker, as the workspace's next action (P2).
 *
 * Until the plan is marked ready nothing is late, the board is not running,
 * and the floor has no authority behind it — which makes it a next action,
 * not a status pill on the Live day header where it used to live.
 */
function PlanNotFinalized({
  summary,
  onNavigate,
}: {
  summary: TournamentSummaryDTO;
  onNavigate: (segment: AppTab) => void;
}) {
  if (summary.signals?.planFinalized !== false) return null;
  return (
    <div data-testid="overview-plan-not-finalized">
      <SectionLabel>Next</SectionLabel>
      <p className={TEXT_MUTED_SM}>Plan not finalized</p>
      <div className="mt-2">
        <Button variant="outline" onClick={() => onNavigate(segments(summary.kind).plan)}>
          Open Plan
        </Button>
      </div>
    </div>
  );
}

function ReadyPanel({ summary, steps, onNavigate }: PanelProps) {
  const seg = segments(summary.kind);
  const m = summary.signals?.matches;
  const first = summary.signals?.nextUp?.[0];
  return (
    <section className="space-y-5">
      <ReadySummary steps={steps} />
      <PlanNotFinalized summary={summary} onNavigate={onNavigate} />
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
          (G3.1) — the panel keeps only its secondary action. Once the plan is
          not yet ready, `PlanNotFinalized` above already offers Open Plan, so
          this second route to the same surface stands down. */}
      {summary.signals?.planFinalized === false ? null : (
        <div>
          <Button variant="outline" onClick={() => onNavigate(seg.plan)}>
            Review the plan
          </Button>
        </div>
      )}
    </section>
  );
}

function LivePanel({ summary, onNavigate }: PanelProps) {
  const m = summary.signals?.matches;
  const nextUp = summary.signals?.nextUp ?? [];
  const seg = segments(summary.kind);
  // Play-through progress (played = terminally-resolved, the same state the
  // phase reads). Optional on older payloads — the bar simply doesn't render.
  const played = m?.played;
  const showProgress = m != null && played != null && m.total > 0;
  const events = summary.signals?.events ?? [];
  return (
    <section className="space-y-5">
      <PlanNotFinalized summary={summary} onNavigate={onNavigate} />
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
          <Meter
            value={played}
            max={m.total}
            label="Matches played"
            testId="overview-played-progress"
            className="mt-3 max-w-80"
          />
        ) : null}
        {/* The live line (OV-4, the inspector's mirror): the triplet is
            planning information; what LIVE is asked is "is anything
            happening". Only while something is. V3-OC19.2/V3-03-3: a
            disputed court is its own bucket, never folded into "playing" —
            shown whenever either count is nonzero, so a dispute is never
            masked just because nothing else is currently on court (contract
            §4.1: "a tally that cannot show [disputedCourts] must show none
            of them" — here it always can).

            The free-court count that used to ride along here moved into the
            Courts section below (D16), which owns the whole three-value
            answer and names its denominator; two statements of the same
            arithmetic on one panel is how they drift. */}
        {(m?.playing ?? 0) > 0 || (m?.disputedCourts ?? 0) > 0 ? (
          <p
            data-testid="overview-live-line"
            className="mt-2 text-xs text-muted-foreground"
          >
            <span className="font-medium text-status-live">
              {m?.playing ?? 0} playing matches
            </span>
            {m?.disputedCourts ? (
              <span
                data-testid="overview-disputed-courts"
                className="font-medium text-status-warning"
              >
                {` · ${m.disputedCourts} court conflict${m.disputedCourts === 1 ? '' : 's'}`}
              </span>
            ) : null}
          </p>
        ) : null}
        {/* V3-OC19.1: a count alone leaves the operator to guess which
            control fixes it — same route as the Run surface's conflict
            cards ("Needs resolution" → Live day), named as a direct action
            rather than "resolve this" with no destination. */}
        {m?.disputedCourts ? (
          <div className="mt-2">
            <Button
              variant="outline"
              data-testid="overview-review-court-assignments"
              onClick={() => onNavigate(seg.run)}
            >
              Review court assignments
            </Button>
          </div>
        ) : null}
      </div>
      {/* D16: the two things a live day asks after "is anything on court" —
          which courts are working, and how far each event has got. */}
      <CourtOccupancy matches={m} />
      <EventProgress events={events} />
      {/* "Open live day" lives in the page header (G3.1). V3-OC05.1: this
          list is upcoming-only (the backend excludes anything on court from
          `nextUp`, mirroring the meet path) — a match already under way
          belongs in the live line above, never restated here as if it were
          next. */}
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
          {/* A neutral outline button, not an underlined link (D1): this is
              a navigation shortcut sitting beside the panel's other actions,
              and three different visual grammars for "go somewhere" on one
              page is what made none of them read as a hierarchy. */}
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate(seg.matches)}>
              <span className={NAV_LINK_ROW}>
                <span>View all matches</span>
                <NavCaret />
              </span>
            </Button>
          </div>
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
        <Button variant="outline" size="sm" onClick={() => onNavigate('ws-sync')}>
          Back up this event
        </Button>
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
