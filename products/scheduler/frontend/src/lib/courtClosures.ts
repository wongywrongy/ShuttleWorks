/**
 * Court-closure window helpers.
 *
 * The persisted shape mixes two representations:
 *   - ``config.closedCourts: number[]`` (legacy) — court ID closed all day.
 *   - ``config.courtClosures: CourtClosure[]`` — time-bounded windows.
 *
 * These helpers normalize both into half-open slot ranges so Gantt
 * grids can grey only the affected cells (not entire rows) and the
 * validator can quickly check overlap.
 */
import type { CourtClosure, TournamentConfig } from '../api/dto';
import { timeToSlot } from './time';

export interface ClosedSlotWindow {
  courtId: number;
  /** Inclusive lower bound (slot index). */
  fromSlot: number;
  /** Exclusive upper bound (slot index). */
  toSlot: number;
  reason?: string;
}

/** Translate every closure (legacy + time-bounded) into slot windows.
 *  Out-of-range courts and inverted/empty windows are silently
 *  dropped. ``totalSlots`` should equal the renderable slot grid
 *  length so "until end of day" closures bound correctly.
 */
export function getClosedSlotWindows(
  config: TournamentConfig | null | undefined,
  totalSlots: number,
): ClosedSlotWindow[] {
  if (!config) return [];
  const out: ClosedSlotWindow[] = [];
  for (const courtId of config.closedCourts ?? []) {
    if (courtId >= 1 && courtId <= config.courtCount && totalSlots > 0) {
      out.push({ courtId, fromSlot: 0, toSlot: totalSlots });
    }
  }
  for (const closure of config.courtClosures ?? []) {
    if (closure.courtId < 1 || closure.courtId > config.courtCount) continue;
    const fromSlot = closure.fromTime
      ? Math.max(0, Math.min(timeToSlot(closure.fromTime, config), totalSlots))
      : 0;
    const toSlot = closure.toTime
      ? Math.max(0, Math.min(timeToSlot(closure.toTime, config), totalSlots))
      : totalSlots;
    if (toSlot > fromSlot) {
      out.push({ courtId: closure.courtId, fromSlot, toSlot, reason: closure.reason });
    }
  }
  return out;
}

/** True iff ``slotId`` falls inside any closure for ``courtId``. */
export function isSlotClosed(
  windows: ClosedSlotWindow[],
  courtId: number,
  slotId: number,
): boolean {
  for (const w of windows) {
    if (w.courtId === courtId && slotId >= w.fromSlot && slotId < w.toSlot) {
      return true;
    }
  }
  return false;
}

/** True iff the entire visible slot range is closed for ``courtId``.
 *  Used to decide whether to grey the court label / row title vs.
 *  just individual cells. */
export function isCourtFullyClosed(
  windows: ClosedSlotWindow[],
  courtId: number,
  visibleFromSlot: number,
  visibleToSlot: number,
): boolean {
  if (visibleToSlot <= visibleFromSlot) return false;
  // Merge windows on this court and see if they cover the full visible range.
  const ranges = windows
    .filter((w) => w.courtId === courtId)
    .map((w) => [Math.max(w.fromSlot, visibleFromSlot), Math.min(w.toSlot, visibleToSlot)] as const)
    .filter(([f, t]) => t > f)
    .sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return false;
  let covered = visibleFromSlot;
  for (const [f, t] of ranges) {
    if (f > covered) return false;
    covered = Math.max(covered, t);
    if (covered >= visibleToSlot) return true;
  }
  return covered >= visibleToSlot;
}

/** Collect the unique closure entries that mention ``courtId``, sorted
 *  by start slot. Useful for tooltip rendering. */
export function closuresForCourt(
  config: TournamentConfig | null | undefined,
  courtId: number,
): CourtClosure[] {
  if (!config) return [];
  const out: CourtClosure[] = [];
  if ((config.closedCourts ?? []).includes(courtId)) {
    out.push({ courtId });
  }
  for (const c of config.courtClosures ?? []) {
    if (c.courtId === courtId) out.push(c);
  }
  return out;
}
