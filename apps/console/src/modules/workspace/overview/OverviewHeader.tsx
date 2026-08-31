/**
 * The Overview's identity block — name, kind/date line, in-header primary
 * action (G3.1).
 *
 * No lifecycle pill here (SP-OPCON-1 SWP-3, X4): the shell's
 * `WorkspaceIdentityBar` already renders the one lifecycle StatusPill for
 * every workspace page, and this header used to repeat it two lines below —
 * the evidence workspace read "COMPLETE" twice in one viewport. One family,
 * one render; the phase stepper below carries progression, not status.
 */
import type { ReactNode } from 'react';
import type { TournamentSummaryDTO } from '../../../api/dto';
import { formatEventDate } from './railRows';

export function OverviewHeader({
  summary,
  action,
}: {
  summary: TournamentSummaryDTO;
  action?: ReactNode;
}) {
  const kindLabel = summary.kind === 'bracket' ? 'Bracket tournament' : 'Meet day';
  const date = formatEventDate(summary.tournamentDate);

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
      <div className="flex shrink-0 items-center gap-3">{action}</div>
    </div>
  );
}
