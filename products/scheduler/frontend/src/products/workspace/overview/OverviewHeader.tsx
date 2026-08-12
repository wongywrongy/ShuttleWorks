/**
 * The Overview's identity block — name, kind/date line, lifecycle badge, in
 * one tight tier instead of the loose stack it replaced (SP-UI-1 3b).
 */
import { StatusPill } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../../api/dto';
import { lifecycleBadge } from '../../../platform/domain/lifecycle';
import { resolvePhase } from '../../../platform/domain/overviewPhase';
import { formatEventDate } from './railRows';

export function OverviewHeader({ summary }: { summary: TournamentSummaryDTO }) {
  const kindLabel = summary.kind === 'bracket' ? 'Bracket tournament' : 'Meet day';
  const date = formatEventDate(summary.tournamentDate);
  // Reuse the SHARED precedence (archived > live > complete) rather than
  // encoding a fourth reading of the same two fields.
  const badge = lifecycleBadge(resolvePhase(summary), summary.status);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="type-display break-words text-2xl text-foreground">
          {summary.name || 'Untitled'}
        </h1>
        <p className="mt-1 text-xs text-text-muted">
          {kindLabel}
          {date ? ` · ${date}` : ''}
        </p>
      </div>
      {badge ? (
        <StatusPill tone={badge.tone} dot className="mt-1 shrink-0">
          {badge.text}
        </StatusPill>
      ) : null}
    </div>
  );
}
