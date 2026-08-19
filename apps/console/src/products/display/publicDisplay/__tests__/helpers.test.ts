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
 * runner would never have caught the bug). The second test pins the
 * helper's contract directly: it spies on `toLocaleDateString` and
 * asserts `timeZone: 'UTC'` was passed.
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
    // therefore fail if the timeZone: 'UTC' option is removed from
    // formatTournamentDate.
    const out = formatTournamentDate('2026-05-15');
    expect(out).toMatch(/^Fri/);
    expect(out).toMatch(/May/);
    expect(out).toMatch(/15/);
  });

  it("passes timeZone: 'UTC' to toLocaleDateString", () => {
    // Direct contract assertion: the helper must request UTC formatting
    // regardless of the runner's locale or zone. Spies on the actual
    // method that gets called (not a Proxy on globalThis.Intl, which
    // doesn't intercept the internal %DateTimeFormat% intrinsic that
    // V8 uses).
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    formatTournamentDate('2026-05-15');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ timeZone: 'UTC' }),
    );
  });

  it('returns null for null / undefined input', () => {
    expect(formatTournamentDate(null)).toBeNull();
    expect(formatTournamentDate(undefined)).toBeNull();
  });

  it('returns null for an unparseable input', () => {
    expect(formatTournamentDate('not-a-date')).toBeNull();
  });
});
