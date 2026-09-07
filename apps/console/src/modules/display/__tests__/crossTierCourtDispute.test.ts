/**
 * Cross-tier parity (deliverable 4, package 04b): the desk (Operations'
 * `runModel.ts`) and the board (`publicDisplay/courtLanes.ts`) must agree
 * on which court is disputed for the same input, because both redirect to
 * the SAME authority (`platform/domain/courtOccupancy.ts`, D1) rather than
 * keeping independent detectors.
 *
 * This file cannot import `modules/operations/runtime/runModel.ts` directly
 * — Display and Operations are independent feature modules and a new
 * cross-module edge is an ERROR (dependency-cruiser, ADR 0011/0013). Instead
 * it calls the authority exactly the way `runModel.ts`'s `deriveSummary`
 * does (`deriveCourtStates`/`disputedCourtCount` over `{id, status, court}`)
 * and separately drives `courtLanes.ts`'s public API over the equivalent
 * `LaneItem`/`nowState` shape, then asserts the two land on the same
 * disputed court for one shared fixture.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveCourtStates,
  disputedCourtCount,
  occupiedCourtCount,
  type OccupancyMatchLike,
} from '../../../platform/domain/courtOccupancy';
import { assignLanes, currentMatchesByCourt, type LaneItem } from '../publicDisplay/courtLanes';

// Shared fixture: two matches ("m1", "m2") both currently playing on court
// 1 — a genuine dispute — and one match ("m3") cleanly playing on court 2.
const DESK_MATCHES: OccupancyMatchLike[] = [
  { id: 'm1', status: 'playing', court: 1 },
  { id: 'm2', status: 'playing', court: 1 },
  { id: 'm3', status: 'playing', court: 2 },
];

const BOARD_ITEMS: LaneItem[] = [
  { id: 'm1', court: 1, plannedSlot: 0 },
  { id: 'm2', court: 1, plannedSlot: 1 },
  { id: 'm3', court: 2, plannedSlot: 0 },
];
const BOARD_NOW_STATE = new Set(['m1', 'm2', 'm3']);

describe('desk/board dispute parity', () => {
  it('runModel-shaped desk summary calls court 1 disputed and court 2 occupied', () => {
    const states = deriveCourtStates(DESK_MATCHES);
    expect(states.get(1)).toBe('disputed');
    expect(states.get(2)).toBe('occupied');
    expect(disputedCourtCount(states)).toBe(1);
    expect(occupiedCourtCount(states)).toBe(1);
  });

  it('courtLanes (the board) calls the SAME court disputed and the same one occupied', () => {
    const { current, conflicts } = currentMatchesByCourt(BOARD_ITEMS, BOARD_NOW_STATE);
    expect(conflicts.get(1)).toEqual(expect.arrayContaining(['m1', 'm2']));
    expect(current.get(2)).toBe('m3');
    expect(current.has(1)).toBe(false);
  });

  it('the board never assigns a "now" lane for the disputed court', () => {
    const lanes = assignLanes(BOARD_ITEMS, BOARD_NOW_STATE);
    expect(lanes.get('m1')).not.toBe('now');
    expect(lanes.get('m2')).not.toBe('now');
    // The undisputed court's live match still gets its now lane.
    expect(lanes.get('m3')).toBe('now');
  });
});
