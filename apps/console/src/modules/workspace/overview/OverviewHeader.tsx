/**
 * The Overview's identity block — name, date line, in-header primary
 * action (G3.1).
 *
 * The subtitle names no tournament TYPE. "Bracket tournament" / "Meet day"
 * described ShuttleWorks' packaging, not the event: the workspace already
 * shows what it runs in its own navigation, and the word changed nothing the
 * director could act on. What is left is the fact a subtitle is for — when
 * the event is.
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
  const date = formatEventDate(summary.tournamentDate);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="type-display break-words text-2xl text-foreground">
          {summary.name || 'Untitled'}
        </h1>
        {date ? <p className="mt-1 text-xs text-text-muted">{date}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">{action}</div>
    </div>
  );
}
