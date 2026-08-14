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
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../lib/selectableRow';

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
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded-sm bg-accent px-2 py-0.5 ` +
  `text-2xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`;

function RowActions({
  b,
  onAction,
}: {
  b: OpsBlock;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
}) {
  if (b.done) {
    return <span className={`${EYEBROW_CLASS} text-status-done`}>Done</span>;
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
          : 'bg-muted-foreground';
    const isSelected = selectedKey === b.key;
    return (
      <li
        key={b.key}
        data-testid="ops-row"
        data-row-id={b.id}
        data-source={b.source}
        // Courts omits `onSelect` for a read-only overview — a row with nothing
        // to activate must not be focusable (audit G1).
        {...(onSelect ? selectableRowProps(() => onSelect(b.key), isSelected) : {})}
        // `flex-wrap`: same fix as the Run queue rows — at 390px the dot,
        // code and court columns plus the action buttons left the sides
        // column ~72px, so `break-words` broke names MID-WORD ("Damo/n
        // Ferraro"). Columns wrap to a second line; sides keeps a 10rem floor.
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 hover:bg-muted/30 ${
          onSelect ? `cursor-pointer ${SELECTABLE_ROW_FOCUS}` : ''
        } ${isSelected ? 'bg-muted/40' : ''}`}
      >
        <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        {/* Same match-code grammar as the Run queue rows. */}
        <span className="w-20 flex-shrink-0 break-words text-2xs font-semibold sw-num text-ink-3">{b.label}</span>
        <span className="w-24 flex-shrink-0 sw-num text-2xs text-muted-foreground tabular-nums">
          {b.court != null ? `C${b.court} · S${b.slot}` : '–'}
        </span>
        <span className="min-w-[10rem] flex-1 break-words text-2sm">
          {b.sideA}
          <span className="px-1.5 text-2xs uppercase tracking-[0.08em] text-muted-foreground">vs</span>
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
        <li className={`border-y border-border bg-muted/40 px-4 py-1 ${EYEBROW_CLASS} text-muted-foreground`}>
          {title} · {items.length}
        </li>
        {items.map(row)}
      </>
    ) : null;

  return (
    // No border-t on the list shell: the first child is always a section band
    // (`border-y`) whose top border IS the board→list seam — one hairline per
    // seam (seamed, not gapped).
    <ul className="divide-y divide-border/60">
      {section('Up next', upNext)}
      {section('Waiting', waiting)}
      {section('Finished', finished)}
    </ul>
  );
}
