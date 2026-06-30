import { describe, it, expect, vi } from 'vitest';
import { runAction } from '../runtime/runActions';

const DTO = { tag: 'updated-bracket-snapshot' };

const seams = () => ({
  meetSubmit: vi.fn(),
  bracketApi: {
    matchAction: vi.fn().mockResolvedValue(DTO),
    assignCourt: vi.fn().mockResolvedValue(DTO),
    unassign: vi.fn().mockResolvedValue(DTO),
  },
  bracketResult: vi.fn(),
  setCalledBracket: vi.fn(),
  onBracketData: vi.fn(),
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

  // Regression: bracket start/assign/postpone must APPLY the DTO they return
  // (not discard it), or a just-assigned unit lingers in the queue for ~2.5s
  // and can be re-pulled onto a second court.
  it('bracket start/assign/postpone apply the returned DTO via onBracketData', async () => {
    const s = seams();
    runAction(m({ id: 'b', source: 'bracket', status: 'called', court: 1 }), 'start', undefined, s);
    runAction(m({ id: 'b', source: 'bracket', status: 'scheduled' }), 'assign', { court: 2, slot: 3 }, s);
    runAction(m({ id: 'b', source: 'bracket', status: 'playing', court: 2 }), 'postpone', undefined, s);
    // .then runs on a microtask — flush before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(s.onBracketData).toHaveBeenCalledTimes(3);
    expect(s.onBracketData).toHaveBeenNthCalledWith(1, DTO);
    expect(s.onBracketData).toHaveBeenNthCalledWith(2, DTO);
    expect(s.onBracketData).toHaveBeenNthCalledWith(3, DTO);
  });
});

