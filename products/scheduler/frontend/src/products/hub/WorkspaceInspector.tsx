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
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { attentionReasons, moduleCountsOf, readinessOf, setupLabel } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, temporalGroupOf } from './hubGrouping';

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
  if (!tournament) {
    return (
      <aside className="hidden w-[322px] shrink-0 flex-col border-l border-border bg-surface-rail lg:flex">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground/70">
          Select a workspace to see what&rsquo;s next.
        </div>
      </aside>
    );
  }

  const modules = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const todos = attentionReasons(tournament);
  const moduleCounts = moduleCountsOf(tournament);
  const readiness = readinessOf(tournament);
  const setupEntries = Object.entries(tournament.signals?.setup ?? {});
  const enabledCount = modules.filter((m) => m.status === 'enabled').length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const action = rowActionFor(tournament, temporalGroupOf(tournament, todayKey));

  return (
    <aside className="hidden w-[322px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-rail p-[18px] lg:flex">
      <div>
        <h2 className="truncate text-[15px] font-semibold text-foreground">
          {tournament.name || 'Untitled'}
        </h2>
        <p className="mt-1.5 text-2xs uppercase tracking-[0.02em] sw-num text-muted-foreground">
          {fmtDate(tournament.tournamentDate)} · {tournament.kind === 'bracket' ? 'Bracket' : 'Meet'}
        </p>
      </div>

      {/* Metric tiles — the prototype's grid-lines triplet: 1px gaps let the
          hairline color show through; each cell is a quiet stat. */}
      <div
        data-testid="inspector-metrics"
        className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border"
      >
        <div className="bg-surface-screen p-2.5">
          <div className="text-lg font-bold leading-tight sw-num text-foreground">
            {readiness ? `${readiness.ready}/${readiness.total}` : '—'}
          </div>
          <div className="text-2xs uppercase tracking-[0.06em] text-ink-faint">ready</div>
        </div>
        <div className="bg-surface-screen p-2.5">
          <div
            className={`text-lg font-bold leading-tight sw-num ${
              todos.length > 0 ? 'text-status-warning' : 'text-foreground'
            }`}
          >
            {todos.length}
          </div>
          <div className="text-2xs uppercase tracking-[0.06em] text-ink-faint">to do</div>
        </div>
        <div className="bg-surface-screen p-2.5">
          <div className="text-lg font-bold leading-tight sw-num text-foreground">{enabledCount}</div>
          <div className="text-2xs uppercase tracking-[0.06em] text-ink-faint">modules on</div>
        </div>
      </div>

      {todos.length > 0 ? (
        <div>
          <RailLabel>TO DO</RailLabel>
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
          <RailLabel>READINESS</RailLabel>
          <ul data-testid="inspector-checklist" className="space-y-1">
            {setupEntries.map(([key, done]) => (
              <li key={key} className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                <span aria-hidden className={done ? 'text-accent' : 'text-muted-foreground/40'}>
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
                  'text-2xs font-semibold uppercase tracking-[0.04em] sw-num',
                  m.status === 'enabled' ? 'text-accent' : 'text-ink-faint',
                ].join(' ')}
              >
                {m.status.replace('-', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Primary action anchored to the rail's bottom — the glow marks it. */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button
          className="w-full"
          onClick={() => (action.kind === 'set-date' ? onSetDate(tournament.id) : onOpen(tournament.id))}
        >
          {action.label === 'Open workspace' ? 'Open workspace →' : action.label}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onSettings(tournament.id)}>
          Workspace settings
        </Button>
      </div>
    </aside>
  );
}
