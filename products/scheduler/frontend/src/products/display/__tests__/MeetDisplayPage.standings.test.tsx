/**
 * Integration coverage for task 9: MeetDisplayPage renders SERVER-SOURCED
 * standings (`state.standings`, hydrated by useDisplaySync/useTournamentState
 * — see their own doc comments) via one of two placements resolved by
 * `standingsPlacement` (courtCount + `config.standingsMode`):
 *
 *   - 'side'   — a persistent panel next to the courts grid.
 *   - 'rotate' — periodically takes over the whole content area on a timer.
 *   - 'off' / empty standings — hidden entirely, never an empty panel.
 *
 * Store setup mirrors `MeetDisplayPage.courtLayout.test.tsx`/
 * `MeetDisplayPage.advisory.test.tsx` (direct `setState`, no `?id=` so
 * `useLiveTracking`/`useDisplaySync` short-circuit before any network call).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetDisplayPage } from '../MeetDisplayPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { ScheduleDTO, TournamentConfig, MeetStandingRowDTO } from '../../../api/dto';

const MINIMAL_SCHEDULE: ScheduleDTO = {
  assignments: [],
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'optimal',
};

const STANDING_ROWS: MeetStandingRowDTO[] = [
  { groupId: 'g1', groupName: 'Northside', wins: 5, losses: 1, matchesPlayed: 6 },
  { groupId: 'g2', groupName: 'Eastview', wins: 3, losses: 3, matchesPlayed: 6 },
];

function configWith(overrides: Partial<TournamentConfig>): TournamentConfig {
  return {
    intervalMinutes: 30,
    dayStart: '09:00',
    dayEnd: '18:00',
    breaks: [],
    courtCount: 4,
    defaultRestMinutes: 0,
    freezeHorizonSlots: 0,
    ...overrides,
  };
}

function renderBoard(path = '/display') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MeetDisplayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  useTournamentStore.getState().reset();
  vi.useRealTimers();
});

describe('MeetDisplayPage — standings placement (task 9)', () => {
  it('hides standings entirely when the server standings array is empty — never an empty panel', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4 }),
      schedule: MINIMAL_SCHEDULE,
      standings: [],
    });

    renderBoard();

    expect(screen.queryByTestId('standings-side-panel')).toBeNull();
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
    expect(screen.queryByText(/team standings/i)).toBeNull();
  });

  it('hides standings entirely when standingsMode is "off", even with real standings data', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4, standingsMode: 'off' }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    expect(screen.queryByTestId('standings-side-panel')).toBeNull();
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
    expect(screen.queryByText(/team standings/i)).toBeNull();
  });

  it('renders a persistent SIDE panel by default for small court counts (<=6)', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    const panel = screen.getByTestId('standings-side-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Northside');
    expect(panel).toHaveTextContent('Eastview');
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
  });

  it('honors an explicit "side" override at a large court count (>6)', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 10, standingsMode: 'side' }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    expect(screen.getByTestId('standings-side-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
  });

  it('defaults to a timed ROTATION for large court counts (>6), swapping content on the interval', () => {
    vi.useFakeTimers();
    useTournamentStore.setState({
      config: configWith({ courtCount: 10 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    // Initial render: normal courts view, no side panel, no rotation
    // takeover yet.
    expect(screen.queryByTestId('standings-side-panel')).toBeNull();
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();

    // After one rotation interval, the content area flips to the
    // full-bleed standings screen.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    const rotationScreen = screen.getByTestId('standings-rotation-screen');
    expect(rotationScreen).toHaveTextContent('Northside');

    // One more interval flips it back to the normal view.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
  });

  it('honors an explicit "rotate" override at a small court count (<=6)', () => {
    vi.useFakeTimers();
    useTournamentStore.setState({
      config: configWith({ courtCount: 4, standingsMode: 'rotate' }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    expect(screen.queryByTestId('standings-side-panel')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId('standings-rotation-screen')).toBeInTheDocument();
  });

  it('a stale bookmarked ?view=standings URL (the pre-task-9 tab) falls back to Courts, not a blank screen', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard('/display?view=standings');

    // The content area must still render something real (the courts grid,
    // with its SIDE panel alongside it at this court count) — not fall
    // through every `view === '...'` branch and render nothing.
    expect(screen.getByTestId('standings-side-panel')).toBeInTheDocument();
  });

  it('no longer offers a manual "Standings" tab — placement is director-configured, not spectator-toggled', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    expect(screen.queryByRole('button', { name: /^standings$/i })).toBeNull();
  });
});
