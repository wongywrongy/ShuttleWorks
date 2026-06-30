/**
 * boardPlacements — the pure OpsBlock → GanttTimeline placement model.
 *
 * One model feeds BOTH operations boards in two modes:
 *   - Plan (`buildPlanChips`) renders the PLANNED schedule: every chip is a
 *     uniform `span = 1` at its planned slot. Duration is deliberately NOT
 *     encoded as width — meet and bracket read identically (owner decision).
 *   - Run (`buildLiveChips`) renders the LIVE/ACTUAL day: a playing chip
 *     anchors at its actual start and grows toward `currentSlot`; a done chip
 *     spans its actual played length; a scheduled/called chip stays span=1 at
 *     the planned slot and flags `late` once the time axis passes it.
 *
 * Purity: no clock read here. `currentSlot` (and all actual timing) is injected
 * by the caller — Task 1 already resolved timestamps to slots on `OpsBlock`.
 * Missing actual timing falls back to the planned slot/span; this never throws.
 *
 * Lane packing is intentionally NOT applied here (the interface carries no
 * packing signal). The board layers `packBlockLanes` on top when it needs to
 * split a true double-booking side-by-side.
 */
import type { Placement } from '@scheduler/design-system/components';
import type { OpsBlock } from '../opsBlock';
import { fromEngineStatus, deriveLate, deriveDriftSlots, type RunStatus } from './runMachine';

export interface BoardChip {
  key: string;
  /** Positioned block for `GanttTimeline`; `placement.span` is the rendered width. */
  placement: Placement;
  source: 'meet' | 'bracket';
  state: RunStatus; // 'scheduled' | 'called' | 'playing' | 'done'
  late: boolean;
  /** Slots a playing chip has run past its planned end (>0 ⇒ overrun). */
  overrunSlots: number;
  label: string;
  colorKey?: string;
  /** The planned duration — drives the planned-end marker on the live board. */
  plannedSpan: number;
}

/** Court-assigned blocks only (court + slot present) become chips; the rest
 *  stay in the queue (owned by RunSurface). */
function courtAssigned(blocks: OpsBlock[]): OpsBlock[] {
  return blocks.filter((b) => b.court != null && b.slot != null);
}

function courtIndexOf(b: OpsBlock): number {
  return Math.max(0, (b.court as number) - 1);
}

/** Plan board: PLANNED schedule, uniform `span = 1` at the planned slot. */
export function buildPlanChips(blocks: OpsBlock[]): BoardChip[] {
  return courtAssigned(blocks).map((b) => {
    const state = fromEngineStatus(b.status);
    const plannedSpan = Math.max(1, b.span ?? 1);
    return {
      key: b.key,
      placement: {
        courtIndex: courtIndexOf(b),
        startSlot: b.slot as number,
        span: 1, // duration is NOT width on the plan board
        key: b.key,
      },
      source: b.source,
      state,
      late: false,
      overrunSlots: 0,
      label: b.label,
      colorKey: b.colorKey,
      plannedSpan,
    };
  });
}

/**
 * Run board: LIVE/ACTUAL spans. See the per-state rules in the module doc.
 *
 * `running` (the plan-finalized / floor-is-live flag) gates `late`: before the
 * day is running, the wall clock being past a DRAFT slot does not mean a match
 * is late, so nothing is flagged (avoids a wall of LATE badges on an un-started
 * plan). Once running, every overdue scheduled/called chip is late — the time
 * axis shows the position and the flag confirms it.
 */
export function buildLiveChips(blocks: OpsBlock[], currentSlot: number, running = false): BoardChip[] {
  return courtAssigned(blocks).map((b) => {
    const state = fromEngineStatus(b.status);
    const plannedSlot = b.slot as number;
    const plannedSpan = Math.max(1, b.span ?? 1);

    let startSlot: number;
    let span: number;
    if (state === 'playing') {
      // Anchor at the ACTUAL start (fall back to the planned slot); grow live.
      startSlot = b.actualStartSlot ?? plannedSlot;
      span = Math.max(1, currentSlot - startSlot);
    } else if (state === 'done') {
      // Span the ACTUAL played length; fall back to the planned span if either
      // actual endpoint is missing.
      startSlot = b.actualStartSlot ?? plannedSlot;
      span =
        b.actualStartSlot != null && b.actualEndSlot != null
          ? Math.max(1, b.actualEndSlot - b.actualStartSlot)
          : plannedSpan;
    } else {
      // scheduled | called — uniform width at the planned slot; the time axis
      // shows lateness directly.
      startSlot = plannedSlot;
      span = 1;
    }

    return {
      key: b.key,
      placement: {
        courtIndex: courtIndexOf(b),
        startSlot,
        span,
        key: b.key,
      },
      source: b.source,
      state,
      // Per-chip late, gated on the floor running: the time axis shows the
      // overdue position; the flag only lights once the day is live.
      late: running && deriveLate({ status: state, plannedSlot, currentSlot }),
      // Overrun measures past the PLANNED end (plannedSlot + plannedSpan).
      overrunSlots: deriveDriftSlots({ status: state, plannedSlot, span: plannedSpan, currentSlot }),
      label: b.label,
      colorKey: b.colorKey,
      plannedSpan,
    };
  });
}
