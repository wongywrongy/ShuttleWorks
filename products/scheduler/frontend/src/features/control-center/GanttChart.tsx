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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen } from '@phosphor-icons/react';
import {
  GanttTimeline,
  type Placement,
  type GanttCell,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import { calculateTotalSlots, formatSlotTime, getRenderSlot } from '../../lib/time';
import {
  getClosedSlotWindows,
  isCourtFullyClosed,
  isSlotClosed,
} from '../../lib/courtClosures';
import { indexById } from '../../lib/indexById';
import type { TrafficLightResult } from '../../utils/trafficLight';
import type {
  ScheduleDTO,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
  ScheduleAssignment,
} from '../../api/dto';

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

// Status → block fill. Wired to the semantic status-* tokens.
const STATUS_STYLES: Record<
  'scheduled' | 'called' | 'started' | 'finished',
  { bg: string; border: string; text: string }
> = {
  scheduled: { bg: 'bg-status-idle-bg', border: 'border-status-idle/40', text: 'text-foreground' },
  called: { bg: 'bg-status-called-bg', border: 'border-status-called/60', text: 'text-status-called' },
  started: {
    bg: 'bg-status-live-bg shadow-[inset_0_0_0_1px_hsl(var(--status-live)/0.5)]',
    border: 'border-status-live/60',
    text: 'text-status-live',
  },
  finished: { bg: 'bg-status-done-bg', border: 'border-status-done/30', text: 'text-muted-foreground' },
};

function getMatchLabel(match: MatchDTO): string {
  if (match.eventRank) return match.eventRank;
  if (match.matchNumber) return `M${match.matchNumber}`;
  return match.id.slice(0, 6);
}

export function GanttChart({
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
  const impactedSet = useMemo(() => new Set(impactedMatchIds), [impactedMatchIds]);
  const totalSlots = calculateTotalSlots(config);

  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
  const prevStatesRef = useRef<Record<string, string>>({});

  const { minSlot, maxSlot } = useMemo(() => {
    if (schedule.assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
    const slots = schedule.assignments.map((a) => a.slotId);
    const endSlots = schedule.assignments.map((a) => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...slots) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
    };
  }, [schedule.assignments, totalSlots]);
  const slotCount = maxSlot - minSlot;

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

  // DTO → placements (render slot + packing applied).
  const placements = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    courtRows.forEach((rows, courtId) => {
      for (const { assignment, renderSlotId, renderSpan } of rows) {
        out.push({
          courtIndex: courtId - 1,
          startSlot: renderSlotId,
          span: renderSpan,
          laneIndex: packing.laneByMatchId.get(assignment.matchId) ?? 0,
          laneCount: packing.laneCountByMatchId.get(assignment.matchId) ?? 1,
          key: assignment.matchId,
        });
      }
    });
    return out;
  }, [courtRows, packing]);

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
                ? 'bg-status-live/10'
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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground/80">
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
      const status = state?.status || 'scheduled';
      const styles = STATUS_STYLES[status];
      const isSelected = selectedMatchId === matchId;
      const isAnimated = animatedIds.has(matchId);
      const assignmentSlot = schedule.assignments.find((a) => a.matchId === matchId)?.slotId ?? 0;
      const isLate =
        currentSlot > assignmentSlot && (status === 'scheduled' || status === 'called');
      const isPostponed = state?.postponed === true;
      const isInProgress = status === 'started';
      const isImpacted = impactedSet.has(matchId);
      const traffic = trafficLights?.get(matchId);
      const conflictActionable =
        traffic && (status === 'scheduled' || status === 'called');
      const isBlocked = conflictActionable && traffic.status === 'red';
      const isResting = conflictActionable && traffic.status === 'yellow';

      // Ring priority: selected > blocked > impacted > postponed > resting > late.
      let ringClass = '';
      if (isSelected) ringClass = 'ring-2 ring-inset ring-status-started';
      else if (isBlocked) ringClass = 'ring-2 ring-inset ring-status-blocked';
      else if (isImpacted) ringClass = 'ring-2 ring-inset ring-purple-500';
      else if (isPostponed) ringClass = 'ring-2 ring-inset ring-red-400';
      else if (isResting) ringClass = 'ring-2 ring-inset ring-status-warning';
      else if (isLate) ringClass = 'ring-2 ring-inset ring-yellow-400';

      const multiLane = (placement.laneCount ?? 1) > 1;

      return (
        <div
          onClick={() => onMatchSelect(matchId)}
          className={`absolute inset-x-0 top-0.5 rounded border cursor-pointer
            ${styles.bg} ${styles.border}
            transition-[transform,box-shadow,filter] duration-fast ease-brand
            ${isAnimated ? 'scale-105' : ''}
            ${ringClass}
            ${isInProgress ? 'shadow-sm' : ''}
            hover:brightness-95`}
          style={{ height: box.height - 4 }}
          title={
            (match ? getMatchLabel(match) : '?') +
            (traffic?.reason && conflictActionable ? ` — ${traffic.reason}` : '')
          }
        >
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
        </div>
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
      schedule.assignments,
      onMatchSelect,
    ],
  );

  return (
    <div className="overflow-hidden">
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
