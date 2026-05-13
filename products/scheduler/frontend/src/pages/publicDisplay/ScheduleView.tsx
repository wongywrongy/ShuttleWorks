/**
 * Public Display — "Up Next" schedule view.
 *
 * Renders the next 10 scheduled matches as a vertical list with court +
 * time + rosters. Pure presentation; all derivation happens in the page
 * shell's `upcomingMatches` memo.
 */
import type { ScheduleAssignment, MatchDTO, TournamentConfig } from '../../api/dto';
import { formatSlotTime } from '../../lib/time';
import { formatPlayers } from './helpers';

interface UpcomingItem {
  assignment: ScheduleAssignment;
  match: MatchDTO | undefined;
}

interface ScheduleViewProps {
  upcomingMatches: UpcomingItem[];
  config: TournamentConfig;
  playerNames: Map<string, string>;
}

export function ScheduleView({
  upcomingMatches,
  config,
  playerNames,
}: ScheduleViewProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-muted-foreground">
        Up Next
      </div>
      {upcomingMatches.length === 0 ? (
        <div className="py-12 text-center text-xl text-muted-foreground">
          No upcoming matches
        </div>
      ) : (
        <div className="space-y-3">
          {upcomingMatches.map(({ assignment, match }) => (
            <div
              key={assignment.matchId}
              className="flex items-center gap-5 rounded-sm border border-border bg-card/60 px-5 py-4"
            >
              <div className="w-20 text-xl font-bold text-foreground">
                {match?.eventRank || `M${match?.matchNumber || '?'}`}
              </div>
              <div className="w-14 text-lg font-semibold text-accent tabular-nums">
                C{assignment.courtId}
              </div>
              <div className="w-24 tabular-nums text-lg text-muted-foreground">
                {formatSlotTime(assignment.slotId, config)}
              </div>
              <div className="flex-1 text-xl text-foreground">
                <span>{formatPlayers(match?.sideA, playerNames)}</span>
                <span className="mx-3 text-sm uppercase tracking-widest text-muted-foreground">
                  vs
                </span>
                <span>{formatPlayers(match?.sideB, playerNames)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
