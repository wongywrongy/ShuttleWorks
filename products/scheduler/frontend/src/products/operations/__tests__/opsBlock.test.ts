import { describe, it, expect } from 'vitest';
import { meetToOpsBlocks, bracketToOpsBlocks, parseOpsKey } from '../opsBlock';
import type { MatchDTO, ScheduleDTO, MatchStateDTO } from '../../../api/dto';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

describe('opsBlock builders', () => {
  it('meetToOpsBlocks carries court/slot/span/status and a source-prefixed key', () => {
    const matches = [{ id: 'm1', sideA: ['p1'], sideB: ['p2'], eventRank: 'MS1', durationSlots: 1 }] as unknown as MatchDTO[];
    const schedule = { assignments: [{ matchId: 'm1', courtId: 2, slotId: 4, durationSlots: 1 }] } as unknown as ScheduleDTO;
    const states: Record<string, MatchStateDTO> = { m1: { status: 'started' } as MatchStateDTO };
    const [b] = meetToOpsBlocks(matches, schedule, states, { p1: 'Alice', p2: 'Bob' });
    expect(b).toMatchObject({ source: 'meet', id: 'm1', key: 'meet:m1', court: 2, slot: 4, span: 1, status: 'started', started: true, done: false, sideA: 'Alice', sideB: 'Bob' });
  });

  it('bracketToOpsBlocks marks done when a result exists', () => {
    const data = {
      participants: [{ id: 'x1', name: 'Cara' }, { id: 'x2', name: 'Dan' }],
      events: [{ id: 'MS', discipline: 'MS' }],
      play_units: [{ id: 'MS-R0-0', event_id: 'MS', side_a: ['x1'], side_b: ['x2'], slot_a: {}, slot_b: {} }],
      assignments: [{ play_unit_id: 'MS-R0-0', court_id: 1, slot_id: 0, duration_slots: 1, actual_start_slot: 0 }],
      results: [{ play_unit_id: 'MS-R0-0', winner_side: 'A' }],
    } as unknown as BracketTournamentDTO;
    const [b] = bracketToOpsBlocks(data);
    expect(b).toMatchObject({ source: 'bracket', id: 'MS-R0-0', key: 'bracket:MS-R0-0', court: 1, slot: 0, done: true, status: 'finished' });
  });

  it('parseOpsKey round-trips and rejects junk', () => {
    expect(parseOpsKey('meet:m1')).toEqual({ source: 'meet', id: 'm1' });
    expect(parseOpsKey('bracket:MS-R0-0')).toEqual({ source: 'bracket', id: 'MS-R0-0' });
    expect(parseOpsKey('nope')).toBeNull();
  });
});
