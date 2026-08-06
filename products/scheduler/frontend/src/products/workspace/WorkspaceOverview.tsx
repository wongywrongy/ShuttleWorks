/**
 * Workspace Overview — the default landing inside a workspace. A compact
 * dashboard: event identity, a "this event" metric triplet
 * (matches / scheduled / to-do), a readiness progress bar over the named
 * setup steps (incomplete steps deep-link into their section), any attention
 * items, and a "Next up" list of the next scheduled matches. All of it reads
 * the server-computed `summary.signals` — the same source the Hub inspector
 * uses — so Overview lands as a real dashboard, not a bare checklist.
 */
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { TournamentSummaryDTO } from '../../api/dto';
import type { AppTab } from '../../store/uiStore';
import { readinessOf, setupLabel, attentionReasons } from '../hub/hubSignals';
import { eventDate } from '../hub/hubGrouping';
import { NextUpList } from '../hub/NextUpList';
import { EYEBROW_CLASS } from '../../lib/utils';

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

/** 10px uppercase section label — the workspace's section voice. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className={`mb-2 ${EYEBROW_CLASS} text-ink-faint`}>{children}</div>
  );
}

/** One "this event" metric tile (grid-lines triplet). */
function MetricTile({ value, label, tone }: { value: number | string; label: string; tone?: 'live' | 'warning' }) {
  const color = tone === 'live' ? 'text-status-live' : tone === 'warning' ? 'text-status-warning' : 'text-foreground';
  return (
    <div className="bg-surface-screen p-3.5">
      <div className={`text-2xl font-bold leading-tight tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-[0.06em] text-ink-faint">{label}</div>
    </div>
  );
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
  const metrics = summary.signals?.matches;
  const toDo = metrics ? metrics.toDo : reasons.length;
  const nextUp = summary.signals?.nextUp ?? [];
  const pct = readiness ? Math.round((readiness.ready / readiness.total) * 100) : 0;

  return (
    <div data-testid="workspace-overview" className="sw-float-in mx-auto max-w-4xl p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{summary.name || 'Untitled'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDate(summary.tournamentDate)} · {kindLabel}
        </p>
      </div>

      {/* This event — the metric triplet (grid-lines let the hairline show). */}
      <div
        data-testid="overview-metrics"
        className="mb-7 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border"
      >
        <MetricTile value={metrics ? metrics.total : '—'} label="matches" />
        <MetricTile value={metrics ? metrics.scheduled : '—'} label="scheduled" tone="live" />
        <MetricTile value={toDo} label="to do" tone={toDo > 0 ? 'warning' : undefined} />
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_308px]">
        {/* Readiness + attention */}
        <div>
          {setupEntries.length > 0 ? (
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Readiness</SectionLabel>
                {readiness ? (
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {readiness.ready} / {readiness.total} steps
                  </span>
                ) : null}
              </div>
              {readiness ? (
                <div
                  role="progressbar"
                  aria-label="Readiness"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mb-3.5 h-1.5 overflow-hidden rounded-full bg-surface-card"
                >
                  <div className="h-full rounded-full bg-status-live" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              <ul data-testid="overview-readiness" className="divide-y divide-border rounded-md border border-border">
                {setupEntries.map(([key, done]) => {
                  const target = done ? null : stepTarget(key, summary.kind);
                  const icon = (
                    <span
                      aria-hidden
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                        done ? 'bg-status-live/12 text-status-live' : 'border border-border text-muted-foreground',
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
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
                        >
                          {icon}
                          {label}
                          <span aria-hidden className="ml-auto text-muted-foreground">&rsaquo;</span>
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
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No readiness signals yet.</p>
          )}

          {reasons.length > 0 ? (
            <div>
              <SectionLabel>Needs attention</SectionLabel>
              <ul data-testid="overview-attention" className="space-y-1.5">
                {reasons.map((r) => (
                  <li key={r.code} className="flex items-start gap-2 text-xs text-ink-2">
                    <span aria-hidden className="text-status-warning">›</span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Next up */}
        {nextUp.length > 0 ? (
          <div data-testid="overview-next-up">
            <SectionLabel>Next up</SectionLabel>
            <NextUpList items={nextUp} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
