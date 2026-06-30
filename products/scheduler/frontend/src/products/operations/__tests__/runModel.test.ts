import { describe, it, expect } from 'vitest';
import { toRunMatches, deriveCourtLanes, deriveQueue, nextEligible, deriveSummary } from '../runtime/runModel';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false,
  ...o,
} as OpsBlock);

describe('runModel', () => {
  it('maps engine status to RunStatus; toRunMatches never flags late', () => {
    const [m] = toRunMatches([blk({ id: 'a', status: 'started', court: 1, slot: 0 })], {});
    expect(m.status).toBe('playing');
    expect(m.late).toBe(false);
    // Even an overdue scheduled match is NOT late at this layer — late is a
    // lane- and run-state-aware fact, derived in deriveCourtLanes.
    const [w] = toRunMatches([blk({ id: 'b', status: 'scheduled', court: 1, slot: 1 })], {});
    expect(w.late).toBe(false);
  });

  it('late: Now match only, and only when the floor is running', () => {
    const ms = toRunMatches([blk({ id: 'a', court: 1, slot: 1, status: 'scheduled' })], {});
    // not running → never late, even when overdue
    expect(deriveCourtLanes(ms, 1, { running: false, currentSlot: 5 })[0].now?.late).toBe(false);
    // running + past planned start → late
    expect(deriveCourtLanes(ms, 1, { running: true, currentSlot: 5 })[0].now?.late).toBe(true);
    // running but not yet due → not late
    expect(deriveCourtLanes(ms, 1, { running: true, currentSlot: 0 })[0].now?.late).toBe(false);
  });

  it('late: Next/Later matches are never late — only the Now match', () => {
    const ms = toRunMatches([
      blk({ id: 'n1', court: 1, slot: 0, status: 'scheduled' }),
      blk({ id: 'n2', court: 1, slot: 1, status: 'scheduled' }),
      blk({ id: 'n3', court: 1, slot: 2, status: 'scheduled' }),
    ], {});
    const [lane] = deriveCourtLanes(ms, 1, { running: true, currentSlot: 99 });
    expect(lane.now?.late).toBe(true);   // overdue Now
    expect(lane.next?.late).toBe(false); // never late
    expect(lane.later?.late).toBe(false);
  });

  it('late: clears when the Now match is playing', () => {
    const ms = toRunMatches([blk({ id: 'p', court: 1, slot: 0, status: 'started' })], {});
    expect(deriveCourtLanes(ms, 1, { running: true, currentSlot: 99 })[0].now?.late).toBe(false);
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
  it('nextEligible skips eligible-but-called matches; requires scheduled (assignable) status', () => {
    // bracket match: eligible (in eligibleBracketIds) but status='called' (in calledBracketIds)
    // meet match: eligible and scheduled → the only assignable head
    const ms = toRunMatches(
      [
        blk({ id: 'called', source: 'bracket', key: 'bracket:called', sideA: 'A', sideB: 'B' }),
        blk({ id: 'ready', sideA: 'C', sideB: 'D' }),
      ],
      { calledBracketIds: new Set(['called']), eligibleBracketIds: new Set(['called']) },
    );
    const q = deriveQueue(ms);
    // 'bracket:called' sorts before 'meet:ready' (b < m); verify it's eligible but called
    const calledM = q.find((m) => m.id === 'called');
    expect(calledM?.eligible).toBe(true);
    expect(calledM?.status).toBe('called');
    // nextEligible must skip the called match and return the scheduled one
    expect(nextEligible(q)?.id).toBe('ready');
    // with only the called match in queue: no assignable head
    expect(nextEligible([calledM!])).toBeUndefined();
  });
  it('meet match is eligible when both sides are known', () => {
    const [m] = toRunMatches([blk({ id: 'm', sideA: 'A', sideB: 'B' })], {});
    expect(m.eligible).toBe(true);
    const [u] = toRunMatches([blk({ id: 'u', sideA: 'TBD', sideB: 'B' })], {});
    expect(u.eligible).toBe(false);
  });
  it('summary counts are all derived; late is Now-only and running-gated', () => {
    const ms = toRunMatches([
      blk({ id: 'p', court: 1, slot: 0, status: 'started' }),   // playing Now on C1
      blk({ id: 'd', status: 'finished', done: true }),
      blk({ id: 'lateNow', court: 2, slot: 1, status: 'scheduled' }), // overdue Now on C2
      blk({ id: 'q', court: undefined, slot: 1 }),              // queued — never late
    ], {});
    // Running → only the overdue Now on C2 is late (playing Now and queued are not).
    const lanesRunning = deriveCourtLanes(ms, 3, { running: true, currentSlot: 9 });
    const sRunning = deriveSummary(ms, lanesRunning);
    expect(sRunning).toMatchObject({ done: 1, total: 4, playing: 1, courtsFree: 1 });
    expect(sRunning.late).toBe(1);
    // Not running (plan not finalized) → zero late.
    const lanesIdle = deriveCourtLanes(ms, 3, { running: false, currentSlot: 9 });
    expect(deriveSummary(ms, lanesIdle).late).toBe(0);
  });
});
