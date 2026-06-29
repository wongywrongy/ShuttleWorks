import { describe, it, expect } from 'vitest';
import { toRunMatches, deriveCourtLanes, deriveQueue, nextEligible, deriveSummary } from '../runtime/runModel';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false,
  ...o,
} as OpsBlock);

describe('runModel', () => {
  it('maps engine status to RunStatus and derives late', () => {
    const [m] = toRunMatches([blk({ id: 'a', status: 'started', court: 1, slot: 0 })], { currentSlot: 5 });
    expect(m.status).toBe('playing');
    expect(m.late).toBe(false); // playing clears late
    const [w] = toRunMatches([blk({ id: 'b', status: 'scheduled', court: 1, slot: 1 })], { currentSlot: 4 });
    expect(w.late).toBe(true);
  });
  it('overlays Operations-local called onto bracket matches', () => {
    const [m] = toRunMatches(
      [blk({ id: 'p', source: 'bracket', key: 'bracket:p', status: 'scheduled', court: 2, slot: 0 })],
      { calledBracketIds: new Set(['p']) },
    );
    expect(m.status).toBe('called');
  });
  it('orders each court lane by slot, drops done, exposes Now/Next/Later + depth', () => {
    const ms = toRunMatches([
      blk({ id: 'n3', court: 1, slot: 3 }),
      blk({ id: 'done', court: 1, slot: 0, status: 'finished', done: true }),
      blk({ id: 'n1', court: 1, slot: 1 }),
      blk({ id: 'n2', court: 1, slot: 2 }),
    ], {});
    const [lane] = deriveCourtLanes(ms, 1);
    expect([lane.now?.id, lane.next?.id, lane.later?.id]).toEqual(['n1', 'n2', 'n3']);
    expect(lane.depth).toBe(3); // 3 not-done on court 1
  });
  it('renders a free court (empty lane) for courts with no live matches', () => {
    const lanes = deriveCourtLanes(toRunMatches([blk({ id: 'x', court: 1, slot: 0 })], {}), 2);
    expect(lanes[1].now).toBeUndefined();
  });
  it('queue = unassigned non-done, sorted by plannedSlot then key; excludes court-assigned', () => {
    const ms = toRunMatches([
      blk({ id: 'q2', court: undefined, slot: 5 }),
      blk({ id: 'on', court: 1, slot: 0 }),
      blk({ id: 'q1', court: undefined, slot: 2 }),
      blk({ id: 'fin', status: 'finished', done: true }),
    ], {});
    expect(deriveQueue(ms).map((m) => m.id)).toEqual(['q1', 'q2']); // slot 2 before slot 5
  });
  it('marks bracket eligibility and nextEligible skips TBD-vs-TBD', () => {
    const ms = toRunMatches(
      [
        blk({ id: 'feeder', source: 'bracket', key: 'bracket:feeder', sideA: 'TBD', sideB: 'TBD', slot: 1 }),
        blk({ id: 'ready', source: 'bracket', key: 'bracket:ready', sideA: 'Lin', sideB: 'Roy', slot: 2 }),
      ],
      { eligibleBracketIds: new Set(['ready']) },
    );
    const q = deriveQueue(ms);
    expect(q.map((m) => m.id)).toEqual(['feeder', 'ready']); // both shown, slot order
    expect(nextEligible(q)?.id).toBe('ready');               // ineligible feeder skipped
  });
  it('meet match is eligible when both sides are known', () => {
    const [m] = toRunMatches([blk({ id: 'm', sideA: 'A', sideB: 'B' })], {});
    expect(m.eligible).toBe(true);
    const [u] = toRunMatches([blk({ id: 'u', sideA: 'TBD', sideB: 'B' })], {});
    expect(u.eligible).toBe(false);
  });
  it('summary counts are all derived', () => {
    const ms = toRunMatches([
      blk({ id: 'p', court: 1, slot: 0, status: 'started' }),
      blk({ id: 'd', status: 'finished', done: true }),
      blk({ id: 'lateq', court: undefined, slot: 1 }), // unassigned, late candidate
    ], { currentSlot: 9 });
    const lanes = deriveCourtLanes(ms, 3);
    const s = deriveSummary(ms, lanes);
    expect(s).toMatchObject({ done: 1, total: 3, playing: 1, courtsFree: 2 });
    expect(s.late).toBeGreaterThanOrEqual(1);
  });
});
