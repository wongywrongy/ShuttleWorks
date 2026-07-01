import type { BracketTournamentDTO, ResultDTO } from '../../../api/bracketDto';
import { sideLabel } from './bracketDisplayData';

/** Read-only bracket tree for a single event — the rounds rendered as
 *  columns, each play_unit showing its two sides with the winning side
 *  marked. No pin/drag/result controls (that's the operator DrawView). */
export function BracketDrawView({
  data,
  eventId,
}: {
  data: BracketTournamentDTO;
  eventId: string;
}) {
  const event = data.events.find((e) => e.id === eventId);
  const rounds = event?.rounds ?? [];
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  const resultByPu = new Map<string, ResultDTO>(
    data.results.map((r) => [r.play_unit_id, r]),
  );

  if (!event || rounds.length === 0) {
    return (
      <div
        data-testid="bracket-draw-empty"
        className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center"
      >
        <p className="text-2xl font-semibold text-foreground">No draw yet</p>
        <p className="text-base text-muted-foreground">
          The bracket appears here once the draw is generated.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6 overflow-auto p-4">
      {rounds.map((roundPuIds, roundIndex) => (
        <div key={roundIndex} className="flex min-w-[18rem] flex-col justify-center gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Round {roundIndex + 1}
          </h3>
          {roundPuIds.map((puId) => {
            const pu = puById.get(puId);
            if (!pu) return null;
            const result = resultByPu.get(puId);
            const winA = result?.winner_side === 'A';
            const winB = result?.winner_side === 'B';
            const labelA = sideLabel(pu, 'a', data.participants);
            const labelB = sideLabel(pu, 'b', data.participants);
            return (
              <div key={puId} className="rounded-md border border-border bg-card">
                <Side label={labelA} won={winA} />
                <div className="border-t border-border" />
                <Side label={labelB} won={winB} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Side({ label, won }: { label: string; won: boolean }) {
  return (
    <div
      {...(won ? { 'data-testid': 'draw-winner' } : {})}
      className={[
        'flex items-center justify-between px-4 py-2.5 text-xl',
        won ? 'font-bold text-accent' : 'font-medium text-foreground',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      {won ? <span aria-label="winner" className="text-accent">✓</span> : null}
    </div>
  );
}
