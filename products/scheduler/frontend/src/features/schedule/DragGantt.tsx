/**
 * Drag-to-reschedule Gantt (meet Schedule tab).
 *
 * A GanttTimeline adapter. dnd-kit stays entirely consumer-side:
 *  - every (court, slot) cell is a `useDroppable` node, mounted via
 *    the scaffold's `renderCell` prop (DropCell)
 *  - every match block is a `useDraggable` node, mounted via the
 *    scaffold's `renderBlock` prop (MatchBlock)
 *  - the whole scaffold is wrapped in <DndContext>
 * The scaffold imports no @dnd-kit and knows nothing about drag.
 *
 * Kept consumer-side: the debounced /schedule/validate orchestrator
 * (its own timer + AbortController + dedupe ref), the green/red hover
 * wash, the animate-drop-ok / animate-shake drop feedback, and
 * pinAndResolve().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, DoorOpen, X as XIcon } from '@phosphor-icons/react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  GanttTimeline,
  GANTT_GEOMETRY,
  type Placement,
  type GanttCell,
  type GanttBlockBox,
} from '@scheduler/design-system/components';
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import { indexById } from '../../lib/indexById';
import { Hint } from '../../components/Hint';
import { useSchedule } from '../../hooks/useSchedule';
import { calculateTotalSlots, formatSlotTime } from '../../lib/time';
import {
  getClosedSlotWindows,
  isCourtFullyClosed,
  isSlotClosed,
} from '../../lib/courtClosures';
import type {
  MatchDTO,
  ScheduleDTO,
  TournamentConfig,
  ValidationResponseDTO,
} from '../../api/dto';
import { getEventColor, EVENT_COLORS } from './eventColors';

const VALIDATE_DEBOUNCE_MS = 80;
const STANDARD = GANTT_GEOMETRY.standard;

interface DragGanttProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  config: TournamentConfig;
  selectedMatchId?: string | null;
  onMatchSelect?: (matchId: string) => void;
  currentSlot?: number;
  readOnly?: boolean;
  onRequestReopenCourt?: (courtId: number) => void;
}

type CellId = `cell:${number}:${number}`;
type BlockId = `match:${string}`;

function cellId(courtId: number, slotId: number): CellId {
  return `cell:${courtId}:${slotId}`;
}

function parseCell(
  id: string | number | null | undefined,
): { courtId: number; slotId: number } | null {
  if (typeof id !== 'string') return null;
  const m = /^cell:(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return { courtId: Number(m[1]), slotId: Number(m[2]) };
}

function matchLabel(m: MatchDTO): string {
  if (m.eventRank) return m.eventRank;
  if (m.matchNumber) return `M${m.matchNumber}`;
  return m.id.slice(0, 4);
}

type DropFx = { type: 'ok' | 'shake'; courtId: number; slotId: number; nonce: number };

export function DragGantt({
  schedule,
  matches,
  config,
  selectedMatchId,
  onMatchSelect,
  currentSlot,
  readOnly = false,
  onRequestReopenCourt,
}: DragGanttProps) {
  const players = useTournamentStore((s) => s.players);
  const pendingPin = useUiStore((s) => s.pendingPin);
  const setLastValidation = useUiStore((s) => s.setLastValidation);
  const { pinAndResolve } = useSchedule();
  const isGenerating = useUiStore((s) => s.isGenerating);

  const matchMap = useMemo(() => indexById(matches), [matches]);
  const totalSlots = calculateTotalSlots(config);

  const { minSlot, maxSlot } = useMemo(() => {
    if (schedule.assignments.length === 0)
      return { minSlot: 0, maxSlot: Math.min(16, totalSlots) };
    const starts = schedule.assignments.map((a) => a.slotId);
    const ends = schedule.assignments.map((a) => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...starts) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...ends) + 2),
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

  // --- drag state --------------------------------------------------------
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState<{ courtId: number; slotId: number } | null>(null);
  const [validation, setValidation] = useState<ValidationResponseDTO | null>(null);
  const [dropFx, setDropFx] = useState<DropFx | null>(null);
  const validateAbortRef = useRef<AbortController | null>(null);
  const validateTimerRef = useRef<number | null>(null);
  const dropFxTimerRef = useRef<number | null>(null);
  const lastValidatedKeyRef = useRef<string | null>(null);

  const activeAssignment = useMemo(() => {
    if (!activeId || !activeId.startsWith('match:')) return null;
    const id = activeId.slice('match:'.length);
    return schedule.assignments.find((a) => a.matchId === id) ?? null;
  }, [activeId, schedule.assignments]);

  const clearDragState = useCallback(() => {
    setActiveId(null);
    setDragDelta({ x: 0, y: 0 });
    setHoverCell(null);
    setValidation(null);
    setLastValidation(null);
    if (validateTimerRef.current !== null) {
      window.clearTimeout(validateTimerRef.current);
      validateTimerRef.current = null;
    }
    if (validateAbortRef.current) {
      validateAbortRef.current.abort();
      validateAbortRef.current = null;
    }
    if (dropFxTimerRef.current !== null) {
      window.clearTimeout(dropFxTimerRef.current);
      dropFxTimerRef.current = null;
    }
    lastValidatedKeyRef.current = null;
  }, [setLastValidation]);

  useEffect(() => () => clearDragState(), [clearDragState]);

  // Inline /schedule/validate orchestrator — owns its debounce timer,
  // AbortController, and dedupe ref together (documented one-off
  // exception; extracting it would split drag state across two files).
  const scheduleValidation = useCallback(
    (matchId: string, targetCourt: number, targetSlot: number) => {
      if (!config) return;
      const key = `${matchId}:${targetCourt}:${targetSlot}`;
      if (lastValidatedKeyRef.current === key) return;
      lastValidatedKeyRef.current = key;
      if (validateTimerRef.current !== null) {
        window.clearTimeout(validateTimerRef.current);
      }
      validateTimerRef.current = window.setTimeout(async () => {
        if (validateAbortRef.current) validateAbortRef.current.abort();
        const ctl = new AbortController();
        validateAbortRef.current = ctl;
        try {
          const res = await apiClient.validateMove({
            config,
            players,
            matches,
            assignments: schedule.assignments,
            proposedMove: { matchId, slotId: targetSlot, courtId: targetCourt },
            signal: ctl.signal,
          });
          setValidation(res);
          setLastValidation({
            matchId,
            slotId: targetSlot,
            courtId: targetCourt,
            feasible: res.feasible,
            conflicts: res.conflicts,
          });
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return;
          setValidation({
            feasible: false,
            conflicts: [{ type: 'network', description: String(err) }],
          });
        }
      }, VALIDATE_DEBOUNCE_MS);
    },
    [config, players, matches, schedule.assignments, setLastValidation],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      setDragDelta({ x: event.delta.x, y: event.delta.y });
      const cell = parseCell(event.over?.id);
      if (cell) {
        setHoverCell(cell);
        const matchId =
          typeof event.active.id === 'string' ? event.active.id.slice('match:'.length) : '';
        if (matchId) scheduleValidation(matchId, cell.courtId, cell.slotId);
      } else {
        setHoverCell(null);
        setValidation(null);
        lastValidatedKeyRef.current = null;
      }
    },
    [scheduleValidation],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const cell = parseCell(event.over?.id);
      const activeMatchId =
        typeof event.active.id === 'string' ? event.active.id.slice('match:'.length) : '';
      if (cell && activeMatchId) {
        const current = schedule.assignments.find((a) => a.matchId === activeMatchId);
        const unchanged =
          current && current.courtId === cell.courtId && current.slotId === cell.slotId;
        const feasible = validation?.feasible ?? true;
        if (!unchanged) {
          setDropFx({
            type: feasible ? 'ok' : 'shake',
            courtId: cell.courtId,
            slotId: cell.slotId,
            nonce: Date.now(),
          });
          if (dropFxTimerRef.current !== null) {
            window.clearTimeout(dropFxTimerRef.current);
          }
          dropFxTimerRef.current = window.setTimeout(() => {
            setDropFx(null);
            dropFxTimerRef.current = null;
          }, 900);
          if (feasible) {
            void pinAndResolve({
              matchId: activeMatchId,
              slotId: cell.slotId,
              courtId: cell.courtId,
            });
          }
        }
      }
      clearDragState();
    },
    [schedule.assignments, pinAndResolve, clearDragState, validation?.feasible],
  );

  // --- scaffold render-props --------------------------------------------

  const renderSlotLabel = useCallback(
    (slotId: number, slotIndex: number) =>
      slotIndex % 2 === 0 ? formatSlotTime(slotId, config) : '',
    [config],
  );

  const renderCell = useCallback(
    ({ courtId, slotId }: GanttCell) => {
      const slotClosed = isSlotClosed(closedWindows, courtId, slotId);
      const hovered =
        hoverCell?.courtId === courtId && hoverCell?.slotId === slotId;
      const fx =
        dropFx?.courtId === courtId && dropFx?.slotId === slotId ? dropFx : null;
      return (
        <DropCell
          courtId={courtId}
          slotId={slotId}
          isCurrent={slotId === currentSlot}
          hovered={hovered}
          validation={hovered ? validation : null}
          dropFx={fx}
          readOnly={readOnly || slotClosed}
          closed={slotClosed}
        />
      );
    },
    [closedWindows, hoverCell, dropFx, validation, currentSlot, readOnly],
  );

  const renderRow = useCallback(
    (courtId: number) => {
      const fullyClosed = isCourtFullyClosed(closedWindows, courtId, minSlot, maxSlot);
      if (!fullyClosed) return null;
      return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground/80">
          court closed
        </div>
      );
    },
    [closedWindows, minSlot, maxSlot],
  );

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

  const placements = useMemo<Placement[]>(
    () =>
      schedule.assignments.map((a) => ({
        courtIndex: a.courtId - 1,
        startSlot: a.slotId,
        span: a.durationSlots,
        key: a.matchId,
      })),
    [schedule.assignments],
  );

  const indexByKey = useMemo(
    () => new Map(placements.map((p, i) => [p.key, i])),
    [placements],
  );

  const renderBlock = useCallback(
    (placement: Placement, box: GanttBlockBox) => {
      const m = matchMap.get(placement.key);
      if (!m) return null;
      const hiddenWhileDragging = activeId === `match:${placement.key}`;
      const idx = indexByKey.get(placement.key) ?? 0;
      return (
        <MatchBlock
          matchId={placement.key}
          match={m}
          box={box}
          isSelected={selectedMatchId === placement.key}
          isPinned={pendingPin?.matchId === placement.key}
          isGenerating={isGenerating}
          onSelect={onMatchSelect}
          readOnly={readOnly || isGenerating}
          translucent={hiddenWhileDragging}
          dragDelta={hiddenWhileDragging ? dragDelta : null}
          enterDelayMs={idx * 40}
        />
      );
    },
    [
      matchMap,
      activeId,
      indexByKey,
      selectedMatchId,
      pendingPin?.matchId,
      isGenerating,
      onMatchSelect,
      readOnly,
      dragDelta,
    ],
  );

  return (
    <div data-testid="drag-gantt" className="relative">
      <Hint id="schedule.drag-instructions" className="m-2">
        Drag a match to any cell — infeasible targets glow red. Drop pins the match and re-solves the rest.
      </Hint>
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-3 py-1.5 text-2xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">Events</span>
        {Object.entries(EVENT_COLORS).map(([key, { bg, border, label }]) => (
          <span key={key} className="inline-flex items-center gap-1" title={label}>
            <span className={`inline-block h-2.5 w-2.5 rounded ${bg} border ${border}`} />
            {key}
          </span>
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        <GanttTimeline
          data-testid="drag-gantt-grid"
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

        <div
          className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-3 py-1.5 text-2xs"
          data-testid="drag-gantt-status"
        >
          {activeAssignment && hoverCell && validation ? (
            validation.feasible ? (
              <span className="inline-flex items-center gap-1 text-status-done">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Feasible — drop to pin at Court {hoverCell.courtId},{' '}
                {formatSlotTime(hoverCell.slotId, config)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Infeasible ({validation.conflicts.length} conflict
                {validation.conflicts.length === 1 ? '' : 's'}):{' '}
                {validation.conflicts[0]?.description}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">
              {schedule.assignments.length} matches scheduled across {config.courtCount} court
              {config.courtCount === 1 ? '' : 's'}.
            </span>
          )}
          {pendingPin ? (
            <span className="text-accent" data-testid="drag-gantt-pin">
              Pin in flight: {pendingPin.matchId.slice(0, 6)} to Court {pendingPin.courtId},{' '}
              {formatSlotTime(pendingPin.slotId, config)}
            </span>
          ) : null}
        </div>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DropCell({
  courtId,
  slotId,
  isCurrent,
  hovered,
  validation,
  dropFx,
  readOnly,
  closed = false,
}: {
  courtId: number;
  slotId: number;
  isCurrent: boolean;
  hovered: boolean;
  validation: ValidationResponseDTO | null;
  dropFx: { type: 'ok' | 'shake'; nonce: number } | null;
  readOnly: boolean;
  closed?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(courtId, slotId),
    disabled: readOnly,
  });
  const infeasible = !closed && hovered && validation && !validation.feasible;
  const feasible = !closed && hovered && validation && validation.feasible;
  const showOk = dropFx?.type === 'ok';
  const showShake = dropFx?.type === 'shake';
  return (
    <div
      ref={setNodeRef}
      data-testid={`cell-${courtId}-${slotId}`}
      title={closed ? `Court ${courtId} closed` : undefined}
      className={[
        'relative h-full w-full border-l border-border/30 transition-colors duration-fast',
        closed ? 'bg-muted/50' : isCurrent ? 'bg-accent/5' : '',
        !closed && isOver ? 'bg-muted/80' : '',
        !closed && hovered ? 'motion-safe:animate-cell-pulse' : '',
        infeasible ? 'ring-2 ring-inset ring-destructive bg-destructive/5' : '',
        feasible ? 'ring-2 ring-inset ring-status-done bg-status-done/5' : '',
        showShake
          ? 'motion-safe:animate-shake ring-2 ring-inset ring-destructive bg-destructive/10'
          : '',
      ].join(' ')}
    >
      {showOk ? (
        <span
          key={dropFx?.nonce}
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-safe:animate-drop-ok"
        />
      ) : null}
    </div>
  );
}

function MatchBlock({
  matchId,
  match,
  box,
  isSelected,
  isPinned,
  isGenerating,
  onSelect,
  readOnly,
  translucent,
  dragDelta,
  enterDelayMs,
}: {
  matchId: string;
  match: MatchDTO;
  box: GanttBlockBox;
  isSelected: boolean;
  isPinned: boolean;
  isGenerating: boolean;
  onSelect?: (id: string) => void;
  readOnly: boolean;
  translucent: boolean;
  dragDelta: { x: number; y: number } | null;
  enterDelayMs: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `match:${matchId}` as BlockId,
    disabled: readOnly,
  });
  const effectiveTransform = dragDelta ?? transform;
  const transformStyle = effectiveTransform
    ? CSS.Translate.toString({
        x: effectiveTransform.x,
        y: effectiveTransform.y,
        scaleX: 1,
        scaleY: 1,
      })
    : undefined;
  const positionTransition = isDragging
    ? 'none'
    : 'background-color 120ms var(--ease-brand), border-color 120ms var(--ease-brand)';
  const pinActive = isPinned && isGenerating;
  const eventColor = getEventColor(match.eventRank);
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect?.(matchId)}
      data-testid={`block-${matchId}`}
      {...listeners}
      {...attributes}
      style={{
        // inset 4px within the scaffold's positioned box.
        position: 'absolute',
        left: 0,
        top: 4,
        width: Math.max(STANDARD.slot - 4, box.width - 4),
        height: box.height - 8,
        transform: transformStyle,
        zIndex: isDragging ? 30 : isSelected ? 20 : isPinned ? 15 : 10,
        touchAction: 'none',
        opacity: translucent && !isDragging ? 0.4 : 1,
        transition: positionTransition,
        animationDelay: `${enterDelayMs}ms`,
      }}
      className={[
        'group rounded border text-left px-2 py-0.5 shadow-sm',
        'motion-safe:animate-block-in',
        isSelected
          ? 'bg-accent/10 border-accent text-accent ring-1 ring-accent/30'
          : `${eventColor.bg} ${eventColor.border} text-foreground hover:shadow-md hover:brightness-95`,
        isPinned && !pinActive ? 'ring-2 ring-inset ring-status-warning border-dashed' : '',
        readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      ].join(' ')}
      title={`${matchLabel(match)} · ${eventColor.label}`}
    >
      {pinActive ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[1px] rounded pin-marquee motion-safe:animate-marching-ants"
        />
      ) : null}
      <span className="relative text-2xs font-semibold leading-tight block truncate">
        {matchLabel(match)}
      </span>
    </button>
  );
}
