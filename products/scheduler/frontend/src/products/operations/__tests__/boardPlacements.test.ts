import { describe, it, expect } from 'vitest';
import { buildPlanChips, buildLiveChips } from '../runtime/boardPlacements';
import type { OpsBlock } from '../opsBlock';

const blk = (o: Partial<OpsBlock> & { id: string }): OpsBlock => ({
  source: 'meet', key: `meet:${o.id}`, label: o.id, span: 1,
  status: 'scheduled', sideA: 'A', sideB: 'B', done: false, started: false,
  ...o,
} as OpsBlock);

describe('boardPlacements — buildPlanChips', () => {
  it('uniform span=1 regardless of solver duration, anchored at the planned slot', () => {
    const chips = buildPlanChips([blk({ id: 'a', court: 2, slot: 4, span: 3, status: 'scheduled' })]);
    expect(chips).toHaveLength(1);
    const [c] = chips;
    expect(c.placement.span).toBe(1);        // duration is NOT width
    expect(c.placement.startSlot).toBe(4);   // planned slot
    expect(c.placement.courtIndex).toBe(1);  // court 2 → index 1
    expect(c.placement.key).toBe('meet:a');
    expect(c.state).toBe('scheduled');
    expect(c.late).toBe(false);
    expect(c.overrunSlots).toBe(0);
    expect(c.plannedSpan).toBe(3);
  });

  it('a finished plan block still renders span=1 (duration is not width)', () => {
    const [c] = buildPlanChips([blk({ id: 'd', court: 1, slot: 0, span: 5, status: 'finished', done: true })]);
    expect(c.placement.span).toBe(1);
    expect(c.state).toBe('done');
  });

  it('only court-assigned blocks become chips (unassigned/no-slot stay in the queue)', () => {
    const chips = buildPlanChips([
      blk({ id: 'on', court: 1, slot: 0 }),
      blk({ id: 'queued', court: undefined, slot: 3 }),
      blk({ id: 'noSlot', court: 1, slot: undefined }),
    ]);
    expect(chips.map((c) => c.key)).toEqual(['meet:on']);
  });
});

describe('boardPlacements — buildLiveChips', () => {
  it('playing chip grows from the ACTUAL start (not the planned slot)', () => {
    // planned slot 1, span 2 (planned end = 3); actually started at slot 2.
    const [c] = buildLiveChips(
      [blk({ id: 'p', court: 1, slot: 1, span: 2, status: 'started', started: true, actualStartSlot: 2 })],
      4,
    );
    expect(c.state).toBe('playing');
    expect(c.placement.startSlot).toBe(2);  // ACTUAL start, not planned 1
    expect(c.placement.span).toBe(2);       // 4 − 2 (grows live)
    expect(c.overrunSlots).toBe(1);         // max(0, 4 − (1+2))
  });

  it('overrun is 0 while a playing chip is still inside its planned window', () => {
    const [c] = buildLiveChips(
      [blk({ id: 'p2', court: 1, slot: 2, span: 2, status: 'started', started: true, actualStartSlot: 2 })],
      3,
    );
    expect(c.placement.span).toBe(1);  // 3 − 2
    expect(c.overrunSlots).toBe(0);    // max(0, 3 − (2+2))
  });

  it('done chip spans the actual played length (start → end)', () => {
    const [c] = buildLiveChips(
      [blk({ id: 'd', court: 1, slot: 0, span: 1, status: 'finished', done: true, actualStartSlot: 2, actualEndSlot: 6 })],
      10,
    );
    expect(c.state).toBe('done');
    expect(c.placement.startSlot).toBe(2);
    expect(c.placement.span).toBe(4);   // 6 − 2 (actual length, not planned 1)
    expect(c.overrunSlots).toBe(0);     // overrun is a playing-only concern
  });

  it('scheduled chip is span=1; late only when RUNNING and currentSlot >= plannedSlot', () => {
    const blocks = [blk({ id: 's', court: 1, slot: 3, span: 2, status: 'scheduled' })];
    // running + overdue → late
    const [overdue] = buildLiveChips(blocks, 3, true);
    expect(overdue.placement.span).toBe(1);
    expect(overdue.placement.startSlot).toBe(3);
    expect(overdue.late).toBe(true);
    // NOT running (plan not finalized) → never late, even when overdue
    expect(buildLiveChips(blocks, 3, false)[0].late).toBe(false);
    // running but not yet due → not late
    expect(buildLiveChips(blocks, 1, true)[0].late).toBe(false);
  });

  it('called chip is span=1 at the planned slot and can be late (when running)', () => {
    const [c] = buildLiveChips([blk({ id: 'c', court: 1, slot: 2, status: 'called' })], 4, true);
    expect(c.state).toBe('called');
    expect(c.placement.span).toBe(1);
    expect(c.placement.startSlot).toBe(2);
    expect(c.late).toBe(true);
  });

  it('missing actual timing falls back to the planned slot/span (never throws)', () => {
    // playing without actualStartSlot → anchors at the planned slot, grows from there
    const [p] = buildLiveChips(
      [blk({ id: 'p', court: 1, slot: 2, span: 1, status: 'started', started: true })],
      5,
    );
    expect(p.placement.startSlot).toBe(2);  // planned fallback
    expect(p.placement.span).toBe(3);       // 5 − 2
    // done without actualEndSlot → falls back to the planned span
    const [d] = buildLiveChips(
      [blk({ id: 'd', court: 1, slot: 0, span: 4, status: 'finished', done: true })],
      10,
    );
    expect(d.placement.startSlot).toBe(0);  // planned fallback
    expect(d.placement.span).toBe(4);       // planned span fallback
    expect(d.overrunSlots).toBe(0);
  });

  it('only court-assigned blocks become chips; source + courtIndex carry through', () => {
    const chips = buildLiveChips(
      [
        blk({ id: 'pu', source: 'bracket', key: 'bracket:pu', court: 3, slot: 1, status: 'started', started: true, actualStartSlot: 1 }),
        blk({ id: 'queued', court: undefined, slot: 3 }),
      ],
      4,
    );
    expect(chips.map((c) => c.key)).toEqual(['bracket:pu']);
    expect(chips[0].source).toBe('bracket');
    expect(chips[0].placement.courtIndex).toBe(2);  // court 3 → index 2
  });
});
