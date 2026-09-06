import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { liveMatches } from './bracketDisplayData';
import { STATE_WORD } from '../../../lib/stateWords';

/** Read-only "what's playing now" view for the bracket TV — the bracket
 *  analog of the meet display's CourtsView. Oversized match cards, one per
 *  on-court / next-up bracket match, readable across a gym. No controls.
 *
 *  `isFullscreen` buys the same step up the meet board's court cards take
 *  once the board owns the whole screen. */
export function BracketLiveView({
  data,
  isFullscreen = false,
}: {
  data: BracketTournamentDTO;
  isFullscreen?: boolean;
}) {
  const rows = liveMatches(data);
  const sideSize = isFullscreen ? 'text-5xl' : 'text-3xl';

  if (rows.length === 0) {
    return (
      <div data-testid="bracket-live-empty" className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
        <p className="text-2xl font-semibold text-foreground">No matches on court</p>
        <p className="text-base text-muted-foreground">Scheduled bracket matches appear here once they&rsquo;re assigned to a court.</p>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-min grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from(new Set(rows.map((row) => row.court))).map((court) => {
        const courtRows = rows.filter((row) => row.court === court);
        const current = courtRows.find((row) => row.status === 'on-court');
        const conflict = courtRows.filter((row) => row.status === 'conflict');
        const next = courtRows.find((row) => row.status === 'next' && row.sideA !== '–' && row.sideB !== '–');
        return <div
          key={court}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Court {court}
            </span>
            {/* "Next" is the calm state, so it stays a plain muted chip —
                the warning tint belonged to a "Called" that was never a
                fact about the data (see bracketDisplayData#liveMatches).
                Disputed court band word: contract §4.1's exact public label
                (V3-OC24.1) — never an announcement instruction. */}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {conflict.length > 1
                ? 'Court assignment unavailable'
                : current
                  ? STATE_WORD.onCourt
                  : next
                    ? 'Next'
                    : 'Court free'}
            </span>
          </div>
          {conflict.length > 1 ? (
            <div className="space-y-2 text-sm">
              {/* Exactly one sentence, the public label restated (contract
                  §4.1) — never "the tournament desk is resolving…", never an
                  instruction to announce anything (V3-OC24.1). */}
              <p className="font-semibold text-status-warning">Court assignment unavailable.</p>
            </div>
          ) : current || next ? (
            <div className="flex flex-col gap-1.5">
              {current ? <MatchNames row={current} size={sideSize} /> : null}
              {current && next ? <div className="my-1 border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next</div> : null}
              {next ? <MatchNames row={next} size={isFullscreen ? 'text-2xl' : 'text-xl'} /> : null}
              {current && !next ? <div className="my-1 border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next · No next match assigned</div> : null}
            </div>
          ) : <p className="text-base text-muted-foreground">No next match assigned.</p>}
        </div>;
      })}
    </div>
  );
}

function MatchNames({ row, size }: { row: { sideA: string; sideB: string }; size: string }) {
  const lines = (value: string) => value.split(' / ').map((name) => (
    <span key={name} className="block break-words">{name}</span>
  ));
  return <>
    <span className={`${size} font-bold leading-tight text-foreground`}>{lines(row.sideA)}</span>
    <span className="text-base font-medium text-muted-foreground">vs</span>
    <span className={`${size} font-bold leading-tight text-foreground`}>{lines(row.sideB)}</span>
  </>;
}
