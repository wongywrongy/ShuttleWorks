/** Shared public match anatomy for player, list, round, and bracket views. */
import type { PersonReferenceDTO } from '../lib/person.types';
import type { PlayerMatchDTO, PlayerMatchSideDTO } from '../lib/player.types';
import { eventCodeLabel, roundLabel } from '../lib/draws.types';
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
const GAME_COLUMNS = 3;

function references(side: PlayerMatchSideDTO): PersonReferenceDTO[] {
  return side.persons;
}

function SidePeople({ side, slug, compact = false }: { side: PlayerMatchSideDTO; slug?: string; compact?: boolean }) {
  return <PersonGroup
    slug={slug ?? ''}
    persons={references(side)}
    state={side.winner ? 'winner' : 'resolved'}
    label={side.placeholder}
    seed={side.seed}
    className={compact ? 'block min-w-0 truncate' : 'block min-w-0'}
  />;
}

function Side({ side, score, index, slug, compact = false, live = false }: { side: PlayerMatchSideDTO; score: number[][] | null; index: 0 | 1; slug?: string; compact?: boolean; live?: boolean }) {
  const gameColumns = compact ? GAME_COLUMNS : (score?.length ?? 0);
  const columns = `1rem minmax(0,1fr) repeat(${gameColumns}, ${compact ? '1.8rem' : '2.25rem'})`;
  return (
    <div className={`grid min-w-0 items-center gap-x-2 ${compact ? 'h-[22px] px-2 text-xs' : 'py-2'}`} style={{ gridTemplateColumns: columns }}>
      <span className="text-center text-xs font-semibold" aria-label={side.winner && !live ? 'Winner' : undefined}>{side.winner && !live ? '✓' : ''}</span>
      <div className={`min-w-0 ${side.winner && !live ? 'font-[650] text-foreground' : 'text-foreground'}`}>
        {compact && !live ? (
          <span className="sr-only">{side.winner ? 'Winner advancing: ' : 'Opponent beaten: '}</span>
        ) : null}
        <SidePeople side={side} slug={slug} compact={compact} />
      </div>
      {Array.from({ length: gameColumns }, (_, set) => (
        <span key={set} aria-hidden={score?.[set] === undefined ? true : undefined} className={`text-right font-mono tabular-nums ${side.winner ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{score?.[set]?.[index] ?? ''}</span>
      ))}
    </div>
  );
}

export function MatchCard({ match, variant = 'card', slug }: { match: MatchCardData; variant?: MatchCardVariant; slug?: string }) {
  const footer = [
    match.playedOn,
    match.localTime ?? match.scheduledTime,
    match.courtLabel ?? (match.court !== null ? `Court ${match.court}` : null),
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
      <article data-testid="public-bracket-node" data-match-variant="bracket-node" className={`grid h-[44px] w-64 grid-rows-2 overflow-hidden rounded border border-rule-soft bg-surface-raised ${live ? 'border-s-2 border-s-status-live' : ''}`} aria-label={`${title} · ${competitors} · ${scoreLabel} · ${stateLabel}`}>
        <Side side={match.sides[0]} score={match.score} index={0} slug={slug} compact live={live} />
        <Side side={match.sides[1]} score={match.score} index={1} slug={slug} compact live={live} />
      </article>
    );
  }

  return (
    <article data-match-variant={variant} className={`${variant === 'canvas' ? 'border border-rule-soft bg-surface-raised' : 'rounded-lg border border-rule-soft bg-surface-raised shadow-sm'} ${live ? 'border-s-2 border-s-status-live' : ''}`}>
      <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</p>
        {live ? <span className="text-xs font-semibold text-status-live">On court now</span> : null}
      </header>
      <div className="divide-y divide-rule-soft px-4">
        <Side side={match.sides[0]} score={match.score} index={0} slug={slug} live={live} />
        <Side side={match.sides[1]} score={match.score} index={1} slug={slug} live={live} />
      </div>
      {footer.length || showSourceLink ? (
        <footer className="border-t border-rule-soft px-4 py-1.5 text-xs text-muted-foreground">
          {footer.join(' · ')}
          {showSourceLink ? <>{footer.length ? <span aria-hidden> · </span> : null}<a href={match.sourceUrl!} className="font-medium text-accent underline-offset-4 hover:underline">Match source</a></> : null}
        </footer>
      ) : null}
    </article>
  );
}
