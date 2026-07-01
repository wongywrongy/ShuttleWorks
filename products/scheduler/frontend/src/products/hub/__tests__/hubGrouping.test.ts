import { describe, it, expect } from 'vitest';
import { groupWorkspaces, dayKey, eventDate } from '../hubGrouping';
import type { TournamentSummaryDTO } from '../../../api/dto';

function ws(id: string, date: string | null, updatedAt = ''): TournamentSummaryDTO {
  return {
    id,
    name: id,
    kind: 'meet',
    role: 'owner',
    status: 'draft',
    tournamentDate: date,
    updatedAt,
  } as TournamentSummaryDTO;
}

const TODAY = '2026-06-25';

describe('hubGrouping', () => {
  it('dayKey takes the date portion of an ISO string', () => {
    expect(dayKey('2026-06-25T14:30:00Z')).toBe('2026-06-25');
    expect(dayKey('2026-06-25')).toBe('2026-06-25');
  });

  it('eventDate parses a date-only string as a local calendar date (no TZ drift)', () => {
    // `new Date('2026-09-15')` is UTC midnight → previous day in behind-UTC zones.
    // eventDate must always yield the 15th, in any timezone.
    const d = eventDate('2026-09-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September (0-based)
    expect(d.getDate()).toBe(15);
  });

  it('partitions into upcoming / undated / past, with today as upcoming', () => {
    const groups = groupWorkspaces(
      [
        ws('future', '2026-07-01'),
        ws('today', '2026-06-25'),
        ws('past', '2026-06-01'),
        ws('none', null),
      ],
      TODAY,
    );
    const byId = Object.fromEntries(groups.map((g) => [g.id, g.items.map((i) => i.id)]));
    expect(byId.upcoming).toEqual(['today', 'future']); // soonest first; today is upcoming
    expect(byId.undated).toEqual(['none']);
    expect(byId.past).toEqual(['past']);
  });

  it('sorts upcoming ascending and past descending by date', () => {
    const groups = groupWorkspaces(
      [
        ws('u2', '2026-08-01'),
        ws('u1', '2026-07-01'),
        ws('p1', '2026-06-10'),
        ws('p2', '2026-05-01'),
      ],
      TODAY,
    );
    const byId = Object.fromEntries(groups.map((g) => [g.id, g.items.map((i) => i.id)]));
    expect(byId.upcoming).toEqual(['u1', 'u2']); // soonest first
    expect(byId.past).toEqual(['p1', 'p2']); // most recent first
  });

  it('orders undated by most-recently updated', () => {
    const groups = groupWorkspaces(
      [ws('a', null, '2026-06-01T00:00:00Z'), ws('b', null, '2026-06-20T00:00:00Z')],
      TODAY,
    );
    const undated = groups.find((g) => g.id === 'undated')!;
    expect(undated.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('always returns the three groups in time order', () => {
    const groups = groupWorkspaces([], TODAY);
    expect(groups.map((g) => g.id)).toEqual(['upcoming', 'undated', 'past']);
  });
});
