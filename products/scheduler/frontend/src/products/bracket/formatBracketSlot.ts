/**
 * Pure slot-to-time helper for the bracket Schedule chrome.
 *
 * Given a 0-based slot id and the bracket's `interval_minutes` +
 * `start_time` config, return an `HH:MM` wall-clock string. When
 * `start_time` is null / empty / unparseable, return the absolute
 * `"Slot N"` fallback so the operator still sees a stable label.
 */
export interface BracketSlotContext {
  /** ISO-like HH:MM wall-clock string, or null for a tournament that
   *  hasn't pinned a start time. */
  start_time: string | null | undefined;
  /** Minutes per slot. */
  interval_minutes: number;
}

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

export function formatBracketSlot(
  slotId: number,
  ctx: BracketSlotContext,
): string {
  const { start_time, interval_minutes } = ctx;
  if (!start_time) return `Slot ${slotId}`;
  const m = HHMM_RE.exec(start_time.trim());
  if (!m) return `Slot ${slotId}`;
  const startHours = parseInt(m[1], 10);
  const startMinutes = parseInt(m[2], 10);
  if (!Number.isFinite(startHours) || !Number.isFinite(startMinutes)) {
    return `Slot ${slotId}`;
  }
  const totalMinutes = startHours * 60 + startMinutes + slotId * interval_minutes;
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
