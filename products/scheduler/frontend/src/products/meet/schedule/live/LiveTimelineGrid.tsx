/**
 * Live timeline grid — the solver-optimization view. Read-only:
 * matches stream in as the solver improves the schedule. A thin
 * adapter over the shared GanttTimeline scaffold; the only thing it
 * owns is the quiet neutral chip + its entry animation and the
 * solver status strip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GanttTimeline,
  type Placement,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import { calculateTotalSlots, formatSlotTime } from '../../../../lib/time';
import { indexById } from '../../../../lib/indexById';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  TournamentConfig,
} from '../../../../api/dto';

interface LiveTimelineGridProps {
  assignments: ScheduleAssignment[];
  matches: MatchDTO[];
  players: PlayerDTO[];
  config: TournamentConfig;
  status?: 'solving' | 'complete' | 'error';
}

function getMatchLabel(match: MatchDTO): string {
  if (match.matchNumber) return `M${match.matchNumber}`;
  if (match.eventRank) return match.eventRank;
  return match.id.slice(0, 4);
}

export function LiveTimelineGrid({
  assignments,
  matches,
  players,
  config,
  status = 'solving',
}: LiveTimelineGridProps) {
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());
  const prevAssignmentsRef = useRef<string[]>([]);

  const matchMap = useMemo(() => indexById(matches), [matches]);
  const playerMap = useMemo(() => indexById(players), [players]);
  const totalSlots = useMemo(() => calculateTotalSlots(config), [config]);

  const { minSlot, maxSlot } = useMemo(() => {
    if (assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(12, totalSlots) };
    const slots = assignments.map((a) => a.slotId);
    const endSlots = assignments.map((a) => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...slots) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...endSlots) + 1),
    };
  }, [assignments, totalSlots]);
  const slotCount = maxSlot - minSlot;

  const courts = useMemo(
    () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
    [config.courtCount],
  );

  // DTO → placements.
  const placements = useMemo<Placement[]>(
    () =>
      assignments.map((a) => ({
        courtIndex: a.courtId - 1,
        startSlot: a.slotId,
        span: a.durationSlots,
        key: a.matchId,
      })),
    [assignments],
  );

  // Entry-animation tracking: newly-arrived assignments fade/scale in.
  useEffect(() => {
    const currentIds = assignments.map((a) => a.matchId);
    const prevIds = prevAssignmentsRef.current;
    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    const handles: ReturnType<typeof setTimeout>[] = [];
    if (newIds.length > 0) {
      newIds.forEach((id, index) => {
        handles.push(
          setTimeout(() => {
            setAnimatedIds((prev) => new Set([...prev, id]));
          }, index * 10),
        );
      });
    }
    prevAssignmentsRef.current = currentIds;
    return () => handles.forEach(clearTimeout);
  }, [assignments]);

  const renderSlotLabel = useCallback(
    (slotId: number, slotIndex: number) =>
      slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
    [config],
  );

  const renderBlock = useCallback(
    (placement: Placement, box: GanttBlockBox) => {
      const match = matchMap.get(placement.key);
      const isAnimated = animatedIds.has(placement.key);
      const sideANames = match?.sideA
        ?.map((id) => playerMap.get(id)?.name || 'Unknown')
        .join(', ');
      const sideBNames = match?.sideB
        ?.map((id) => playerMap.get(id)?.name || 'Unknown')
        .join(', ');
      const tooltip = match
        ? [
            match.eventRank ?? match.id.slice(0, 4),
            sideANames ? `A: ${sideANames}` : '',
            sideBNames ? `B: ${sideBNames}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : placement.key;
      return (
        <div
          // top-0.5 inset within the scaffold's row box (4px shorter).
          // Quiet neutral (the shared "scheduled" intensity) — these are all
          // pre-day assignments materializing; the chip label already names
          // the event, so no event hues (one color language with Run).
          className={`absolute inset-x-0 top-0.5 rounded border cursor-default hover:brightness-95
            bg-muted/30 border-border
            transition-[opacity,transform] duration-fast ease-brand
            ${isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          style={{ height: box.height - 4 }}
          title={tooltip}
        >
          <div className="px-1 h-full flex items-center">
            <span className="text-xs font-medium break-words text-foreground">
              {match ? getMatchLabel(match) : '?'}
            </span>
          </div>
        </div>
      );
    },
    [matchMap, playerMap, animatedIds],
  );

  if (assignments.length === 0) {
    return (
      <div className="bg-muted/40 rounded border border-border p-4 text-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 bg-status-started rounded-full animate-bounce"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
          <div className="text-xs">Waiting for first solution…</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Solver status strip (the EVENTS hue legend is gone — chips carry
          their event in the label; one color language with Run). */}
      <div className="px-2 py-1 border-b border-border/60 bg-muted/40 flex items-center gap-3 text-xs">
        <div className="flex-1" />
        {status === 'solving' && (
          <span className="flex items-center gap-1 text-status-started">
            <span className="w-1.5 h-1.5 rounded-full bg-status-started animate-ping" />
            Optimizing
          </span>
        )}
        {status === 'complete' && (
          <span className="flex items-center gap-1 text-status-live">
            <span className="w-1.5 h-1.5 rounded-full bg-status-live" />
            Complete
          </span>
        )}
      </div>

      <GanttTimeline
        courts={courts}
        minSlot={minSlot}
        slotCount={slotCount}
        density="compact"
        placements={placements}
        renderBlock={renderBlock}
        renderSlotLabel={renderSlotLabel}
        headerLabel=""
      />
    </div>
  );
}
