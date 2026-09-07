/**
 * Public Display — Courts view (the current match on each court).
 *
 * This is a COURT-FINDING SURFACE, not an operator panel (match-card
 * contract §4.4, state-and-formatting §9.1, both rewritten by the P0
 * operator-visual-fixes pass). Three rules shape everything below:
 *
 *  1. **The court number is the largest element on the card.** Names next,
 *     the live score readable, and nothing else competing with them.
 *  2. **An empty, closed, unavailable or DISPUTED court renders the court
 *     number and nothing else.** No "Court assignment unavailable.", no "No
 *     next match assigned", no error colour — a spectator cannot act on any
 *     of it, and the operator has the real dispute on the Run surface.
 *  3. **The Next preview is opt-in** (`showNext`, persisted, default off)
 *     and renders only fully RESOLVED names; an unresolved side omits the
 *     preview rather than leaking "Winner of …", a feeder reference or a
 *     UUID onto the wall.
 *
 * Two render modes selected by `displayMode` ('list' for many courts on one
 * screen; 'auto'/'grid' for the card grid, differing only in who chose the
 * column count). The retired 'strip' mode maps to 'auto' before it gets here.
 */
import type { TournamentConfig, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { ScoreLane, type SetPair } from '../../../components/control-plane/MatchCard';
import { formatPlayers, sideLines, isCourtClosedNow, hasResolvedSides } from './helpers';
import {
  resolveSignageCourtSize,
  resolveSignageNameSize,
  resolveSignageScoreSize,
} from './tvSizing';

type CourtStatus = 'active' | 'called' | 'empty';
type CourtDisplayMode = 'list' | 'auto' | 'grid';

interface CourtRow {
  courtId: number;
  match: MatchDTO | null;
  state: MatchStateDTO | null;
  status: CourtStatus;
  /** A disputed court: two claims the board must NOT arbitrate between. It
   *  renders as the court number alone; the dispute itself stays visible to
   *  the operator, and the court is not marked free in operational data. */
  conflictMatches?: MatchDTO[];
  /** The Next-lane assignment on this court, when one exists. Rendered only
   *  where the board's `showNext` setting is on.
   *
   *  The board no longer reads the lane's planned CLOCK or its Later lane:
   *  a "~09:00" on a tile is a promise the day stops keeping the moment it
   *  runs late, and Later was a third answer to a question the hall did not
   *  ask. `MeetDisplayPage` still derives both (the same `assignLanes` call
   *  decides what "now" is); this renderer just does not print them. */
  nextMatch?: MatchDTO | null;
}

interface CourtsViewProps {
  courts: CourtRow[];
  config: TournamentConfig;
  now: Date;
  displayMode: CourtDisplayMode;
  /** Pre-computed Tailwind grid-cols class for grid mode. */
  gridColsClass: string;
  /** Card height in pixels for grid mode. */
  cardHeightPx: number;
  /** Tailwind padding-x class for grid cards (size-tier sensitive). */
  cardPadX: string;
  /** Whether to show scores anywhere (persisted board setting). */
  tvShowScores: boolean;
  /** Whether to show the Next preview (persisted board setting, default off). */
  showNext: boolean;
  /** Fullscreen modifier — bumps inner sizing on the bigger surface. */
  isFullscreen: boolean;
  /** Pre-built playerId → name lookup. */
  playerNames: Map<string, string>;
}

/**
 * The games to print in the shared `ScoreLane`, or none.
 *
 * Per-game detail when the state carries it, else the recorded aggregate as
 * a single pair — the same rule the operator's match rows use, so a score
 * reads identically on a row and on the wall. Never fabricated: an absent
 * score is an empty lane, and the public projection already refuses to
 * publish an unrecorded 0–0 (see the API's `_display_score`).
 */
function laneSets(state: MatchStateDTO | null, show: boolean): SetPair[] {
  if (!show || !state) return [];
  if (state.sets?.length) return state.sets;
  return state.score ? [state.score] : [];
}

export function CourtsView(props: CourtsViewProps) {
  return props.displayMode === 'list' ? (
    <CourtsListMode {...props} />
  ) : (
    <CourtsCardMode {...props} />
  );
}

function CourtsListMode({
  courts,
  config,
  now,
  tvShowScores,
  showNext,
  playerNames,
}: CourtsViewProps) {
  return (
    <div className="flex w-full flex-col divide-y divide-border rounded-sm border border-border bg-card/40">
      {courts.map((row) => {
        const { courtId, match, state, conflictMatches, nextMatch } = row;
        const isClosed = isCourtClosedNow(config, courtId, now);
        // A disputed court is not arbitrated and not announced: it reads
        // exactly like an empty one to the hall.
        const suppressed = isClosed || !!conflictMatches?.length;
        const sets = suppressed ? [] : laneSets(state, tvShowScores);
        const sideA = !suppressed && match ? formatPlayers(match.sideA, playerNames) : '';
        const sideB = !suppressed && match ? formatPlayers(match.sideB, playerNames) : '';
        const preview =
          !suppressed && !match && showNext && nextMatch && hasResolvedSides(nextMatch, playerNames)
            ? nextMatch
            : null;
        // (List mode is the many-courts layout: one line per court, so the
        // Next preview only fills a court that has nothing on it.)
        return (
          <div
            key={courtId}
            // `min-h`, not `h`: the players cell wraps rather than
            // ellipsising, so a long doubles pairing makes the row taller
            // instead of hiding a surname from the far side of the hall.
            className="grid min-h-[3.5rem] items-center gap-3 px-4 text-base text-foreground grid-cols-[4rem_1fr_10rem]"
          >
            {/* The court number leads and outweighs everything beside it. */}
            <span
              className={`tabular-nums text-4xl font-bold leading-none ${
                isClosed ? 'text-muted-foreground line-through' : ''
              }`}
            >
              {courtId}
            </span>
            <span className="min-w-0 break-words">
              {match && !suppressed ? (
                <>
                  <span className="font-medium">{sideA}</span>
                  <span className="px-2 text-muted-foreground">vs</span>
                  <span className="font-medium">{sideB}</span>
                </>
              ) : preview ? (
                <span className="text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide text-foreground">Next</span>{' '}
                  {formatPlayers(preview.sideA, playerNames)} vs{' '}
                  {formatPlayers(preview.sideB, playerNames)}
                </span>
              ) : null}
            </span>
            <span className="text-right">
              <ScoreLane sets={sets} size="text-xl" sideALabel={sideA} sideBLabel={sideB} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CourtsCardMode({
  courts,
  config,
  now,
  displayMode,
  gridColsClass,
  cardHeightPx,
  cardPadX,
  tvShowScores,
  showNext,
  playerNames,
}: CourtsViewProps) {
  return (
    <div
      className={`w-full grid gap-3 ${gridColsClass}`}
      // `minmax(h, auto)`, not a fixed track: the card height is the DESIGNED
      // height, not a cap. A doubles pairing too long for one line grows its
      // row instead of being clipped by the card — nothing on a hall board is
      // readable at half a name.
      style={{ gridAutoRows: `minmax(${cardHeightPx}px, auto)` }}
      data-display-mode={displayMode}
    >
      {courts.map((row, idx) => (
        <CourtCard
          key={row.courtId}
          row={row}
          idx={idx}
          isClosed={isCourtClosedNow(config, row.courtId, now)}
          cardHeightPx={cardHeightPx}
          cardPadX={cardPadX}
          tvShowScores={tvShowScores}
          showNext={showNext}
          playerNames={playerNames}
        />
      ))}
    </div>
  );
}

interface CourtCardProps {
  row: CourtRow;
  idx: number;
  isClosed: boolean;
  cardHeightPx: number;
  cardPadX: string;
  tvShowScores: boolean;
  showNext: boolean;
  playerNames: Map<string, string>;
}

/**
 * One court tile. The court number is the card, structurally: it is the
 * first and largest thing rendered, and on a court with nothing to show it
 * is the ONLY thing rendered — no status band, no state word, no placeholder
 * sentence (match-card §4.4). A closed court dims and strikes its own
 * number, which says "not in play" without prose.
 */
function CourtCard({
  row,
  idx,
  isClosed,
  cardHeightPx,
  cardPadX,
  tvShowScores,
  showNext,
  playerNames,
}: CourtCardProps) {
  const { courtId, match, state, conflictMatches, nextMatch } = row;
  const courtSize = resolveSignageCourtSize(cardHeightPx);
  const nameSize = resolveSignageNameSize(cardHeightPx);
  const scoreSize = resolveSignageScoreSize(cardHeightPx);
  // Disputed courts are suppressed, never arbitrated: picking one of two
  // claims would put a wrong match on the wall with full confidence.
  const suppressed = isClosed || !!conflictMatches?.length;
  const current = suppressed ? null : match;
  const sets = laneSets(suppressed ? null : state, tvShowScores);
  const linesA = current ? sideLines(current.sideA, playerNames) : [];
  const linesB = current ? sideLines(current.sideB, playerNames) : [];
  // The Next preview rides an idle court AND an occupied one: "what does
  // this court play next" is the question the setting is for, and a hall in
  // full flow has no idle courts to put it on.
  const preview =
    !suppressed && showNext && nextMatch && hasResolvedSides(nextMatch, playerNames)
      ? nextMatch
      : null;

  return (
    <div
      data-testid={`court-card-${courtId}`}
      className={`flex flex-col items-center justify-center gap-1 overflow-hidden rounded border border-border bg-card sw-float-in ${cardPadX} py-3`}
      style={{
        minHeight: cardHeightPx,
        // Staggered entry — each tile arrives 60 ms after the previous
        // so the grid doesn't flash on every poll. (Cards are keyed by
        // courtId, so this fires on arrival, not on every poll.)
        animationDelay: `${idx * 60}ms`,
      }}
    >
      <span
        data-testid={`court-number-${courtId}`}
        className={`${courtSize} font-black leading-none tabular-nums tracking-tighter ${
          isClosed ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
      >
        {courtId}
      </span>

      {current ? (
        <>
          <SignageSide lines={linesA} nameSize={nameSize} />
          <ScoreLane
            sets={sets}
            size={scoreSize}
            className="font-bold"
            sideALabel={linesA.join(' / ')}
            sideBLabel={linesB.join(' / ')}
            data-testid={`court-score-${courtId}`}
          />
          <SignageSide lines={linesB} nameSize={nameSize} />
        </>
      ) : null}

      {preview ? (
        <div
          data-testid={`court-next-${courtId}`}
          className="flex flex-col items-center gap-0.5 text-center"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Next
          </span>
          <span
            className={`${current ? 'text-base' : nameSize} font-semibold leading-tight text-muted-foreground`}
          >
            {formatPlayers(preview.sideA, playerNames)}
          </span>
          <span
            className={`${current ? 'text-base' : nameSize} font-semibold leading-tight text-muted-foreground`}
          >
            {formatPlayers(preview.sideB, playerNames)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One side of the board card: one line PER PARTICIPANT (match-card §3.1 — a
 * doubles pair is never joined onto one line at signage density). The score
 * is NOT here; it lives once, in the centred lane between the two sides
 * (§3.4), which is the same lane every other match surface renders.
 */
function SignageSide({ lines, nameSize }: { lines: string[]; nameSize: string }) {
  return (
    <span className={`${nameSize} w-full text-center font-semibold leading-tight text-foreground`}>
      {lines.map((line, i) => (
        <span key={i} className="block break-words">
          {line}
        </span>
      ))}
    </span>
  );
}
