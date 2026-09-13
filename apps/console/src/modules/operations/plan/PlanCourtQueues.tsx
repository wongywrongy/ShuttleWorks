/**
 * PlanCourtQueues — the DEFAULT Plan view (P2, `operator-visual-fixes.md`).
 *
 * One full-width lane per court, each an ORDERED list of COMPACT ROWS: one
 * row is one match — time, position in the lane, match reference, the two
 * participant groups and the state. Duration is not encoded as height any
 * more than it was encoded as width on the timeline: what the operator reads
 * off this surface is ORDER, and the clock time is stated with the clock it
 * came from (`labelledClock`: Scheduled / Started), never a bare `~`.
 *
 * The lanes stack down the page rather than tiling into a grid of six inner
 * scroll panes: one page scroll reaches every court, which is what "all
 * courts easy to reach" means when the venue has eight of them.
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
import { NavCaret, NAV_LINK_ROW } from '../../../components/NavCaret';
import { TEXT_HELPER, TEXT_SECONDARY } from '../../../lib/textRoles';
import { labelledClock } from '../../../lib/formatDateTime';
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
 *  a plan lane is, so printing it on every cell says nothing — and since P4
 *  finished matches live under their own "Completed" disclosure, "Done" on
 *  every cell inside it says nothing either. Live and exceptional states
 *  stay explicit. */
function laneStateWord(block: OpsBlock): string | null {
  if (block.done) return null;
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
        {/* Lanes stack full width and the PAGE scrolls. Six or eight courts
            tiled into a grid each got their own cramped scroll pane, so
            reaching court 7's next match meant finding and scrolling a
            different little window. */}
        <div className="flex flex-col gap-2 p-3">
          {lanes.map((lane) => {
            // Position in the lane is the move coordinate, so it is read off
            // the FULL lane once and carried through the split below: what a
            // cell is worth moving to must not depend on which disclosure it
            // happens to be rendered in.
            const entries = lane.cells.map((cell, index) => ({ cell, index }));
            const completed = entries.filter((e) => e.cell.done);
            const upcoming = entries.filter((e) => !e.cell.done);
            const cellProps = (index: number) => ({
              court: lane.court,
              index,
              laneCount: lane.cells.length,
              courtCount: lanes.length,
              canEdit,
              onSelect,
              onMove: moveTo,
              formatSlot,
            });
            return (
              <section
                key={lane.court}
                data-testid={`plan-queue-lane-${lane.court}`}
                aria-label={`Court ${lane.court} queue`}
                className="overflow-hidden rounded border border-border bg-card"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-rule-soft bg-surface-band px-2.5 py-1.5">
                  <span className={`${EYEBROW_CLASS} text-foreground`}>Court {lane.court}</span>
                  <span className={`text-xs ${TEXT_HELPER}`}>
                    {upcoming.length} to play
                    {completed.length > 0 ? ` · ${completed.length} done` : ''}
                  </span>
                </div>
                {/* Completed work is history: it keeps its lane order and its
                    rows, but it is collapsed so court 6's first match is not
                    behind court 1's whole afternoon. */}
                {completed.length > 0 ? (
                  <details
                    data-testid={`plan-queue-completed-${lane.court}`}
                    className="border-b border-rule-soft"
                  >
                    <summary
                      data-testid={`plan-queue-completed-toggle-${lane.court}`}
                      className={`${NAV_LINK_ROW} w-full cursor-pointer list-none px-2.5 py-1.5 text-xs ${TEXT_SECONDARY} hover:text-foreground`}
                    >
                      <span className="inline-flex transition-transform duration-fast [details[open]_&]:rotate-90">
                        <NavCaret />
                      </span>
                      {completed.length} completed on Court {lane.court}
                    </summary>
                    <ol className="flex flex-col divide-y divide-rule-soft px-2 pb-1">
                      {completed.map(({ cell, index }) => (
                        <QueueRow
                          key={cell.key}
                          block={cell}
                          selected={selectedKey === cell.key}
                          pending={pendingKey === cell.key}
                          {...cellProps(index)}
                        />
                      ))}
                    </ol>
                  </details>
                ) : null}
                <ol
                  data-testid={`plan-queue-list-${lane.court}`}
                  aria-label={`Court ${lane.court} upcoming matches`}
                  className="flex flex-col px-2 py-1"
                >
                  {upcoming.map(({ cell, index }, i) => {
                    // A lane is sorted by slot, so a printed time that goes
                    // BACKWARDS is never a re-ordering — it is the clock
                    // wrapping past midnight with nothing said about it.
                    const prev = upcoming[i - 1]?.cell;
                    const dayBreak =
                      prev != null &&
                      crossesDayBoundary(slotClock(prev, formatSlot), slotClock(cell, formatSlot));
                    return (
                      <Fragment key={cell.key}>
                        {dayBreak ? (
                          <li
                            data-testid={`plan-queue-day-break-${lane.court}`}
                            className={`flex items-center gap-2 py-1 text-2xs uppercase tracking-[0.08em] ${TEXT_SECONDARY}`}
                          >
                            <span className="h-px flex-1 bg-border" />
                            Next day
                            <span className="h-px flex-1 bg-border" />
                          </li>
                        ) : null}
                        {/* The gap ABOVE the row is the drop target for its position. */}
                        <DropSlot court={lane.court} index={index} />
                        <QueueRow
                          block={cell}
                          selected={selectedKey === cell.key}
                          pending={pendingKey === cell.key}
                          {...cellProps(index)}
                        />
                      </Fragment>
                    );
                  })}
                  {/* The tail target: dropping here appends to the lane. Also
                      the ONLY drop target an empty lane has. */}
                  <DropSlot court={lane.court} index={lane.cells.length} empty={lane.cells.length === 0} />
                </ol>
              </section>
            );
          })}
        </div>
      </DndContext>
      {/* Outcome only. The idle state carries NO standing drag instruction
          (P2): the move controls are on the rows, where the action is. */}
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

/** The wall-clock a row PRINTS for its position in the lane (the planned
 *  slot). '' when the workspace has no configured clock. */
function slotClock(block: OpsBlock, formatSlot?: (slotId: number) => string): string {
  return block.slot != null ? formatSlot?.(block.slot) ?? '' : '';
}

/**
 * Do two consecutive lane times cross a calendar day?
 *
 * A lane is sorted by slot, so its printed times can only DECREASE when the
 * slot→clock mapping wraps: `slotToTime` prints time-of-day and wraps at
 * 24:00, so an overnight day window — or a plan pushed past the configured
 * day end — prints `23:45` then `00:15` with nothing to say a day passed.
 * Pure and string-only: it reads the two labels and never invents a date.
 */
export function crossesDayBoundary(prev: string, next: string): boolean {
  const minutes = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = minutes(prev);
  const b = minutes(next);
  return a != null && b != null && b < a;
}

/** A drop target between/after rows. `index` is the position the dragged
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
        empty ? 'h-12' : 'h-1.5',
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

function QueueRow({
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
  // Three clocks, three labels (`labelledClock`): the slot the plan holds,
  // and — once the desk has actually run the match — when it really started
  // and ended. A bare `~9:00` could not tell an operator which of those it
  // was. Nothing here estimates: the Plan surface is given planned slots and
  // recorded actuals, so it prints those two and invents no third.
  const planned = labelledClock('scheduled', slotClock(block, formatSlot));
  const startedAt =
    block.actualStartSlot != null
      ? labelledClock('actual', formatSlot?.(block.actualStartSlot) ?? '')
      : null;
  const stateWord = laneStateWord(block);
  const moveTitle = canEdit ? undefined : READ_ONLY_MESSAGE;
  // 24x24 minimum target (WCAG 2.2 AA 2.5.8) — a 12px caret needs a real box
  // around it, not padding that happens to add up.
  const btn =
    'grid h-6 w-6 place-items-center rounded border border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <li
      data-testid={`plan-queue-cell-${block.key}`}
      data-source={block.source}
      className="group flex items-center gap-1"
    >
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
        title={`${identity}: ${block.sideA} versus ${block.sideB}`}
        aria-label={`${identity}: ${block.sideA} versus ${block.sideB}`}
        className={[
          // One ROW, not a card: fixed columns for the facts that compare
          // down the lane, and the names take the rest. It WRAPS rather than
          // clips (the truncation contract forbids silent clipping as
          // squarely as an inaccessible ellipsis), so a long doubles pairing
          // at a narrow width pushes the row taller and stays readable.
          'flex min-h-8 w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded border px-2 py-1 text-left',
          SELECTABLE_ROW_FOCUS,
          selected ? 'border-accent ring-1 ring-accent' : 'border-transparent',
          block.done ? 'bg-muted/40' : canEdit ? 'cursor-grab active:cursor-grabbing' : '',
          isDragging ? 'border-dashed bg-muted/40' : '',
          pending ? 'animate-pulse' : '',
        ].join(' ')}
      >
        {/* Time first: it is what an operator scans a lane for. */}
        <span className="flex w-32 shrink-0 flex-col leading-tight">
          <span
            data-testid={`plan-queue-planned-${block.key}`}
            className={`text-xs sw-num ${TEXT_SECONDARY}`}
          >
            {planned ?? ''}
          </span>
          {startedAt ? (
            <span
              data-testid={`plan-queue-actual-${block.key}`}
              className={`text-2xs sw-num ${TEXT_HELPER}`}
            >
              {startedAt}
            </span>
          ) : null}
        </span>
        {/* Order in the lane, then the reference — event and round ride in
            the reference itself (`formatMatchIdentity`), as secondary ink. */}
        <span className="w-5 shrink-0 text-right text-2xs sw-num text-ink-faint">{index + 1}</span>
        <span
          className={`w-20 shrink-0 whitespace-nowrap text-xs font-semibold sw-num ${TEXT_SECONDARY}`}
        >
          {identity}
        </span>
        {/* One participant GROUP per element, so a doubles pairing never
            wraps through its own middle and the reader never has to work out
            where one side ends. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span
            data-testid={`plan-queue-side-a-${block.key}`}
            className="break-words text-[13px] font-medium leading-tight text-foreground"
          >
            {block.sideA}
          </span>
          <span className="text-2xs uppercase tracking-[0.06em] text-muted-foreground">v</span>
          <span
            data-testid={`plan-queue-side-b-${block.key}`}
            className="break-words text-[13px] font-medium leading-tight text-foreground"
          >
            {block.sideB}
          </span>
        </span>
        {stateWord ? (
          <span className={`shrink-0 text-xs ${TEXT_SECONDARY}`}>{stateWord}</span>
        ) : null}
      </div>
      {/* Movement controls reveal on SELECTION or keyboard focus (and, as a
          convenience, hover) — never hover alone, which no keyboard or touch
          user can produce. They stay in the tab order at all times: opacity,
          not `hidden`, is what changes. */}
      {block.done ? null : (
        <span
          data-testid={`plan-queue-controls-${block.key}`}
          className={[
            'flex shrink-0 items-center gap-0.5 transition-opacity duration-fast',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            selected ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
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
    </li>
  );
}
