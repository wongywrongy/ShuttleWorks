/**
 * Drag-to-reschedule Gantt.
 *
 * - Every match is a draggable block anchored at its (court, slot) position.
 * - Every (court, slot) cell is a drop target.
 * - While dragging, the component debounces a call to /schedule/validate and
 *   paints the hovered cell either green (feasible) or red (infeasible).
 * - Dropping on a cell sets an optimistic pin and kicks off /schedule/stream
 *   with `pinnedSlotId` / `pinnedCourtId` so the solver reshuffles everything
 *   else around the new anchor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X as XIcon } from 'lucide-react';
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
import { apiClient } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { useSchedule } from '../../hooks/useSchedule';
import { calculateTotalSlots, formatSlotTime } from '../../utils/timeUtils';
import type {
  MatchDTO,
  ScheduleAssignment,
  ScheduleDTO,
  TournamentConfig,
  ValidationResponseDTO,
} from '../../api/dto';

const SLOT_WIDTH = 56;
const ROW_HEIGHT = 40;
const COURT_LABEL_WIDTH = 56;
const VALIDATE_DEBOUNCE_MS = 80;

interface DragGanttProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  config: TournamentConfig;
  selectedMatchId?: string | null;
  onMatchSelect?: (matchId: string) => void;
  currentSlot?: number;
  readOnly?: boolean;
}

type CellId = `cell:${number}:${number}`; // cell:court:slot
type BlockId = `match:${string}`;

function cellId(courtId: number, slotId: number): CellId {
  return `cell:${courtId}:${slotId}`;
}

function parseCell(id: string | number | null | undefined): { courtId: number; slotId: number } | null {
  if (typeof id !== 'string') return null;
  const match = /^cell:(\d+):(\d+)$/.exec(id);
  if (!match) return null;
  return { courtId: Number(match[1]), slotId: Number(match[2]) };
}

function matchLabel(m: MatchDTO): string {
  if (m.eventRank) return m.eventRank;
  if (m.matchNumber) return `M${m.matchNumber}`;
  return m.id.slice(0, 4);
}

export function DragGantt({
  schedule,
  matches,
  config,
  selectedMatchId,
  onMatchSelect,
  currentSlot,
  readOnly = false,
}: DragGanttProps) {
  const players = useAppStore((s) => s.players);
  const pendingPin = useAppStore((s) => s.pendingPin);
  const setLastValidation = useAppStore((s) => s.setLastValidation);
  const { pinAndResolve } = useSchedule();
  const isGenerating = useAppStore((s) => s.isGenerating);

  const matchMap = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const totalSlots = calculateTotalSlots(config);

  // Visible range: clip to the active assignments plus a little padding.
  const { minSlot, maxSlot } = useMemo(() => {
    if (schedule.assignments.length === 0) return { minSlot: 0, maxSlot: Math.min(16, totalSlots) };
    const starts = schedule.assignments.map((a) => a.slotId);
    const ends = schedule.assignments.map((a) => a.slotId + a.durationSlots);
    return {
      minSlot: Math.max(0, Math.min(...starts) - 1),
      maxSlot: Math.min(totalSlots, Math.max(...ends) + 2),
    };
  }, [schedule.assignments, totalSlots]);
  const visibleSlots = maxSlot - minSlot;

  const courts = useMemo(
    () => Array.from({ length: config.courtCount }, (_, i) => i + 1),
    [config.courtCount],
  );

  // Group assignments by court for rendering.
  const courtAssignments = useMemo(() => {
    const byCourt = new Map<number, ScheduleAssignment[]>();
    courts.forEach((c) => byCourt.set(c, []));
    for (const a of schedule.assignments) {
      (byCourt.get(a.courtId) ?? []).push(a);
    }
    return byCourt;
  }, [schedule.assignments, courts]);

  // --- drag state ----------------------------------------------------------

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState<{ courtId: number; slotId: number } | null>(null);
  const [validation, setValidation] = useState<ValidationResponseDTO | null>(null);
  // Feedback animations triggered on drop: "ok" paints a green wash on the
  // landing cell; "shake" rattles the cell we tried to drop on but couldn't.
  const [dropFx, setDropFx] = useState<
    { type: 'ok' | 'shake'; courtId: number; slotId: number; nonce: number } | null
  >(null);
  const validateAbortRef = useRef<AbortController | null>(null);
  const validateTimerRef = useRef<number | null>(null);
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
    lastValidatedKeyRef.current = null;
  }, [setLastValidation]);

  useEffect(() => () => clearDragState(), [clearDragState]);

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
        if (validateAbortRef.current) {
          validateAbortRef.current.abort();
        }
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
          // Network/transport failure: don't block the drop — show an error ring.
          setValidation({ feasible: false, conflicts: [{ type: 'network', description: String(err) }] });
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
        // Drive the drop feedback FX off the validation snapshot so infeasible
        // drops shake the target cell even if the re-solve would still run.
        const feasible = validation?.feasible ?? true;
        if (!unchanged) {
          setDropFx({
            type: feasible ? 'ok' : 'shake',
            courtId: cell.courtId,
            slotId: cell.slotId,
            nonce: Date.now(),
          });
          window.setTimeout(() => setDropFx(null), 900);

          if (feasible) {
            void pinAndResolve({
              matchId: activeMatchId,
              slotId: cell.slotId,
              courtId: cell.courtId,
            });
          }
          // Infeasible drops: do NOT invoke the solver — the conflict is real.
          // The shake animation + the already-visible red ring communicate the
          // rejection; the user can drop elsewhere.
        }
      }
      clearDragState();
    },
    [schedule.assignments, pinAndResolve, clearDragState, validation?.feasible],
  );

  // --- render --------------------------------------------------------------

  const gridWidth = COURT_LABEL_WIDTH + visibleSlots * SLOT_WIDTH;

  return (
    <div
      data-testid="drag-gantt"
      className="relative rounded border border-border bg-card overflow-hidden"
    >
      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
        <svg aria-hidden className="h-3 w-3 text-muted-foreground" viewBox="0 0 16 16" fill="none">
          <path d="M4 8h8M8 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Drag a match to any cell — infeasible targets glow red. Drop pins the match and re-solves the rest.
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto">
          <div style={{ width: gridWidth }}>
            {/* Time header */}
            <div className="flex border-b border-border">
              <div
                style={{ width: COURT_LABEL_WIDTH }}
                className="flex-shrink-0 bg-card text-xs text-muted-foreground text-center py-1"
              >
                Time
              </div>
              {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot, i) => (
                <div
                  key={slot}
                  style={{ width: SLOT_WIDTH }}
                  className={[
                    'flex-shrink-0 border-l border-border bg-card text-center text-[10px] py-1',
                    slot === currentSlot ? 'text-blue-700 font-semibold' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {i % 2 === 0 ? formatSlotTime(slot, config) : ''}
                </div>
              ))}
            </div>

            {/* Court rows */}
            {courts.map((courtId) => (
              <div
                key={courtId}
                className="relative flex border-b border-border"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
                  className="flex-shrink-0 flex items-center justify-center bg-card text-xs font-medium text-muted-foreground"
                >
                  Court {courtId}
                </div>

                {/* Drop target cells (one per slot column) */}
                <div className="relative gantt-grid" style={{ flex: '1 1 auto' }}>
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot) => (
                      <DropCell
                        key={slot}
                        courtId={courtId}
                        slotId={slot}
                        isCurrent={slot === currentSlot}
                        hovered={
                          hoverCell?.courtId === courtId && hoverCell?.slotId === slot
                        }
                        validation={
                          hoverCell?.courtId === courtId && hoverCell?.slotId === slot
                            ? validation
                            : null
                        }
                        dropFx={
                          dropFx?.courtId === courtId && dropFx?.slotId === slot ? dropFx : null
                        }
                        readOnly={readOnly}
                      />
                    ))}
                  </div>

                  {/* Match blocks for this court */}
                  {(courtAssignments.get(courtId) ?? []).map((a, idx) => {
                    const m = matchMap.get(a.matchId);
                    if (!m) return null;
                    const hiddenWhileDragging = activeId === `match:${a.matchId}`;
                    return (
                      <MatchBlock
                        key={a.matchId}
                        assignment={a}
                        match={m}
                        minSlot={minSlot}
                        isSelected={selectedMatchId === a.matchId}
                        isPinned={pendingPin?.matchId === a.matchId}
                        isGenerating={isGenerating}
                        onSelect={onMatchSelect}
                        readOnly={readOnly || isGenerating}
                        translucent={hiddenWhileDragging}
                        dragDelta={hiddenWhileDragging ? dragDelta : null}
                        enterDelayMs={idx * 40}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live hover status */}
        <div
          className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-[11px]"
          data-testid="drag-gantt-status"
        >
          {activeAssignment && hoverCell && validation ? (
            validation.feasible ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Feasible — drop to pin at Court {hoverCell.courtId}, {formatSlotTime(hoverCell.slotId, config)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700">
                <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Infeasible ({validation.conflicts.length} conflict{validation.conflicts.length === 1 ? '' : 's'}):{' '}
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
            <span className="text-blue-700" data-testid="drag-gantt-pin">
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
}: {
  courtId: number;
  slotId: number;
  isCurrent: boolean;
  hovered: boolean;
  validation: ValidationResponseDTO | null;
  dropFx: { type: 'ok' | 'shake'; nonce: number } | null;
  readOnly: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(courtId, slotId), disabled: readOnly });
  const infeasible = hovered && validation && !validation.feasible;
  const feasible = hovered && validation && validation.feasible;
  const showOk = dropFx?.type === 'ok';
  const showShake = dropFx?.type === 'shake';
  return (
    <div
      ref={setNodeRef}
      style={{ width: SLOT_WIDTH }}
      data-testid={`cell-${courtId}-${slotId}`}
      // `key` on the animated child forces the animation to restart on every
      // new drop (because nonce changes).
      className={[
        'relative flex-shrink-0 border-l border-border transition-colors duration-150',
        isCurrent ? 'bg-blue-50/30' : '',
        isOver ? 'bg-muted/80' : '',
        hovered ? 'motion-safe:animate-cell-pulse' : '',
        infeasible ? 'ring-2 ring-inset ring-red-400 bg-red-50/50' : '',
        feasible ? 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/50' : '',
        showShake ? 'motion-safe:animate-shake ring-2 ring-inset ring-red-400 bg-red-100/60' : '',
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
  assignment,
  match,
  minSlot,
  isSelected,
  isPinned,
  isGenerating,
  onSelect,
  readOnly,
  translucent,
  dragDelta,
  enterDelayMs,
}: {
  assignment: ScheduleAssignment;
  match: MatchDTO;
  minSlot: number;
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
    id: `match:${assignment.matchId}` as BlockId,
    disabled: readOnly,
  });

  const left = (assignment.slotId - minSlot) * SLOT_WIDTH;
  const width = Math.max(SLOT_WIDTH - 4, assignment.durationSlots * SLOT_WIDTH - 4);
  const effectiveTransform = dragDelta ?? transform;
  const transformStyle = effectiveTransform
    ? CSS.Translate.toString({ x: effectiveTransform.x, y: effectiveTransform.y, scaleX: 1, scaleY: 1 })
    : undefined;

  // Smooth the `left` coordinate whenever blocks re-lay out after a re-solve.
  // Disable the transition while dragging so the block follows the pointer.
  const positionTransition = isDragging
    ? 'none'
    : 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), top 420ms cubic-bezier(0.22, 1, 0.36, 1)';

  const pinActive = isPinned && isGenerating;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect?.(assignment.matchId)}
      data-testid={`block-${assignment.matchId}`}
      {...listeners}
      {...attributes}
      style={{
        left,
        top: 4,
        width,
        height: ROW_HEIGHT - 8,
        position: 'absolute',
        transform: transformStyle,
        zIndex: isDragging ? 30 : isSelected ? 20 : isPinned ? 15 : 10,
        touchAction: 'none',
        opacity: translucent && !isDragging ? 0.4 : 1,
        transition: positionTransition,
        animationDelay: `${enterDelayMs}ms`,
      }}
      className={[
        'group rounded border text-left px-2 py-0.5 shadow-sm backdrop-blur-sm',
        'motion-safe:animate-block-in',
        isSelected
          ? 'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100 dark:border-blue-500/50'
          : 'bg-card/95 border-border text-foreground hover:border-muted-foreground hover:shadow-md',
        isPinned && !pinActive ? 'ring-2 ring-inset ring-amber-400 border-dashed' : '',
        readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      ].join(' ')}
      title={matchLabel(match)}
    >
      {/* Marching-ants overlay while the solver is re-solving with this pin */}
      {pinActive ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[1px] rounded pin-marquee motion-safe:animate-marching-ants"
        />
      ) : null}
      <span className="relative text-[11px] font-semibold leading-tight block truncate">
        {matchLabel(match)}
      </span>
      <span className="relative text-[10px] leading-tight block truncate text-muted-foreground">
        {match.sideA.length}v{match.sideB.length}
        {match.sideC && match.sideC.length ? `v${match.sideC.length}` : ''}
      </span>
    </button>
  );
}
