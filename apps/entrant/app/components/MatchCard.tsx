/**
 * Shared public match anatomy for player, list, round, schedule and bracket
 * views (ADR 0028): a header band naming event · round with the state word
 * on the right, two side rows, one score cell per PLAYED game (contract
 * §3.4 — the ledger never pads to a configured game count), and a footer of
 * reference · time · court · duration. Winners read by weight and by the
 * `sr-only` word "Winner"; there is no visible tick column.
 *
 * Contract §3.3 / V3-PE09.4: a routine live card carries no saturated fill.
 * The header stays the same plain treatment whether or not the match is on
 * court; only the state word's ink and the bracket-node's thin border
 * accent say "this one is live" — never a solid band repeating the same
 * fact a third time.
 *
 * **public-visual-fixes P3 — four changes, all of them about naming one
 * match once:**
 *
 * 1. The card and the node carry the SHARED match reference (`MS R32·11` /
 *    `R32·11`), the identical string the operator's match list shows,
 *    spelled server-side by `shared/match_reference.py` off the coordinates
 *    the console formats from. The bare `Match {position}` label is deleted:
 *    it was a per-surface renumbering that could not be used to talk to the
 *    desk. A caller picks WHICH spelling by what it puts in `reference` —
 *    the short form inside a single draw, the full one in a mixed-event
 *    schedule (§6.1).
 * 2. The compact line is `reference · time · court`, so a card names the
 *    match, when it plays and where in one place. A court is shown WHENEVER
 *    the wire carries one, in every grouping mode; a courtless record is
 *    never called "On court" (§4.2) — an absent court is an absent claim,
 *    not a quieter card.
 * 3. No game score carries emphasis, complete or in progress (§5.1 rule 6,
 *    §3.4): the winner is carried by the winning side's NAME and by the
 *    authoritative outcome behind `side.winner`, never by counting games.
 * 4. An exceptional outcome (walkover, retirement, cancellation) reads as a
 *    small LEADING cue rather than a second trailing status word, and the
 *    routine words the surrounding context already states are dropped.
 */
import type { PersonReferenceDTO } from '../lib/person.types';
import type { PlayerMatchDTO, PlayerMatchSideDTO } from '../lib/player.types';
import { eventCodeLabel, roundLabel } from '../lib/draws.types';
import { schedulePublicState, schedulePublicStateLabel, scheduleStateLabel } from '../lib/schedule.types';
import { labelledClock } from '../lib/format';
import { gameScore, pairedScoreLine } from '../lib/score';
import { sideSummaryPhrase } from '../lib/side';
import { LIST_CARD, TEXT_HELPER, TEXT_SECONDARY } from '../lib/ui';
import { PersonGroup } from './PersonGroup';
import { personRefModel } from '../../public/assets/person-ref.js';

export type MatchCardData = PlayerMatchDTO & {
  playedOn?: string | null;
  localTime?: string | null;
  courtLabel?: string | null;
  sourceUrl?: string | null;
  sourceRef?: string | null;
};

export type MatchCardVariant = 'card' | 'canvas' | 'bracket-node';

/**
 * The match states that deserve a cue at all (contract §3.3, §4.2). Anything
 * else is furniture: "Scheduled" repeats the time already on the card,
 * "Completed" repeats the score, and a card in a "Live now" band has already
 * been told it is live by the band.
 */
function isExceptionalState(status: MatchCardData['status']): boolean {
  return (
    status === 'walkover' ||
    status === 'retired' ||
    status === 'cancelled' ||
    status === 'delayed'
  );
}

function references(side: PlayerMatchSideDTO): PersonReferenceDTO[] {
  return side.persons;
}

function SidePeople({ side, slug, compact = false, highlightPersonId, highlightPersonName }: { side: PlayerMatchSideDTO; slug?: string; compact?: boolean; highlightPersonId?: string | null; highlightPersonName?: string | null }) {
  const highlighted = Boolean((highlightPersonId && side.persons.some((person) => person.identity?.id === highlightPersonId)) || (highlightPersonName && side.persons.some((person) => personRefModel({ slug: slug ?? '', identity: person.identity, state: person.resolution, label: person.label }).text.toLocaleLowerCase().includes(highlightPersonName.toLocaleLowerCase()))));
  return <PersonGroup
    slug={slug ?? ''}
    persons={references(side)}
    state={side.winner ? 'winner' : 'resolved'}
    label={side.placeholder}
    unresolved={side.unresolved}
    className={`${compact ? 'block min-w-0 whitespace-normal break-words leading-tight' : 'block min-w-0'} ${highlighted ? 'font-semibold underline decoration-2 underline-offset-2' : ''}`}
  />;
}

function Side({ side, score, index, slug, compact = false, live = false, first = false, showGames = true, highlightPersonId, highlightPersonName }: { side: PlayerMatchSideDTO; score: number[][] | null; index: 0 | 1; slug?: string; compact?: boolean; live?: boolean; first?: boolean; showGames?: boolean; highlightPersonId?: string | null; highlightPersonName?: string | null }) {
  // Contract §3.4: never padded to the configured game count — the ledger
  // has exactly as many columns as there are recorded games, in every
  // renderer, and NO columns (an absent container, not an empty one) when
  // there are none.
  const gameColumns = showGames ? (score?.length ?? 0) : 0;
  const seed = side.seed ?? null;
  // §4.2/§4.3: the seed sits in the row's own trailing cell, beside the side
  // it belongs to, rather than on a line of its own under the last partner.
  const columns = [
    'minmax(0,1fr)',
    seed !== null ? 'auto' : '',
    gameColumns ? `repeat(${gameColumns}, ${compact ? '1.8rem' : '2.5rem'})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const won = side.winner && !live;
  return (
    <div
      className={`grid min-w-0 items-stretch ${compact ? 'min-h-[22px] text-sm' : 'min-h-10 text-sm'} ${first ? '' : 'border-t border-rule-soft'}`}
      style={{ gridTemplateColumns: columns }}
    >
      <div className={`flex min-w-0 items-center ${compact ? 'px-2 py-0.5' : 'px-4 py-2'} ${won ? 'font-[650] text-foreground' : 'text-foreground'}`}>
        {won ? (
          <span className="sr-only">{compact ? 'Winner advancing: ' : 'Winner: '}</span>
        ) : null}
        <SidePeople side={side} slug={slug} compact={compact} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      </div>
      {seed !== null ? (
        <span className={`flex items-center justify-end tabular-nums ${TEXT_HELPER} ${compact ? 'pe-2 text-xs' : 'pe-2 text-xs'}`}>
          [{seed}]
        </span>
      ) : null}
      {gameColumns
        ? Array.from({ length: gameColumns }, (_, set) => (
            <span
              key={set}
              // §3.4/§5.1 rule 6: no game score is ever emphasised — not for
              // a completed game, not for the winning side. `game.winner`
              // drives no ink anywhere on this tier.
              className="grid place-items-center border-s border-rule-soft tabular-nums text-foreground"
            >
              {/* Zero, missing and not-started are three different facts
                  (P1 rule 7): `0` prints as `0`, a game the wire left blank
                  prints nothing in a cell that keeps its width, and a match
                  with no games renders no cells at all. */}
              {gameScore(score, set, index) ?? ''}
            </span>
          ))
        : null}
    </div>
  );
}

export function MatchCard({ match, variant = 'card', slug, highlightPersonId, highlightPersonName, compactList = false }: { match: MatchCardData; variant?: MatchCardVariant; slug?: string; highlightPersonId?: string | null; highlightPersonName?: string | null; compactList?: boolean }) {
  const live = match.status === 'live' || Boolean((match as MatchCardData & { live?: boolean }).live);
  // §4.2 (P3): the approved court is published whenever the wire carries
  // one — including in "By time" mode, where omitting it was not quieter,
  // it was wrong. A court that is absent, withheld or disputed renders
  // nothing at all rather than a placeholder line (§3.2).
  // P7 (operator/public parity): the APPROVED court wins. `courtLabel` is the
  // imported source record's court — provenance, not the published schedule —
  // and preferring it published a stale court for every live match, so the
  // draw said "Court 8" while the desk, the operator console and the public
  // schedule all said "Court 1". It survives only as the fallback for a
  // historical record that has no operational court at all.
  const court = match.court !== null && match.court !== undefined ? `Court ${match.court}` : (match.courtLabel ?? null);
  // Contract §3.2: a missing value is OMITTED, never a placeholder apology.
  // A missing time reads as the one honest schedule-state word instead of
  // a blank line; a missing court line disappears entirely.
  const footer = [
    match.reference ?? null,
    match.playedOn ?? null,
    // P2: a bare `10:30` on a finished card reads as when the match
    // STARTED. The public wire carries only the approved venue-local slot,
    // so the card says which clock it is — `Scheduled 10:30` — through the
    // tier's one formatter, and falls back to the honest schedule-state
    // word when there is no approved time at all.
    // P7: same rule as the court above — the approved slot time is the
    // schedule; `localTime` is the source record's clock and is the fallback.
    labelledClock('scheduled', match.scheduledTime ?? match.localTime) ??
      schedulePublicStateLabel(schedulePublicState(match)),
    court,
    match.durationMinutes ? `${match.durationMinutes} min` : null,
  ].filter(Boolean);
  const title = match.roundLabel ? `${eventCodeLabel(match.eventCode)} · ${roundLabel(match.roundLabel) ?? match.roundLabel}` : eventCodeLabel(match.eventCode);
  // Contract §6.1 D14: the one accessible inline phrase — built from the
  // structured sides via the shared authority, never from
  // `persons.map(...).join(' / ')`.
  const competitors = sideSummaryPhrase(slug ?? '', match.sides);
  // Contract §2.3/§2.4: "Score not published" is a claim about PUBLICATION,
  // and a null score alone does not support it — an unplayed match has no
  // score either. Before the wire carried `scoresPublished` (v3 package 29,
  // V3-11-3) every future match on the calendar was announced as withheld.
  // Withheld says so; not-yet-played omits the term entirely (§2.4).
  const scoreLabel = match.score?.length
    ? `Score ${pairedScoreLine(match.score)}`
    : match.scoresPublished === false
      ? 'Score not published'
      : null;
  // The tier's one match-state speller (contract §2.3) — ``null`` when the
  // status is unrecognised, in which case no state chip renders (§2.2).
  const stateLabel = scheduleStateLabel(match.status);
  const showSourceLink = Boolean(
    match.sourceUrl &&
    match.sourceRef &&
    !match.sourceRef.startsWith('demo-generated:'),
  );

  // Contract §2.1: a match on court says "On court"; "Live now" is a section
  // word only. §4.2 (P3): a match with NO approved court is never described
  // as being on one — the honest answer to "which court?" is silence, and a
  // claim built on the missing value would be worse than no claim.
  // ...and "Scheduled" is not a chip at all (§4.2 "must never show: a
  // 'Scheduled' chip over a card with no approved time"). The schedule
  // domain's own answer — the approved time, or "Time to be confirmed" — is
  // already on the compact line and is the more precise of the two; a chip
  // beside it repeats one fact in two vocabularies (§3.3).
  const stateWord =
    match.status === 'scheduled' || (live && court === null) ? null : stateLabel;
  // §4.2 (P3): a small LEADING cue for the states a reader must not miss,
  // instead of a trailing word on every card repeating what the time, the
  // score or the section heading already said.
  const cue = isExceptionalState(match.status) ? stateLabel : null;
  const reference = match.reference ?? null;

  if (variant === 'bracket-node') {
    // §4.3 (public-visual-fixes P4): the node has NO height of its own —
    // the withdrawn `min-h-[58px]` was a constant chosen for a singles pair,
    // and a doubles side is two person lines at the 14px floor. Height comes
    // from the tallest rendered side; the column owns the width, so the node
    // fills it rather than carrying a second, conflicting `w-72`.
    // **Operator/public remediation P1 supersedes public-visual-fixes P4
    // here.** The node's one right-aligned paired lane is withdrawn: a
    // bracket node is a STACKED layout, so each side carries its own
    // aligned game-score column and the number beside a name belongs to
    // that name. The compact columns are 1.8rem each, so even a
    // best-of-three beside two doubles pairs costs 5.4rem of a node that
    // takes its width from the column.
    const header = [cue, reference].filter(Boolean).join(' ');
    return (
      <article data-testid="public-bracket-node" data-match-variant="bracket-node" className={`grid w-full min-w-0 grid-rows-[auto_auto_auto] rounded-sm border border-rule-soft bg-surface-raised ${live ? 'border-s-2 border-s-status-live' : ''}`} aria-label={[title, competitors, scoreLabel, stateWord].filter(Boolean).join(' · ')}>
        {header ? (
          <p className={`flex items-baseline justify-between gap-2 border-b border-rule-soft px-2 py-0.5 text-xs ${TEXT_SECONDARY}`}>
            <span className="font-semibold uppercase tracking-[0.04em]">{header}</span>
          </p>
        ) : (
          <p aria-hidden className="h-0" />
        )}
        <Side side={match.sides[0]} score={match.score} index={0} slug={slug} compact live={live} first highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
        <Side side={match.sides[1]} score={match.score} index={1} slug={slug} compact live={live} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      </article>
    );
  }

  const card = variant === 'card';
  return (
    // v3-consolidated work package 26b: `min-w-0`. `MatchCard` is
    // frequently a direct CSS Grid item (`schedule.tsx`'s "Live now" and
    // by-time/by-court groupings, `md:grid-cols-2`) with no explicit
    // column width below `md:` — same implicit-grid-track mechanism as
    // `SeasonCalendar.tsx`/`tournament.tsx` in this package: a grid item
    // defaults to `min-width: auto`, and a long unbroken side name at
    // 200% text zoom measurably forced the shared column past the
    // viewport (plan §6 "Responsive/signage"). The grid CONTAINERS
    // already got `min-w-0` alongside this; this is the item-side half —
    // both are needed, since a container's `min-w-0` governs how IT
    // shrinks as a grid item of ITS OWN parent, not how ITS children
    // contribute to ITS track sizing.
    <article data-match-variant={variant} className={`min-w-0 ${card ? LIST_CARD : 'border border-rule-soft bg-surface-raised'}`}>
      {compactList ? (
        cue || reference || stateWord ? (
          <div className={`flex items-center justify-between gap-2 border-b border-rule-soft px-3 py-1 text-xs font-semibold ${TEXT_SECONDARY}`}>
            <span>{[cue, reference].filter(Boolean).join(' ')}</span>
            <span className={live ? 'text-status-live' : ''}>{cue ? null : stateWord}</span>
          </div>
        ) : null
      ) : (
        <header
          className={`flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2 ${TEXT_SECONDARY} ${card ? 'rounded-t-lg' : ''}`}
        >
          <p className="flex min-w-0 items-baseline gap-2 text-xs font-bold uppercase tracking-[0.06em]">
            {cue ? <span className="font-semibold normal-case tracking-normal text-foreground">{cue}</span> : null}
            <span>{title}</span>
          </p>
          {!cue && stateWord ? <span className={`text-xs font-semibold ${live ? 'text-status-live' : ''}`}>{stateWord}</span> : null}
        </header>
      )}
      <Side side={match.sides[0]} score={match.score} index={0} slug={slug} live={live} first highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      <Side side={match.sides[1]} score={match.score} index={1} slug={slug} live={live} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      {footer.length || showSourceLink ? (
        <footer className={`border-t border-rule-soft px-4 py-1.5 text-xs ${TEXT_SECONDARY}`}>
          {footer.join(' · ')}
          {showSourceLink ? <>{footer.length ? <span aria-hidden> · </span> : null}<a href={match.sourceUrl!} className="font-medium text-accent underline-offset-4 hover:underline">Match source</a></> : null}
        </footer>
      ) : null}
    </article>
  );
}
