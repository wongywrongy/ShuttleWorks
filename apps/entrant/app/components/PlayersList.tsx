import type { PlayersDTO } from '../lib/draws.types';

export function PlayersList({ roster }: { roster: PlayersDTO }) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="sr-only">Players</h2>
        <p className="text-sm text-muted-foreground">
          Players named in the published draws. These source roster records are
          not entrant profiles.
        </p>
        {roster.missingNameCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {`${roster.missingNameCount} draw roster ${
              roster.missingNameCount === 1 ? 'reference has' : 'references have'
            } no published player name and ${
              roster.missingNameCount === 1 ? 'is' : 'are'
            } not listed.`}
          </p>
        ) : null}
      </div>
      {roster.players.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule-soft text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Player</th>
                <th className="px-4 py-2 font-semibold">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-soft">
              {roster.players.map((player) => (
                <tr key={player.playerKey}>
                  <td className="px-4 py-2 font-medium text-foreground">{player.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {player.eventCodes.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">No named players in the published draws.</p>
      )}
    </section>
  );
}
