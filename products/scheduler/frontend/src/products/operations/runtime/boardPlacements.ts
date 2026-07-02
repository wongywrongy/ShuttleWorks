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
  /** Slots this chip was pushed PAST its planned slot by earlier matches
   *  still occupying its court (>0 ⇒ visibly delayed — the board renders a
   *  `▸+N` marker). Only scheduled/called chips are ever pushed; playing and
   *  done chips are facts and anchor where they actually happened. */
  pushedSlots: number;
  label: string;
  colorKey?: string;
  /** The planned duration — drives the planned-end marker on the live board. */
  plannedSpan: number;
  /** Side labels — the live board paints them on wide (playing) chips so the
   *  floor sees teams at a glance; the plan board stays label-only. */
  sideA?: string;
  sideB?: string;
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
      pushedSlots: 0, // the plan board shows the PLAN — nothing is pushed
      label: b.label,
      colorKey: b.colorKey,
      plannedSpan,
    };
  });
}

/**
 * Court pushback — a court plays ONE match at a time, so a match that runs
 * long must visibly DELAY what's behind it, not grow underneath it.
 *
 * Walks each court's chips in start order keeping a rolling `cursor` (the
 * earliest slot the court is next free). A scheduled/called chip that would
 * start before the cursor is pushed right to it and carries the shift in
 * `pushedSlots` (>0 ⇒ the board renders a `▸+N` delay marker). Playing and
 * done chips are FACTS (actual timing) — they are never moved; they only
 * advance the cursor. Pushes cascade naturally down the court. A genuine
 * factual overlap (e.g. two playing chips on one court) stays overlapping —
 * the board's vertical lane split remains the honest fallback for that.
 *
 * Pure and stable: input order of the returned array is preserved; only
 * `placement.startSlot` / `pushedSlots` of pushed chips change.
 */
export function applyCourtPushback(chips: BoardChip[]): BoardChip[] {
  const byCourt = new Map<number, BoardChip[]>();
  for (const c of chips) {
    const list = byCourt.get(c.placement.courtIndex) ?? [];
    list.push(c);
    byCourt.set(c.placement.courtIndex, list);
  }

  const pushed = new Map<string, BoardChip>();
  for (const list of byCourt.values()) {
    // Facts before plans on ties so an in-progress match claims the cell it
    // actually occupies before a same-slot planned chip is considered.
    const ordered = [...list].sort(
      (a, b) =>
        a.placement.startSlot - b.placement.startSlot ||
        Number(isPlanned(b)) - Number(isPlanned(a)),
    );
    let cursor = Number.NEGATIVE_INFINITY;
    for (const c of ordered) {
      let start = c.placement.startSlot;
      if (isPlanned(c) && start < cursor) {
        const shift = cursor - start;
        start = cursor;
        pushed.set(c.key, {
          ...c,
          pushedSlots: shift,
          placement: { ...c.placement, startSlot: start },
        });
      }
      cursor = Math.max(cursor, start + c.placement.span);
    }
  }

  if (pushed.size === 0) return chips;
  return chips.map((c) => pushed.get(c.key) ?? c);
}

/** Plans move; facts don't. */
function isPlanned(c: BoardChip): boolean {
  return c.state === 'scheduled' || c.state === 'called';
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
  const chips = courtAssigned(blocks).map((b) => {
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
      pushedSlots: 0, // assigned by the pushback pass below
      label: b.label,
      colorKey: b.colorKey,
      plannedSpan,
      sideA: b.sideA,
      sideB: b.sideB,
    };
  });
  // A long-running match must visibly DELAY what's behind it on its court,
  // never grow underneath it (feature fix, 2026-07-02).
  return applyCourtPushback(chips);
}
