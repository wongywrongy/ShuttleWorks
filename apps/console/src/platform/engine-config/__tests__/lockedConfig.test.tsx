/**
 * The results lock, and the banner that announces it (defect D5).
 *
 * Meet Configuration renders `LockRibbon tier="results"` — "Settings are
 * read-only while matches are in play" — from the same `resultsLocked` flag it
 * passes to `LockedFieldset`. The audit read only 6 of ~43 controls as
 * disabled and asked whether the banner was lying.
 *
 * It is not. The guard is a native `<fieldset disabled>`, whose cascade makes
 * every descendant control ACTUALLY disabled without writing the `disabled`
 * attribute onto any of them — so counting `[disabled]` in the DOM finds only
 * the handful that carry it for an unrelated reason (`Seg disabled={isSimple}`),
 * and misses the cascade entirely. `:disabled` is what the browser matches on,
 * and what blocks the click.
 *
 * That makes this file the thing worth pinning: whoever later swaps the
 * fieldset for per-control props, or lifts a control out of the wrapper, gets
 * a failure rather than a banner that quietly stops being true.
 *
 * Where the banner IS over-claiming is one nav item away: see
 * `modules/workspace/__tests__/VenueScheduleTab.test.tsx`. Court count, slot
 * duration and the day window are settings by any reading, and they had no
 * results lock at all.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EngineConfigForm } from '../EngineConfigForm';
import { LockedFieldset } from '../ConfigSurface';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { TournamentConfig } from '../../../api/dto';

const baseConfig: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  restBetweenRounds: 1,
  scoringFormat: 'badminton',
  setsToWin: 2,
  pointsPerSet: 21,
  deuceEnabled: true,
  deterministic: false,
  solverTimeLimitSeconds: 30,
  enableCourtUtilization: true,
  courtUtilizationPenalty: 50,
  enableGameProximity: false,
  enableCompactSchedule: false,
  allowPlayerOverlap: false,
  tournamentName: 'Config Tournament',
  tournamentDate: '2026-05-15',
};

/** Exactly what `TournamentSetupPage` mounts while `resultsLocked` is true. */
function mountLocked() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/config']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <LockedFieldset locked>
              <EngineConfigForm module="meet" readOnly />
            </LockedFieldset>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const CONTROLS = 'button, input, select, textarea';

beforeEach(() => {
  useTournamentStore.setState({ config: { ...baseConfig } });
});

describe('Meet Configuration under the results lock (D5)', () => {
  it('every rendered control is actually disabled, so the read-only banner is true', () => {
    const { container } = mountLocked();
    const controls = Array.from(container.querySelectorAll<HTMLElement>(CONTROLS));

    // A real surface, not an empty one — otherwise "all of them" is vacuous.
    expect(controls.length).toBeGreaterThan(20);
    const live = controls.filter((el) => !el.matches(':disabled'));
    expect(live.map((el) => el.getAttribute('aria-label') ?? el.textContent)).toEqual([]);
  });

  it('the lock is the fieldset cascade, not per-control attributes', () => {
    // Named explicitly because it is what made the audit read the banner as a
    // lie: the cascade sets no attribute, so `[disabled]` finds almost nothing
    // while every control is nonetheless inert.
    const { container } = mountLocked();
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toBeDisabled();
    expect(
      container.querySelectorAll(`${CONTROLS}`).length,
    ).toBeGreaterThan(container.querySelectorAll('[disabled]').length);
  });

  it('the destructive per-row affordances are removed outright, not merely inert', () => {
    // `MeetEventsSection` drops its Remove buttons and its Add row under
    // `readOnly` rather than leaving them disabled. Worth pinning separately:
    // it is the one part of this surface that does NOT rely on the cascade, so
    // a refactor of that prop would not be caught by the assertions above.
    mountLocked();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.queryByLabelText('Event code')).toBeNull();
  });
});
