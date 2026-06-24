import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { liveMatches } from './bracketDisplayData';

/** Read-only "what's playing now" view for the bracket TV — the bracket
 *  analog of the meet display's CourtsView. Oversized match cards, one per
 *  on-court / called bracket match, readable across a gym. No controls. */
export function BracketLiveView({ data }: { data: BracketTournamentDTO }) {
  const rows = liveMatches(data);

  if (rows.length === 0) {
    return (
      <div
        data-testid="bracket-live-empty"
        className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center"
      >
        <p className="text-2xl font-semibold text-foreground">No matches on court</p>
        <p className="text-base text-muted-foreground">
          Scheduled bracket matches appear here once they&rsquo;re assigned to a court.
        </p>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-min grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((m) => (
        <div
          key={m.puId}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Court {m.court}
            </span>
            <span
              className={[
                'rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                m.status === 'on-court'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-status-warning/20 text-status-warning',
              ].join(' ')}
            >
              {m.status === 'on-court' ? 'On court' : 'Called'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="truncate text-3xl font-bold leading-tight text-foreground">
              {m.sideA}
            </span>
            <span className="text-base font-medium text-muted-foreground">vs</span>
            <span className="truncate text-3xl font-bold leading-tight text-foreground">
              {m.sideB}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
