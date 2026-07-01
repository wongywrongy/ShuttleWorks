import { describe, it, expect } from 'vitest';
import { liveMatches, sideLabel } from '../bracketDisplayData';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

export const data = {
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  play_units: [
    {
      id: 'u1',
      event_id: 'e1',
      round_index: 0,
      match_index: 0,
      side_a: null,
      side_b: null,
      slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
      duration_slots: 1,
      dependencies: [],
    },
  ],
  assignments: [
    {
      play_unit_id: 'u1',
      slot_id: 0,
      court_id: 2,
      duration_slots: 1,
      actual_start_slot: null,
      actual_end_slot: null,
      started: true,
      finished: false,
    },
  ],
  results: [],
  events: [],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
} as unknown as BracketTournamentDTO;

describe('bracketDisplayData', () => {
  it('sideLabel resolves a slot participant id to its name', () => {
    expect(sideLabel(data.play_units[0], 'a', data.participants)).toBe('Alice');
    expect(sideLabel(data.play_units[0], 'b', data.participants)).toBe('Bob');
  });
  it('liveMatches lists on-court matches with court + sides', () => {
    const live = liveMatches(data);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ court: 2, sideA: 'Alice', sideB: 'Bob', status: 'on-court' });
  });
});
