/**
 * The public /display board must never surface an operator-facing
 * advisory to spectators — Display PROJECTS, it does not OPERATE
 * (see CLAUDE.md's module model). ``AdvisoryBanner`` is a SHARED
 * component also used by the operator Run surface; this test proves
 * the board renders none of its output even when a critical advisory
 * is active in the store, without touching the shared component.
 *
 * Store setup mirrors ``useDisplaySync`` (which hydrates
 * ``useTournamentStore`` directly with plain ``setState`` — see
 * ``publicDisplay/useDisplaySync.ts``) and ``pages/__tests__/TournamentPage.test.tsx``
 * (direct ``useUiStore.setState``/actions rather than mocking the
 * network). No ``?id=`` query param is set, so ``useLiveTracking``,
 * ``useDisplaySync`` and ``useAdvisories`` all resolve an empty
 * tournament id and short-circuit before any ``apiClient`` call —
 * the board's main body renders purely off the seeded store state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useUiStore } from '../../../store/uiStore';
import type { ScheduleDTO, Advisory } from '../../../api/dto';

const MINIMAL_SCHEDULE: ScheduleDTO = {
  assignments: [],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
};

const CRITICAL_ADVISORY: Advisory = {
  id: 'adv-1',
  kind: 'overrun',
  severity: 'critical',
  summary: 'Match #1 has run 12 min over its expected duration',
  detail: null,
  detectedAt: '2026-07-03T12:00:00Z',
};

function seedStores() {
  // config already defaults non-null (DEFAULT_CONFIG); only schedule
  // needs setting to get the board past its "no schedule yet" branch.
  useTournamentStore.setState({ schedule: MINIMAL_SCHEDULE });
  useUiStore.getState().setAdvisories([CRITICAL_ADVISORY]);
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/display']}>
      <MeetDisplayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  useTournamentStore.getState().reset();
  useUiStore.getState().reset();
});

describe('MeetDisplayPage — operator advisory must not leak to the public board', () => {
  it('does not render the critical advisory banner even when one is active', () => {
    seedStores();
    renderBoard();

    // Sanity check: the board actually rendered its main body (not the
    // "no schedule yet" placeholder) — otherwise this test would pass
    // for the wrong reason.
    expect(screen.getByText(/tournament status/i)).toBeInTheDocument();

    // The operator-facing advisory text must not leak to spectators,
    // whether by its summary or (were detail ever populated) detail text.
    expect(screen.queryByText(/min over its expected/i)).toBeNull();
    expect(screen.queryByText(CRITICAL_ADVISORY.summary)).toBeNull();
  });
});
