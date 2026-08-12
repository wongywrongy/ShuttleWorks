/**
 * Public Display — team standings (school-vs-school dual-meet leaderboard).
 *
 * Pure presentation; ZERO aggregation happens here (Task 9) — every row
 * is computed authoritatively by the backend (`services.meet.standings`)
 * and served on `TournamentStateDTO.standings`. This replaces the old
 * client-side `groupScores` computation that used to live in
 * `MeetDisplayPage.tsx` (deleted). Server-sorted order is rendered
 * as-is; the top row gets a preset-relative ink-emphasis card (works on
 * every TV preset) to draw the eye.
 */
import type { MeetStandingRowDTO } from '../../../api/dto';

interface StandingsViewProps {
  standings: MeetStandingRowDTO[];
}

export function StandingsView({ standings }: StandingsViewProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-xl font-semibold uppercase tracking-widest text-muted-foreground">
        Team Standings
      </div>
      {standings.length === 0 ? (
        <div className="py-12 text-center text-xl text-muted-foreground">
          No matches completed yet
        </div>
      ) : (
        <div className="space-y-3">
          {standings.map((team, index) => (
            <div
              key={team.groupId}
              className={`flex items-start gap-5 rounded-sm border px-5 py-4 ${
                index === 0
                  ? 'border-l-2 border-[hsl(var(--ink)/0.7)] bg-[hsl(var(--ink)/0.06)]'
                  : 'border-border bg-card/60'
              }`}
            >
              <div className="w-14 text-4xl font-black tabular-nums text-muted-foreground">
                {index + 1}
              </div>
              {/* Wrap, never truncate — but wrap AT WORD BOUNDARIES. Sharing
                  this row with the rank digit and the W-L block left the name
                  ~155px wide at text-3xl, too narrow for an ordinary word
                  ("Badminton", "Association") to fit its own line, so
                  `break-words` (the right property: it only breaks inside a
                  word as a last resort) was firing on nearly every word —
                  indistinguishable from `break-all` in practice. The W-L
                  block now sits BELOW the name instead of beside it, so the
                  name gets the row's full remaining width and mid-word
                  breaking is reserved for a genuinely unbreakable token. */}
              <div className="min-w-0 flex-1">
                <div className="break-words text-3xl font-bold leading-tight">
                  {team.groupName}
                </div>
                <div className="mt-1 flex shrink-0 items-baseline gap-3 text-xl tabular-nums">
                  <span className="text-status-done">
                    {team.wins}W
                  </span>
                  <span className="text-muted-foreground">–</span>
                  <span className="text-destructive">
                    {team.losses}L
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
