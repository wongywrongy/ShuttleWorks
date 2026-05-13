/**
 * Public Display — Courts view (current/called match on each court).
 *
 * Three render modes selected by `displayMode`:
 *
 *   • 'list'        — compact rows, one per court. Best for 16+ courts on
 *                     1080p TVs; trades the giant court-number for one-line
 *                     scannability.
 *   • 'strip'       — single-column tall cards stacked vertically.
 *   • 'grid'        — N-column responsive grid of the same card shape.
 *
 * Strip and Grid share the same card render — only the wrapping container
 * (flex vs grid) differs. Both modes use the same status tint tokens so
 * the visual language stays consistent.
 */
import type { ReactNode } from 'react';

import type { TournamentConfig, MatchDTO, MatchStateDTO } from '../../api/dto';
import { formatElapsed } from '../../lib/timeFormatters';
import { formatPlayers, isCourtClosedNow } from './helpers';

export type CourtStatus = 'active' | 'called' | 'empty';
export type CourtDisplayMode = 'list' | 'strip' | 'grid';

export interface CourtRow {
  courtId: number;
  match: MatchDTO | null;
  state: MatchStateDTO | null;
  status: CourtStatus;
  /** When status === 'empty': the next future assignment on this court (if any). */
  nextMatch?: MatchDTO | null;
  nextStartTime?: string;
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
      {courts.map(({ courtId, match, state, status, nextMatch, nextStartTime }) => {
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
            className={`grid items-center gap-3 px-4 text-base text-foreground grid-cols-[3rem_3.5rem_1fr_5rem_5.5rem] ${rowTintClass} ${
              isClosed ? 'opacity-50' : ''
            }`}
            style={{ height: 56 }}
          >
            <span
              className={`tabular-nums text-2xl font-bold ${isClosed ? 'line-through text-muted-foreground' : ''}`}
            >
              {courtId}
            </span>
            <span className="tabular-nums text-base font-semibold text-muted-foreground">
              {isClosed ? '—' : match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
            </span>
            <span className="truncate">
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
                  Next{nextStartTime ? ` · ${nextStartTime}` : ''} ·{' '}
                  {formatPlayers(nextMatch.sideA, playerNames)} vs{' '}
                  {formatPlayers(nextMatch.sideB, playerNames)}
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
  courtNumSize,
  eventCodeSize,
  playerSize,
  tvAccent,
  tvShowScores,
  isFullscreen,
  playerNames,
}: CourtsViewProps) {
  return (
    <div
      className={`w-full ${displayMode === 'grid' ? `grid gap-3 ${gridColsClass}` : 'flex flex-col gap-2'}`}
      style={displayMode === 'grid' ? { gridAutoRows: `${cardHeightPx}px` } : undefined}
    >
      {courts.map((row, idx) => (
        <CourtCard
          key={row.courtId}
          row={row}
          idx={idx}
          isClosed={isCourtClosedNow(config, row.courtId, now)}
          cardHeightPx={cardHeightPx}
          cardPadX={cardPadX}
          courtNumSize={courtNumSize}
          eventCodeSize={eventCodeSize}
          playerSize={playerSize}
          tvAccent={tvAccent}
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
  courtNumSize: string;
  eventCodeSize: string;
  playerSize: string;
  tvAccent: string;
  tvShowScores: boolean;
  isFullscreen: boolean;
  playerNames: Map<string, string>;
}

function CourtCard({
  row,
  idx,
  isClosed,
  cardHeightPx,
  cardPadX,
  courtNumSize,
  eventCodeSize,
  playerSize,
  tvAccent,
  tvShowScores,
  isFullscreen,
  playerNames,
}: CourtCardProps) {
  const { courtId, match, state, status, nextMatch, nextStartTime } = row;
  const elapsed = status === 'active' ? formatElapsed(state?.actualStartTime) : null;
  // Active / called cards get a tinted background carrying state. Full-card
  // tint + inset highlight ring replaces the banned left-stripe accent.
  const cardBgClass = isClosed
    ? 'bg-muted/30 opacity-60'
    : status === 'active'
      ? 'bg-status-live-bg/80 ring-1 ring-status-live/30 shadow-[inset_0_0_0_1px_hsl(var(--status-live)/0.25)]'
      : status === 'called'
        ? 'bg-status-called-bg/70 ring-1 ring-status-called/25'
        : 'bg-card/60';
  const aggregate = state?.score ? `${state.score.sideA}–${state.score.sideB}` : null;
  const sideA = match ? formatPlayers(match.sideA, playerNames) : '';
  const sideB = match ? formatPlayers(match.sideB, playerNames) : '';

  return (
    <div
      className={`overflow-hidden rounded-sm border border-border animate-block-in ${cardBgClass}`}
      style={{
        height: cardHeightPx,
        // Staggered entry — each tile arrives 60 ms after the previous
        // so the grid doesn't flash on every poll.
        animationDelay: `${idx * 60}ms`,
      }}
    >
      <div
        className={`grid h-full items-center gap-3 ${cardPadX} grid-cols-[auto_auto_1fr_auto_auto]`}
      >
        {/* Court number — anchor of the card */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Court
          </span>
          <span className={`${courtNumSize} font-black tabular-nums leading-none`}>{courtId}</span>
        </div>

        {/* Event code */}
        <div className={`min-w-[3.5rem] ${eventCodeSize} font-bold text-foreground tabular-nums`}>
          {match ? match.eventRank || `M${match.matchNumber || '?'}` : '—'}
        </div>

        {/* Players (grows). Always rendered on their own lines so long
            doubles names never truncate. */}
        <div className={`min-w-0 ${playerSize} leading-tight text-foreground`}>
          {isClosed ? (
            <span className="uppercase tracking-wider text-muted-foreground">Court closed</span>
          ) : match ? (
            <PlayerStack sideA={sideA} sideB={sideB} isFullscreen={isFullscreen} />
          ) : nextMatch ? (
            <NextUp
              nextStartTime={nextStartTime}
              nextSideA={formatPlayers(nextMatch.sideA, playerNames)}
              nextSideB={formatPlayers(nextMatch.sideB, playerNames)}
              isFullscreen={isFullscreen}
            />
          ) : (
            <span className="text-muted-foreground">Available</span>
          )}
        </div>

        {/* Status pill */}
        <div>
          {status === 'active' && (
            <StatusPill
              label="Live"
              bgAlpha={`${tvAccent}33`}
              color={tvAccent}
              dotColor={tvAccent}
              isFullscreen={isFullscreen}
              pulse
            />
          )}
          {status === 'called' && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
              Calling
            </span>
          )}
        </div>

        {/* Score + elapsed */}
        <div
          className={`flex items-baseline gap-3 tabular-nums ${isFullscreen ? 'text-2xl' : 'text-lg'}`}
        >
          {tvShowScores && aggregate && <span className="font-semibold text-foreground">{aggregate}</span>}
          {elapsed && (
            <span className="text-muted-foreground min-w-[4.5rem] text-right">{elapsed}</span>
          )}
        </div>
      </div>

      {/* Per-set breakdown */}
      {tvShowScores && status === 'active' && state?.sets && state.sets.length > 0 && (
        <div
          className={`border-t border-border px-4 ${isFullscreen ? 'py-2.5 text-lg' : 'py-1.5 text-sm'} flex flex-wrap gap-1.5 font-mono`}
        >
          {state.sets.map((s, i) => (
            <span
              key={i}
              className={`rounded-sm bg-muted ${isFullscreen ? 'px-2.5 py-1' : 'px-1.5 py-0.5'} tabular-nums text-foreground`}
              title={`Set ${i + 1}`}
            >
              {s.sideA}–{s.sideB}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerStack({
  sideA,
  sideB,
  isFullscreen,
}: {
  sideA: string;
  sideB: string;
  isFullscreen: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="block truncate font-medium" title={sideA}>
        {sideA}
      </span>
      <span
        className={`${isFullscreen ? 'text-sm' : 'text-xs'} uppercase tracking-widest text-muted-foreground`}
      >
        vs
      </span>
      <span className="block truncate font-medium" title={sideB}>
        {sideB}
      </span>
    </div>
  );
}

function NextUp({
  nextStartTime,
  nextSideA,
  nextSideB,
  isFullscreen,
}: {
  nextStartTime?: string;
  nextSideA: string;
  nextSideB: string;
  isFullscreen: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-muted-foreground">
      <span
        className={`${isFullscreen ? 'text-xs' : 'text-2xs'} font-semibold uppercase tracking-[0.18em]`}
      >
        Next up{nextStartTime ? ` · ${nextStartTime}` : ''}
      </span>
      <span
        className={`${isFullscreen ? 'text-2xl' : 'text-base'} font-medium text-foreground`}
      >
        {nextSideA} <span className="text-muted-foreground">vs</span> {nextSideB}
      </span>
    </div>
  );
}

function StatusPill({
  label,
  bgAlpha,
  color,
  dotColor,
  isFullscreen,
  pulse,
}: {
  label: ReactNode;
  bgAlpha: string;
  color: string;
  dotColor: string;
  isFullscreen: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${isFullscreen ? 'px-3.5 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'} font-bold uppercase tracking-wider`}
      style={{ backgroundColor: bgAlpha, color }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  );
}
