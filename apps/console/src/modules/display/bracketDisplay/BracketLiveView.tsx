import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { liveMatches, type LiveRow } from './bracketDisplayData';
import { ScoreLane } from '../../../components/control-plane/MatchCard';

/**
 * Read-only "what's playing now" view for the bracket TV — the bracket analog
 * of the meet display's CourtsView, and held to the same signage contract
 * (match-card §4.4 / state-and-formatting §9.1, as rewritten by P0):
 *
 *  - the **court number is the largest element** on each tile, names next,
 *    the recorded score readable below them;
 *  - an empty court, and a DISPUTED one, render the court number and nothing
 *    else — no "Court assignment unavailable.", no "No next match assigned",
 *    no warning colour. The board never arbitrates between two claims, and
 *    the operator keeps the real dispute on the Run surface;
 *  - the Next preview is the persisted, default-off `showNext` board
 *    setting, and renders only when both sides are resolved.
 *
 * `isFullscreen` buys the same step up the meet board's court cards take
 * once the board owns the whole screen.
 */
export function BracketLiveView({
  data,
  isFullscreen = false,
  showNext = false,
  showScores = true,
}: {
  data: BracketTournamentDTO;
  isFullscreen?: boolean;
  showNext?: boolean;
  showScores?: boolean;
}) {
  const rows = liveMatches(data);
  const courtSize = isFullscreen ? 'text-8xl' : 'text-7xl';
  const nameSize = isFullscreen ? 'text-4xl' : 'text-3xl';
  const scoreSize = isFullscreen ? 'text-3xl' : 'text-2xl';

  if (rows.length === 0) {
    return (
      <div
        data-testid="bracket-live-empty"
        className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center"
      >
        <p className="text-2xl font-semibold text-foreground">No matches on court</p>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-min grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from(new Set(rows.map((row) => row.court))).map((court) => {
        const courtRows = rows.filter((row) => row.court === court);
        const current = courtRows.find((row) => row.status === 'on-court');
        const disputed = courtRows.filter((row) => row.status === 'conflict').length > 1;
        const next = courtRows.find((row) => row.status === 'next' && row.resolved);
        // A disputed court reads exactly like an empty one to the hall.
        const shown = disputed ? null : current;
        return (
          <div
            key={court}
            data-testid={`bracket-court-card-${court}`}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-5 text-center"
          >
            <span
              data-testid={`bracket-court-number-${court}`}
              className={`${courtSize} font-black leading-none tabular-nums tracking-tighter text-foreground`}
            >
              {court}
            </span>
            {shown ? (
              <MatchNames row={shown} nameSize={nameSize} scoreSize={scoreSize} showScores={showScores} />
            ) : !disputed && showNext && next ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Next
                </span>
                <MatchNames row={next} nameSize={nameSize} scoreSize={scoreSize} showScores={false} muted />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Names stacked one participant per line (match-card §3.1) with the shared
 *  centred score lane between the two sides (§3.4) — the same grammar the
 *  meet board and every operator surface render. */
function MatchNames({
  row,
  nameSize,
  scoreSize,
  showScores,
  muted = false,
}: {
  row: LiveRow;
  nameSize: string;
  scoreSize: string;
  showScores: boolean;
  muted?: boolean;
}) {
  const ink = muted ? 'text-muted-foreground' : 'text-foreground';
  const lines = (value: string) =>
    value.split(' / ').map((name) => (
      <span key={name} className="block break-words">
        {name}
      </span>
    ));
  return (
    <>
      <span className={`${nameSize} font-semibold leading-tight ${ink}`}>{lines(row.sideA)}</span>
      <ScoreLane
        sets={showScores ? row.sets : []}
        size={scoreSize}
        className="font-bold"
        sideALabel={row.sideA}
        sideBLabel={row.sideB}
        data-testid={`bracket-court-score-${row.court}`}
      />
      <span className={`${nameSize} font-semibold leading-tight ${ink}`}>{lines(row.sideB)}</span>
    </>
  );
}
