import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { eventChampion, sideLabel } from './bracketDisplayData';

/** Read-only results view for the bracket TV — per event, the champion (when
 *  decided) and the completed matches with their winners. Styled like the
 *  meet display's StandingsView. */
export function BracketResultsView({ data }: { data: BracketTournamentDTO }) {
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  const decided = data.results.filter((r) => r.winner_side !== 'none');

  if (decided.length === 0) {
    return (
      <div
        data-testid="bracket-results-empty"
        className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center"
      >
        <p className="text-2xl font-semibold text-foreground">No results yet</p>
        <p className="text-base text-muted-foreground">
          Completed bracket matches and champions appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {data.events.map((event) => {
        const champion = eventChampion(data, event.id);
        const eventResults = decided.filter(
          (r) => puById.get(r.play_unit_id)?.event_id === event.id,
        );
        if (eventResults.length === 0) return null;
        return (
          <section key={event.id} className="rounded-lg border border-border bg-card p-5">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-foreground">{event.discipline}</h3>
              {champion ? (
                <p className="text-sm text-muted-foreground">
                  Champion:{' '}
                  <span
                    data-testid={`champion-${event.id}`}
                    className="text-base font-bold text-accent"
                  >
                    {champion}
                  </span>
                </p>
              ) : null}
            </header>
            <ul className="flex flex-col gap-1.5">
              {eventResults.map((r) => {
                const pu = puById.get(r.play_unit_id);
                if (!pu) return null;
                const winner = sideLabel(pu, r.winner_side === 'A' ? 'a' : 'b', data.participants);
                const loser = sideLabel(pu, r.winner_side === 'A' ? 'b' : 'a', data.participants);
                return (
                  <li key={r.play_unit_id} className="flex items-center gap-2 text-base">
                    <span className="font-semibold text-foreground">{winner}</span>
                    <span className="text-muted-foreground">def.</span>
                    <span className="text-muted-foreground">{loser}</span>
                    {r.walkover ? (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        (walkover)
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
