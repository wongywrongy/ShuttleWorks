/**
 * RunLiveBoard — the Run surface hero, now a court×time GanttTimeline.
 *
 * Same scaffold the Plan board uses (`GanttTimeline` + the shared `MatchChip`),
 * but fed LIVE/ACTUAL placements: a playing chip anchors at its actual start and
 * grows toward `currentSlot`, a done chip spans its actual played length, and a
 * scheduled/called chip stays a uniform `span=1` at its planned slot and flags
 * `late` once the time axis passes it. The over-portion of an overrunning chip
 * paints in `status-warning` past the planned-end marker (the left edge of the
 * inset bar), driven by `BoardChip.overrunSlots` (from `deriveDriftSlots`).
 *
 * Chips are `tone="state"` (fill = live status; source is the left edge — no
 * discipline colour). Test ids are preserved from the old positional board so
 * existing Run idioms keep meaning: each chip is `run-card-${key}` with a
 * `data-source`, and a late chip carries a `run-late-${key}` marker.
 *
 * Purity: this reads no clock. `currentSlot` is injected by the caller; the
 * placement math lives in the pure `buildLiveChips` model.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  GanttTimeline,
  GANTT_GEOMETRY,
  type Placement,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import { MatchChip } from '../../../components/MatchChip';
import type { OpsBlock } from '../opsBlock';
import { buildLiveChips, type BoardChip } from '../runtime/boardPlacements';

export interface RunLiveBoardProps {
  /** Meet + bracket blocks (already carry actual-timing slots). */
  blocks: OpsBlock[];
  courtCount: number;
  /** Live play-head slot; injected (never read from the clock here). */
  currentSlot?: number;
  /** Floor-is-live (plan finalized) — gates the `late` flag so an un-started
   *  plan doesn't paint a wall of LATE badges. */
  running?: boolean;
  selectedKey?: string | null;
  onSelect(key: string): void;
}

export function RunLiveBoard({
  blocks,
  courtCount,
  currentSlot = 0,
  running = false,
  selectedKey,
  onSelect,
}: RunLiveBoardProps) {
  const chips = useMemo<BoardChip[]>(
    () => buildLiveChips(blocks, currentSlot, running),
    [blocks, currentSlot, running],
  );
  const chipByKey = useMemo(() => new Map(chips.map((c) => [c.key, c])), [chips]);

  const courts = useMemo(
    () => Array.from({ length: Math.max(1, courtCount) }, (_, i) => i + 1),
    [courtCount],
  );

  const placements = useMemo<Placement[]>(() => chips.map((c) => c.placement), [chips]);

  const { minSlot, slotCount } = useMemo(() => {
    if (placements.length === 0) return { minSlot: 0, slotCount: 8 };
    const lo = placements.reduce((m, p) => Math.min(m, p.startSlot), Number.POSITIVE_INFINITY);
    const hi = placements.reduce((m, p) => Math.max(m, p.startSlot + p.span), 0);
    return { minSlot: Math.max(0, lo - 1), slotCount: Math.max(4, hi - lo + 2) };
  }, [placements]);

  // Time-axis zoom — same Auto/±/% idiom as UnifiedOpsBoard's zoomBar. AUTO
  // fits the slot width so the narrowest (span=1) chip can still read its label;
  // the operator can override. Stretches TIME only (courts keep their height).
  const [auto, setAuto] = useState(true);
  const [manualZoom, setManualZoom] = useState(1);
  const autoZoom = useMemo(() => {
    if (chips.length === 0) return 1;
    const longest = chips.reduce((m, c) => Math.max(m, c.label.length), 0);
    // Width a span=1 cell needs to read the longest label at text-2xs plus the
    // chip's horizontal padding + inset (~24px). Generous so nothing clips.
    const neededPx = Math.max(56, longest * 8 + 24);
    return Math.min(3, Math.max(1, neededPx / GANTT_GEOMETRY.standard.slot));
  }, [chips]);
  const timeZoom = auto ? autoZoom : manualZoom;
  const zoomBy = (f: number) => {
    setManualZoom(Math.min(3, Math.max(0.5, Math.round(timeZoom * f * 100) / 100)));
    setAuto(false);
  };

  const renderBlock = useCallback(
    (placement: Placement, box: GanttBlockBox) => {
      const c = chipByKey.get(placement.key);
      if (!c) return null;
      // Over-portion: the rightmost `overrunSlots / span` fraction of the chip
      // covers exactly [plannedEnd, currentSlot); its left border IS the
      // planned-end marker.
      const overFrac = c.placement.span > 0 ? Math.min(1, c.overrunSlots / c.placement.span) : 0;
      return (
        <MatchChip
          label={c.label}
          source={c.source}
          state={c.state}
          late={c.late}
          selected={selectedKey === c.key}
          tone="state"
          onSelect={() => onSelect(c.key)}
          data-testid={`run-card-${c.key}`}
          title={`${c.source === 'meet' ? 'Meet' : 'Bracket'} · ${c.label} [${c.late ? 'late' : c.state}]`}
          style={{
            position: 'absolute',
            left: 0,
            top: 2,
            width: box.width,
            height: box.height - 4,
          }}
          className="cursor-pointer px-2"
        >
          {c.overrunSlots > 0 && (
            <span
              aria-hidden
              data-testid={`run-overrun-${c.key}`}
              className="pointer-events-none absolute inset-y-0 right-0 border-l-2 border-status-warning bg-status-warning/20"
              style={{ width: `${overFrac * 100}%` }}
            />
          )}
          {c.late && (
            <span
              data-testid={`run-late-${c.key}`}
              aria-label="Late"
              className="absolute right-1.5 top-1 text-[9px] font-semibold uppercase tracking-wide text-status-warning"
            >
              Late
            </span>
          )}
        </MatchChip>
      );
    },
    [chipByKey, selectedKey, onSelect],
  );

  if (chips.length === 0) {
    return (
      <div data-testid="run-live-board" data-mode="live" className="w-full border-b border-border">
        <p
          data-testid="run-board-empty"
          className="px-4 py-6 text-center text-2xs text-muted-foreground"
        >
          No matches on court yet — assign from the queue to fill a court.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="run-live-board" data-mode="live" className="w-full overflow-x-auto border-b border-border">
      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        density="standard"
        slotScale={timeZoom}
        placements={placements}
        renderBlock={renderBlock}
        currentSlot={currentSlot}
        renderSlotLabel={(slotId, i) => (i % 2 === 0 ? `S${slotId}` : '')}
      />
      <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/40 px-3 py-1 text-2xs">
        <span className="text-muted-foreground">Time</span>
        <button
          type="button"
          onClick={() => setAuto(true)}
          aria-pressed={auto}
          title="Auto-fit cells to be readable"
          className={`rounded border px-1.5 py-0.5 ${auto ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground hover:bg-muted/60'}`}
        >
          Auto
        </button>
        <button
          type="button"
          aria-label="Less time per cell"
          onClick={() => zoomBy(1 / 1.25)}
          className="h-5 w-5 rounded border border-border bg-card leading-none hover:bg-muted/60"
        >
          −
        </button>
        <span className="w-9 text-center tabular-nums text-muted-foreground">{Math.round(timeZoom * 100)}%</span>
        <button
          type="button"
          aria-label="More time per cell"
          onClick={() => zoomBy(1.25)}
          className="h-5 w-5 rounded border border-border bg-card leading-none hover:bg-muted/60"
        >
          +
        </button>
      </div>
    </div>
  );
}
