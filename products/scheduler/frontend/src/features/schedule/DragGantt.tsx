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
import { apiClient } from '../../api/client';
import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import { indexById } from '../../store/selectors';
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
  ScheduleAssignment,
  ScheduleDTO,
  TournamentConfig,
  ValidationResponseDTO,
} from '../../api/dto';

import { SLOT_WIDTH, ROW_HEIGHT, COURT_LABEL_WIDTH } from './ganttGeometry';
import { getEventColor, EVENT_COLORS } from './eventColors';
const VALIDATE_DEBOUNCE_MS = 80;

interface DragGanttProps {
  schedule: ScheduleDTO;
  matches: MatchDTO[];
  config: TournamentConfig;
  selectedMatchId?: string | null;
  onMatchSelect?: (matchId: string) => void;
  currentSlot?: number;
  readOnly?: boolean;
  /** Optional callback invoked when a fully-closed court row is
   *  clicked. Used to deeplink the director panel on the Schedule
   *  tab; if omitted the closed row is rendered as a passive cell. */
  onRequestReopenCourt?: (courtId: number) => void;
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
  onRequestReopenCourt,
}: DragGanttProps) {
  const players = useTournamentStore((s) => s.players);
  const pendingPin = useUiStore((s) => s.pendingPin);
  const setLastValidation = useUiStore((s) => s.setLastValidation);
  const { pinAndResolve } = useSchedule();
  const isGenerating = useUiStore((s) => s.isGenerating);

  const matchMap = useMemo(() => indexById(matches), [matches]);
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
  const closedWindows = useMemo(
    () => getClosedSlotWindows(config, totalSlots),
    [config, totalSlots],
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
    <div data-testid="drag-gantt" className="relative">
      <Hint id="schedule.drag-instructions" className="m-2">
        Drag a match to any cell — infeasible targets glow red. Drop pins the match and re-solves the rest.
      </Hint>
      {/* Event-type legend — same palette the live grid uses, so the
       *  two views read the same. Skipped on null/empty match list. */}
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
        <div className="overflow-x-auto">
          <div style={{ width: gridWidth }}>
            {/* Time header — chrome matches features/control-center/GanttChart
                so the Schedule and Live grids are visually identical. */}
            <div className="flex border-b border-border/60 bg-muted/40">
              <div
                style={{ width: COURT_LABEL_WIDTH }}
                className="flex-shrink-0 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Court
              </div>
              {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot, i) => (
                <div
                  key={slot}
                  style={{ width: SLOT_WIDTH }}
                  className={`flex-shrink-0 border-l border-border px-1 py-1 text-center text-2xs tabular-nums ${
                    slot === currentSlot
                      ? 'bg-status-live/15 font-semibold text-status-live'
                      : 'text-muted-foreground'
                  }`}
                >
                  {i % 2 === 0 ? formatSlotTime(slot, config) : ''}
                </div>
              ))}
            </div>

            {/* Court rows */}
            {courts.map((courtId) => {
              const fullyClosed = isCourtFullyClosed(
                closedWindows,
                courtId,
                minSlot,
                maxSlot,
              );
              return (
              <div
                key={courtId}
                className={`relative flex border-b border-border/60 ${
                  fullyClosed ? 'opacity-60' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
                title={fullyClosed ? `Court ${courtId} is closed` : undefined}
              >
                {fullyClosed && onRequestReopenCourt ? (
                  <button
                    type="button"
                    onClick={() => onRequestReopenCourt(courtId)}
                    title={`Court ${courtId} closed — open Reopen panel`}
                    aria-label={`Court ${courtId} is closed. Click to open Reopen panel.`}
                    className="flex-shrink-0 flex items-center gap-1 px-2 text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground hover:bg-status-warning-bg hover:text-status-warning hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                    style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
                  >
                    <span className="line-through">C{courtId}</span>
                    <DoorOpen className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : (
                  <div
                    style={{ width: COURT_LABEL_WIDTH, height: ROW_HEIGHT }}
                    className={`flex-shrink-0 flex items-center px-2 text-xs font-semibold tabular-nums ${
                      fullyClosed
                        ? 'bg-muted/60 text-muted-foreground line-through'
                        : 'bg-muted/30 text-foreground'
                    }`}
                  >
                    C{courtId}
                  </div>
                )}

                {/* Drop target cells (one per slot column) — closed
                    cells reject drops; the rest of the row remains
                    a valid drop target so a temporary closure only
                    blocks part of the day. */}
                <div className="relative gantt-grid" style={{ flex: '1 1 auto' }}>
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: visibleSlots }, (_, i) => minSlot + i).map((slot) => {
                      const slotClosed = isSlotClosed(closedWindows, courtId, slot);
                      return (
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
                        readOnly={readOnly || slotClosed}
                        closed={slotClosed}
                      />
                      );
                    })}
                  </div>
                  {fullyClosed && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-2xs uppercase tracking-wider text-muted-foreground/80">
                      court closed
                    </div>
                  )}

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
              );
            })}
          </div>
        </div>

        {/* Live hover status */}
        <div
          className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-3 py-1.5 text-2xs"
          data-testid="drag-gantt-status"
        >
          {activeAssignment && hoverCell && validation ? (
            validation.feasible ? (
              <span className="inline-flex items-center gap-1 text-status-done">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Feasible — drop to pin at Court {hoverCell.courtId}, {formatSlotTime(hoverCell.slotId, config)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
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
  /** When true, the cell falls inside a court-closure window: shaded
   *  slate, drop disabled, no hover ring. */
  closed?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(courtId, slotId), disabled: readOnly });
  const infeasible = !closed && hovered && validation && !validation.feasible;
  const feasible = !closed && hovered && validation && validation.feasible;
  const showOk = dropFx?.type === 'ok';
  const showShake = dropFx?.type === 'shake';
  return (
    <div
      ref={setNodeRef}
      style={{ width: SLOT_WIDTH }}
      data-testid={`cell-${courtId}-${slotId}`}
      title={closed ? `Court ${courtId} closed` : undefined}
      className={[
        'relative flex-shrink-0 border-l border-border/30 transition-colors duration-fast',
        closed
          ? 'bg-muted/50'
          : isCurrent
            ? 'bg-accent/5'
            : '',
        !closed && isOver ? 'bg-muted/80' : '',
        !closed && hovered ? 'motion-safe:animate-cell-pulse' : '',
        infeasible ? 'ring-2 ring-inset ring-destructive bg-destructive/5' : '',
        feasible ? 'ring-2 ring-inset ring-status-done bg-status-done/5' : '',
        showShake ? 'motion-safe:animate-shake ring-2 ring-inset ring-destructive bg-destructive/10' : '',
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
  // Background + border color ease at 120ms (--motion-fast) so the selection
  // highlight flips smoothly rather than snapping to the accent ring.
  const positionTransition = isDragging
    ? 'none'
    : 'left 420ms var(--ease-brand), top 420ms var(--ease-brand), background-color 120ms var(--ease-brand), border-color 120ms var(--ease-brand)';

  const pinActive = isPinned && isGenerating;
  const eventColor = getEventColor(match.eventRank);

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
      {/* Marching-ants overlay while the solver is re-solving with this pin */}
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
