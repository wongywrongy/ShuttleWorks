/**
 * Workspace Inspector — the Hub's right-side rail (hidden below `lg`), shown
 * when a workspace is selected. Handoff Hub-prototype grammar (2026-07-02):
 * rail substrate, 10px uppercase section labels, a grid-lines METRIC TILE
 * triplet, an amber › to-do list, module rows with micro-tag statuses, and
 * the primary action anchored to the bottom with the signature glow.
 *
 * Plain-language and operator-first; deliberately omits raw signal codes,
 * owner/identity metadata, and collaboration stats.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { attentionReasons, moduleCountsOf, readinessOf, setupLabel } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, temporalGroupOf } from './hubGrouping';
import { NextUpList } from './NextUpList';

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

/** 10px uppercase micro-label — the rail's section voice. */
function RailLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
      {children}
    </div>
  );
}

interface InspectorProps {
  tournament: TournamentSummaryDTO | null;
  onOpen: (id: string) => void;
  onSetDate: (id: string) => void;
  onSettings: (id: string) => void;
}

export function WorkspaceInspector({ tournament, onOpen, onSetDate, onSettings }: InspectorProps) {
  // Empty-state decision (2026-07 cleanup): the rail COLLAPSES until a
  // selection exists — the list gets the full width instead of a third of
  // the screen spelling out one gray sentence.
  if (!tournament) return null;

  const modules = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const todos = attentionReasons(tournament);
  const moduleCounts = moduleCountsOf(tournament);
  const readiness = readinessOf(tournament);
  const setupEntries = Object.entries(tournament.signals?.setup ?? {});
  const metrics = tournament.signals?.matches;
  const toDo = metrics ? metrics.toDo : todos.length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const action = rowActionFor(tournament, temporalGroupOf(tournament, todayKey));

  // Header status pill (only meaningful with signals): the shared lifecycle
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
    <aside className="hidden w-[344px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface-rail lg:flex">
      {/* Header block — identity + status pill, then the primary action + gear
          (redesign moves the actions to the top). */}
      <div className="flex flex-col gap-3 border-b border-border p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-foreground">
              {tournament.name || 'Untitled'}
            </h2>
            <p className="mt-1.5 text-2xs uppercase tracking-[0.02em] sw-num text-muted-foreground">
              {fmtDate(tournament.tournamentDate)} · {tournament.kind === 'bracket' ? 'Bracket' : 'Meet'}
            </p>
          </div>
          {tournament.signals ? (
            <StatusPill tone={pill.tone} dot className="shrink-0">
              {pill.text}
            </StatusPill>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => (action.kind === 'set-date' ? onSetDate(tournament.id) : onOpen(tournament.id))}
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
      </div>

      <div className="flex flex-1 flex-col gap-[17px] overflow-y-auto p-[18px]">
      <div>
        <RailLabel>THIS EVENT</RailLabel>
        {/* Metric tiles — grid-lines triplet: matches / scheduled / to do.
            Falls back to — when a payload predates the match signals. */}
        <div
          data-testid="inspector-metrics"
          className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border"
        >
          <MetricTile value={metrics ? metrics.total : '—'} label="matches" />
          <MetricTile value={metrics ? metrics.scheduled : '—'} label="scheduled" />
          <MetricTile value={toDo} label="to do" tone={toDo > 0 ? 'warning' : undefined} />
        </div>
      </div>

      {todos.length > 0 ? (
        <div>
          <ul data-testid="inspector-todos" className="space-y-1.5">
            {todos.map((r) => (
              <li key={r.code} className="flex items-start gap-2 text-xs text-ink-2">
                <span aria-hidden className="text-status-warning">›</span>
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {setupEntries.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Readiness
            </span>
            {readiness ? (
              <span className="text-2xs sw-num text-muted-foreground">
                {readiness.ready} / {readiness.total}
              </span>
            ) : null}
          </div>
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
          <ul data-testid="inspector-checklist" className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {setupEntries.map(([key, done]) => (
              <li key={key} className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                <span aria-hidden className={done ? 'text-status-success-fg' : 'text-muted-foreground'}>
                  {done ? '✓' : '○'}
                </span>
                {setupLabel(key)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <RailLabel>
          <span className="flex items-baseline justify-between">
            <span>MODULES</span>
            {moduleCounts ? (
              <span
                data-testid="inspector-module-counts"
                className="normal-case tracking-normal sw-num text-muted-foreground"
              >
                {moduleCounts.enabled} on · {moduleCounts.available} available
              </span>
            ) : null}
          </span>
        </RailLabel>
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
      </div>

      {(tournament.signals?.nextUp?.length ?? 0) > 0 ? (
        <div data-testid="inspector-next-up">
          <RailLabel>NEXT UP</RailLabel>
          <NextUpList items={tournament.signals?.nextUp ?? []} />
        </div>
      ) : null}

      </div>
    </aside>
  );
}
