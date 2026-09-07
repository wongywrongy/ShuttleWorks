import { describe, it, expect } from 'vitest';
import {
  HUB_VIEWS,
  eventRangeOf,
  matchesView,
  sortForHub,
  timeBucketOf,
  todayKeyIn,
  viewCounts,
} from '../hubFacets';
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

// 2026-07-30, mid-morning UTC.
const NOW = new Date('2026-07-30T10:00:00Z');

describe('hub time views', () => {
  it('offers exactly Upcoming · Live · Past', () => {
    expect(HUB_VIEWS.map((v) => v.id)).toEqual(['upcoming', 'live', 'past']);
    expect(HUB_VIEWS.map((v) => v.label)).toEqual(['Upcoming', 'Live', 'Past']);
  });

  it('derives the bucket from the event date RANGE, not a single day', () => {
    const multiDay = ws({ tournamentDate: '2026-07-28', tournamentEndDate: '2026-08-03' });
    expect(timeBucketOf(multiDay, NOW)).toBe('live');
    expect(timeBucketOf(ws({ tournamentDate: '2026-08-10' }), NOW)).toBe('upcoming');
    expect(timeBucketOf(ws({ tournamentDate: '2026-07-01' }), NOW)).toBe('past');
    // A single-day event on today's date is live.
    expect(timeBucketOf(ws({ tournamentDate: '2026-07-30' }), NOW)).toBe('live');
    expect(timeBucketOf(ws({ tournamentDate: null }), NOW)).toBe('undated');
  });

  it('reads "today" in the event timezone, not the browser one', () => {
    // 2026-07-30T23:30Z is already the 31st in Sydney and still the 30th in
    // Los Angeles.
    const lateUtc = new Date('2026-07-30T23:30:00Z');
    expect(todayKeyIn('Australia/Sydney', lateUtc)).toBe('2026-07-31');
    expect(todayKeyIn('America/Los_Angeles', lateUtc)).toBe('2026-07-30');
    const sydney = ws({ tournamentDate: '2026-07-30', timeZone: 'Australia/Sydney' });
    expect(timeBucketOf(sydney, lateUtc)).toBe('past');
    const la = ws({ tournamentDate: '2026-07-30', timeZone: 'America/Los_Angeles' });
    expect(timeBucketOf(la, lateUtc)).toBe('live');
  });

  it('treats a bad stored end date as a single-day event', () => {
    const bad = ws({ tournamentDate: '2026-08-01', tournamentEndDate: '2026-07-01' });
    expect(eventRangeOf(bad)).toEqual({ start: '2026-08-01', end: '2026-08-01' });
  });

  it('shows Live + Upcoming (and the undated) by default; Past is its own view', () => {
    const live = ws({ id: 'l', tournamentDate: '2026-07-30' });
    const soon = ws({ id: 'u', tournamentDate: '2026-08-10' });
    const done = ws({ id: 'p', tournamentDate: '2026-07-01' });
    const none = ws({ id: 'n', tournamentDate: null });
    for (const t of [live, soon, none]) expect(matchesView(t, 'current', NOW)).toBe(true);
    expect(matchesView(done, 'current', NOW)).toBe(false);
    expect(matchesView(done, 'past', NOW)).toBe(true);
    expect(matchesView(live, 'live', NOW)).toBe(true);
    expect(matchesView(soon, 'upcoming', NOW)).toBe(true);
  });

  it('counts each workspace once, in one bucket', () => {
    const counts = viewCounts(
      [
        ws({ id: 'a', tournamentDate: '2026-07-30' }),
        ws({ id: 'b', tournamentDate: '2026-08-10' }),
        ws({ id: 'c', tournamentDate: '2026-08-20' }),
        ws({ id: 'd', tournamentDate: '2026-01-01' }),
        ws({ id: 'e', tournamentDate: null }),
      ],
      NOW,
    );
    expect(counts).toEqual({ live: 1, upcoming: 2, past: 1, undated: 1 });
  });

  it('orders live first, upcoming ascending, undated, then past descending', () => {
    const list = [
      ws({ id: 'past-old', tournamentDate: '2025-01-01' }),
      ws({ id: 'later', tournamentDate: '2026-09-01' }),
      ws({ id: 'undated', tournamentDate: null }),
      ws({ id: 'past-recent', tournamentDate: '2026-07-01' }),
      ws({ id: 'sooner', tournamentDate: '2026-08-10' }),
      ws({ id: 'live', tournamentDate: '2026-07-29', tournamentEndDate: '2026-08-02' }),
    ];
    expect(sortForHub(list, NOW).map((t) => t.id)).toEqual([
      'live',
      'sooner',
      'later',
      'undated',
      'past-recent',
      'past-old',
    ]);
  });
});
