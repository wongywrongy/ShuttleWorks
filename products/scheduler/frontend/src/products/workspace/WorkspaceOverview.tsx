/**
 * Workspace Overview — the default landing inside a workspace. Not a stats
 * dashboard: a readiness checklist. Shows the event name + date, an "N/M steps
 * complete" summary, and the named setup steps with done / attention /
 * incomplete states. No aggregate metrics, member counts, or module counts.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { readinessOf, setupLabel, attentionReasons } from '../hub/hubSignals';
import { eventDate } from '../hub/hubGrouping';

function fmtDate(iso: string | null): string {
  if (!iso) return 'No date set';
  const d = eventDate(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function WorkspaceOverview({ summary }: { summary: TournamentSummaryDTO | null }) {
  if (!summary) {
    return <div data-testid="workspace-overview" className="p-6 text-sm text-muted-foreground">Loading workspace…</div>;
  }

  const readiness = readinessOf(summary);
  const setupEntries = Object.entries(summary.signals?.setup ?? {});
  const reasons = attentionReasons(summary);

  return (
    <div data-testid="workspace-overview" className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{summary.name || 'Untitled'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{fmtDate(summary.tournamentDate)}</p>
        {readiness ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold tabular-nums text-foreground">
              {readiness.ready}/{readiness.total}
            </span>{' '}
            <span className="text-muted-foreground">steps complete</span>
          </p>
        ) : null}
      </div>

      {setupEntries.length > 0 ? (
        <ul data-testid="overview-readiness" className="divide-y divide-border rounded-md border border-border">
          {setupEntries.map(([key, done]) => (
            <li key={key} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                  done
                    ? 'bg-accent/10 text-accent'
                    : 'border border-border text-muted-foreground/50',
                ].join(' ')}
              >
                {done ? '✓' : '○'}
              </span>
              <span className={`text-sm capitalize ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                {setupLabel(key)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No readiness signals yet.</p>
      )}

      {reasons.length > 0 ? (
        <ul data-testid="overview-attention" className="mt-4 space-y-1.5">
          {reasons.map((r) => (
            <li key={r.code} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
              {r.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
