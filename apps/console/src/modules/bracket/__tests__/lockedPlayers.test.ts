import { describe, it, expect } from 'vitest';
import { lockedPlayerIds } from '../lockedPlayers';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

function makeData(events: unknown[]): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 10,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events,
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  } as unknown as BracketTournamentDTO;
}

describe('lockedPlayerIds — mirrors the backend ROSTER_LOCKED guard', () => {
  it('locks nobody when every draw is still a draft', () => {
    const data = makeData([
      { id: 'ev1', status: 'draft', participants: [{ id: 'p1', name: 'A' }] },
    ]);
    expect(lockedPlayerIds(data).size).toBe(0);
  });

  it('locks the participants of a generated draw', () => {
    const data = makeData([
      { id: 'ev1', status: 'generated', participants: [{ id: 'p1', name: 'A' }] },
    ]);
    expect(lockedPlayerIds(data).has('p1')).toBe(true);
  });

  it('locks BOTH members of a generated doubles pair, not just the pair id', () => {
    // The backend unions member ids too — a pair is not a roster player.
    const data = makeData([
      {
        id: 'ev1',
        status: 'generated',
        participants: [{ id: 'pair-1', name: 'A/B', members: ['p1', 'p2'] }],
      },
    ]);
    const locked = lockedPlayerIds(data);
    expect(locked.has('p1')).toBe(true);
    expect(locked.has('p2')).toBe(true);
    expect(locked.has('pair-1')).toBe(true);
  });

  it('a draft draw does not lock a player that a generated draw does not use', () => {
    const data = makeData([
      { id: 'ev1', status: 'generated', participants: [{ id: 'p1', name: 'A' }] },
      { id: 'ev2', status: 'draft', participants: [{ id: 'p9', name: 'Z' }] },
    ]);
    const locked = lockedPlayerIds(data);
    expect(locked.has('p1')).toBe(true);
    expect(locked.has('p9')).toBe(false);
  });

  it('treats a missing status as draft (older fixtures)', () => {
    const data = makeData([{ id: 'ev1', participants: [{ id: 'p1', name: 'A' }] }]);
    expect(lockedPlayerIds(data).size).toBe(0);
  });

  it('is empty for null data', () => {
    expect(lockedPlayerIds(null).size).toBe(0);
  });
});
