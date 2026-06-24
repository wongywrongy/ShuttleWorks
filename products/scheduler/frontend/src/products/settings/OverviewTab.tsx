import type { TournamentSummaryDTO } from '../../api/dto';
import { SectionCard, HealthDot } from '../../components/control-plane';
import {
  workspaceHealth,
  readinessOf,
  attentionReasons,
  collaborationOf,
  moduleCountsOf,
} from '../hub/hubSignals';

/** Workspace Overview — the control-plane summary for one workspace: health +
 *  readiness, a setup checklist + attention reasons, module counts, and
 *  collaboration counts. Degrades when the summary/signals are absent. */
export function OverviewTab({ summary }: { summary: TournamentSummaryDTO | null }) {
  if (!summary) {
    return (
      <div data-testid="overview-tab" className="p-6 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  const health = workspaceHealth(summary);
  const readiness = readinessOf(summary);
  const reasons = attentionReasons(summary);
  const collab = collaborationOf(summary);
  const counts = moduleCountsOf(summary);
  const setupEntries = Object.entries(summary.signals?.setup ?? {});

  return (
    <div data-testid="overview-tab" className="max-w-2xl">
      <div className="border-b border-border p-6">
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          OVERVIEW
        </div>
        <h2 className="mt-1 truncate text-base font-semibold text-foreground">
          {summary.name || 'Untitled'}
        </h2>
        <div className="mt-2 flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
          <HealthDot health={health} />
          <span className="text-foreground">{health}</span>
          {readiness ? (
            <span className="tabular-nums">
              {' · '}
              {readiness.ready}/{readiness.total} ready
            </span>
          ) : null}
        </div>
      </div>

      {setupEntries.length > 0 || reasons.length > 0 ? (
        <SectionCard eyebrow="READINESS">
          {setupEntries.length > 0 ? (
            <ul data-testid="overview-checklist" className="space-y-1">
              {setupEntries.map(([key, done]) => (
                <li
                  key={key}
                  className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground"
                >
                  <span aria-hidden className={done ? 'text-accent' : 'text-muted-foreground/40'}>
                    {done ? '✓' : '○'}
                  </span>
                  {key}
                </li>
              ))}
            </ul>
          ) : null}
          {reasons.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {reasons.map((r) => (
                <li key={r.code} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
                  {r.label}
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="MODULES"
        right={
          counts ? (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {counts.enabled} enabled · {counts.available} available
            </span>
          ) : undefined
        }
      >
        <p className="text-xs text-muted-foreground">
          Manage product systems for this workspace on the Modules tab.
        </p>
      </SectionCard>

      <SectionCard eyebrow="PEOPLE">
        <p className="text-xs text-muted-foreground">
          {collab
            ? `${collab.memberCount} member${collab.memberCount === 1 ? '' : 's'} · ${collab.activeInviteCount} active invite${collab.activeInviteCount === 1 ? '' : 's'}`
            : 'No collaborators yet.'}
        </p>
      </SectionCard>
    </div>
  );
}
