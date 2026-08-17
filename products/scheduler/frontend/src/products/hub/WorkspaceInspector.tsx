/**
 * Workspace Inspector — the Hub's detail pane for the selected workspace.
 *
 * Plain-language and operator-first; deliberately omits raw signal codes,
 * owner/identity metadata, and collaboration stats.
 *
 * It is a `DetailPanel`, hosted by the Hub's `DetailDock` (debt-log:119). It
 * used to hard-code `w-[344px]`, roll its own `RailLabel`, and hide itself
 * below `lg` — three problems in one element:
 *
 *  - the width was a fourth panel geometry in an app that has one dock;
 *  - `RailLabel` was a fourth spelling of the section eyebrow, the exact
 *    duplication `DetailPanel.Section` exists to end;
 *  - `hidden lg:flex` meant that on the tablet the owner actually runs, every
 *    Hub row click did nothing at all. Not degraded: nothing. The dock's own
 *    narrow fallback answers that properly, presenting the pane as the dialog
 *    it has become rather than deleting it.
 *
 * It also fixes D11. As a fixed 344px sibling this pane stole width from the
 * list, which pushed the row's `@container/table` under the Modules column's
 * `@4xl` threshold: selecting a row silently dropped a column. The dock now
 * carries a `minContentWidth` (HubPage) that keeps the list above that
 * threshold, or falls back to overlay and leaves the list untouched. Either
 * way, nothing disappears as a side effect of selecting a row.
 */
import { Button } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { attentionReasons, moduleCountsOf, readinessOf } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, temporalGroupOf } from './hubGrouping';
import { DetailPanel } from '../../components/control-plane/DetailPanel';
import { NextUpList } from '../../components/control-plane/NextUpList';
import { SetupChecklist } from '../../components/control-plane/SetupChecklist';
import { buildChecklist } from '../../platform/domain/setupChecklist';

/** One metric tile in the "This event" triplet. */
function MetricTile({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: 'warning';
}) {
  // Color budget: counts are neutral — green is success/complete only.
  const color = tone === 'warning' ? 'text-status-warning' : 'text-foreground';
  return (
    <div className="bg-surface-screen p-2.5">
      <div className={`text-lg font-bold leading-tight sw-num ${color}`}>{value}</div>
      <div className="text-2xs text-text-muted">{label}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'No date set';
  const d = eventDate(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

interface InspectorProps {
  tournament: TournamentSummaryDTO | null;
  onOpen: (id: string, segment?: string) => void;
  onSetDate: (id: string) => void;
  onSettings: (id: string) => void;
  /** Clear the selection. The pane's × and Escape both route here. */
  onClose: () => void;
}

export function WorkspaceInspector({
  tournament,
  onOpen,
  onSetDate,
  onSettings,
  onClose,
}: InspectorProps) {
  // Empty-state decision (2026-07 cleanup): the pane COLLAPSES until a
  // selection exists — the list gets the full width instead of a third of
  // the screen spelling out one gray sentence.
  if (!tournament) return null;

  const modules = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const todos = attentionReasons(tournament);
  const moduleCounts = moduleCountsOf(tournament);
  const readiness = readinessOf(tournament);
  // ONE merged setup model, shared with the Overview (SP-UI-1): the pane used
  // to render an amber to-do list AND a readiness checklist — the same fact
  // set twice, in two shapes. `compact` drops the per-step action buttons;
  // the pane already has a primary CTA at its head.
  const steps = buildChecklist(tournament);
  const metrics = tournament.signals?.matches;
  const toDo = metrics ? metrics.toDo : todos.length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const action = rowActionFor(tournament, temporalGroupOf(tournament, todayKey));

  // Status pill (only meaningful with signals): the shared lifecycle
  // precedence first (Archived > Live > Complete — platform/domain/lifecycle),
  // so an archived workspace never flaunts a pulsing "Live" and the pill
  // matches the shell header. Otherwise: "Ready" when the setup checklist is
  // complete AND nothing needs attention, else "Needs setup". Keyed off
  // readiness + attention — NOT the lifecycle `health` (a fully set-up
  // workspace can still be status:'draft', which `health` reports as 'draft'
  // and would mislabel a ready event as "Needs setup").
  const ready = !!readiness && readiness.ready === readiness.total;
  const pillReady = ready && todos.length === 0;
  const pill: { text: string; tone: 'green' | 'amber' | 'idle' | 'done' } =
    lifecycleBadge(tournament.signals?.phase, tournament.status) ??
    (pillReady
      ? { text: 'Ready', tone: 'green' }
      : { text: 'Needs setup', tone: 'amber' });
  const pct = readiness ? Math.round((readiness.ready / readiness.total) * 100) : 0;

  return (
    <DetailPanel
      label="Workspace"
      value={tournament.name || 'Untitled'}
      sub={`${fmtDate(tournament.tournamentDate)} · ${tournament.kind === 'bracket' ? 'Bracket' : 'Meet'}`}
      onClose={onClose}
      testId="workspace-inspector"
    >
      {/* Actions lead — the pane exists to be acted on, not read. */}
      <div className="flex gap-2 border-b border-border p-4">
        <Button
          className="flex-1"
          onClick={() => (action.kind === 'set-date' ? onSetDate(tournament.id) : onOpen(tournament.id, action.segment))}
        >
          {action.label === 'Open workspace' ? 'Open workspace →' : action.label}
        </Button>
        <Button
          variant="outline"
          aria-label="Workspace settings"
          onClick={() => onSettings(tournament.id)}
        >
          ⚙
        </Button>
      </div>

      <DetailPanel.Section
        eyebrow="This event"
        right={
          tournament.signals ? (
            <StatusPill tone={pill.tone} dot className="shrink-0">
              {pill.text}
            </StatusPill>
          ) : null
        }
      >
        {/* Metric tiles — the SAME triplet vocabulary as the Overview (W1.2):
            a playing/played event reads played / remaining / total (remaining
            counts down, total anchors — "scheduled" duplicated "matches"
            whenever everything was scheduled); before play it stays the
            setup-useful matches / scheduled / to do. Falls back to – when a
            payload predates the match signals. */}
        <div
          data-testid="inspector-metrics"
          className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border"
        >
          {metrics &&
          metrics.played != null &&
          (tournament.signals?.phase === 'live' ||
            tournament.signals?.phase === 'complete') ? (
            <>
              <MetricTile value={metrics.played} label="played" />
              <MetricTile
                value={Math.max(0, metrics.total - metrics.played)}
                label="remaining"
              />
              <MetricTile value={metrics.total} label="total" />
            </>
          ) : (
            <>
              <MetricTile value={metrics ? metrics.total : '–'} label="matches" />
              <MetricTile value={metrics ? metrics.scheduled : '–'} label="scheduled" />
              <MetricTile value={toDo} label="to do" tone={toDo > 0 ? 'warning' : undefined} />
            </>
          )}
        </div>
      </DetailPanel.Section>

      {steps.length > 0 ? (
        <DetailPanel.Section
          eyebrow="Readiness"
          right={
            readiness ? (
              <span className="text-2xs sw-num text-muted-foreground">
                {readiness.ready} / {readiness.total}
              </span>
            ) : null
          }
        >
          <div
            role="progressbar"
            aria-label="Readiness"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-card"
          >
            <div className="h-full rounded-full bg-status-success-fg" style={{ width: `${pct}%` }} />
          </div>
          <SetupChecklist steps={steps} variant="compact" testId="inspector-checklist" />
        </DetailPanel.Section>
      ) : null}

      <DetailPanel.Section
        eyebrow="Modules"
        right={
          moduleCounts ? (
            <span
              data-testid="inspector-module-counts"
              className="text-2xs sw-num text-muted-foreground"
            >
              {moduleCounts.enabled} on · {moduleCounts.available} available
            </span>
          ) : null
        }
      >
        <ul className="space-y-1.5">
          {modules.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2" title={m.note}>
              <span
                className={`text-xs ${m.status === 'enabled' ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {m.label}
              </span>
              <span
                className={[
                  'text-2xs capitalize',
                  m.status === 'enabled' ? 'text-text-secondary font-medium' : 'text-text-muted',
                ].join(' ')}
              >
                {m.status.replace('-', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </DetailPanel.Section>

      {(tournament.signals?.nextUp?.length ?? 0) > 0 ? (
        <DetailPanel.Section eyebrow="Next up" testId="inspector-next-up">
          <NextUpList items={tournament.signals?.nextUp ?? []} />
        </DetailPanel.Section>
      ) : null}
    </DetailPanel>
  );
}
