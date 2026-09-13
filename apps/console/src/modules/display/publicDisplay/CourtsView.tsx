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
import { SideScores, type SetPair } from '../../../components/control-plane/MatchCard';
import {
  formatPlayers,
  sideLines,
  isCourtClosedNow,
  hasResolvedSides,
  matchEventLabel,
} from './helpers';
import {
  resolveSignageCourtSize,
  resolveSignageNameSize,
  resolveSignageScoreSize,
  SIGNAGE_NAME_WRAP,
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
 * The games to print, in the per-side `SideScores` columns both render
 * modes now use — or none.
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
        const linesA = !suppressed && match ? sideLines(match.sideA, playerNames) : [];
        const linesB = !suppressed && match ? sideLines(match.sideB, playerNames) : [];
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
            className="grid min-h-[3.5rem] items-center gap-3 px-4 py-2 text-base text-foreground grid-cols-[4rem_1fr]"
          >
            {/* The court number leads and outweighs everything beside it. */}
            <span
              data-testid={`court-number-${courtId}`}
              className={`tabular-nums text-4xl font-bold leading-none ${
                isClosed ? 'text-muted-foreground line-through' : ''
              }`}
            >
              {courtId}
            </span>
            {match && !suppressed ? (
              /* P4: the same two-group grammar the card mode renders — one
                 row per SIDE, both doubles partners inside their own row,
                 and that side's score in the column beside it. The old
                 single "A vs B" line put one score block at the far right
                 belonging visibly to neither side.
                 D7: the event line rides ABOVE the sides — plain muted text,
                 never a pill — so the row says which event it is without
                 competing with the names or the court number. */
              <div className="min-w-0">
              <EventLine
                courtId={courtId}
                label={matchEventLabel(match)}
                className="text-sm"
              />
              <div
                data-testid={`court-match-${courtId}`}
                // The score column EXISTS only when there is a score:
                // `SideScores` renders nothing for an empty ledger, and a
                // two-column track with nothing in its second column used to
                // drop side B into it — the two sides sat abreast, each name
                // in half a card, and the name column narrowed below its own
                // longest word (OPR-0908-10). `min-content` is the floor when
                // the column does exist.
                className={`grid min-w-0 items-center gap-x-3 ${
                  sets.length
                    ? 'grid-cols-[minmax(min-content,1fr)_auto]'
                    : 'grid-cols-[minmax(min-content,1fr)]'
                }`}
              >
                <ListSide lines={linesA} />
                <SideScores
                  sets={sets}
                  side="A"
                  size="text-xl"
                  className="font-bold"
                  sideLabel={linesA.join(' and ')}
                  data-testid={`court-score-${courtId}-a`}
                />
                <ListSide lines={linesB} className="mt-1 border-t border-border pt-1" />
                <SideScores
                  sets={sets}
                  side="B"
                  size="text-xl"
                  className="mt-1 border-t border-transparent pt-1 font-bold"
                  sideLabel={linesB.join(' and ')}
                  data-testid={`court-score-${courtId}-b`}
                />
              </div>
              </div>
            ) : preview ? (
              <span className="min-w-0 text-muted-foreground" style={SIGNAGE_NAME_WRAP}>
                <span className="font-semibold uppercase tracking-wide text-foreground">
                  Next{matchEventLabel(preview) ? ` · ${matchEventLabel(preview)}` : ''}
                </span>{' '}
                {formatPlayers(preview.sideA, playerNames)} vs{' '}
                {formatPlayers(preview.sideB, playerNames)}
              </span>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The event identity of a shown match — "Men's Doubles 2" (D7).
 *
 * Muted secondary ink, no border, no background: it is context for the names
 * beside it, not a decorative badge, and it must never take size from the
 * court number or the players. Renders nothing when the match carries no
 * event, rather than a placeholder.
 */
function EventLine({
  courtId,
  label,
  className = '',
}: {
  courtId: number;
  label: string | null;
  className?: string;
}) {
  if (!label) return null;
  return (
    <span
      data-testid={`court-event-${courtId}`}
      className={`block break-words font-semibold uppercase tracking-[0.08em] text-muted-foreground ${className}`}
    >
      {label}
    </span>
  );
}

/** One side of a LIST-mode row: one line per participant, so a doubles pair
 *  reads as two names inside one group rather than a slash-joined string. */
function ListSide({ lines, className = '' }: { lines: string[]; className?: string }) {
  return (
    <span className={`min-w-0 font-medium leading-tight ${className}`} style={SIGNAGE_NAME_WRAP}>
      {lines.map((line, i) => (
        <span key={i} className="block" style={SIGNAGE_NAME_WRAP}>
          {line}
        </span>
      ))}
    </span>
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
  const scoreSize = resolveSignageScoreSize(cardHeightPx);
  // Disputed courts are suppressed, never arbitrated: picking one of two
  // claims would put a wrong match on the wall with full confidence.
  const suppressed = isClosed || !!conflictMatches?.length;
  const current = suppressed ? null : match;
  const sets = laneSets(suppressed ? null : state, tvShowScores);
  const linesA = current ? sideLines(current.sideA, playerNames) : [];
  const linesB = current ? sideLines(current.sideB, playerNames) : [];
  // The tier is derived from the card AND from the names on it: a word too
  // long for the column steps the whole card's names down one tier rather
  // than breaking (OPR-0908-10). Both sides step together — two name rows at
  // two sizes would read as a hierarchy the match does not have.
  const nameSize = resolveSignageNameSize(cardHeightPx, [...linesA, ...linesB]);
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

      {/* D7: which event this court is playing, directly under its number and
          above the names — always present for a shown match. */}
      <EventLine
        courtId={courtId}
        label={current ? matchEventLabel(current) : null}
        className="max-w-full text-center text-sm"
      />

      {current ? (
        /* P1 (contract rules 2-3): a court card is a STACKED layout, so each
           side owns its own aligned score column and the centred lane
           between the two sides is gone — at hall distance a number between
           two names belongs to neither. `SideScores` sizes its cells in
           `em`, so the columns stay aligned as the board scales the type.
           The hairline between the rows is the side boundary, stated
           without colour; the partner lines inside a side sit tighter than
           the gap that separates the two sides. */
        <div
          data-testid={`court-match-${courtId}`}
          // Two columns only while there IS a score to put in the second one
          // — see the list-mode note: an empty score column used to swallow
          // side B and halve the name column (OPR-0908-10).
          className={`grid w-full items-center gap-x-3 ${
            sets.length
              ? 'grid-cols-[minmax(min-content,1fr)_auto]'
              : 'grid-cols-[minmax(min-content,1fr)]'
          }`}
        >
          <SignageSide lines={linesA} nameSize={nameSize} />
          <SideScores
            sets={sets}
            side="A"
            size={scoreSize}
            className="font-bold"
            sideLabel={linesA.join(' and ')}
            data-testid={`court-score-${courtId}-a`}
          />
          <SignageSide lines={linesB} nameSize={nameSize} className="mt-1 border-t border-border pt-1" />
          <SideScores
            sets={sets}
            side="B"
            size={scoreSize}
            className="mt-1 border-t border-transparent pt-1 font-bold"
            sideLabel={linesB.join(' and ')}
            data-testid={`court-score-${courtId}-b`}
          />
        </div>
      ) : null}

      {preview ? (
        <div
          data-testid={`court-next-${courtId}`}
          className="flex flex-col items-center gap-0.5 text-center"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Next{matchEventLabel(preview) ? ` · ${matchEventLabel(preview)}` : ''}
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
 * sits in this side's OWN column beside it (P1 contract rules 2-3), never in
 * a centred lane between the two sides.
 */
function SignageSide({
  lines,
  nameSize,
  className = '',
}: {
  lines: string[];
  nameSize: string;
  className?: string;
}) {
  return (
    <span
      className={`${nameSize} w-full text-center font-semibold leading-tight text-foreground ${className}`}
      style={SIGNAGE_NAME_WRAP}
    >
      {lines.map((line, i) => (
        <span key={i} className="block" style={SIGNAGE_NAME_WRAP}>
          {line}
        </span>
      ))}
    </span>
  );
}
