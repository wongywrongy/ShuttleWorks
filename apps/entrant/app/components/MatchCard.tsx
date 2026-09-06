/**
 * Shared public match anatomy for player, list, round, schedule and bracket
 * views (ADR 0028): a header band naming event · round with the state word
 * on the right — FILLED in the live tone while a match is on court — two
 * side rows, one 40px score cell per game, and a footer of time · court ·
 * duration. Winners read by weight and by the `sr-only` word "Winner"; the
 * old visible tick column is gone.
 */
import type { PersonReferenceDTO } from '../lib/person.types';
import type { PlayerMatchDTO, PlayerMatchSideDTO } from '../lib/player.types';
import { eventCodeLabel, roundLabel } from '../lib/draws.types';
import { LIST_CARD } from '../lib/ui';
import { PersonGroup } from './PersonGroup';
import { personRefModel } from '../../public/assets/person-ref.js';

export type MatchCardData = PlayerMatchDTO & {
  playedOn?: string | null;
  localTime?: string | null;
  courtLabel?: string | null;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  /** Schedule/draw views may need to explain an intentionally unassigned slot. */
  showAssignmentPlaceholders?: boolean;
};

export type MatchCardVariant = 'card' | 'canvas' | 'bracket-node';
const GAME_COLUMNS = 3;

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
  const gameColumns = compact ? GAME_COLUMNS : (score?.length ?? 0);
  const columns = `minmax(0,1fr) repeat(${gameColumns}, ${compact ? '1.8rem' : '2.5rem'})`;
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
      {Array.from({ length: gameColumns }, (_, set) => (
        <span
          key={set}
          aria-hidden={score?.[set] === undefined ? true : undefined}
          className={`grid place-items-center border-s border-rule-soft tabular-nums ${compact ? '' : 'font-semibold'} ${side.winner ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {score?.[set]?.[index] ?? ''}
        </span>
      ))}
    </div>
  );
}

export function MatchCard({ match, variant = 'card', slug, highlightPersonId, highlightPersonName, compactList = false }: { match: MatchCardData; variant?: MatchCardVariant; slug?: string; highlightPersonId?: string | null; highlightPersonName?: string | null; compactList?: boolean }) {
  const footer = [
    match.playedOn ?? (match.scheduledTime ? 'Date to be confirmed' : null),
    match.localTime ?? match.scheduledTime ?? (match.showAssignmentPlaceholders ? 'Time not assigned' : null),
    match.courtLabel ?? (match.court !== null ? `Court ${match.court}` : (match.showAssignmentPlaceholders ? 'Court information unavailable' : null)),
    match.durationMinutes ? `${match.durationMinutes} min` : null,
  ].filter(Boolean);
  const live = match.status === 'live' || Boolean((match as MatchCardData & { live?: boolean }).live);
  const title = match.roundLabel ? `${eventCodeLabel(match.eventCode)} · ${roundLabel(match.roundLabel) ?? match.roundLabel}` : eventCodeLabel(match.eventCode);
  const competitors = match.sides.map((side) =>
    side.persons.length
      ? side.persons.map((person) => personRefModel({ slug: slug ?? '', identity: person.identity, state: person.resolution, label: person.label }).text).join(' / ')
      : side.placeholder ?? 'TBD',
  ).join(' versus ');
  const scoreLabel = match.score?.length
    ? `Score ${match.score.map((game) => game.join('-')).join(', ')}`
    : 'Score not published';
  const stateLabel = live ? 'Live' : match.decided ? 'Completed' : 'Scheduled';
  const showSourceLink = Boolean(
    match.sourceUrl &&
    match.sourceRef &&
    !match.sourceRef.startsWith('demo-generated:'),
  );

  if (variant === 'bracket-node') {
    return (
      <article data-testid="public-bracket-node" data-match-variant="bracket-node" className={`grid min-h-[44px] w-72 grid-rows-[auto_auto] rounded-sm border border-rule-soft bg-surface-raised ${live ? 'border-s-2 border-s-status-live' : ''}`} aria-label={`${title} · ${competitors} · ${scoreLabel} · ${stateLabel}`}>
        <Side side={match.sides[0]} score={match.score} index={0} slug={slug} compact live={live} first highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
        <Side side={match.sides[1]} score={match.score} index={1} slug={slug} compact live={live} highlightPersonId={highlightPersonId} highlightPersonName={highlightPersonName} />
      </article>
    );
  }

  const card = variant === 'card';
  return (
    <article data-match-variant={variant} className={card ? LIST_CARD : 'border border-rule-soft bg-surface-raised'}>
      {compactList ? (
        <div className="flex justify-end border-b border-rule-soft px-3 py-1 text-xs font-semibold text-muted-foreground">
          {live ? 'Now' : stateLabel}
        </div>
      ) : (
        <header
          className={`flex items-center justify-between gap-3 px-4 py-2 ${card ? 'rounded-t-lg' : ''} ${
            live ? 'bg-status-live text-accent-ink' : 'border-b border-rule-soft text-muted-foreground'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.06em]">{title}</p>
          <span className="text-xs font-semibold">{live ? 'Now' : stateLabel}</span>
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
