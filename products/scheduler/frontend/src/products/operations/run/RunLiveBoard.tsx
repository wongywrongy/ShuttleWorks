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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GanttTimeline,
  GANTT_GEOMETRY,
  type Placement,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import { MatchChip } from '../../../components/MatchChip';
import type { OpsBlock } from '../opsBlock';
import { packBlockLanes, chipLanePx } from '../opsBlock';
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
  /** Wall-clock label for a slot (operators think in time, not slot indices). */
  formatSlot?: (slotId: number) => string;
  /** Minutes per slot (config.intervalMinutes) — when provided, playing chips
   *  carry a quiet elapsed stamp (`span × slotMinutes`). */
  slotMinutes?: number;
  selectedKey?: string | null;
  onSelect(key: string): void;
}

export function RunLiveBoard({
  blocks,
  courtCount,
  currentSlot = 0,
  running = false,
  formatSlot,
  slotMinutes,
  selectedKey,
  onSelect,
}: RunLiveBoardProps) {
  const chips = useMemo<BoardChip[]>(
    () => buildLiveChips(blocks, currentSlot, running),
    [blocks, currentSlot, running],
  );
  const chipByKey = useMemo(() => new Map(chips.map((c) => [c.key, c])), [chips]);

  // ── one-shot state-flip signals (sw-call-flash / sw-go-live) ─────────────
  // usePrevious-style detection: remember every chip's last-seen state; when a
  // chip OBSERVED in the previous render flips to 'called' (amber flash) or
  // 'playing' (green wipe) record a one-shot class for it. Poll ticks re-run
  // this effect but states are unchanged, so nothing fires; the class is held
  // in state (survives mid-animation re-renders without restarting, since the
  // chip element itself is stable) and cleared on `animationend`. Initial
  // mount never flashes (no previous states to compare against).
  const [flipFlash, setFlipFlash] = useState<ReadonlyMap<string, string>>(new Map());
  const prevStatesRef = useRef<Map<string, BoardChip['state']> | null>(null);
  useEffect(() => {
    const prev = prevStatesRef.current;
    const next = new Map(chips.map((c) => [c.key, c.state]));
    if (prev) {
      const fired = new Map<string, string>();
      for (const c of chips) {
        const p = prev.get(c.key);
        if (p === undefined || p === c.state) continue;
        if (c.state === 'called') fired.set(c.key, 'sw-call-flash');
        else if (c.state === 'playing') fired.set(c.key, 'sw-go-live');
      }
      if (fired.size > 0) {
        setFlipFlash((old) => {
          const merged = new Map(old);
          fired.forEach((cls, key) => merged.set(key, cls));
          return merged;
        });
      }
    }
    prevStatesRef.current = next;
  }, [chips]);
  const clearFlipFlash = useCallback((key: string) => {
    setFlipFlash((old) => {
      if (!old.has(key)) return old;
      const next = new Map(old);
      next.delete(key);
      return next;
    });
  }, []);

  const courts = useMemo(
    () => Array.from({ length: Math.max(1, courtCount) }, (_, i) => i + 1),
    [courtCount],
  );

  // Lane-pack on the LIVE spans: a playing chip that grows toward `currentSlot`
  // can cross a later chip on the same court (or meet+bracket can double-book
  // a cell) — without packing the two render stacked in the same pixels and
  // the lower one disappears. Same idiom as UnifiedOpsBoard, but on rendered
  // (grown) spans rather than uniform planned ones.
  const lanes = useMemo(
    () =>
      packBlockLanes(
        chips.map((c) => ({
          key: c.key,
          court: c.placement.courtIndex + 1,
          slot: c.placement.startSlot,
          span: c.placement.span,
        })),
      ),
    [chips],
  );

  const placements = useMemo<Placement[]>(
    () =>
      chips.map((c) => {
        const ln = lanes.get(c.key);
        return { ...c.placement, laneIndex: ln?.laneIndex ?? 0, laneCount: ln?.laneCount ?? 1 };
      }),
    [chips, lanes],
  );

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
    // chip's horizontal padding + inset + the M/B source square (~42px total).
    // Shared basis with the Plan board (chipLanePx) — Run and Plan cells are
    // the same size at Auto fit; the reserve includes the status stamp.
    const neededPx = chipLanePx(longest);
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
      const flashCls = flipFlash.get(c.key);
      return (
        <MatchChip
          label={c.label}
          source={c.source}
          state={c.state}
          late={c.late}
          selected={selectedKey === c.key}
          tone="state"
          sideA={c.sideA}
          sideB={c.sideB}
          // Sides render only when the cell is tall enough for a second
          // line. At the Plan-parity `standard` density (40px rows) that is
          // never — chips stay label-height (the inspector + hover title
          // carry the players); the guard keeps sides working if a denser
          // tier ever changes.
          showSides={c.state === 'playing' && box.height >= 48}
          onSelect={() => onSelect(c.key)}
          data-testid={`run-card-${c.key}`}
          title={`${c.source === 'meet' ? 'Meet' : 'Bracket'} · ${c.label} [${c.late ? 'late' : c.state}]${
            c.pushedSlots > 0
              ? ` · running ${c.pushedSlots} slot${c.pushedSlots === 1 ? '' : 's'} behind plan (starts when its court is free)`
              : ''
          }`}
          style={{
            // Inset a 2px gutter on each side (like the Plan board) so a
            // selection ring / shadow has breathing room and never bleeds into
            // the abutting chip in the next slot.
            position: 'absolute',
            left: 2,
            top: 2,
            width: box.width - 4,
            height: box.height - 4,
          }}
          className={`cursor-pointer px-2${flashCls ? ` ${flashCls}` : ''}`}
          onAnimationEnd={(e) => {
            // Clear the one-shot flip class the moment its animation ends so a
            // later unrelated re-render can never replay it. Guard on the
            // animation name — the chip hosts other animated children.
            if (e.animationName === 'sw-call-flash' || e.animationName === 'sw-go-live') {
              clearFlipFlash(c.key);
            }
          }}
        >
          {c.overrunSlots > 0 && (
            // Over-portion wash: the left border IS the planned-end marker.
            // Its number moved into the single right-aligned stamp below so
            // a chip never shows two competing figures.
            <span
              aria-hidden
              data-testid={`run-overrun-${c.key}`}
              className="pointer-events-none absolute inset-y-0 right-0 border-l border-status-warning/60"
              style={{ width: `${overFrac * 100}%` }}
            />
          )}
          {/* ONE stamp per chip — right-aligned, vertically centered so it
              shares the label's line instead of overlaying it (numbers used
              to stack in three corners and collide on narrow cells). Unit is
              MINUTES when the slot length is known ("+30m", "▸+15m", "45m");
              slots otherwise. Priority: running-over > elapsed > delayed >
              late. Meanings are spelled out in the footer legend + title.
              Zoom-aware: when the operator zooms TIME below the auto-fit
              width the stamp is dropped before the label (the hover title
              keeps the information), so nothing overlaps at any scale. */}
          {(() => {
            if (box.width < chipLanePx(c.label.length) - 8) return null;
            const fmtSlots = (n: number) =>
              slotMinutes != null ? `${Math.round(n * slotMinutes)}m` : String(n);
            if (c.state === 'playing' && c.overrunSlots > 0) {
              return (
                <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
                  <span className="sw-late-nudge rounded-xs bg-status-warning px-1 text-[9px] font-semibold leading-4 text-background sw-num">
                    +{fmtSlots(c.overrunSlots)}
                  </span>
                </span>
              );
            }
            if (c.state === 'playing' && slotMinutes != null) {
              return (
                <span
                  className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[9px] opacity-80 sw-num"
                  data-testid={`run-elapsed-${c.key}`}
                >
                  {Math.max(0, Math.round(c.placement.span * slotMinutes))}m
                </span>
              );
            }
            if (c.pushedSlots > 0) {
              return (
                <span
                  data-testid={`run-delayed-${c.key}`}
                  aria-label={`Delayed ${c.pushedSlots} slot${c.pushedSlots === 1 ? '' : 's'}`}
                  className="sw-late-nudge pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[9px] font-semibold uppercase tracking-wide text-status-warning sw-num"
                >
                  ▸+{fmtSlots(c.pushedSlots)}
                </span>
              );
            }
            if (c.late) {
              return (
                <span
                  data-testid={`run-late-${c.key}`}
                  aria-label="Late"
                  className="sw-late-nudge pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[9px] font-semibold uppercase tracking-wide text-status-warning"
                >
                  Late
                </span>
              );
            }
            return null;
          })()}
        </MatchChip>
      );
    },
    [chipByKey, selectedKey, onSelect, slotMinutes, flipFlash, clearFlipFlash],
  );

  if (chips.length === 0) {
    return (
      <div data-testid="run-live-board" data-mode="live" className="w-full shrink-0 border-b border-border">
        <p
          data-testid="run-board-empty"
          className="px-4 py-6 text-center text-2xs text-muted-foreground"
        >
          No matches on court yet. Assign from the queue to fill a court.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="run-live-board" data-mode="live" className="w-full shrink-0 overflow-x-auto border-b border-border">
      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        // Same cell geometry as the Plan board (UnifiedOpsBoard) — the two
        // boards are ONE court plan and should read identically; the old
        // `roomy` tier's 64px rows wasted vertical space on chips that are
        // label-height anyway (feature fix, 2026-07-02).
        density="standard"
        laneOrientation="vertical"
        slotScale={timeZoom}
        placements={placements}
        renderBlock={renderBlock}
        currentSlot={currentSlot}
        renderSlotLabel={(slotId, i) =>
          i % 2 === 0 ? (formatSlot ? formatSlot(slotId) : `S${slotId}`) : ''
        }
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
        {/* Stamp legend — the chips carry at most ONE figure each; this line
            says what each voice means so the numbers are never cryptic. */}
        <span
          data-testid="run-board-legend"
          className="ml-auto hidden items-center gap-3 text-muted-foreground sm:flex"
        >
          <span>
            <span className="font-semibold text-status-warning">+n</span> over time
          </span>
          <span>
            <span className="font-semibold text-status-warning">▸n</span> late start
          </span>
          {slotMinutes != null && (
            <span>
              <span className="font-semibold text-foreground">n</span> min played
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
