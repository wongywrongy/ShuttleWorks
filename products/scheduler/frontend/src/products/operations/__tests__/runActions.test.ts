import { describe, it, expect, vi } from 'vitest';
import { runAction, planAutoPull } from '../runtime/runActions';

const seams = () => ({
  meetSubmit: vi.fn(),
  bracketApi: {
    matchAction: vi.fn().mockResolvedValue({}),
    assignCourt: vi.fn().mockResolvedValue({}),
    unassign: vi.fn().mockResolvedValue({}),
  },
  bracketResult: vi.fn(),
  setCalledBracket: vi.fn(),
});

const m = (o: any) => {
  const source = o.source ?? 'meet';
  return {
    key: o.key ?? `${source}:${o.id}`,
    id: o.id,
    source,
    label: o.id,
    sideA: 'A',
    sideB: 'B',
    span: 1,
    status: o.status ?? 'scheduled',
    late: false,
    eligible: o.eligible ?? false,
    court: o.court,
    plannedSlot: o.slot,
  };
};

describe('runAction routing', () => {
  it('meet call/start/record go through the command queue', () => {
    const s = seams();
    runAction(m({ id: 'a', status: 'scheduled', court: 1 }), 'call', undefined, s);
    runAction(m({ id: 'a', status: 'called', court: 1 }), 'start', undefined, s);
    runAction(m({ id: 'a', status: 'playing', court: 1 }), 'record', undefined, s);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(1, 'call_to_court', 'a', undefined);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(2, 'start_match', 'a', undefined);
    expect(s.meetSubmit).toHaveBeenNthCalledWith(3, 'finish_match', 'a', undefined);
  });
  it('meet assign/postpone send court payloads', () => {
    const s = seams();
    runAction(m({ id: 'q', status: 'scheduled' }), 'assign', { court: 2, slot: 5 }, s);
    runAction(m({ id: 'p', status: 'playing', court: 2 }), 'postpone', undefined, s);
    expect(s.meetSubmit).toHaveBeenCalledWith('assign_court', 'q', { court_id: 2, time_slot: 5 });
    expect(s.meetSubmit).toHaveBeenCalledWith('postpone_match', 'p', {});
  });
  it('bracket record routes to Seam C; start to matchAction; call sets local flag', () => {
    const s = seams();
    runAction(m({ id: 'b', source: 'bracket', status: 'scheduled', court: 1 }), 'call', undefined, s);
    runAction(m({ id: 'b', source: 'bracket', status: 'called', court: 1 }), 'start', undefined, s);
    expect(s.setCalledBracket).toHaveBeenCalledWith('b', true);
    expect(s.bracketApi.matchAction).toHaveBeenCalledWith({ play_unit_id: 'b', action: 'start' });
  });
  it('bracket assign calls assignCourt with play_unit_id, court_id, slot_id', () => {
    const s = seams();
    runAction(
      m({ id: 'bx', source: 'bracket', status: 'scheduled' }),
      'assign',
      { court: 3, slot: 7 },
      s,
    );
    expect(s.bracketApi.assignCourt).toHaveBeenCalledWith({
      play_unit_id: 'bx',
      court_id: 3,
      slot_id: 7,
    });
    expect(s.bracketApi.matchAction).not.toHaveBeenCalled();
  });
  it('bracket postpone calls unassign with play_unit_id', () => {
    const s = seams();
    runAction(
      m({ id: 'by', source: 'bracket', status: 'playing', court: 2 }),
      'postpone',
      undefined,
      s,
    );
    expect(s.bracketApi.unassign).toHaveBeenCalledWith({ play_unit_id: 'by' });
    expect(s.bracketApi.matchAction).not.toHaveBeenCalled();
  });
  it('refuses illegal transitions (no seam call)', () => {
    const s = seams();
    runAction(m({ id: 'a', status: 'scheduled', court: 1 }), 'start', undefined, s);
    expect(s.meetSubmit).not.toHaveBeenCalled();
  });
});

describe('planAutoPull', () => {
  it('fills only free courts, from the eligible queue head, with a concrete slot', () => {
    const lanes = [
      { court: 1, now: undefined, depth: 0 },
      { court: 2, now: { id: 'on', plannedSlot: 4 } as any, depth: 1 },
    ] as any;
    const queue = [
      { ...m({ id: 'wait' }), eligible: false },
      { ...m({ id: 'q1' }), eligible: true, plannedSlot: 2 },
    ];
    const plan = planAutoPull(lanes, queue, [...queue], 6);
    // court 1 is free → gets q1 (the eligible head); court 2 is busy → untouched.
    // slot = max(currentSlot 6, court-1 lane slots none) + 1 = 7.
    expect(plan).toEqual([{ matchKey: 'meet:q1', court: 1, slot: 7 }]);
  });
  it('does not assign the same match to two free courts', () => {
    const lanes = [{ court: 1, now: undefined, depth: 0 }, { court: 2, now: undefined, depth: 0 }] as any;
    const queue = [{ ...m({ id: 'only' }), eligible: true, plannedSlot: 0 }];
    const plan = planAutoPull(lanes, queue, [...queue], 3);
    expect(plan).toHaveLength(1);
    expect(plan[0].court).toBe(1);
  });
});
