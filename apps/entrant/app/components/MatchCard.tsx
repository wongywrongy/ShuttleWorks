/**
 * Shared public match anatomy for player, list, round, schedule and bracket
 * views (ADR 0028): a header band naming event · round with the state word
 * on the right, two side rows, one score cell per PLAYED game (contract
 * §3.4 — the ledger never pads to a configured game count), and a footer of
 * time · court · duration. Winners read by weight and by the `sr-only` word
 * "Winner"; there is no visible tick column.
 *
 * Contract §3.3 / V3-PE09.4: a routine live card carries no saturated fill.
 * The header stays the same plain treatment whether or not the match is on
 * court; only the state word's ink and the bracket-node's thin border
 * accent say "this one is live" — never a solid band repeating the same
 * fact a third time.
 */
import type { PersonReferenceDTO } from '../lib/person.types';
import type { PlayerMatchDTO, PlayerMatchSideDTO } from '../lib/player.types';
import { eventCodeLabel, roundLabel } from '../lib/draws.types';
import { schedulePublicState, schedulePublicStateLabel, scheduleStateLabel } from '../lib/schedule.types';
import { sideSummaryPhrase } from '../lib/side';
import { LIST_CARD } from '../lib/ui';
import { PersonGroup } from './PersonGroup';
import { personRefModel } from '../../public/assets/person-ref.js';

export type MatchCardData = PlayerMatchDTO & {
  playedOn?: string | null;
  localTime?: string | null;
  courtLabel?: string | null;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  /**
   * The node's 1-based position within its round (contract §3.6/§4.3,
   * V3-PE10.1) — already on the wire as `MatchNodeDTO.position`. Rendered
   * as a small visible reference so a "Winner of {reference}" placeholder
   * elsewhere in the tree resolves to a labelled source node without
   * counting rows.
   */
  matchNumber?: number | null;
};

export type MatchCardVariant = 'card' | 'canvas' | 'bracket-node';

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
    seed={side.seed}
    className={`${compact ? 'block min-w-0 whitespace-normal break-words leading-tight' : 'block min-w-0'} ${highlighted ? 'font-semibold underline decoration-2 underline-offset-2' : ''}`}
  />;
}

function Side({ side, score, index, slug, compact = false, live = false, first = false, highlightPersonId, highlightPersonName }: { side: PlayerMatchSideDTO; score: number[][] | null; index: 0 | 1; slug?: string; compact?: boolean; live?: boolean; first?: boolean; highlightPersonId?: string | null; highlightPersonName?: string | null }) {
  // Contract §3.4: never padded to the configured game count — the ledger
  // has exactly as many columns as there are recorded games, in every
  // renderer, and NO columns (an absent container, not an empty one) when
  // there are none.
  const gameColumns = score?.length ?? 0;
  const columns = gameColumns
    ? `minmax(0,1fr) repeat(${gameColumns}, ${compact ? '1.8rem' : '2.5rem'})`
    : 'minmax(0,1fr)';
  const won = side.winner && !live;
  return (
    <div
      className={`grid min-w-0 items-stretch ${compact ? 'min-h-[22px] text-xs' : 'min-h-10 text-sm'} ${first ? '' : 'border-t border-rule-soft'}`}
      style={{ gridTemplateColumns: columns }}
    >
      <div className={`flex min-w-0 items-center ${compact ? 'px-2' : 'px-4 py-2'} ${won ? 'font-[650] text-foreground' : 'text-foreground'}`}>
        {won ? (
          <span className="sr-only">{compact ? 'Winner advancing: ' : 'Winner: '}</span>
        ) : null}
        <SidePeople side={side} slug={slug} compact={compact} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      </div>
      {gameColumns
        ? Array.from({ length: gameColumns }, (_, set) => (
            <span
              key={set}
              className={`grid place-items-center border-s border-rule-soft tabular-nums ${compact ? '' : 'font-semibold'} ${side.winner ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {score?.[set]?.[index] ?? ''}
            </span>
          ))
        : null}
    </div>
  );
}

export function MatchCard({ match, variant = 'card', slug, highlightPersonId, highlightPersonName, compactList = false }: { match: MatchCardData; variant?: MatchCardVariant; slug?: string; highlightPersonId?: string | null; highlightPersonName?: string | null; compactList?: boolean }) {
  // Contract §3.2: a missing value is OMITTED, never a placeholder apology.
  // A missing time reads as the one honest schedule-state word instead of
  // a blank line; a missing court line disappears entirely.
  const footer = [
    match.playedOn ?? null,
    match.localTime ??
      match.scheduledTime ??
      schedulePublicStateLabel(schedulePublicState(match)),
    match.courtLabel ?? (match.court !== null ? `Court ${match.court}` : null),
    match.durationMinutes ? `${match.durationMinutes} min` : null,
  ].filter(Boolean);
  const live = match.status === 'live' || Boolean((match as MatchCardData & { live?: boolean }).live);
  const title = match.roundLabel ? `${eventCodeLabel(match.eventCode)} · ${roundLabel(match.roundLabel) ?? match.roundLabel}` : eventCodeLabel(match.eventCode);
  // Contract §6.1 D14: the one accessible inline phrase — built from the
  // structured sides via the shared authority, never from
  // `persons.map(...).join(' / ')`.
  const competitors = sideSummaryPhrase(slug ?? '', match.sides);
  const scoreLabel = match.score?.length
    ? `Score ${match.score.map((game) => game.join('-')).join(', ')}`
    : 'Score not published';
  // The tier's one match-state speller (contract §2.3) — ``null`` when the
  // status is unrecognised, in which case no state chip renders (§2.2).
  const stateLabel = scheduleStateLabel(match.status);
  const showSourceLink = Boolean(
    match.sourceUrl &&
    match.sourceRef &&
    !match.sourceRef.startsWith('demo-generated:'),
  );

  // Contract §2.1: a match on court says "On court"; "Live now" is a section word only.
  const stateWord = stateLabel;
  const matchNumber = match.matchNumber ?? null;
  const matchNumberLabel = matchNumber !== null ? `Match ${matchNumber}` : null;

  if (variant === 'bracket-node') {
    return (
      <article data-testid="public-bracket-node" data-match-variant="bracket-node" className={`grid min-h-[58px] w-72 grid-rows-[auto_auto_auto] rounded-sm border border-rule-soft bg-surface-raised ${live ? 'border-s-2 border-s-status-live' : ''}`} aria-label={[title, competitors, scoreLabel, stateWord].filter(Boolean).join(' · ')}>
        {matchNumberLabel ? (
          <p className="border-b border-rule-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {matchNumberLabel}
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
    <article data-match-variant={variant} className={card ? LIST_CARD : 'border border-rule-soft bg-surface-raised'}>
      {compactList ? (
        stateWord || matchNumberLabel ? (
          <div className="flex items-center justify-between gap-2 border-b border-rule-soft px-3 py-1 text-xs font-semibold text-muted-foreground">
            <span>{matchNumberLabel}</span>
            <span className={live ? 'text-status-live' : ''}>{stateWord}</span>
          </div>
        ) : null
      ) : (
        <header
          className={`flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2 text-muted-foreground ${card ? 'rounded-t-lg' : ''}`}
        >
          <p className="flex min-w-0 items-baseline gap-2 text-xs font-bold uppercase tracking-[0.06em]">
            <span>{title}</span>
            {matchNumberLabel ? <span className="font-medium normal-case tracking-normal text-muted-foreground">{matchNumberLabel}</span> : null}
          </p>
          {stateWord ? <span className={`text-xs font-semibold ${live ? 'text-status-live' : ''}`}>{stateWord}</span> : null}
        </header>
      )}
      <Side side={match.sides[0]} score={match.score} index={0} slug={slug} live={live} first highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      <Side side={match.sides[1]} score={match.score} index={1} slug={slug} live={live} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      {footer.length || showSourceLink ? (
        <footer className="border-t border-rule-soft px-4 py-1.5 text-xs text-muted-foreground">
          {footer.join(' · ')}
          {showSourceLink ? <>{footer.length ? <span aria-hidden> · </span> : null}<a href={match.sourceUrl!} className="font-medium text-accent underline-offset-4 hover:underline">Match source</a></> : null}
        </footer>
      ) : null}
    </article>
  );
}
