/**
 * UnifiedOpsList — the both-engines working queue beneath the board.
 *
 * The same dense, sectioned design as the single-engine list (Up next /
 * Waiting / Finished; status dot · id · court·slot · sides · action), but
 * rows interleave meet + bracket, each tagged by source and carrying its
 * engine's real actions. The board above is the spatial map; this is where
 * the operator runs the day.
 */
import { useMemo } from 'react';
import type { OpsBlock } from './opsBlock';
import type { OperationalAction } from './operationalWriteback';
import { SourceChip } from './SourceChip';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  blocks: OpsBlock[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Live surface passes a handler; Courts omits it for a read-only overview. */
  onAction?: (block: OpsBlock, action: OperationalAction) => void;
}

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded-sm border border-border ` +
  `bg-card px-2 py-0.5 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground ` +
  `disabled:cursor-not-allowed disabled:opacity-50`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded-sm bg-primary px-2 py-0.5 ` +
  `text-2xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;

function RowActions({
  b,
  onAction,
}: {
  b: OpsBlock;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
}) {
  if (b.done) {
    return <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-status-done">Done</span>;
  }
  const assigned = b.court != null;
  if (b.source === 'meet') {
    if (b.started) {
      return (
        <button type="button" className={actionBtn} onClick={() => onAction(b, { kind: 'finish' })}>
          Finish
        </button>
      );
    }
    if (b.status === 'called') {
      return (
        <button type="button" className={primaryBtn} onClick={() => onAction(b, { kind: 'start' })}>
          Start
        </button>
      );
    }
    return (
      <>
        <button type="button" className={actionBtn} onClick={() => onAction(b, { kind: 'call' })}>
          Call
        </button>
        <button type="button" className={primaryBtn} onClick={() => onAction(b, { kind: 'start' })}>
          Start
        </button>
      </>
    );
  }
  // bracket
  if (!assigned) {
    return <span className="text-2xs text-muted-foreground">awaiting court</span>;
  }
  if (!b.started) {
    return (
      <button type="button" className={primaryBtn} onClick={() => onAction(b, { kind: 'start' })}>
        Start
      </button>
    );
  }
  return (
    <>
      <button type="button" className={actionBtn} title={`${b.sideA} wins`} onClick={() => onAction(b, { kind: 'recordWinner', winnerSide: 'A' })}>
        {b.sideA} wins
      </button>
      <button type="button" className={actionBtn} title={`${b.sideB} wins`} onClick={() => onAction(b, { kind: 'recordWinner', winnerSide: 'B' })}>
        {b.sideB} wins
      </button>
    </>
  );
}

export function UnifiedOpsList({ blocks, selectedKey, onSelect, onAction }: Props) {
  const { upNext, waiting, finished } = useMemo(() => {
    const up = blocks
      .filter((b) => b.court != null && !b.done)
      .sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0) || (x.court ?? 0) - (y.court ?? 0));
    const wait = blocks.filter((b) => b.court == null && !b.done);
    const fin = blocks.filter((b) => b.done);
    return { upNext: up, waiting: wait, finished: fin };
  }, [blocks]);

  const row = (b: OpsBlock) => {
    const dot = b.done
      ? 'bg-status-done'
      : b.started
        ? 'bg-status-live'
        : b.court != null
          ? 'bg-status-called'
          : 'bg-muted-foreground/40';
    return (
      <li
        key={b.key}
        data-testid="ops-row"
        data-row-id={b.id}
        data-source={b.source}
        className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 hover:bg-muted/30 ${selectedKey === b.key ? 'bg-muted/40' : ''}`}
        onClick={() => onSelect?.(b.key)}
      >
        <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        <SourceChip source={b.source} className="flex-shrink-0" />
        <span className="w-20 flex-shrink-0 truncate font-mono text-2xs tracking-wider text-foreground">{b.label}</span>
        <span className="w-24 flex-shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
          {b.court != null ? `C${b.court} · S${b.slot}` : '—'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {b.sideA}
          <span className="px-1.5 text-2xs uppercase tracking-[0.18em] text-muted-foreground">vs</span>
          {b.sideB}
        </span>
        {onAction ? (
          <span className="flex flex-shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <RowActions b={b} onAction={onAction} />
          </span>
        ) : null}
      </li>
    );
  };

  const section = (title: string, items: OpsBlock[]) =>
    items.length > 0 ? (
      <>
        <li className="border-y border-border bg-muted/40 px-4 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title} · {items.length}
        </li>
        {items.map(row)}
      </>
    ) : null;

  return (
    <ul className="divide-y divide-border/60 border-t border-border">
      {section('Up next', upNext)}
      {section('Waiting', waiting)}
      {section('Finished', finished)}
    </ul>
  );
}
