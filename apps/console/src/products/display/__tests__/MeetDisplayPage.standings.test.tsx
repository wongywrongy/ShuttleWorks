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

  it('has no persistent side panel at any court count — standings rotate (TV-5)', () => {
    // The panel took roughly a third of the board's width away from the
    // courts, permanently, to hold a table nobody reads continuously.
    for (const cfg of [
      { courtCount: 4 },
      { courtCount: 10 },
      { courtCount: 4, standingsMode: 'side' as const },
    ]) {
      useTournamentStore.setState({
        config: configWith(cfg),
        schedule: MINIMAL_SCHEDULE,
        standings: STANDING_ROWS,
      });
      const { unmount } = renderBoard();
      expect(screen.queryByTestId('standings-side-panel')).toBeNull();
      unmount();
    }
  });

  it('rotates courts → standings → up next on the 20 / 10 / 10 cycle (TV-7)', () => {
    vi.useFakeTimers();
    useTournamentStore.setState({
      config: configWith({ courtCount: 10 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();

    // Courts holds twice the base dwell: it is the slide the hall is reading.
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('standings-rotation-screen')).toHaveTextContent('Northside');

    // …then back to the courts, since this fixture's queue is empty so the
    // up-next slide is dropped rather than shown blank.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
  });

  it('does not rotate at all when only the courts slide has data', () => {
    vi.useFakeTimers();
    useTournamentStore.setState({
      config: configWith({ courtCount: 4, standingsMode: 'off' }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.queryByTestId('standings-rotation-screen')).toBeNull();
    expect(screen.queryByTestId('up-next-rotation-screen')).toBeNull();
  });

  it('a stale bookmarked ?view=standings URL (the pre-task-9 tab) falls back to Courts, not a blank screen', () => {
    useTournamentStore.setState({
      config: configWith({ courtCount: 4 }),
      schedule: MINIMAL_SCHEDULE,
      standings: STANDING_ROWS,
    });

    renderBoard('/display?view=standings');

    // The content area must still render something real (the courts grid) —
    // not fall through every `view === '...'` branch and render nothing.
    expect(screen.getAllByText(/Court 1/i).length).toBeGreaterThan(0);
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
