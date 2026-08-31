/**
 * UnifiedOpsList — the both-engines working queue beneath the board.
 *
 * The same dense, sectioned design as the single-engine list (Up next /
 * Waiting / Finished; status dot · id · court·slot · sides · action), but
 * rows interleave meet + bracket, each tagged by source and carrying its
 * engine's real actions. The board above is the spatial map; this is where
 * the operator runs the day.
 */
import { useMemo, useState } from 'react';
import type { OpsBlock } from './opsBlock';
import type { OperationalAction } from './operationalWriteback';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { SELECTABLE_ROW_FOCUS, selectableRowProps } from '../../lib/selectableRow';
import { STATE_WORD } from '../../lib/stateWords';
import { InlineSearch } from '../../components/InlineSearch';
import { MODULE_LABELS } from '../../platform/product-shell/types';
import { formatMatchIdentity } from '../../platform/domain/matchIdentity';

interface Props {
  blocks: OpsBlock[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Live surface passes a handler; Courts omits it for a read-only overview. */
  onAction?: (block: OpsBlock, action: OperationalAction) => void;
  /** Search + engine filter chips above the list (SP-CONSOLE-4 B1 —
   *  absorbs the legacy matches-table search and the bracket events
   *  dim-strip's need). Off by default. */
  searchable?: boolean;
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

export function UnifiedOpsList({ blocks, selectedKey, onSelect, onAction, searchable }: Props) {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<Set<string>>(() => new Set());

  // Search matches the row's code AND its player names — finding "where is
  // Aiden playing next" is the desk's real lookup. Source chips narrow to
  // one engine; no active chip means both.
  const visible = useMemo(() => {
    if (!searchable) return blocks;
    const needle = query.trim().toLowerCase();
    return blocks.filter((b) => {
      if (sources.size > 0 && !sources.has(b.source)) return false;
      if (needle === '') return true;
      return `${formatMatchIdentity(b.identity, b.id)} ${b.sideA} ${b.sideB}`.toLowerCase().includes(needle);
    });
  }, [blocks, searchable, query, sources]);

  const { upNext, waiting, finished } = useMemo(() => {
    const up = visible
      .filter((b) => b.court != null && !b.done)
      .sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0) || (x.court ?? 0) - (y.court ?? 0));
    const wait = visible.filter((b) => b.court == null && !b.done);
    const fin = visible.filter((b) => b.done);
    return { upNext: up, waiting: wait, finished: fin };
  }, [visible]);

  const row = (b: OpsBlock, showLocation: boolean, showStatusMarker: boolean) => {
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
        {showStatusMarker ? (
          <span
            aria-hidden
            data-testid="ops-status-marker"
            className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`}
          />
        ) : null}
        {/* Same match-code grammar as the Run queue rows. */}
        <span className="w-20 flex-shrink-0 break-words text-2xs font-semibold sw-num text-ink-3">{formatMatchIdentity(b.identity, b.id)}</span>
        {/* SP-OPCON-1 SWP-6: the section owns this column. If no row in a
            section has a court (the 155-row completed bracket capture), the
            column does not mount at all rather than becoming empty ballast. */}
        {showLocation ? (
          <span data-testid="ops-row-location" className="w-24 flex-shrink-0 sw-num text-2xs text-muted-foreground tabular-nums">
            {b.court != null ? `C${b.court} · S${b.slot}` : ''}
          </span>
        ) : null}
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

  const section = (title: string, items: OpsBlock[]) => {
    if (items.length === 0) return null;
    const showLocation = items.some((candidate) => candidate.court != null);
    const statusMarkers = new Set(
      items.map((candidate) =>
        candidate.done ? 'done' : candidate.started ? 'started' : candidate.court != null ? 'called' : 'waiting',
      ),
    );
    const showStatusMarker = statusMarkers.size > 1;
    return (
      <>
        <li className={`border-y border-border bg-muted/40 px-4 py-1 ${EYEBROW_CLASS} text-muted-foreground`}>
          {title} · {items.length}
        </li>
        {items.map((item) => row(item, showLocation, showStatusMarker))}
      </>
    );
  };

  const emptySearch =
    searchable && visible.length === 0 && blocks.length > 0 ? (
      <li className="px-4 py-3 text-sm text-muted-foreground">
        No matches match this search.
      </li>
    ) : null;

  return (
    <div>
      {searchable ? (
        <div className="border-t border-border px-4 py-1.5">
          <InlineSearch
            query={query}
            onQueryChange={setQuery}
            placeholder="Search matches or players"
            resultCount={{ shown: visible.length, total: blocks.length }}
            showClear
            onClearAll={() => {
              setQuery('');
              setSources(new Set());
            }}
            filters={[
              {
                label: 'Engine',
                options: [
                  { id: 'meet', label: MODULE_LABELS.meet },
                  { id: 'bracket', label: MODULE_LABELS.bracket },
                ],
                active: sources,
                onToggle: (id) =>
                  setSources((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  }),
              },
            ]}
          />
        </div>
      ) : null}
      {/* No border-t on the list shell: the first child is always a section band
          (`border-y`) whose top border IS the board→list seam — one hairline per
          seam (seamed, not gapped). */}
      <ul className="divide-y divide-border/60">
        {section('Up next', upNext)}
        {section(STATE_WORD.pending, waiting)}
        {section('Finished', finished)}
        {emptySearch}
      </ul>
    </div>
  );
}
