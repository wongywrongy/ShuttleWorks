import { describe, expect, it } from 'vitest';
import { displayStateForStore } from '../displayProjection';

describe('public display adapter', () => {
  it('hydrates the board from a minimal response without private operator data', () => {
    const state = displayStateForStore({
      config: { courtCount: 4, dayStart: '09:00', dayEnd: '18:00', intervalMinutes: 20 },
      players: [{ id: 'p', name: 'Player', groupId: '', representation: 'Club' }],
      matches: [{ id: 'm', sideA: ['p'], matchType: 'tri', sideC: ['c'], durationSlots: 1 }],
      schedule: { assignments: [{ matchId: 'm', slotId: 2, courtId: 3, durationSlots: 1 }], status: 'feasible' },
    });
    expect(state.config).toMatchObject({ courtCount: 4, dayStart: '09:00', intervalMinutes: 20 });
    expect(state.players[0]).toMatchObject({ name: 'Player', representation: 'Club', availability: [] });
    expect(state.matches[0]).toMatchObject({ matchType: 'tri', sideC: ['c'], durationSlots: 1 });
    expect(state.schedule?.assignments[0]).toEqual({ matchId: 'm', slotId: 2, courtId: 3, durationSlots: 1 });
    expect(state.schedule?.infeasibleReasons).toEqual([]);
    expect(displayStateForStore({})).toMatchObject({ config: null, schedule: null, players: [], matches: [] });
  });
});
