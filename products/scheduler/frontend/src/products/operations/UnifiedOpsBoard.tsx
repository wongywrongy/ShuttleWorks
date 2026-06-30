/**
 * UnifiedOpsBoard — the both-engines court×time board with drag-to-reschedule.
 *
 * One `GanttTimeline` + one dnd-kit `DndContext` hosting BOTH engines' blocks
 * (a match is a match — only `source` differs). Dragging a block validates
 * the target cell and, on a feasible drop, pins + re-solves through the
 * originating engine's API:
 *   - meet    → `apiClient.validateMove` + `useSchedule().pinAndResolve`
 *   - bracket → `useBracketApi().validateMove` + `pinMatch`
 * Both share the workspace's physical courts, so it's one court axis. Blocks
 * are click-selectable (drives the detail panel); finished matches are inert.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Check, X as XIcon } from '@phosphor-icons/react';
import { apiClient } from '../../api/client';
import { useBracketApi } from '../../api/bracketClient';
import { useSchedule } from '../../hooks/useSchedule';
import { useTournamentStore } from '../../store/tournamentStore';
import { MatchChip } from '../../components/MatchChip';
import { fromEngineStatus } from './runtime/runMachine';
import { buildPlanChips, type BoardChip } from './runtime/boardPlacements';
import type { MatchDTO, ScheduleDTO, TournamentConfig } from '../../api/dto';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import type { OpsBlock } from './opsBlock';
import { parseOpsKey, packBlockLanes } from './opsBlock';

interface Conflict { description: string }
interface Validation { feasible: boolean; conflicts: Conflict[] }

interface Props {
  blocks: OpsBlock[];
  courtCount: number;
  currentSlot?: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Courts is interactive (drag-to-reschedule); Live is read-only (run the
   *  day — blocks show live status + late, no reschedule). */
  interactive: boolean;
  /** Meet validate needs the live schedule inputs (held in the parent). */
  meet: { config: TournamentConfig | null; matches: MatchDTO[]; schedule: ScheduleDTO | null };
  /** Apply the bracket DTO a pin returns. */
  onBracketData: (dto: BracketTournamentDTO) => void;
}

function cellId(courtId: number, slotId: number) {
  return `cell:${courtId}:${slotId}`;
}
function parseCell(id: string | number | null | undefined): { courtId: number; slotId: number } | null {
  if (typeof id !== 'string') return null;
  const m = /^cell:(\d+):(\d+)$/.exec(id);
  return m ? { courtId: Number(m[1]), slotId: Number(m[2]) } : null;
}

const VALIDATE_DEBOUNCE_MS = 80;
type DropFx = { type: 'ok' | 'shake'; courtId: number; slotId: number; nonce: number };

export function UnifiedOpsBoard({
  blocks,
  courtCount,
  currentSlot,
  selectedKey,
  onSelect,
  interactive,
  meet,
  onBracketData,
}: Props) {
  const players = useTournamentStore((s) => s.players);
  const { pinAndResolve } = useSchedule();
  const bracketApi = useBracketApi();

  const placed = useMemo(() => blocks.filter((b) => b.court != null && b.slot != null), [blocks]);
  const blockByKey = useMemo(() => new Map(placed.map((b) => [b.key, b])), [placed]);

  const courts = useMemo(
    () => Array.from({ length: Math.max(1, courtCount) }, (_, i) => i + 1),
    [courtCount],
  );

  // PLANNED placements — uniform `span = 1` via the shared placement model, so
  // meet and bracket read identically (duration is NOT encoded as width).
  const planChips = useMemo<BoardChip[]>(() => buildPlanChips(placed), [placed]);

  // Lane-pack on the UNIFORM width (span=1): only TRUE double-bookings (same
  // court+slot) collide and split side-by-side; merely-adjacent planned
  // durations no longer fight for half-width lanes (GanttTimeline divides a
  // cell by laneCount). A real same-cell conflict is a real conflict — fine.
  const lanes = useMemo(
    () => packBlockLanes(placed.map((b) => ({ ...b, span: 1 }))),
    [placed],
  );

  const placements = useMemo<Placement[]>(
    () =>
      planChips.map((c) => {
        const ln = lanes.get(c.key);
        return { ...c.placement, laneIndex: ln?.laneIndex ?? 0, laneCount: ln?.laneCount ?? 1 };
      }),
    [planChips, lanes],
  );

  const { minSlot, slotCount } = useMemo(() => {
    if (placements.length === 0) return { minSlot: 0, slotCount: 8 };
    const lo = placements.reduce((m, p) => Math.min(m, p.startSlot), Number.POSITIVE_INFINITY);
    const hi = placements.reduce((m, p) => Math.max(m, p.startSlot + p.span), 0);
    return { minSlot: Math.max(0, lo - 1), slotCount: Math.max(4, hi - lo + 2) };
  }, [placements]);

  // --- drag state ----------------------------------------------------------
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState<{ courtId: number; slotId: number } | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [dropFx, setDropFx] = useState<DropFx | null>(null);
  // Time-axis zoom — AUTO-fits the timeline so cells (including lane-packed
  // splits) stay readable; the operator can still override manually. Stretches
  // the time width only; courts (rows) stay fixed. Real layout (drag + scroll
  // keep working).
  const [auto, setAuto] = useState(true);
  const [manualZoom, setManualZoom] = useState(1);
  const autoZoom = useMemo(() => {
    if (placed.length === 0) return 1;
    const maxLanes = Math.max(1, ...[...lanes.values()].map((l) => l.laneCount));
    const longest = placed.reduce((m, b) => Math.max(m, b.label.length), 0);
    // Width one lane needs to read the longest label at text-2xs, plus the
    // block's horizontal padding + inset (~24px). Generous so nothing clips.
    const neededLanePx = Math.max(56, longest * 8 + 24);
    return Math.min(3, Math.max(1, (neededLanePx * maxLanes) / GANTT_GEOMETRY.standard.slot));
  }, [placed, lanes]);
  const timeZoom = auto ? autoZoom : manualZoom;
  const zoomBy = (f: number) => {
    setManualZoom(Math.min(3, Math.max(0.5, Math.round(timeZoom * f * 100) / 100)));
    setAuto(false);
  };
  const validateAbortRef = useRef<AbortController | null>(null);
  const validateTimerRef = useRef<number | null>(null);
  const dropFxTimerRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  const clearDrag = useCallback(() => {
    setActiveKey(null);
    setDragDelta({ x: 0, y: 0 });
    setHoverCell(null);
    setValidation(null);
    if (validateTimerRef.current !== null) window.clearTimeout(validateTimerRef.current);
    validateTimerRef.current = null;
    validateAbortRef.current?.abort();
    validateAbortRef.current = null;
    lastKeyRef.current = null;
  }, []);
  useEffect(() => () => clearDrag(), [clearDrag]);

  // Source-routed validate (debounced), feeding the green/red hover wash.
  const runValidate = useCallback(
    (blockKey: string, courtId: number, slotId: number) => {
      const parsed = parseOpsKey(blockKey);
      if (!parsed) return;
      const dedupe = `${blockKey}:${courtId}:${slotId}`;
      if (lastKeyRef.current === dedupe) return;
      lastKeyRef.current = dedupe;
      if (validateTimerRef.current !== null) window.clearTimeout(validateTimerRef.current);
      validateTimerRef.current = window.setTimeout(async () => {
        validateAbortRef.current?.abort();
        const ctl = new AbortController();
        validateAbortRef.current = ctl;
        try {
          let res: Validation;
          if (parsed.source === 'meet') {
            if (!meet.config || !meet.schedule) return;
            res = await apiClient.validateMove({
              config: meet.config,
              players,
              matches: meet.matches,
              assignments: meet.schedule.assignments,
              proposedMove: { matchId: parsed.id, slotId, courtId },
              signal: ctl.signal,
            });
          } else {
            res = await bracketApi.validateMove({
              play_unit_id: parsed.id,
              slot_id: slotId,
              court_id: courtId,
            });
          }
          setValidation({ feasible: res.feasible, conflicts: res.conflicts ?? [] });
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return;
          setValidation({ feasible: false, conflicts: [{ description: String(err) }] });
        }
      }, VALIDATE_DEBOUNCE_MS);
    },
    [meet.config, meet.schedule, meet.matches, players, bracketApi],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const onDragStart = useCallback((e: DragStartEvent) => setActiveKey(String(e.active.id).slice('block:'.length)), []);

  const onDragMove = useCallback(
    (e: DragMoveEvent) => {
      setDragDelta({ x: e.delta.x, y: e.delta.y });
      const cell = parseCell(e.over?.id);
      if (cell) {
        setHoverCell(cell);
        const key = String(e.active.id).slice('block:'.length);
        runValidate(key, cell.courtId, cell.slotId);
      } else {
        setHoverCell(null);
        setValidation(null);
        lastKeyRef.current = null;
      }
    },
    [runValidate],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const cell = parseCell(e.over?.id);
      const key = String(e.active.id).slice('block:'.length);
      const parsed = parseOpsKey(key);
      const block = blockByKey.get(key);
      if (cell && parsed && block) {
        const unchanged = block.court === cell.courtId && block.slot === cell.slotId;
        const feasible = validation?.feasible ?? true;
        if (!unchanged) {
          setDropFx({ type: feasible ? 'ok' : 'shake', courtId: cell.courtId, slotId: cell.slotId, nonce: Date.now() });
          if (dropFxTimerRef.current !== null) window.clearTimeout(dropFxTimerRef.current);
          dropFxTimerRef.current = window.setTimeout(() => setDropFx(null), 900);
          if (feasible) {
            if (parsed.source === 'meet') {
              void pinAndResolve({ matchId: parsed.id, slotId: cell.slotId, courtId: cell.courtId });
            } else {
              void bracketApi
                .pinMatch({ play_unit_id: parsed.id, slot_id: cell.slotId, court_id: cell.courtId })
                .then(onBracketData)
                .catch(() => {});
            }
          }
        }
      }
      clearDrag();
    },
    [blockByKey, validation?.feasible, pinAndResolve, bracketApi, onBracketData, clearDrag],
  );

  // --- render-props --------------------------------------------------------
  const renderCell = useCallback(
    ({ courtId, slotId }: GanttCell) => {
      const hovered = hoverCell?.courtId === courtId && hoverCell?.slotId === slotId;
      const fx = dropFx?.courtId === courtId && dropFx?.slotId === slotId ? dropFx : null;
      return (
        <DropCell
          courtId={courtId}
          slotId={slotId}
          isCurrent={slotId === currentSlot}
          hovered={hovered}
          validation={hovered ? validation : null}
          dropFx={fx}
        />
      );
    },
    [hoverCell, dropFx, validation, currentSlot],
  );

  const isLate = useCallback(
    (b: OpsBlock) =>
      currentSlot != null && !b.done && !b.started && b.slot != null && currentSlot >= b.slot + b.span,
    [currentSlot],
  );

  const renderBlock = useCallback(
    (placement: Placement, box: GanttBlockBox) => {
      const b = blockByKey.get(placement.key);
      if (!b) return null;
      if (!interactive) {
        return <StaticBlock block={b} selected={selectedKey === b.key} onSelect={onSelect} late={isLate(b)} />;
      }
      const hidden = activeKey === placement.key;
      return (
        <BlockView
          block={b}
          box={box}
          selected={selectedKey === b.key}
          onSelect={onSelect}
          translucent={hidden}
          dragDelta={hidden ? dragDelta : null}
        />
      );
    },
    [blockByKey, interactive, isLate, activeKey, selectedKey, onSelect, dragDelta],
  );

  if (placed.length === 0) return null;

  const grid = (
    <GanttTimeline
      courts={courts}
      minSlot={minSlot}
      slotCount={slotCount}
      density="standard"
      slotScale={timeZoom}
      placements={placements}
      renderBlock={renderBlock}
      renderCell={interactive ? renderCell : undefined}
      currentSlot={currentSlot}
      renderSlotLabel={(slotId, i) => (i % 2 === 0 ? `S${slotId}` : '')}
    />
  );

  const zoomBar = (
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
      <button type="button" aria-label="Less time per cell" onClick={() => zoomBy(1 / 1.25)} className="h-5 w-5 rounded border border-border bg-card leading-none hover:bg-muted/60">−</button>
      <span className="w-9 text-center tabular-nums text-muted-foreground">{Math.round(timeZoom * 100)}%</span>
      <button type="button" aria-label="More time per cell" onClick={() => zoomBy(1.25)} className="h-5 w-5 rounded border border-border bg-card leading-none hover:bg-muted/60">+</button>
    </div>
  );

  if (!interactive) {
    // Live — read-only spatial map; status + late communicated by the rings.
    return (
      <div data-testid="unified-ops-board" data-mode="live" className="shrink-0 overflow-x-auto border-b border-border">
        {grid}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LiveLegend />
          {zoomBar}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="unified-ops-board" data-mode="courts" className="shrink-0 overflow-x-auto border-b border-border">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        {grid}
        {zoomBar}
        <div className="flex items-center gap-2 border-t border-border/60 bg-muted/40 px-3 py-1.5 text-2xs" data-testid="unified-ops-status">
          {hoverCell && validation ? (
            validation.feasible ? (
              <span className="inline-flex items-center gap-1 text-status-done">
                <Check className="h-3.5 w-3.5" /> Feasible — drop to pin at C{hoverCell.courtId} · S{hoverCell.slotId}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                <XIcon className="h-3.5 w-3.5" /> Infeasible: {validation.conflicts[0]?.description ?? 'conflict'}
              </span>
            )
          ) : (
            <span className="text-muted-foreground">
              Drag a match to any cell to reschedule — meet and bracket on one court plan.
            </span>
          )}
        </div>
      </DndContext>
    </div>
  );
}

function LiveLegend() {
  const items = [
    { ring: '', label: 'Scheduled' },
    { ring: 'ring-2 ring-inset ring-status-live', label: 'Playing' },
    { ring: 'ring-2 ring-inset ring-status-done', label: 'Done' },
    { ring: 'ring-2 ring-inset ring-status-warning', label: 'Late' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-muted/40 px-3 py-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status</span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`h-3 w-3 rounded-[2px] border border-border bg-card ${it.ring}`} />
          <span className="text-2xs text-muted-foreground">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function StaticBlock({
  block,
  selected,
  onSelect,
  late,
}: {
  block: OpsBlock;
  selected: boolean;
  onSelect?: (key: string) => void;
  late: boolean;
}) {
  return (
    <MatchChip
      label={block.label}
      source={block.source}
      state={fromEngineStatus(block.status)}
      late={late && !block.done}
      selected={selected}
      tone="state"
      onSelect={() => onSelect?.(block.key)}
      data-testid={`ops-block-${block.key}`}
      style={{ position: 'absolute', left: 0, top: 4, right: 4, bottom: 4 }}
      className="cursor-pointer px-1.5"
      title={`${block.source === 'meet' ? 'Meet' : 'Bracket'} · ${block.label} — ${block.sideA} vs ${block.sideB} [${late && !block.done ? 'late' : block.status}]`}
    />
  );
}

function DropCell({
  courtId,
  slotId,
  isCurrent,
  hovered,
  validation,
  dropFx,
}: {
  courtId: number;
  slotId: number;
  isCurrent: boolean;
  hovered: boolean;
  validation: Validation | null;
  dropFx: { type: 'ok' | 'shake'; nonce: number } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(courtId, slotId) });
  const infeasible = hovered && validation && !validation.feasible;
  const feasible = hovered && validation && validation.feasible;
  return (
    <div
      ref={setNodeRef}
      data-testid={`ops-cell-${courtId}-${slotId}`}
      className={[
        'relative h-full w-full border-l border-border/30 transition-colors duration-fast',
        isCurrent ? 'bg-accent/5' : '',
        isOver ? 'bg-muted/80' : '',
        hovered ? 'motion-safe:animate-cell-pulse' : '',
        infeasible ? 'ring-2 ring-inset ring-destructive bg-destructive/5' : '',
        feasible ? 'ring-2 ring-inset ring-status-done bg-status-done/5' : '',
        dropFx?.type === 'shake' ? 'motion-safe:animate-shake ring-2 ring-inset ring-destructive bg-destructive/10' : '',
      ].join(' ')}
    >
      {dropFx?.type === 'ok' ? (
        <span key={dropFx.nonce} aria-hidden className="pointer-events-none absolute inset-0 motion-safe:animate-drop-ok" />
      ) : null}
    </div>
  );
}

function BlockView({
  block,
  box,
  selected,
  onSelect,
  translucent,
  dragDelta,
}: {
  block: OpsBlock;
  box: GanttBlockBox;
  selected: boolean;
  onSelect?: (key: string) => void;
  translucent: boolean;
  dragDelta: { x: number; y: number } | null;
}) {
  // Finished matches are inert (no reschedule).
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block:${block.key}`,
    disabled: block.done,
  });
  const eff = dragDelta ?? transform;
  const transformStyle = eff ? CSS.Translate.toString({ x: eff.x, y: eff.y, scaleX: 1, scaleY: 1 }) : undefined;
  return (
    <MatchChip
      ref={setNodeRef}
      label={block.label}
      source={block.source}
      state={fromEngineStatus(block.status)}
      selected={selected}
      tone="state"
      onSelect={() => onSelect?.(block.key)}
      data-testid={`ops-block-${block.key}`}
      {...listeners}
      {...attributes}
      style={{
        position: 'absolute',
        left: 0,
        top: 4,
        width: box.width - 4,
        height: box.height - 8,
        transform: transformStyle,
        zIndex: isDragging ? 30 : selected ? 20 : 10,
        touchAction: 'none',
        opacity: translucent && !isDragging ? 0.4 : 1,
      }}
      className={`px-1.5 ${block.done ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      title={`${block.source === 'meet' ? 'Meet' : 'Bracket'} · ${block.label} — ${block.sideA} vs ${block.sideB} [${block.status}]`}
    />
  );
}
