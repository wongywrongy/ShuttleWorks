/**
 * UnifiedCourtBoard — the court×time grid board for the both-engines
 * Operations surfaces.
 *
 * This is the spatial "board you run the day from": the same
 * `GanttTimeline` scaffold the single-engine Meet and Bracket surfaces
 * use, but fed by the MERGED `OperationalMatch[]` so meet and bracket
 * blocks share one court plan. Each block is tinted by `source` (sky =
 * Meet, violet = Bracket, matching `SourceChip`) and ringed by lifecycle
 * status. Unassigned matches don't appear on the board — they live in the
 * working list beneath it (mirroring the single-engine Live/Courts split:
 * the board is the map, the list is where actions happen).
 */
import { useCallback, useMemo } from 'react';
import { GanttTimeline, type Placement } from '@scheduler/design-system';
import type {
  OperationalMatch,
  OperationalSource,
  OperationalStatus,
} from '../../lib/operations/operationalMatch';

// Engine tint — same hues as SourceChip so the board and the list read as
// one vocabulary.
const SRC_BLOCK: Record<OperationalSource, string> = {
  meet: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  bracket: 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-200',
};

// Lifecycle ring — mirrors the bracket Live chip vocabulary.
const STATUS_RING: Record<OperationalStatus, string> = {
  scheduled: '',
  called: 'ring-2 ring-inset ring-status-called',
  started: 'ring-2 ring-inset ring-status-live',
  finished: 'ring-2 ring-inset ring-status-done',
};

interface Props {
  /** The merged meet+bracket rows (already sorted is fine; we re-window). */
  rows: OperationalMatch[];
  /** Optional current-slot highlight for the time header. */
  currentSlot?: number;
}

export function UnifiedCourtBoard({ rows, currentSlot }: Props) {
  // Only assigned matches (court + slot known) land on the board.
  const placed = useMemo(
    () => rows.filter((r) => r.court != null && r.slot != null),
    [rows],
  );

  const rowByKey = useMemo(() => {
    const m: Record<string, OperationalMatch> = {};
    for (const r of placed) m[`${r.source}-${r.id}`] = r;
    return m;
  }, [placed]);

  const courts = useMemo(() => {
    const maxCourt = placed.reduce((mx, r) => Math.max(mx, r.court ?? 0), 0);
    return Array.from({ length: Math.max(1, maxCourt) }, (_, i) => i + 1);
  }, [placed]);

  const placements: Placement[] = useMemo(
    () =>
      placed.map((r) => ({
        courtIndex: Math.max(0, (r.court ?? 1) - 1),
        startSlot: r.slot ?? 0,
        span: r.span ?? 1,
        key: `${r.source}-${r.id}`,
      })),
    [placed],
  );

  const { minSlot, slotCount } = useMemo(() => {
    if (placements.length === 0) return { minSlot: 0, slotCount: 1 };
    const lo = placements.reduce((m, p) => Math.min(m, p.startSlot), Number.POSITIVE_INFINITY);
    const hi = placements.reduce((m, p) => Math.max(m, p.startSlot + p.span), 0);
    return { minSlot: lo, slotCount: Math.max(1, hi - lo) };
  }, [placements]);

  const renderBlock = useCallback(
    (placement: Placement) => {
      const row = rowByKey[placement.key];
      if (!row) return null;
      const tint = SRC_BLOCK[row.source];
      const ring = STATUS_RING[row.status];
      const title = `${row.source === 'meet' ? 'Meet' : 'Bracket'} — ${row.sideA} vs ${row.sideB} [${row.status}]`;
      return (
        <div
          data-board-block={`${row.source}-${row.id}`}
          data-source={row.source}
          className={`flex h-full w-full flex-col justify-center overflow-hidden rounded-sm border px-1.5 py-0.5 ${tint} ${ring}`}
          title={title}
        >
          <span className="truncate text-2xs font-semibold uppercase tracking-[0.16em] opacity-70 leading-none">
            {row.source}
          </span>
          <span className="truncate text-2xs font-medium leading-tight">
            {row.sideA} <span className="opacity-50">v</span> {row.sideB}
          </span>
        </div>
      );
    },
    [rowByKey],
  );

  const renderSlotLabel = useCallback(
    (slotId: number) => `S${slotId}`,
    [],
  );

  if (placed.length === 0) return null;

  return (
    <div className="shrink-0 overflow-x-auto border-b border-border p-4" data-testid="unified-board">
      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        density="standard"
        placements={placements}
        renderBlock={renderBlock}
        renderSlotLabel={renderSlotLabel}
        currentSlot={currentSlot}
      />
    </div>
  );
}
