import { describe, it, expect } from 'vitest';
import { sortBy, HUB_SORTS } from '../hubSort';
import type { TournamentSummaryDTO } from '../../../api/dto';

function ws(over: Partial<TournamentSummaryDTO>): TournamentSummaryDTO {
  return {
    id: 'id',
    name: 'name',
    kind: 'meet',
    role: 'owner',
    status: 'draft',
    tournamentDate: null,
    createdAt: '',
    updatedAt: '',
    ownerName: null,
    ...over,
  } as TournamentSummaryDTO;
}

const TODAY = '2026-07-01';

describe('hubSort', () => {
  it('lists the three orders in strip order', () => {
    expect(HUB_SORTS.map((s) => s.id)).toEqual(['recent', 'date', 'name']);
  });

  it('recent = most-recently-updated first', () => {
    const list = [
      ws({ id: 'a', updatedAt: '2026-06-01T00:00:00Z' }),
      ws({ id: 'b', updatedAt: '2026-06-20T00:00:00Z' }),
    ];
    expect(sortBy(list, 'recent', TODAY).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('name = case-insensitive locale ascending', () => {
    const list = [ws({ id: 'a', name: 'Zeta' }), ws({ id: 'b', name: 'alpha' })];
    expect(sortBy(list, 'name', TODAY).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('date = the operational time order (upcoming → undated → past)', () => {
    const list = [
      ws({ id: 'p', tournamentDate: '2026-06-01' }),
      ws({ id: 'u', tournamentDate: '2026-08-01' }),
      ws({ id: 'n', tournamentDate: null }),
    ];
    expect(sortBy(list, 'date', TODAY).map((t) => t.id)).toEqual(['u', 'n', 'p']);
  });

  it('does not mutate the input array', () => {
    const list = [ws({ id: 'a', name: 'B' }), ws({ id: 'b', name: 'A' })];
    const before = list.map((t) => t.id);
    sortBy(list, 'name', TODAY);
    expect(list.map((t) => t.id)).toEqual(before);
  });
});
