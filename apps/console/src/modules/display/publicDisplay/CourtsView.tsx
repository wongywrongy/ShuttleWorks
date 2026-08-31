/**
 * Public Display — Courts view (current/called match on each court).
 *
 * Three render modes selected by `displayMode`:
 *
 *   • 'list'        — compact rows, one per court. Best for 16+ courts on
 *                     1080p TVs; trades the giant court-number for one-line
 *                     scannability.
 *   • 'auto'        — N-column grid whose column count is derived from the
 *                     BOARD's shape and the court count, paginating rather
 *                     than shrinking past the legibility floor (TV-6).
 *   • 'grid'        — the same card grid at the director's own column count.
 *
 * Auto and Grid share the card render and differ only in who chose the
 * column count; the retired 'strip' mode was this same render in a single
 * flex column, and stored values map to 'auto' before they reach here.
 * Every mode uses the same status tint tokens.
 */
import type { TournamentConfig, MatchDTO, MatchStateDTO } from '../../../api/dto';
import { formatElapsed } from '../../../lib/timeFormatters';
import { sideSurnameLine } from '../../../lib/names';
import { STATE_WORD } from '../../../lib/stateWords';
import { formatPlayers, isCourtClosedNow } from './helpers';
import {
  formatMatchIdentity,
  meetMatchIdentityFromStored,
} from '../../../platform/domain/matchIdentity';

type CourtStatus = 'active' | 'called' | 'empty';
type CourtDisplayMode = 'list' | 'auto' | 'grid';

interface CourtRow {
  courtId: number;
  match: MatchDTO | null;
  state: MatchStateDTO | null;
  status: CourtStatus;
  /** When status === 'empty': the Next-lane assignment on this court (if
   *  any). `nextStartTime` is a de-emphasized PLANNED clock — never the
   *  primary label (that's the relative "Next" lane itself). */
  nextMatch?: MatchDTO | null;
  nextStartTime?: string;
  /** When status === 'empty': the Later-lane assignment (the one after
   *  Next), same de-emphasized-clock treatment. */
  laterMatch?: MatchDTO | null;
  laterStartTime?: string;
}

interface CourtsViewProps {
  courts: CourtRow[];
  config: TournamentConfig;
  now: Date;
  displayMode: CourtDisplayMode;
  /** Pre-computed Tailwind grid-cols class for grid mode. */
  gridColsClass: string;
  /** Card height in pixels for strip/grid mode. */
  cardHeightPx: number;
  /** Tailwind padding-x class for strip/grid cards (size-tier sensitive). */
  cardPadX: string;
  /** Court-number type-scale class for strip/grid cards. */
  courtNumSize: string;
  /** Event-code type-scale class for strip/grid cards. */
  eventCodeSize: string;
  /** Players type-scale class for strip/grid cards. */
  playerSize: string;
  /** Brand accent hex (TV theme override). */
  tvAccent: string;
  /** Whether to show aggregate scores anywhere. */
  tvShowScores: boolean;
  /** Fullscreen modifier — bumps inner sizing on the bigger surface. */
  isFullscreen: boolean;
  /** Pre-built playerId → name lookup. */
  playerNames: Map<string, string>;
}

function getMatchCode(match: MatchDTO): string {
  const identity = meetMatchIdentityFromStored({
    event_rank: match.eventRank,
    sequence: match.matchNumber ?? null,
  });
  return formatMatchIdentity(identity, match.id) || '?';
}

export function CourtsView(props: CourtsViewProps) {
  return props.displayMode === 'list' ? (
    <CourtsListMode {...props} />
  ) : (
    <CourtsCardMode {...props} />
  );
}

function CourtsListMode({ courts, config, now, tvShowScores, playerNames }: CourtsViewProps) {
  return (
    <div className="flex w-full flex-col divide-y divide-border rounded-sm border border-border bg-card/40">
      {courts.map(({ courtId, match, state, status, nextMatch, nextStartTime, laterMatch, laterStartTime }) => {
        const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
        const aggregate = state?.score ? `${state.score.sideA}–${state.score.sideB}` : null;
        const sideA = match ? formatPlayers(match.sideA, playerNames) : '';
        const sideB = match ? formatPlayers(match.sideB, playerNames) : '';
        const isClosed = isCourtClosedNow(config, courtId, now);
        // Row tint carries status — replaces the banned left-stripe accent.
        const rowTintClass =
          status === 'active'
            ? 'bg-status-live-bg/60'
            : status === 'called'
              ? 'bg-status-called-bg/50'
              : '';
        return (
          <div
            key={courtId}
            // `min-h`, not `h`: the players cell wraps rather than
            // ellipsising, so a long doubles pairing makes the row taller
            // instead of hiding a surname from the far side of the hall.
            className={`grid min-h-[3.5rem] items-center gap-3 px-4 text-base text-foreground grid-cols-[3rem_3.5rem_1fr_5rem_5.5rem] ${rowTintClass} ${
              isClosed ? 'opacity-50' : ''
            }`}
          >
            <span
              className={`tabular-nums text-2xl font-bold ${isClosed ? 'line-through text-muted-foreground' : ''}`}
            >
              {courtId}
            </span>
            <span className="tabular-nums text-base font-semibold text-muted-foreground">
              {isClosed ? '–' : match ? getMatchCode(match) : '–'}
            </span>
            <span className="min-w-0 break-words">
              {isClosed ? (
                <span className="uppercase tracking-wider text-muted-foreground">Court closed</span>
              ) : match ? (
                <>
                  <span className="font-medium">{sideA}</span>
                  <span className="px-2 text-muted-foreground">vs</span>
                  <span className="font-medium">{sideB}</span>
                </>
              ) : nextMatch ? (
                <span className="text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide text-foreground/80">
                    Next
                  </span>{' '}
                  {formatPlayers(nextMatch.sideA, playerNames)} vs{' '}
                  {formatPlayers(nextMatch.sideB, playerNames)}
                  {/* De-emphasized PLANNED clock — never the primary label,
                      and never shown at all on the live "Now" court above. */}
                  {nextStartTime && (
                    <span className="text-2xs text-muted-foreground"> ~{nextStartTime}</span>
                  )}
                  {laterMatch && (
                    <span className="text-2xs text-muted-foreground">
                      {'  ·  Later '}
                      {formatPlayers(laterMatch.sideA, playerNames)} vs{' '}
                      {formatPlayers(laterMatch.sideB, playerNames)}
                      {laterStartTime ? ` ~${laterStartTime}` : ''}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Available</span>
              )}
            </span>
            <span className="tabular-nums text-right font-semibold">
              {tvShowScores ? (aggregate ?? '') : ''}
            </span>
            <span className="tabular-nums text-right text-muted-foreground">{elapsed ?? ''}</span>
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
  playerSize,
  tvShowScores,
  isFullscreen,
  playerNames,
}: CourtsViewProps) {
  return (
    <div
      className={`w-full ${displayMode === 'list' ? 'flex flex-col gap-2' : `grid gap-3 ${gridColsClass}`}`}
      // `minmax(h, auto)`, not a fixed track: the card height is the DESIGNED
      // height, not a cap. A doubles pairing too long for one line grows its
      // row instead of being clipped by the card — nothing on a hall board is
      // readable at half a name.
      style={displayMode === 'list' ? undefined : { gridAutoRows: `minmax(${cardHeightPx}px, auto)` }}
    >
      {courts.map((row, idx) => (
        <CourtCard
          key={row.courtId}
          row={row}
          idx={idx}
          isClosed={isCourtClosedNow(config, row.courtId, now)}
          cardHeightPx={cardHeightPx}
          cardPadX={cardPadX}
          playerSize={playerSize}
          tvShowScores={tvShowScores}
          isFullscreen={isFullscreen}
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
  playerSize: string;
  tvShowScores: boolean;
  isFullscreen: boolean;
  playerNames: Map<string, string>;
}

/**
 * The Console board card (2026-08-13): a colored condition BAND heads the
 * card ("COURT 2 · WD2 | LIVE · 0:21"), the body stacks each player on a
 * line (BWF presentation) with per-set score columns on the right — the
 * won set's number reads in the live hue, the current set in full ink.
 * The Next/Later idle-court lanes and the closed-court state are unchanged
 * behavior under the new skin. Live/called bands use the AA-proven status
 * tokens (an arbitrary `tvAccent` hex cannot promise readable ink).
 */
function CourtCard({
  row,
  idx,
  isClosed,
  cardHeightPx,
  cardPadX,
  playerSize,
  tvShowScores,
  isFullscreen,
  playerNames,
}: CourtCardProps) {
  const { courtId, match, state, status, nextMatch, nextStartTime, laterMatch, laterStartTime } = row;
  const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
  const code = match ? getMatchCode(match) : null;
  const sets = tvShowScores && status === 'active' ? state?.sets ?? [] : [];
  // No per-set breakdown but an aggregate exists → show it as one score
  // column per side, so a score-carrying match never renders scoreless.
  const scoresA = sets.length > 0 ? sets.map((s) => s.sideA)
    : tvShowScores && status === 'active' && state?.score ? [state.score.sideA] : [];
  const scoresB = sets.length > 0 ? sets.map((s) => s.sideB)
    : tvShowScores && status === 'active' && state?.score ? [state.score.sideB] : [];

  const band = isClosed
    ? { cls: 'bg-muted text-muted-foreground', word: STATE_WORD.closed }
    : status === 'active'
      ? {
          cls: 'bg-status-live-solid text-status-live-ink',
          word: elapsed ? `${STATE_WORD.live} · ${elapsed}` : STATE_WORD.live,
        }
      : status === 'called'
        ? { cls: 'bg-status-called-solid text-status-called-ink', word: STATE_WORD.called }
        : { cls: 'bg-muted text-muted-foreground', word: STATE_WORD.free };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded border border-border bg-card sw-float-in ${
        isClosed ? 'opacity-60' : ''
      } ${status === 'empty' && !isClosed ? 'border-dashed' : ''}`}
      style={{
        minHeight: cardHeightPx,
        // Staggered entry — each tile arrives 60 ms after the previous
        // so the grid doesn't flash on every poll. (Cards are keyed by
        // courtId, so this fires on arrival, not on every poll.)
        animationDelay: `${idx * 60}ms`,
      }}
    >
      <div
        className={`flex items-center justify-between gap-2 whitespace-nowrap ${cardPadX} ${
          isFullscreen ? 'py-2 text-base' : 'py-1.5 text-xs'
        } font-extrabold uppercase tracking-[0.06em] ${band.cls}`}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span>Court {courtId}</span>
          {code ? <span className="sw-num opacity-90">{code}</span> : null}
        </span>
        <span className="sw-num">{band.word}</span>
      </div>

      <div className={`flex flex-1 flex-col justify-center gap-1 ${cardPadX} py-2`}>
        {isClosed ? (
          <span className={`${playerSize} uppercase tracking-wider text-muted-foreground`}>
            Court closed
          </span>
        ) : match ? (
          <>
            <SideScoreRow
              name={sideSurnameLine(formatPlayers(match.sideA, playerNames), ' & ')}
              scores={scoresA}
              others={scoresB}
              playerSize={playerSize}
            />
            <SideScoreRow
              name={sideSurnameLine(formatPlayers(match.sideB, playerNames), ' & ')}
              scores={scoresB}
              others={scoresA}
              playerSize={playerSize}
            />
            {/* What this court does NEXT, on the card itself (TV-3). The ETA
                was already derived and already shown on FREE cards; a
                spectator watching an occupied court is the one who most wants
                it. Client-side from the schedule the projection already
                ships — no new field, no new route. */}
            {nextMatch ? (
              <span className="text-2xs uppercase tracking-[0.06em] text-muted-foreground sw-num">
                next: {getMatchCode(nextMatch)}
                {nextStartTime ? ` ~${nextStartTime}` : ''}
              </span>
            ) : null}
          </>
        ) : nextMatch ? (
          <NextUp
            nextStartTime={nextStartTime}
            nextSideA={formatPlayers(nextMatch.sideA, playerNames)}
            nextSideB={formatPlayers(nextMatch.sideB, playerNames)}
            laterStartTime={laterStartTime}
            laterSideA={laterMatch ? formatPlayers(laterMatch.sideA, playerNames) : undefined}
            laterSideB={laterMatch ? formatPlayers(laterMatch.sideB, playerNames) : undefined}
            isFullscreen={isFullscreen}
          />
        ) : (
          <span className={`${playerSize} text-muted-foreground`}>court free</span>
        )}
      </div>
    </div>
  );
}

/**
 * One side of the board card: a single line of surnames with the side's
 * per-set scores right-aligned (TV-1). A decided set's winning number takes
 * the live hue; the set in progress (the last one) stays full ink.
 *
 * The score columns are the DOMINANT element (TV-2 / ruling R-C): two rows of
 * them own roughly 38% of the card's height budget, sized a step and a half
 * above the names, because a score is the one thing a spectator crosses a
 * hall to read. The slot renders empty today for meet matches — the wire
 * carries no per-set data and there is no live score entry in the domain — and
 * it is laid out anyway, so a future score-relay app lights it up without
 * redesigning the card.
 */
function SideScoreRow({
  name,
  scores,
  others,
  playerSize,
}: {
  name: string;
  scores: number[];
  others: number[];
  playerSize: string;
}) {
  const last = scores.length - 1;
  return (
    <div className="flex min-h-[30px] items-center gap-2">
      <span
        className={`${playerSize} min-w-0 flex-1 break-words font-semibold leading-tight text-foreground`}
      >
        {name}
      </span>
      {/* Reserved even when empty — the lane is part of the card, not a
          conditional. Two of these stack to the score block's budget. */}
      <span className="flex shrink-0 items-center gap-1.5">
        {scores.length === 0 ? <span aria-hidden className="w-9" /> : null}
        {scores.map((v, i) => (
          <span
            key={i}
            title={`Set ${i + 1}`}
            className={`w-9 shrink-0 text-right text-3xl font-bold leading-none tabular-nums ${
              i === last
                ? 'text-foreground'
                : v > (others[i] ?? 0)
                  ? 'text-status-live'
                  : 'text-muted-foreground'
            }`}
          >
            {v}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * Idle-court preview — the Next/Later lanes (task 8). The relative label
 * ("Next" / "Later") is the PRIMARY text; the planned clock is a small,
 * de-emphasized "~time" suffix, never the headline (that was the drifting
 * wall-clock bug this replaces). Later renders only when a second upcoming
 * match exists on this court, and is visually quieter than Next.
 */
function NextUp({
  nextStartTime,
  nextSideA,
  nextSideB,
  laterStartTime,
  laterSideA,
  laterSideB,
  isFullscreen,
}: {
  nextStartTime?: string;
  nextSideA: string;
  nextSideB: string;
  laterStartTime?: string;
  laterSideA?: string;
  laterSideB?: string;
  isFullscreen: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-muted-foreground">
      <div className="flex flex-col gap-0.5">
        <span
          className={`${isFullscreen ? 'text-xs' : 'text-2xs'} font-semibold uppercase tracking-[0.08em]`}
        >
          Next
          {nextStartTime && (
            <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
              ~{nextStartTime}
            </span>
          )}
        </span>
        <span
          className={`${isFullscreen ? 'text-2xl' : 'text-base'} font-medium text-foreground`}
        >
          {nextSideA} <span className="text-muted-foreground">vs</span> {nextSideB}
        </span>
      </div>
      {laterSideA && laterSideB && (
        <div className="flex flex-col gap-0.5 opacity-70">
          <span
            className={`${isFullscreen ? 'text-2xs' : 'text-3xs'} font-semibold uppercase tracking-[0.08em]`}
          >
            Later
            {laterStartTime && (
              <span className="ml-1 font-normal normal-case tracking-normal">
                ~{laterStartTime}
              </span>
            )}
          </span>
          <span className={`${isFullscreen ? 'text-lg' : 'text-sm'} font-medium`}>
            {laterSideA} <span>vs</span> {laterSideB}
          </span>
        </div>
      )}
    </div>
  );
}
