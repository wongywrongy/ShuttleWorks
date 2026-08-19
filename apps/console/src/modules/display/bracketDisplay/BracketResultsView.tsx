import type { BracketTournamentDTO, ResultDTO } from '../../../api/bracketDto';
import { eventChampion, roundLabel, sideLabel } from './bracketDisplayData';
import { resolveCardHeightPx, resolveCardSizeClasses } from '../publicDisplay/tvSizing';

/** Read-only results view for the bracket TV — per event, the champion (when
 *  decided) and the completed matches grouped by round, latest round first.
 *
 *  Sized for a hall, not a desk. The champion is the single most important
 *  fact on this board and used to render at 16px — 53% of the meet board's
 *  equivalent standings leader — above a flat run of 16px rows with no round
 *  structure at all. Row scale comes from the shared `tvSizing` tiers, so it
 *  takes the same fullscreen boost the meet board's court cards do. */
export function BracketResultsView({
  data,
  isFullscreen = false,
}: {
  data: BracketTournamentDTO;
  isFullscreen?: boolean;
}) {
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  const decided = data.results.filter((r) => r.winner_side !== 'none');
  const { playerSize } = resolveCardSizeClasses(resolveCardHeightPx('auto', isFullscreen));
  const championSize = isFullscreen ? 'text-6xl' : 'text-4xl';

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

        // Latest round first: on a board glanced at for three seconds, the
        // final belongs at the top, not at the end of a scroll.
        const byRound = new Map<number, ResultDTO[]>();
        for (const r of eventResults) {
          const roundIndex = puById.get(r.play_unit_id)?.round_index ?? 0;
          const list = byRound.get(roundIndex);
          if (list) list.push(r);
          else byRound.set(roundIndex, [r]);
        }
        const rounds = [...byRound.entries()].sort((a, b) => b[0] - a[0]);

        return (
          <section key={event.id} className="rounded-lg border border-border bg-card p-5">
            <header className="mb-4 border-b border-border pb-3">
              <h3 className="text-2xl font-semibold text-foreground">{event.discipline}</h3>
              {champion ? (
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Champion
                  </span>
                  <span
                    data-testid={`champion-${event.id}`}
                    className={`${championSize} font-bold leading-tight text-accent`}
                  >
                    {champion}
                  </span>
                </p>
              ) : null}
            </header>
            {rounds.map(([roundIndex, results]) => (
              <div key={roundIndex} className="mb-5 last:mb-0">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {roundLabel(roundIndex, event.rounds.length)}
                </h4>
                <ul className="flex flex-col gap-2">
                  {results.map((r) => {
                    const pu = puById.get(r.play_unit_id);
                    if (!pu) return null;
                    const winner = sideLabel(
                      pu,
                      r.winner_side === 'A' ? 'a' : 'b',
                      data.participants,
                    );
                    const loser = sideLabel(
                      pu,
                      r.winner_side === 'A' ? 'b' : 'a',
                      data.participants,
                    );
                    return (
                      <li
                        key={r.play_unit_id}
                        data-testid={`result-${r.play_unit_id}`}
                        className={`flex flex-wrap items-baseline gap-x-3 leading-tight ${playerSize}`}
                      >
                        <span className="font-semibold text-foreground">{winner}</span>
                        <span className="text-base text-muted-foreground">def.</span>
                        <span className="text-muted-foreground">{loser}</span>
                        {r.walkover ? (
                          <span className="text-sm uppercase tracking-wide text-muted-foreground">
                            (walkover)
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
