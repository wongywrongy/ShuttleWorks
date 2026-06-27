/**
 * CourtStatusBoard — the hero of the Live operations console.
 *
 * A director runs the floor by court: "court 3 is free — who's next; court 1
 * has been on 18 min." So Live leads with one card per physical court showing
 * what's ON it now (players, elapsed), what's ON DECK next, or that it's FREE,
 * with the action that moves the floor forward (Call → Start → Finish/Score).
 * The queue list below is support. Mirrors the Court Desk model (ready → on
 * court → done) researched for live tournament desks.
 */
import { useMemo } from 'react';
import type { OpsBlock } from './opsBlock';
import type { OperationalAction } from './operationalWriteback';
import { SourceChip } from './SourceChip';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  blocks: OpsBlock[];
  courtCount: number;
  /** Slots elapsed since day start (0 before the event clock starts). */
  currentSlot: number;
  /** Minutes per slot — turns slot deltas into elapsed minutes. */
  intervalMinutes: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
}

interface CourtState {
  court: number;
  now: OpsBlock | null;
  onDeck: OpsBlock | null;
}

const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-primary px-2 py-1 ` +
  `text-2xs font-medium text-primary-foreground hover:opacity-90`;
const ghostBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40`;

function Players({ block }: { block: OpsBlock }) {
  // The on-court players are the hero of the card — wrap long doubles names
  // rather than clip them; the director must read who's up.
  return (
    <div className="min-w-0 space-y-0.5 text-sm leading-tight">
      <div className="break-words">{block.sideA}</div>
      <div className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">vs</div>
      <div className="break-words">{block.sideB}</div>
    </div>
  );
}

function CourtActions({
  block,
  onAction,
}: {
  block: OpsBlock;
  onAction: (b: OpsBlock, a: OperationalAction) => void;
}) {
  if (block.done) return <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-status-done">Done</span>;
  if (block.started) {
    if (block.source === 'meet') {
      return (
        <button type="button" className={ghostBtn} onClick={() => onAction(block, { kind: 'finish' })}>
          Finish
        </button>
      );
    }
    return (
      <span className="flex flex-wrap gap-1">
        <button type="button" className={ghostBtn} onClick={() => onAction(block, { kind: 'recordWinner', winnerSide: 'A' })}>
          {block.sideA} won
        </button>
        <button type="button" className={ghostBtn} onClick={() => onAction(block, { kind: 'recordWinner', winnerSide: 'B' })}>
          {block.sideB} won
        </button>
      </span>
    );
  }
  // assigned, not started
  return (
    <span className="flex gap-1">
      {block.source === 'meet' && block.status !== 'called' ? (
        <button type="button" className={ghostBtn} onClick={() => onAction(block, { kind: 'call' })}>
          Call
        </button>
      ) : null}
      <button type="button" className={primaryBtn} onClick={() => onAction(block, { kind: 'start' })}>
        Start
      </button>
    </span>
  );
}

export function CourtStatusBoard({
  blocks,
  courtCount,
  currentSlot,
  intervalMinutes,
  selectedKey,
  onSelect,
  onAction,
}: Props) {
  const courts = useMemo<CourtState[]>(() => {
    const out: CourtState[] = [];
    for (let c = 1; c <= Math.max(1, courtCount); c++) {
      const onCourt = blocks
        .filter((b) => b.court === c && !b.done)
        .sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0));
      // "Now" = a started match, else the earliest assigned one that has begun
      // its slot; "on deck" = the next one after it.
      const started = onCourt.find((b) => b.started) ?? null;
      const earliest = onCourt[0] ?? null;
      const now = started ?? (earliest && (earliest.slot ?? 0) <= currentSlot ? earliest : null);
      const onDeck = onCourt.find((b) => b !== now) ?? null;
      out.push({ court: c, now, onDeck });
    }
    return out;
  }, [blocks, courtCount, currentSlot]);

  const elapsedMin = (b: OpsBlock) =>
    Math.max(0, currentSlot - (b.slot ?? 0)) * intervalMinutes;

  return (
    <div
      data-testid="court-status-board"
      className="grid gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]"
    >
      {courts.map(({ court, now, onDeck }) => {
        const free = !now;
        return (
          <div
            key={court}
            data-court={court}
            className={`flex flex-col gap-2 rounded-md border p-2.5 ${
              free ? 'border-dashed border-border bg-muted/20' : 'border-border bg-card'
            } ${now && selectedKey === now.key ? 'ring-1 ring-accent' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tabular-nums text-foreground">Court {court}</span>
              {now ? (
                (() => {
                  const tone = now.started
                    ? 'text-status-live'
                    : now.status === 'called'
                      ? 'text-status-called'
                      : 'text-muted-foreground';
                  const dot = now.started
                    ? 'bg-status-live'
                    : now.status === 'called'
                      ? 'bg-status-called'
                      : 'bg-muted-foreground/50';
                  const label = now.started
                    ? `Playing · ${elapsedMin(now)}m`
                    : now.status === 'called'
                      ? 'Called'
                      : 'Up now';
                  return (
                    <span className={`inline-flex items-center gap-1 text-2xs font-medium ${tone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {label}
                    </span>
                  );
                })()
              ) : (
                <span className="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Free</span>
              )}
            </div>

            {now ? (
              <button type="button" className="text-left" onClick={() => onSelect?.(now.key)}>
                <div className="mb-1 flex items-center gap-1.5">
                  <SourceChip source={now.source} />
                  <span className="font-mono text-2xs text-muted-foreground">{now.label}</span>
                </div>
                <Players block={now} />
              </button>
            ) : (
              <div className="py-1 text-2xs text-muted-foreground">No match on court.</div>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2">
              <div className="min-w-0">
                <div className="text-3xs uppercase tracking-[0.18em] text-muted-foreground/70">On deck</div>
                <div className="truncate text-2xs text-muted-foreground" title={onDeck ? `${onDeck.sideA} vs ${onDeck.sideB}` : ''}>
                  {onDeck ? `${onDeck.sideA} vs ${onDeck.sideB}` : '—'}
                </div>
              </div>
              {now ? <CourtActions block={now} onAction={onAction} /> : onDeck ? <CourtActions block={onDeck} onAction={onAction} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
