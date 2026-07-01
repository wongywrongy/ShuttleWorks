/**
 * Workspace Overview — the default landing inside a workspace. Not a stats
 * dashboard: a readiness checklist. Shows the event name + date + type, any
 * attention items, and the named setup steps with done / incomplete states.
 * Incomplete steps that map to a section are clickable and navigate there. No
 * aggregate metrics, member counts, or module counts.
 */
import { useNavigate } from 'react-router-dom';
import type { TournamentSummaryDTO } from '../../api/dto';
import type { AppTab } from '../../store/uiStore';
import { readinessOf, setupLabel, attentionReasons } from '../hub/hubSignals';
import { eventDate } from '../hub/hubGrouping';

function fmtDate(iso: string | null): string {
  if (!iso) return 'No date set';
  const d = eventDate(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** The section a readiness step links to, by key + workspace kind. Returns null
 *  for steps with no obvious destination. */
function stepTarget(key: string, kind: 'meet' | 'bracket'): AppTab | null {
  const k = key.toLowerCase();
  const br = kind === 'bracket';
  if (k.includes('config')) return br ? 'bracket-setup' : 'setup';
  if (k.includes('roster') || k.includes('player') || k.includes('participant'))
    return br ? 'bracket-roster' : 'roster';
  if (k.includes('draw') || k.includes('bracket')) return 'bracket-draw';
  if (k.includes('schedul')) return br ? 'bracket-schedule' : 'schedule';
  if (k.includes('result') || k.includes('score') || k.includes('live'))
    return br ? 'bracket-live' : 'live';
  return null;
}

export function WorkspaceOverview({ summary }: { summary: TournamentSummaryDTO | null }) {
  const navigate = useNavigate();
  if (!summary) {
    return <div data-testid="workspace-overview" className="p-6 text-sm text-muted-foreground">Loading workspace…</div>;
  }

  const readiness = readinessOf(summary);
  const setupEntries = Object.entries(summary.signals?.setup ?? {});
  const reasons = attentionReasons(summary);
  const kindLabel = summary.kind === 'bracket' ? 'Bracket tournament' : 'Meet day';

  return (
    <div data-testid="workspace-overview" className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{summary.name || 'Untitled'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDate(summary.tournamentDate)} · {kindLabel}
        </p>
        {readiness ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold tabular-nums text-foreground">
              {readiness.ready}/{readiness.total}
            </span>{' '}
            <span className="text-muted-foreground">steps complete</span>
          </p>
        ) : null}
      </div>

      {reasons.length > 0 ? (
        <ul data-testid="overview-attention" className="mb-4 space-y-1.5">
          {reasons.map((r) => (
            <li key={r.code} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
              {r.label}
            </li>
          ))}
        </ul>
      ) : null}

      {setupEntries.length > 0 ? (
        <ul data-testid="overview-readiness" className="divide-y divide-border rounded-md border border-border">
          {setupEntries.map(([key, done]) => {
            const target = done ? null : stepTarget(key, summary.kind);
            const icon = (
              <span
                aria-hidden
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                  done ? 'bg-accent/10 text-accent' : 'border border-border text-muted-foreground/50',
                ].join(' ')}
              >
                {done ? '✓' : '○'}
              </span>
            );
            const label = (
              <span className={`text-sm capitalize ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                {setupLabel(key)}
              </span>
            );
            if (target) {
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => navigate(`/tournaments/${summary.id}/${target}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    {icon}
                    {label}
                    <span aria-hidden className="ml-auto text-muted-foreground/60">
                      &rsaquo;
                    </span>
                  </button>
                </li>
              );
            }
            return (
              <li key={key} className="flex items-center gap-3 px-4 py-3">
                {icon}
                {label}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No readiness signals yet.</p>
      )}
    </div>
  );
}
