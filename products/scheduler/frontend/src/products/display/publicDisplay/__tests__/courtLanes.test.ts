/**
 * Pure-helper tests for the board's Now/Next/Later lane assignment. Written
 * FIRST (TDD RED) — courtLanes.ts does not exist yet when this file is
 * created. See task-8-brief.md.
 *
 * This is a BOARD-LOCAL helper, deliberately NOT shared with Operations'
 * `deriveCourtLanes` (products/operations/runtime/runModel.ts). That helper
 * sets `now` POSITIONALLY — the earliest non-done match on a court, even
 * when nothing on that court has actually started or been called (an idle
 * court with only scheduled matches still gets a `now` there, used for
 * Operations' internal bookkeeping/free-court-finding). The public board
 * must NEVER label a not-yet-live match "Now" on a spectator TV — `now`
 * here is strictly LIVE-gated (only ids the caller names in `nowState`),
 * never positional. That divergence (a different essential input — live
 * status — and a different `now` rule, not just a coarser vocabulary) is
 * why this is its own tested helper rather than a shared extraction; see
 * task-8-report.md for the full write-up.
 */
import { describe, expect, it } from 'vitest';
import { assignLanes, type LaneItem } from '../courtLanes';

function item(id: string, court: number, plannedSlot: number): LaneItem {
  return { id, court, plannedSlot };
}

describe('assignLanes', () => {
  it('idle court (nothing live): earliest two by plannedSlot become next/later, no now at all', () => {
    const items = [item('a', 1, 2), item('b', 1, 0), item('c', 1, 1)];
    const lanes = assignLanes(items, new Set());

    expect(lanes.get('b')).toBe('next'); // slot 0
    expect(lanes.get('c')).toBe('later'); // slot 1
    expect(lanes.get('a')).toBeUndefined(); // slot 2 — beyond the two previews
    // Decisive assertion: an idle court must not manufacture a "now".
    expect([...lanes.values()]).not.toContain('now');
  });

  it('a live match that is NOT earliest-by-slot (actualCourtId override) is still "now"; remaining items keep sort order for next/later', () => {
    // b (slot 0) and c (slot 5) are both merely scheduled; a (slot 3) is the
    // match actually in progress on this court right now (e.g. reassigned
    // here via actualCourtId after the original schedule placed it later
    // than b). Live status wins over position.
    const items = [item('b', 1, 0), item('a', 1, 3), item('c', 1, 5)];
    const lanes = assignLanes(items, new Set(['a']));

    expect(lanes.get('a')).toBe('now');
    expect(lanes.get('b')).toBe('next'); // earliest of the remaining, by slot
    expect(lanes.get('c')).toBe('later');
  });

  it('courts are independent: a live match on one court does not affect another court\'s lanes', () => {
    const items = [
      item('c1-now', 1, 0),
      item('c1-next', 1, 1),
      item('c2-a', 2, 0),
      item('c2-b', 2, 1),
    ];
    const lanes = assignLanes(items, new Set(['c1-now']));

    expect(lanes.get('c1-now')).toBe('now');
    expect(lanes.get('c1-next')).toBe('next');
    // Court 2 has nothing live — same idle rule as the first test.
    expect(lanes.get('c2-a')).toBe('next');
    expect(lanes.get('c2-b')).toBe('later');
  });

  it('ties on plannedSlot break by id, ascending', () => {
    const items = [item('z', 1, 0), item('a', 1, 0)];
    const lanes = assignLanes(items, new Set());

    expect(lanes.get('a')).toBe('next');
    expect(lanes.get('z')).toBe('later');
  });

  it('empty items produce an empty map', () => {
    expect(assignLanes([], new Set()).size).toBe(0);
  });

  it('a nowState id absent from items is ignored (defensive — never throws, never phantom-labels)', () => {
    const items = [item('a', 1, 0), item('b', 1, 1)];
    const lanes = assignLanes(items, new Set(['ghost']));

    expect(lanes.get('a')).toBe('next');
    expect(lanes.get('b')).toBe('later');
    expect(lanes.get('ghost')).toBeUndefined();
  });

  it('a court with only one item and nothing live: that item is next, no later', () => {
    const items = [item('solo', 4, 0)];
    const lanes = assignLanes(items, new Set());

    expect(lanes.get('solo')).toBe('next');
    expect(lanes.size).toBe(1);
  });
});
