import type { BracketTournamentDTO } from '../../../api/bracketDto';
import { liveMatches, type LiveRow } from './bracketDisplayData';
import { SideScores } from '../../../components/control-plane/MatchCard';
import { SIGNAGE_NAME_WRAP, stepDownSignageNameSize, resolveGridColsClass } from '../publicDisplay/tvSizing';
import { autoLayout } from '../publicDisplay/courtLayout';
import { resolveBoardAccent } from '../publicDisplay/boardChrome';

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
  accent = null,
}: {
  data: BracketTournamentDTO;
  isFullscreen?: boolean;
  showNext?: boolean;
  showScores?: boolean;
  /** The board's operator-set accent. Restrained chrome only — a hairline on
   *  the top of each court tile (D7). Status hues are never derived from it. */
  accent?: string | null;
}) {
  const rows = liveMatches(data);
  const boardAccent = resolveBoardAccent(accent);
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

  // D7: every configured court fits the board. The old fixed
  // `sm:2 / xl:3` grid with `auto-rows-min` overflowed the viewport past six
  // courts and left the rest behind a scrollbar nobody at a TV can reach.
  // Columns come from the same `autoLayout` the meet board uses, and the rows
  // divide the height (`1fr`) instead of stacking off the bottom.
  const courts = Array.from(new Set(rows.map((row) => row.court)));
  const boardAspect =
    typeof window === 'undefined' || window.innerHeight === 0
      ? 16 / 9
      : window.innerWidth / window.innerHeight;
  const gridColsClass = resolveGridColsClass(autoLayout(courts.length, boardAspect).columns);

  return (
    <div
      className={`grid h-full min-h-0 gap-4 p-4 ${gridColsClass}`}
      style={{ gridAutoRows: 'minmax(0, 1fr)' }}
      data-testid="bracket-live-grid"
    >
      {courts.map((court) => {
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
            className="flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border border-t-4 bg-card p-5 text-center"
            /* The one place the operator's accent touches this board: the
               tile's top rule. Branding, not status — the live/called hues
               below stay on their own tokens (D7). */
            style={{ borderTopColor: boardAccent }}
            data-board-accent={boardAccent}
          >
            <span
              data-testid={`bracket-court-number-${court}`}
              className={`${courtSize} font-black leading-none tabular-nums tracking-tighter text-foreground`}
            >
              {court}
            </span>
            {/* Which event and round is on this court — always present for a
                shown match, muted and never a pill (D7). */}
            {shown?.eventLabel ? (
              <span
                data-testid={`bracket-court-event-${court}`}
                className="block max-w-full break-words text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {shown.eventLabel}
              </span>
            ) : null}
            {shown ? (
              <MatchNames row={shown} nameSize={nameSize} scoreSize={scoreSize} showScores={showScores} />
            ) : !disputed && showNext && next ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Next{next.eventLabel ? ` · ${next.eventLabel}` : ''}
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

/** Names stacked one participant per line (match-card §3.1), each side with
 *  its OWN aligned game-score column beside it (P1, contract rules 2-3) —
 *  the same stacked grammar the meet board and the bracket node render. The
 *  centred lane between the two sides is withdrawn: on a wall, a number
 *  sitting between two names belongs visibly to neither. */
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
      // Wrap between words only — never inside a surname (OPR-0908-10).
      <span key={name} className="block" style={SIGNAGE_NAME_WRAP}>
        {name}
      </span>
    ));
  const sets = showScores ? row.sets : [];
  // A word too long for the column steps the card's names down one tier
  // rather than splitting; both sides step together.
  const size = stepDownSignageNameSize(nameSize, [
    ...row.sideA.split(' / '),
    ...row.sideB.split(' / '),
  ]);
  return (
    // The score column exists only when there is a score: `SideScores`
    // renders nothing for an empty ledger, and an empty second track used to
    // receive side B instead — the two sides sat abreast in half a card each
    // and the name column narrowed below its own longest word (OPR-0908-10).
    <div
      className={`grid w-full items-center gap-x-3 ${
        sets.length
          ? 'grid-cols-[minmax(min-content,1fr)_auto]'
          : 'grid-cols-[minmax(min-content,1fr)]'
      }`}
    >
      <span className={`${size} font-semibold leading-tight ${ink}`}>{lines(row.sideA)}</span>
      <SideScores
        sets={sets}
        side="A"
        size={scoreSize}
        className="font-bold"
        sideLabel={row.sideA}
        data-testid={`bracket-court-score-${row.court}-a`}
      />
      {/* The hairline is the side boundary — stated without colour, so the
          two partners of a doubles pair group tighter inside a side than the
          sides do against each other (contract rule 3). */}
      <span className={`${size} mt-1 border-t border-border pt-1 font-semibold leading-tight ${ink}`}>
        {lines(row.sideB)}
      </span>
      <SideScores
        sets={sets}
        side="B"
        size={scoreSize}
        className="mt-1 pt-1 font-bold"
        sideLabel={row.sideB}
        data-testid={`bracket-court-score-${row.court}-b`}
      />
    </div>
  );
}
