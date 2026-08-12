/**
 * GanttChart — meet Live tab. A GanttTimeline adapter that paints
 * status-colored blocks with the live state-ring vocabulary.
 *
 * Stays consumer-side (the scaffold only positions):
 *  - matchStates adaptation + getRenderSlot() elapsed-time shift
 *  - horizontal sub-lane packing (emits laneIndex / laneCount)
 *  - the ring priority ladder: selected > blocked > impacted >
 *    postponed > resting > late
 *  - click-select, animatedIds state-change pulse
 *  - closed-court row/cell shading
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen } from '@phosphor-icons/react';
import {
  LIFECYCLE_STYLES,
  SELECTION_RING,
  exceptionFor,
  lifecycleOf,
} from '../timelineEncoding';
import { TimelineKey } from '../TimelineKey';
import {
  GanttTimeline,
  type Placement,
  type GanttCell,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import {
  calculateTotalSlots,
  formatSlotTime,
  getRenderSlot,
  hasStaleActualTiming,
} from '../../../lib/time';
import {
  getClosedSlotWindows,
  isCourtFullyClosed,
  isSlotClosed,
} from '../../../lib/courtClosures';
import { indexById } from '../../../lib/indexById';
import type { TrafficLightResult } from '../../../utils/trafficLight';
import type {
  ScheduleDTO,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
  ScheduleAssignment,
} from '../../../api/dto';

interface GanttChartProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  matchStates: Record<string, MatchStateDTO>;
  config: TournamentConfig;
  currentSlot: number;
  selectedMatchId?: string | null;
  onMatchSelect: (matchId: string) => void;
  impactedMatchIds?: string[];
  trafficLights?: Map<string, TrafficLightResult>;
  onRequestReopenCourt?: (courtId: number) => void;
}

// Lifecycle-by-intensity styles + the exception vocabulary live in the
// shared ../timelineEncoding module so Plan's DragGantt paints the same
// language (SPEC_AMENDMENT_timeline_encoding; Phase-4 build-for-both).

function getMatchLabel(match: MatchDTO): string {
  if (match.eventRank) return match.eventRank;
  if (match.matchNumber) return `M${match.matchNumber}`;
  return match.id.slice(0, 6);
}


function GanttChartImpl({
  schedule,
  matches,
  matchStates,
  config,
  currentSlot,
  selectedMatchId,
  onMatchSelect,
  impactedMatchIds = [],
  trafficLights,
  onRequestReopenCourt,
}: GanttChartProps) {
  const matchMap = useMemo(() => indexById(matches), [matches]);
  // Planned slot per match, indexed once — renderBlock previously did a
  // linear `.find` over all assignments per block (O(N²) across the grid,
  // re-run on every 5s sync). PERF_FINDINGS.md §2 FIX B.
  const assignmentSlotById = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of schedule.assignments) m.set(a.matchId, a.slotId);
    return m;
  }, [schedule.assignments]);
  const impactedSet = useMemo(() => new Set(impactedMatchIds), [impactedMatchIds]);
  const totalSlots = calculateTotalSlots(config);

  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
  const prevStatesRef = useRef<Record<string, string>>({});

  const courts = useMemo(
    () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
    [config.courtCount],
  );
  const closedWindows = useMemo(
    () => getClosedSlotWindows(config, totalSlots),
    [config, totalSlots],
  );

  // Group assignments by EFFECTIVE court (actualCourtId override),
  // sorted by render slot. Carries the renderSlot so packing + the
  // placement map don't recompute getRenderSlot.
  const courtRows = useMemo(() => {
    const byCourt = new Map<
      number,
      { assignment: ScheduleAssignment; renderSlotId: number; renderSpan: number }[]
    >();
    for (let c = 1; c <= config.courtCount; c++) byCourt.set(c, []);
    for (const a of schedule.assignments) {
      const effCourt = matchStates[a.matchId]?.actualCourtId ?? a.courtId;
      const r = getRenderSlot(a, matchStates[a.matchId], config);
      (byCourt.get(effCourt) ?? []).push({
        assignment: a,
        renderSlotId: r.slotId,
        renderSpan: r.durationSlots,
      });
    }
    byCourt.forEach((rows) =>
      rows.sort(
        (x, y) =>
          x.renderSlotId - y.renderSlotId || x.assignment.slotId - y.assignment.slotId,
      ),
    );
    return byCourt;
  }, [schedule.assignments, config, matchStates]);

  // Honesty pass. getRenderSlot refuses an actual timestamp that isn't from
  // the configured day and draws the match at its PLANNED slot instead —
  // right, but indistinguishable from a match that ran exactly on time. Say
  // which it is; this is the normal state of every past tournament's Live tab.
  const staleTimingCount = useMemo(
    () =>
      schedule.assignments.filter((a) =>
        hasStaleActualTiming(matchStates[a.matchId], config),
      ).length,
    [schedule.assignments, matchStates, config],
  );

  // Axis extent covers BOTH the planned slots and the live render slots.
  // Render slots come from wall-clock actual start/end times (getRenderSlot),
  // so a match played later than planned used to land PAST maxSlot and paint
  // in unlabeled space right of the grid; the axis must follow reality.
  //
  // Bounded, though: getRenderSlot's duration is uncapped (a Finish pressed
  // hours late, or a restored row with a next-day actualEndTime, yields a
  // 50–100-slot span), and an unbounded axis would shrink every real chip to
  // a sliver. The live extension is capped a few hours past the configured
  // day; anything beyond is dirty data, and placements are clamped into the
  // capped extent below so a chip can never render off-grid either way.
  const EXTENT_OVERRUN_SLOTS = 8;
  const { minSlot, maxSlot } = useMemo(() => {
    if (schedule.assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
    const cap = totalSlots + EXTENT_OVERRUN_SLOTS;
    let lo = Number.POSITIVE_INFINITY;
    let hi = 0;
    for (const a of schedule.assignments) {
      lo = Math.min(lo, a.slotId);
      hi = Math.max(hi, a.slotId + a.durationSlots);
    }
    hi = Math.min(totalSlots, hi + 1); // planned range: clamp to the day, +1 pad
    courtRows.forEach((rows) => {
      for (const { renderSlotId, renderSpan } of rows) {
        lo = Math.min(lo, renderSlotId);
        hi = Math.max(hi, Math.min(cap, renderSlotId + renderSpan));
      }
    });
    return { minSlot: Math.max(0, lo - 1), maxSlot: hi };
  }, [schedule.assignments, courtRows, totalSlots]);
  const slotCount = maxSlot - minSlot;

  // Horizontal sub-lane packing. Each block's laneCount = max
  // concurrent blocks on its court during its lifetime; lane = lowest
  // free horizontal lane at placement time.
  const packing = useMemo(() => {
    const laneByMatchId = new Map<string, number>();
    const laneCountByMatchId = new Map<string, number>();
    courtRows.forEach((rows) => {
      let active: { matchId: string; lane: number; end: number }[] = [];
      for (const { assignment, renderSlotId, renderSpan } of rows) {
        const start = renderSlotId;
        const end = start + renderSpan;
        active = active.filter((x) => x.end > start);
        const used = new Set(active.map((x) => x.lane));
        let lane = 0;
        while (used.has(lane)) lane++;
        laneByMatchId.set(assignment.matchId, lane);
        active.push({ matchId: assignment.matchId, lane, end });
        const size = active.length;
        for (const x of active) {
          const prior = laneCountByMatchId.get(x.matchId) ?? 1;
          if (size > prior) laneCountByMatchId.set(x.matchId, size);
        }
      }
    });
    return { laneByMatchId, laneCountByMatchId };
  }, [courtRows]);

  // DTO → placements (render slot + packing applied). Clamped into the
  // capped axis extent — a dirty multi-hour render span shows as a chip
  // pinned at the grid's right edge instead of blowing past it.
  const placements = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    courtRows.forEach((rows, courtId) => {
      for (const { assignment, renderSlotId, renderSpan } of rows) {
        const startSlot = Math.min(renderSlotId, Math.max(minSlot, maxSlot - 1));
        const span = Math.max(1, Math.min(renderSpan, maxSlot - startSlot));
        out.push({
          courtIndex: courtId - 1,
          startSlot,
          span,
          laneIndex: packing.laneByMatchId.get(assignment.matchId) ?? 0,
          laneCount: packing.laneCountByMatchId.get(assignment.matchId) ?? 1,
          key: assignment.matchId,
        });
      }
    });
    return out;
  }, [courtRows, packing, minSlot, maxSlot]);

  // State-change pulse: a block whose status flips scales up briefly.
  useEffect(() => {
    const currentStates: Record<string, string> = {};
    schedule.assignments.forEach((a) => {
      currentStates[a.matchId] = matchStates[a.matchId]?.status || 'scheduled';
    });
    const changedIds = Object.keys(currentStates).filter(
      (id) => prevStatesRef.current[id] !== currentStates[id],
    );
    const handles: ReturnType<typeof setTimeout>[] = [];
    if (changedIds.length > 0) {
      changedIds.forEach((id, index) => {
        handles.push(
          setTimeout(() => {
            setAnimatedIds((prev) => new Set([...prev, id]));
          }, index * 30),
        );
        handles.push(
          setTimeout(() => {
            setAnimatedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, index * 30 + 300),
        );
      });
    }
    prevStatesRef.current = currentStates;
    return () => handles.forEach(clearTimeout);
  }, [schedule.assignments, matchStates]);

  const renderSlotLabel = useCallback(
    (slotId: number, slotIndex: number) =>
      slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
    [config],
  );

  // Closed-cell shading + currentSlot tint + every-other divider.
  const renderCell = useCallback(
    ({ courtId, slotId, slotIndex }: GanttCell) => {
      const slotClosed = isSlotClosed(closedWindows, courtId, slotId);
      const showDivider = slotIndex % 2 === 0;
      return (
        <div
          className={`h-full w-full ${showDivider ? 'border-l border-border/30' : ''} ${
            slotClosed
              ? 'bg-muted/50'
              : slotId === currentSlot
                ? 'bg-accent/10'
                : ''
          }`}
          title={slotClosed ? `Court ${courtId} closed` : undefined}
        />
      );
    },
    [closedWindows, currentSlot],
  );

  // Fully-closed court → "closed" overlay behind the blocks.
  const renderRow = useCallback(
    (courtId: number) => {
      const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
      if (!fullyClosed) return null;
      return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground">
          closed
        </div>
      );
    },
    [closedWindows, minSlot, maxSlot],
  );

  // Court-label column: a Reopen button when fully closed + callback present.
  const renderCourtLabel = useCallback(
    (courtId: number) => {
      const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
      if (fullyClosed && onRequestReopenCourt) {
        return (
          <button
            type="button"
            onClick={() => onRequestReopenCourt(courtId)}
            title={`Court ${courtId} closed — open Reopen panel`}
            aria-label={`Court ${courtId} is closed. Click to open Reopen panel.`}
            className="flex h-full w-full items-center gap-1 px-2 text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground hover:bg-status-warning-bg hover:text-status-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          >
            <span className="line-through">C{courtId}</span>
            <DoorOpen className="h-3 w-3" aria-hidden="true" />
          </button>
        );
      }
      return (
        <span
          className={`flex h-full items-center px-2 text-xs font-semibold tabular-nums ${
            fullyClosed
              ? 'bg-muted/60 text-muted-foreground line-through'
              : 'bg-muted/30 text-foreground'
          }`}
        >
          C{courtId}
        </span>
      );
    },
    [closedWindows, minSlot, maxSlot, onRequestReopenCourt],
  );

  // Status-colored block + the full ring vocabulary + click-select.
  const renderBlock = useCallback(
    (placement: Placement, box: GanttBlockBox) => {
      const matchId = placement.key;
      const match = matchMap.get(matchId);
      const state = matchStates[matchId];
      const status = lifecycleOf(state);
      const styles = LIFECYCLE_STYLES[status];
      const isSelected = selectedMatchId === matchId;
      const isAnimated = animatedIds.has(matchId);
      const assignmentSlot = assignmentSlotById.get(matchId) ?? 0;
      const isLate =
        currentSlot > assignmentSlot && (status === 'scheduled' || status === 'called');
      const isPostponed = state?.postponed === true;
      const isInProgress = status === 'started';
      // impacted = a match the PENDING repair proposal would move (bound to
      // the P2 banner, cleared on apply/dismiss) — NOT the selected match's
      // shared-player set anymore (§3).
      const isImpacted = impactedSet.has(matchId);
      const traffic = trafficLights?.get(matchId);
      const conflictActionable =
        traffic && (status === 'scheduled' || status === 'called');
      const isBlocked = !!conflictActionable && traffic!.status === 'red';
      const isResting = !!conflictActionable && traffic!.status === 'yellow';

      // ONE exception hue, paired with a glyph (never colour alone) —
      // shared vocabulary. resting is evicted from the block (tooltip only).
      const {
        border: exceptionBorder,
        extra: exceptionExtra,
        Glyph: ExceptionGlyph,
        glyphTone,
      } = exceptionFor({ isBlocked, isPostponed, isLate, baseBorder: styles.border });

      // Selection is INTERACTION, not data → the neutral canon focus ring,
      // separate from the exception hues.
      const selectionRing = isSelected ? SELECTION_RING : '';

      const multiLane = (placement.laneCount ?? 1) > 1;

      const lateMin = isLate
        ? Math.max(0, currentSlot - assignmentSlot) * (config.intervalMinutes ?? 0)
        : 0;
      const title = [
        match ? getMatchLabel(match) : '?',
        `C${placement.courtIndex + 1}`,
        status,
        isLate && lateMin > 0 ? `${lateMin}m late` : null,
        isPostponed ? 'postponed' : null,
        isBlocked && traffic?.reason ? `blocked: ${traffic.reason}` : null,
        isResting && traffic?.reason ? `resting: ${traffic.reason}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return (
        // A real <button>, like the sibling Plan Gantt's blocks (DragGantt) and
        // like this file's own Reopen court label. As a `<div onClick>` it had
        // no tabIndex, no role and no key handler, so the whole Live timeline
        // was unreachable without a mouse (WCAG 2.1.1).
        <button
          type="button"
          onClick={() => onMatchSelect(matchId)}
          className={`absolute inset-x-0 top-0.5 block rounded border text-left cursor-pointer
            ${styles.bg} ${exceptionBorder} ${exceptionExtra}
            transition-[transform,box-shadow,filter] duration-fast ease-brand
            ${isAnimated ? 'scale-105' : ''}
            ${selectionRing}
            ${isInProgress ? 'shadow-sm' : ''}
            hover:brightness-95
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`}
          style={{ height: box.height - 4 }}
          title={title}
        >
          {/* impacted: dashed accent overlay, only while a proposal is pending. */}
          {isImpacted && (
            <div className="pointer-events-none absolute inset-0 rounded border-2 border-dashed border-accent" />
          )}
          <div
            className={`h-full flex flex-col justify-center overflow-hidden leading-tight ${
              multiLane ? 'px-0 items-center' : 'px-2 items-start'
            }`}
          >
            <span
              className={`text-2xs font-semibold whitespace-nowrap overflow-hidden tabular-nums ${styles.text}`}
            >
              {match ? getMatchLabel(match) : '?'}
            </span>
          </div>
          {ExceptionGlyph && (
            <ExceptionGlyph
              aria-hidden="true"
              weight="fill"
              className={`pointer-events-none absolute right-0.5 top-0.5 h-3 w-3 ${glyphTone}`}
            />
          )}
        </button>
      );
    },
    [
      matchMap,
      matchStates,
      selectedMatchId,
      animatedIds,
      currentSlot,
      impactedSet,
      trafficLights,
      assignmentSlotById,
      onMatchSelect,
      config,
    ],
  );

  return (
    <div className="relative overflow-hidden">
      <TimelineKey />
      {staleTimingCount > 0 ? (
        <p className="px-2 pb-1 text-2xs text-muted-foreground">
          Showing planned times for {staleTimingCount}{' '}
          {staleTimingCount === 1 ? 'match' : 'matches'} — their recorded start
          times are not from this tournament&rsquo;s day.
        </p>
      ) : null}
      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        density="standard"
        placements={placements}
        renderBlock={renderBlock}
        renderCell={renderCell}
        renderRow={renderRow}
        renderCourtLabel={renderCourtLabel}
        renderSlotLabel={renderSlotLabel}
        currentSlot={currentSlot}
      />
    </div>
  );
}

// Memoized: with props stabilized upstream (impactedMatchIds/onRequestReopenCourt
// hoisted in MatchControlCenterPage, matchStates now referentially stable when
// unchanged — PERF_FINDINGS.md FIX C/F), the Gantt skips re-render on the 5s
// no-op sync and on unrelated parent state (details toggle, dialogs).
export const GanttChart = memo(GanttChartImpl);
