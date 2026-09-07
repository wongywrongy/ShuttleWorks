/**
 * PlanCourtQueues — the DEFAULT Plan view (P2, `operator-visual-fixes.md`).
 *
 * One lane per court, each an ORDERED list of uniform match cells with the
 * estimated start time beneath each cell in muted text. Duration is not
 * encoded as height any more than it was encoded as width on the timeline:
 * every cell is the same size, because what the operator reads off this
 * surface is ORDER, and the time is an estimate printed underneath.
 *
 * The time-scaled court x time board is still available behind the
 * **Timeline** toggle (`UnifiedOpsBoard`), which is where the zoom controls
 * live. Nothing about the solve changes: a move here goes through exactly
 * the same validated schedule commands the timeline drag has always used —
 *   - meet    → `apiClient.validateMove` then `useSchedule().pinAndResolve`
 *   - bracket → `useBracketApi().validateMove` then `pinMatch`
 * so CP-SAT, rest, player overlap, court availability, session boundaries
 * and pinned assignments are all still enforced by the engine. An infeasible
 * move is refused and says why; nothing is written optimistically.
 *
 * Keyboard parity is not optional (WCAG 2.1.1): every cell carries explicit
 * move actions (earlier / later in the lane, previous / next court) that run
 * the identical `moveTo` path the pointer drag does.
 */
import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CaretDown, CaretLeft, CaretRight, CaretUp } from '@phosphor-icons/react';
import { apiClient } from '../../../api/client';
import { useBracketApi } from '../../../api/bracketClient';
import { useSchedule } from '../../../hooks/useSchedule';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useTournamentStore } from '../../../store/tournamentStore';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';
import { formatMatchIdentity } from '../../../platform/domain/matchIdentity';
import { SELECTABLE_ROW_FOCUS } from '../../../lib/selectableRow';
import { EYEBROW_CLASS } from '../../../lib/utils';
import { STATE_WORD } from '../../../lib/stateWords';
import type { MatchDTO, ScheduleDTO, TournamentConfig } from '../../../api/dto';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { OpsBlock } from '../opsBlock';
import { parseOpsKey } from '../opsBlock';

export interface PlanCourtQueuesProps {
  blocks: OpsBlock[];
  courtCount: number;
  selectedKey?: string | null;
  onSelect(key: string): void;
  /** Meet validate needs the live schedule inputs (held in the parent). */
  meet: { config: TournamentConfig | null; matches: MatchDTO[]; schedule: ScheduleDTO | null };
  /** Apply the bracket DTO a pin returns. */
  onBracketData: (dto: BracketTournamentDTO) => void;
  /** Wall-clock label for a slot. Returns '' when the workspace has no
   *  clock configured — the estimate is then omitted, never faked and never
   *  replaced with the raw slot index. */
  formatSlot?: (slotId: number) => string;
}

interface Lane {
  court: number;
  cells: OpsBlock[];
}

/** Only a state worth acting on is named. "Scheduled" is what every cell in
 *  a plan lane is, so printing it on every cell says nothing. */
function laneStateWord(block: OpsBlock): string | null {
  if (block.done) return STATE_WORD.done;
  if (block.status === 'started') return STATE_WORD.onCourt;
  if (block.status === 'called') return STATE_WORD.called;
  return null;
}

/** Build the ordered lanes: every configured court, its placed matches in
 *  solved order (start slot, then the stable key). */
export function buildLanes(blocks: readonly OpsBlock[], courtCount: number): Lane[] {
  const byCourt = new Map<number, OpsBlock[]>();
  for (const b of blocks) {
    if (b.court == null || b.slot == null) continue;
    const list = byCourt.get(b.court) ?? [];
    list.push(b);
    byCourt.set(b.court, list);
  }
  const courts = new Set<number>([
    ...Array.from({ length: Math.max(1, courtCount) }, (_, i) => i + 1),
    ...byCourt.keys(),
  ]);
  return [...courts]
    .sort((a, b) => a - b)
    .map((court) => ({
      court,
      cells: (byCourt.get(court) ?? []).sort(
        (a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      ),
    }));
}

/**
 * The slot a move to (`court`, position `index`) targets.
 *
 * Pure, and deliberately conservative: it never invents a time. The target is
 * the slot the cell currently sitting at that position holds (so the moved
 * match takes its place and the solver re-flows the rest), or — appending to
 * the end of a lane — the slot just after the lane's last cell. An empty lane
 * takes the earliest slot anywhere in the plan, which is the only time the
 * plan itself supplies.
 */
export function targetSlotFor(
  lanes: readonly Lane[],
  court: number,
  index: number,
  movingKey: string,
): number | null {
  const lane = lanes.find((l) => l.court === court);
  const cells = (lane?.cells ?? []).filter((c) => c.key !== movingKey);
  if (cells.length === 0) {
    const all = lanes.flatMap((l) => l.cells).map((c) => c.slot ?? 0);
    return all.length > 0 ? Math.min(...all) : null;
  }
  const clamped = Math.max(0, Math.min(index, cells.length));
  if (clamped < cells.length) return cells[clamped].slot ?? null;
  const last = cells[cells.length - 1];
  return (last.slot ?? 0) + Math.max(1, last.span ?? 1);
}

interface Conflict {
  description: string;
}

export function PlanCourtQueues({
  blocks,
  courtCount,
  selectedKey,
  onSelect,
  meet,
  onBracketData,
  formatSlot,
}: PlanCourtQueuesProps) {
  const canEdit = useCanEdit();
  const players = useTournamentStore((s) => s.players);
  const { pinAndResolve } = useSchedule();
  const bracketApi = useBracketApi();
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const lanes = useMemo(() => buildLanes(blocks, courtCount), [blocks, courtCount]);
  const byKey = useMemo(() => new Map(blocks.map((b) => [b.key, b])), [blocks]);

  /**
   * The one move path — pointer drag and every keyboard action land here.
   * Validates through the originating engine first and writes only when the
   * engine says the placement is feasible.
   */
  const moveTo = useCallback(
    async (blockKey: string, court: number, index: number) => {
      const parsed = parseOpsKey(blockKey);
      const block = byKey.get(blockKey);
      if (!parsed || !block || !canEdit) return;
      const slot = targetSlotFor(lanes, court, index, blockKey);
      if (slot == null) return;
      if (block.court === court && block.slot === slot) return;
      setPendingKey(blockKey);
      setStatus(null);
      try {
        let feasible: boolean;
        let conflicts: Conflict[] = [];
        if (parsed.source === 'meet') {
          if (!meet.config || !meet.schedule) return;
          const res = await apiClient.validateMove({
            config: meet.config,
            players,
            matches: meet.matches,
            assignments: meet.schedule.assignments,
            proposedMove: { matchId: parsed.id, slotId: slot, courtId: court },
          });
          feasible = res.feasible;
          conflicts = res.conflicts ?? [];
        } else {
          const res = await bracketApi.validateMove({
            play_unit_id: parsed.id,
            slot_id: slot,
            court_id: court,
          });
          feasible = res.feasible;
          conflicts = res.conflicts ?? [];
        }
        if (!feasible) {
          setStatus({
            tone: 'error',
            text: `Not possible: ${conflicts[0]?.description ?? 'the move conflicts with the plan'}`,
          });
          return;
        }
        if (parsed.source === 'meet') {
          await pinAndResolve({ matchId: parsed.id, slotId: slot, courtId: court });
        } else {
          const dto = await bracketApi.pinMatch({
            play_unit_id: parsed.id,
            slot_id: slot,
            court_id: court,
          });
          onBracketData(dto);
        }
        const when = formatSlot?.(slot) ?? '';
        setStatus({
          tone: 'ok',
          text: `Moved ${formatMatchIdentity(block.identity, block.id)} to Court ${court}${
            when ? ` · ~${when}` : ''
          }`,
        });
      } catch (err) {
        setStatus({ tone: 'error', text: `Could not move the match: ${String(err)}` });
      } finally {
        setPendingKey(null);
      }
    },
    [byKey, canEdit, lanes, meet, players, pinAndResolve, bracketApi, onBracketData, formatSlot],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const over = typeof e.over?.id === 'string' ? e.over.id : null;
      const m = over ? /^slot:(\d+):(\d+)$/.exec(over) : null;
      if (!m) return;
      const key = String(e.active.id).slice('cell:'.length);
      void moveTo(key, Number(m[1]), Number(m[2]));
    },
    [moveTo],
  );

  if (lanes.every((l) => l.cells.length === 0)) return null;

  return (
    <div data-testid="plan-court-queues" className="shrink-0">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {lanes.map((lane) => (
            <section
              key={lane.court}
              data-testid={`plan-queue-lane-${lane.court}`}
              aria-label={`Court ${lane.court} queue`}
              className="flex flex-col overflow-hidden rounded border border-border bg-card"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-rule-soft bg-surface-band px-2.5 py-1.5">
                <span className={`${EYEBROW_CLASS} text-foreground`}>Court {lane.court}</span>
                <span className="text-xs text-muted-foreground">
                  {lane.cells.length} match{lane.cells.length === 1 ? '' : 'es'}
                </span>
              </div>
              <ol className="flex flex-col gap-1.5 p-2">
                {lane.cells.map((cell, i) => (
                  <Fragment key={cell.key}>
                    {/* The gap ABOVE cell i is the drop target for position i. */}
                    <DropSlot court={lane.court} index={i} />
                    <QueueCell
                      block={cell}
                      court={lane.court}
                      index={i}
                      laneCount={lane.cells.length}
                      courtCount={lanes.length}
                      selected={selectedKey === cell.key}
                      pending={pendingKey === cell.key}
                      canEdit={canEdit}
                      onSelect={onSelect}
                      onMove={moveTo}
                      formatSlot={formatSlot}
                    />
                  </Fragment>
                ))}
                {/* The tail target: dropping here appends to the lane. Also
                    the ONLY drop target an empty lane has. */}
                <DropSlot court={lane.court} index={lane.cells.length} empty={lane.cells.length === 0} />
              </ol>
            </section>
          ))}
        </div>
      </DndContext>
      {/* Outcome only. The idle state carries NO standing drag instruction
          (P2): the move controls are on the cells, where the action is. */}
      <div
        data-testid="plan-queue-status"
        role="status"
        aria-live="polite"
        className={
          status ? 'border-t border-border/60 bg-muted/40 px-3 py-1.5 text-xs' : 'sr-only'
        }
      >
        {status ? (
          <span className={status.tone === 'ok' ? 'text-status-done' : 'text-destructive'}>
            {status.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A drop target between/after cells. `index` is the position the dragged
 *  match takes in the lane. */
function DropSlot({ court, index, empty }: { court: number; index: number; empty?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${court}:${index}` });
  return (
    <li
      ref={setNodeRef}
      data-testid={`plan-queue-drop-${court}-${index}`}
      aria-hidden
      className={[
        'rounded border border-dashed transition-colors duration-fast',
        empty ? 'h-12' : 'h-3',
        isOver ? 'border-accent bg-accent-bg' : 'border-transparent',
      ].join(' ')}
    >
      {empty ? (
        <span className="grid h-full place-items-center text-xs text-muted-foreground">
          No matches on this court
        </span>
      ) : null}
    </li>
  );
}

function QueueCell({
  block,
  court,
  index,
  laneCount,
  courtCount,
  selected,
  pending,
  canEdit,
  onSelect,
  onMove,
  formatSlot,
}: {
  block: OpsBlock;
  court: number;
  index: number;
  laneCount: number;
  courtCount: number;
  selected: boolean;
  pending: boolean;
  canEdit: boolean;
  onSelect(key: string): void;
  onMove(key: string, court: number, index: number): void;
  formatSlot?: (slotId: number) => string;
}) {
  const identity = formatMatchIdentity(block.identity, block.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cell:${block.key}`,
    disabled: block.done || !canEdit,
  });
  const when = block.slot != null ? formatSlot?.(block.slot) ?? '' : '';
  const stateWord = laneStateWord(block);
  const moveTitle = canEdit ? undefined : READ_ONLY_MESSAGE;
  // 24x24 minimum target (WCAG 2.2 AA 2.5.8) — a 12px caret needs a real box
  // around it, not padding that happens to add up.
  const btn =
    'grid h-6 w-6 place-items-center rounded border border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <li data-testid={`plan-queue-cell-${block.key}`} data-source={block.source}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        data-testid={`plan-queue-chip-${block.key}`}
        onClick={() => onSelect(block.key)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(block.key);
          }
        }}
        // match-card §3.2 / §4.5: this is the DEGENERATE renderer — a
        // uniform h-12 cell too small for stacked sides — so the sides read
        // inline and the accessible summary carries the contract's own
        // "versus" phrasing.
        title={`${identity}: ${block.sideA} versus ${block.sideB}`}
        aria-label={`${identity}: ${block.sideA} versus ${block.sideB}`}
        // Uniform cell: every match is the same size whatever its duration.
        className={[
          // Uniform h-12 cell, overflow hidden rather than ellipsised: the
          // console renders no CSS-side ellipsis (truncation contract).
          'flex h-12 w-full items-center gap-2 overflow-hidden rounded border px-2 text-left',
          SELECTABLE_ROW_FOCUS,
          selected ? 'border-accent ring-1 ring-accent' : 'border-border',
          block.done ? 'bg-muted/30' : canEdit ? 'cursor-grab active:cursor-grabbing' : '',
          isDragging ? 'border-dashed bg-muted/40' : '',
          pending ? 'animate-pulse' : '',
        ].join(' ')}
      >
        <span className="w-5 shrink-0 text-right text-2xs sw-num text-ink-faint">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-xs font-semibold sw-num text-ink-3">{identity}</span>
          <span className="block break-words text-[13px] leading-tight text-foreground">
            {block.sideA}
            <span className="px-1 text-xs uppercase tracking-[0.06em] text-muted-foreground">v</span>
            {block.sideB}
          </span>
        </span>
        {stateWord ? (
          <span className="shrink-0 text-xs text-muted-foreground">{stateWord}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 px-2">
        {/* The estimate, beneath the cell, muted — the lane carries the
            order, the clock time is the solve's estimate of when. */}
        <span className="text-2xs sw-num text-muted-foreground">{when ? `~${when}` : ''}</span>
        {block.done ? null : (
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              className={btn}
              data-testid={`plan-queue-earlier-${block.key}`}
              aria-label={`Move ${identity} earlier on Court ${court}`}
              title={moveTitle}
              disabled={!canEdit || index === 0}
              onClick={() => onMove(block.key, court, index - 1)}
            >
              <CaretUp aria-hidden className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={btn}
              data-testid={`plan-queue-later-${block.key}`}
              aria-label={`Move ${identity} later on Court ${court}`}
              title={moveTitle}
              disabled={!canEdit || index >= laneCount - 1}
              onClick={() => onMove(block.key, court, index + 1)}
            >
              <CaretDown aria-hidden className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={btn}
              data-testid={`plan-queue-prev-court-${block.key}`}
              aria-label={`Move ${identity} to Court ${court - 1}`}
              title={moveTitle}
              disabled={!canEdit || court <= 1}
              onClick={() => onMove(block.key, court - 1, index)}
            >
              <CaretLeft aria-hidden className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={btn}
              data-testid={`plan-queue-next-court-${block.key}`}
              aria-label={`Move ${identity} to Court ${court + 1}`}
              title={moveTitle}
              disabled={!canEdit || court >= courtCount}
              onClick={() => onMove(block.key, court + 1, index)}
            >
              <CaretRight aria-hidden className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
