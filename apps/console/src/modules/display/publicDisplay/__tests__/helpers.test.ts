/**
 * Regression test for the TV header date off-by-one bug.
 *
 * `formatTournamentDate` was rendering "Thu, May 14" for a tournament
 * date of "2026-05-15" in any UTC-NEGATIVE timezone, because the bare
 * YYYY-MM-DD parses as UTC midnight (per ECMA-262) and `toLocaleDateString`
 * then formats it in the viewer's local zone — which in the Americas is
 * still the previous calendar day.
 *
 * The first test FORCES TZ=America/Los_Angeles via vitest's env config so
 * the assertion is meaningful in any CI environment (the default UTC
 * runner would never have caught the bug).
 *
 * Package 17 (v3 consolidated plan, signage density, D13) redirected the
 * implementation from a local `toLocaleDateString` call to the
 * `formatDateTime` authority (`lib/formatDateTime.ts`), which uses
 * `Intl.DateTimeFormat` directly rather than `Date.prototype.
 * toLocaleDateString` — the old second test here spied on that method and
 * would now fail vacuously (the spy is simply never called), not because
 * the UTC behavior regressed. It is replaced with an explicit `timeZone`
 * parameter test: passing a different zone changes the rendered day exactly
 * where UTC and that zone disagree on the calendar date.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTournamentDate } from '../helpers';

describe('formatTournamentDate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Fri, May 15 for 2026-05-15 in any local timezone', () => {
    // Runs under TZ=America/Los_Angeles (vitest env override). Before
    // the fix this produced "Thu, May 14" — the bug. The assertions
    // therefore fail if the default `timeZone: 'UTC'` is removed from
    // formatTournamentDate.
    const out = formatTournamentDate('2026-05-15');
    expect(out).toMatch(/^Fri/);
    expect(out).toMatch(/May/);
    expect(out).toMatch(/15/);
  });

  it('defaults to UTC but honors an explicit timeZone argument', () => {
    // 2026-05-15T00:00:00Z is still 2026-05-14 in America/Los_Angeles
    // (UTC-7 in May) — an explicit zone must actually change the day
    // rendered, proving the parameter is wired through to the formatter
    // rather than a UTC constant baked into this file.
    expect(formatTournamentDate('2026-05-15')).toMatch(/^Fri, May 15/);
    expect(formatTournamentDate('2026-05-15', 'America/Los_Angeles')).toMatch(/^Thu, May 14/);
  });

  it('returns null for null / undefined input', () => {
    expect(formatTournamentDate(null)).toBeNull();
    expect(formatTournamentDate(undefined)).toBeNull();
  });

  it('returns null for an unparseable input', () => {
    expect(formatTournamentDate('not-a-date')).toBeNull();
  });
});
