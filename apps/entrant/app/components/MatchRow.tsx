/**
 * The ALIGNED match row (public refinement 2026-09-12): one match as one
 * line of a list, with its facts in fixed columns — when and where · event
 * and round · who · score or state — so a reader scans a schedule or a
 * played-matches list down the columns instead of reading a card grid.
 *
 * Same seams as `MatchCard`, deliberately: every name flows through
 * `PersonGroup`/`PersonRef` (the identity seam), the score through
 * `gameScore` (the positional score speller), the state through
 * `scheduleStateLabel`, the reference is the SHARED match reference the
 * wire spells. Nothing here decides a winner, invents a score or trims a
 * name: a doubles side is two stacked lines and the row grows with them
 * (no fixed row height), and every side keeps its own game cells on its
 * own line so a score always sits beside the side it belongs to.
 *
 * What the row says in its last column, in order of precedence:
 *   - an exceptional outcome (walkover · retired · cancelled · delayed)
 *     as a word, with the games where the wire carries them;
 *   - "On court" in the live tone for a live match WITH a published court
 *     (a courtless live record claims nothing, §4.2), beside whatever games
 *     or running points the wire carries — running scores are published
 *     only when the desk records them;
 *   - the games, one cell per PLAYED game (never padded), when there are any;
 *   - "Score not published" when the wire says publication is withheld;
 *   - nothing at all for a match still to play — its time is column one.
 *
 * `context` picks the first column: a schedule already states the day in
 * its heading, so `schedule` prints time and court; a player's own record
 * lists matches across days, so `player` prints the day above the time.
 */
import type { PersonReferenceDTO } from '../lib/person.types';
import type { PlayerMatchSideDTO } from '../lib/player.types';
import { eventCodeLabel, roundLabel } from '../lib/draws.types';
import { schedulePublicStateLabel, schedulePublicState, scheduleStateLabel } from '../lib/schedule.types';
import { gameScore, pairedScoreLine } from '../lib/score';
import { sideSummaryPhrase } from '../lib/side';
import { TEXT_HELPER, TEXT_SECONDARY } from '../lib/ui';
import type { MatchCardData } from './MatchCard';
import { PersonGroup } from './PersonGroup';

export type MatchRowContext = 'schedule' | 'player';

/** The row's grid, shared with a list's column header so the two align. */
export const MATCH_ROW_COLUMNS = 'md:grid-cols-[6.5rem_10rem_minmax(0,1fr)]';

function isExceptional(status: MatchCardData['status']): boolean {
  return status === 'walkover' || status === 'retired' || status === 'cancelled' || status === 'delayed';
}

function SideLine({
  side,
  index,
  score,
  liveScore,
  live,
  slug,
  highlightPersonId,
}: {
  side: PlayerMatchSideDTO;
  index: 0 | 1;
  score: number[][] | null;
  /** The running points of the game in play, shown only while no game has
   *  been recorded yet — one cell per side, in the live tone. */
  liveScore?: [number, number] | null;
  live: boolean;
  slug: string;
  highlightPersonId?: string | null;
}) {
  const games = score?.length ?? 0;
  const running = !games && live && liveScore ? liveScore[index] : null;
  const won = side.winner && !live;
  const highlighted = Boolean(
    highlightPersonId && side.persons.some((person: PersonReferenceDTO) => person.identity?.id === highlightPersonId),
  );
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className={`min-w-0 ${won ? 'font-[650] text-foreground' : 'text-foreground'} ${highlighted ? 'underline decoration-2 underline-offset-2' : ''}`}>
        {won ? <span className="sr-only">Winner: </span> : null}
        <PersonGroup
          slug={slug}
          persons={side.persons}
          state={won ? 'winner' : 'resolved'}
          label={side.placeholder}
          unresolved={side.unresolved}
          className="block min-w-0"
        />
      </div>
      {games ? (
        <span className="flex shrink-0 gap-1 tabular-nums">
          {Array.from({ length: games }, (_, game) => (
            <span key={game} className="inline-block w-7 text-right text-foreground">
              {/* Zero prints as 0; a blank cell keeps its width. */}
              {gameScore(score, game, index) ?? ''}
            </span>
          ))}
        </span>
      ) : running !== null ? (
        <span data-live-score className="inline-block w-7 shrink-0 text-right font-semibold tabular-nums text-status-live">
          {running}
        </span>
      ) : null}
    </div>
  );
}

export function MatchRow({
  match,
  slug,
  context = 'schedule',
  highlightPersonId,
  dayLabel,
}: {
  match: MatchCardData;
  slug: string;
  context?: MatchRowContext;
  highlightPersonId?: string | null;
  /** The day, for the `player` context (the schedule states it above). */
  dayLabel?: string | null;
}) {
  const live = match.status === 'live';
  const court = match.court !== null && match.court !== undefined ? `Court ${match.court}` : (match.courtLabel ?? null);
  const clock = match.scheduledTime ?? match.localTime ?? null;
  const games = match.score?.length ?? 0;
  const liveScore = live ? (match.liveScore ?? null) : null;
  const stateWord = scheduleStateLabel(match.status);
  const cue =
    match.outcomeReason === 'forfeit'
      ? 'Forfeit'
      : match.outcomeReason === 'retired'
        ? 'Retired'
        : match.outcomeReason === 'walkover'
          ? 'Walkover'
          : isExceptional(match.status)
            ? stateWord
            : null;
  // The last-column word, by the precedence in the module note. A live
  // match says "On court" only when a court is actually published (§4.2 —
  // a courtless live record makes no claim); a finished one lets its games
  // speak, and says "Score not published" only when the wire says so.
  const status = cue
    ? cue
    : live
      ? court
        ? 'On court'
        : null
      : games
        ? null
        : match.scoresPublished === false
          ? 'Score not published'
          : null;
  const title = match.roundLabel
    ? `${eventCodeLabel(match.eventCode)} · ${roundLabel(match.roundLabel) ?? match.roundLabel}`
    : eventCodeLabel(match.eventCode);
  const competitors = sideSummaryPhrase(slug, match.sides);
  const scoreLabel = games
    ? `Score ${pairedScoreLine(match.score)}`
    : liveScore
      ? `In play ${liveScore[0]}\u2013${liveScore[1]}`
      : null;
  const whenLine = clock ?? schedulePublicStateLabel(schedulePublicState({ scheduledTime: clock }));

  return (
    <li
      data-match-row
      data-match-live={live ? '' : undefined}
      aria-label={[title, competitors, scoreLabel, status].filter(Boolean).join(' · ')}
      className={`grid gap-x-4 gap-y-1 border-t border-rule-soft px-3 py-2.5 text-sm md:items-start ${MATCH_ROW_COLUMNS} ${live ? 'border-s-2 border-s-status-live' : ''}`}
    >
      {/* Column one: when and where. */}
      <div className="flex flex-wrap items-baseline gap-x-3 md:block">
        {context === 'player' && dayLabel ? (
          <span className={`block text-xs ${TEXT_SECONDARY}`}>{dayLabel}</span>
        ) : null}
        <span className={`tabular-nums ${TEXT_SECONDARY} ${clock ? 'font-medium text-foreground' : ''}`}>{whenLine}</span>
        {court ? <span className={`block ${TEXT_SECONDARY}`}>{court}</span> : null}
      </div>
      {/* Column two: event, round, and the shared reference. */}
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-[0.04em] ${TEXT_SECONDARY}`}>{title}</p>
        {match.reference ? <p className={`text-xs ${TEXT_HELPER}`}>{match.reference}</p> : null}
      </div>
      {/* Column three: the two sides, each with its own game cells, and the
          state word on the right where there are no games to show. */}
      <div className="grid min-w-0 gap-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid min-w-0 gap-0.5">
          <SideLine side={match.sides[0]} index={0} score={match.score} liveScore={liveScore} live={live} slug={slug} highlightPersonId={highlightPersonId} />
          <SideLine side={match.sides[1]} index={1} score={match.score} liveScore={liveScore} live={live} slug={slug} highlightPersonId={highlightPersonId} />
        </div>
        {status ? (
          <span className={`text-xs font-semibold ${live && !cue ? 'text-status-live' : TEXT_SECONDARY}`}>{status}</span>
        ) : null}
      </div>
    </li>
  );
}
