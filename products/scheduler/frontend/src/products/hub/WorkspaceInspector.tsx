/**
 * Workspace Inspector — the Hub's right-side detail panel (hidden below `lg`),
 * shown when a workspace is selected.
 *
 * Plain-language and operator-first: the event name + date, the specific things
 * blocking readiness (to-dos), a simple readiness checklist, the module map, and
 * one primary action + a secondary (workspace settings). Deliberately omits raw
 * signal codes, owner/identity metadata, and collaboration stats.
 */
import { Button } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { attentionReasons, moduleCountsOf, setupLabel } from './hubSignals';
import { rowActionFor } from './nextAction';
import { dayKey, eventDate, type HubGroupId } from './hubGrouping';
import { SectionCard } from '../../components/control-plane';

function fmtDate(iso: string | null): string {
  if (!iso) return 'No date set';
  const d = eventDate(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Same time-group logic the Hub list uses, for a single workspace, so the
 *  inspector's primary action matches its row. */
function groupOf(t: TournamentSummaryDTO, todayKey: string): HubGroupId {
  if (!t.tournamentDate) return 'undated';
  return dayKey(t.tournamentDate) >= todayKey ? 'upcoming' : 'past';
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
      <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/40 lg:flex">
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
  const setupEntries = Object.entries(tournament.signals?.setup ?? {});

  const todayKey = new Date().toISOString().slice(0, 10);
  const action = rowActionFor(tournament, groupOf(tournament, todayKey));

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card/40 lg:flex">
      <div className="border-b border-border p-4">
        <h2 className="truncate text-base font-semibold text-foreground">
          {tournament.name || 'Untitled'}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{fmtDate(tournament.tournamentDate)}</p>
      </div>

      {todos.length > 0 ? (
        <SectionCard eyebrow="To do">
          <ul data-testid="inspector-todos" className="space-y-1.5">
            {todos.map((r) => (
              <li key={r.code} className="flex items-start gap-1.5 text-xs text-foreground">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
                {r.label}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {setupEntries.length > 0 ? (
        <SectionCard eyebrow="Readiness">
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
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Modules"
        right={
          moduleCounts ? (
            <span data-testid="inspector-module-counts" className="text-2xs tabular-nums text-muted-foreground">
              {moduleCounts.enabled} on · {moduleCounts.available} available
            </span>
          ) : undefined
        }
      >
        <ul className="space-y-1.5">
          {modules.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2" title={m.note}>
              <span className="text-sm text-foreground">{m.label}</span>
              <span
                className={[
                  'rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize',
                  m.status === 'enabled'
                    ? 'bg-accent/10 text-accent'
                    : m.status === 'available'
                      ? 'border border-border text-muted-foreground'
                      : 'border border-dashed border-border text-muted-foreground/60',
                ].join(' ')}
              >
                {m.status.replace('-', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="space-y-2 p-4">
        <Button
          className="w-full"
          onClick={() => (action.kind === 'set-date' ? onSetDate(tournament.id) : onOpen(tournament.id))}
        >
          {action.label}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => onSettings(tournament.id)}>
          Workspace settings
        </Button>
      </div>
    </aside>
  );
}
