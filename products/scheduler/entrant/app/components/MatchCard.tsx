/**
 * The public match card (SP-P7 §3.3) — the console MatchCard's anatomy in
 * this tier's own component.
 *
 * NOT an import of `frontend/src/components/control-plane/MatchCard.tsx`:
 * the entrant tier cannot reach operator frontend (depcruise
 * `entrant-no-operator-frontend`, ERROR), so parity is by SPEC — header
 * strip (event code · round · status-chip slot), two sides with stacked
 * names, winner dot + bold, tabular-numeral game scores, footer strip
 * (time · court) — the Phase 0 ruling Kyle approved.
 *
 * The status-chip slot is data-driven on purpose: v1 carries the scheduled
 * time only, and the slot is exactly where Operations live state (called /
 * on-court / ETA) lands later as a projection-side change — nothing here
 * would move.
 */
import type { PlayerMatchDTO, PlayerMatchSideDTO } from '../lib/player.types';

function Side({ side, score, index }: {
  side: PlayerMatchSideDTO;
  score: number[][] | null;
  index: 0 | 1;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        {side.names.length > 0 ? (
          side.names.map((name) => (
            <p
              key={name}
              className={`text-sm ${side.winner ? 'font-semibold text-foreground' : 'text-foreground'}`}
            >
              {side.winner ? (
                <span aria-hidden className="me-1.5 inline-block h-1.5 w-1.5 rounded-full bg-status-live align-middle" />
              ) : null}
              {name}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{side.placeholder ?? 'TBD'}</p>
        )}
      </div>
      {score ? (
        <div className="flex shrink-0 gap-2 tabular-nums text-sm text-foreground">
          {score.map((pair, set) => (
            <span key={set} className={side.winner ? 'font-semibold' : ''}>
              {pair[index]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MatchCard({ match }: { match: PlayerMatchDTO }) {
  const footer = [
    match.scheduledTime,
    match.court !== null ? `Court ${match.court}` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {match.roundLabel ? `${match.eventCode} · ${match.roundLabel}` : match.eventCode}
        </p>
        {/* The status-chip slot. v1: schedule only (§3.3). */}
        <span className="text-xs text-muted-foreground">
          {match.scheduledTime ?? (match.decided ? '' : 'Court to be assigned')}
        </span>
      </header>
      <div className="divide-y divide-rule-soft px-4">
        <Side side={match.sides[0]} score={match.score} index={0} />
        <Side side={match.sides[1]} score={match.score} index={1} />
      </div>
      {footer.length > 0 ? (
        <footer className="border-t border-rule-soft px-4 py-1.5 text-xs text-muted-foreground">
          {footer.join(' · ')}
        </footer>
      ) : null}
    </article>
  );
}
