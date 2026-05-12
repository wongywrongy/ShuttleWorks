/**
 * Public Display — team standings (school-vs-school dual-meet leaderboard).
 *
 * Pure presentation; all aggregation happens in the page shell's
 * `standings` memo. Top-1 team gets a gold-tinted card to draw the eye.
 */

export interface StandingRow {
  groupId: string;
  groupName: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

interface StandingsViewProps {
  standings: StandingRow[];
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
              className={`flex items-center gap-5 rounded-sm border px-5 py-4 ${
                index === 0
                  ? 'border-yellow-500/60 bg-yellow-500/10'
                  : 'border-border bg-card/60'
              }`}
            >
              <div className="w-14 text-4xl font-black tabular-nums text-muted-foreground">
                {index + 1}
              </div>
              <div className="flex-1 truncate text-3xl font-bold">
                {team.groupName}
              </div>
              <div className="flex items-baseline gap-3 text-xl tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {team.wins}W
                </span>
                <span className="text-muted-foreground">–</span>
                <span className="text-rose-600 dark:text-rose-400">
                  {team.losses}L
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
