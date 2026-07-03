/**
 * Tests for DisplayLayoutEditor — the Display Configuration "Board layout"
 * controls (tv* fields + standingsMode), plus (task 7) the court order &
 * visibility list that drives `courtOrder`/`hiddenCourts`. Writes through
 * `setConfig` immediately, same persist path as BracketEngineSection/
 * ScoringFields — `useTournamentState`'s debounce coalesces the PUT.
 *
 * The court-order list reuses the dnd-kit pattern from
 * `meet/roster/positionGrid/GridHeader.tsx` (DndContext/SortableContext +
 * useSortable), which — per that file's own test (`positionGrid.test.tsx`)
 * — is NOT exercised via simulated pointer drags in this codebase (jsdom
 * has no pointer-capture/layout support for that). These tests match that
 * convention: they assert the rendered order/hide state and the handlers
 * that mutate it (hide toggle, reset, the live-match "show it?" nudge)
 * directly, without simulating an actual drag gesture.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { DisplayLayoutEditor } from '../DisplayLayoutEditor';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import type { TournamentConfig, ScheduleDTO } from '../../../../api/dto';

const BASE_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
};

function resetStore(overrides: Partial<TournamentConfig> = {}) {
  useTournamentStore.setState({ config: { ...BASE_CONFIG, ...overrides } });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  useMatchStateStore.getState().reset();
});

describe('<DisplayLayoutEditor />', () => {
  it('renders controls for display mode, columns, card size, show scores, standings mode', () => {
    render(<DisplayLayoutEditor />);
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Grid columns' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Card size' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show scores' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Standings mode' })).toBeInTheDocument();
  });

  it('reflects the board fallback defaults when config fields are unset', () => {
    render(<DisplayLayoutEditor />);
    expect(screen.getByRole('radio', { name: 'Strip' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Show scores' })).toHaveAttribute('aria-checked', 'true');
    const gridGroup = screen.getByRole('radiogroup', { name: 'Grid columns' });
    expect(within(gridGroup).getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    const standingsGroup = screen.getByRole('radiogroup', { name: 'Standings mode' });
    expect(within(standingsGroup).getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes tvDisplayMode to the store when changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(setConfig).toHaveBeenCalled();
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.tvDisplayMode).toBe('grid');
  });

  it('writes tvGridColumns as a number when a specific column count is chosen', () => {
    resetStore({ tvGridColumns: null });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    const gridGroup = screen.getByRole('radiogroup', { name: 'Grid columns' });
    fireEvent.click(within(gridGroup).getByRole('radio', { name: '3' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.tvGridColumns).toBe(3);
  });

  it('writes tvGridColumns as null when Auto is chosen', () => {
    resetStore({ tvGridColumns: 3 });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    const gridGroup = screen.getByRole('radiogroup', { name: 'Grid columns' });
    fireEvent.click(within(gridGroup).getByRole('radio', { name: 'Auto' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.tvGridColumns).toBeNull();
  });

  it('writes tvCardSize to the store when changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.tvCardSize).toBe('large');
  });

  it('writes tvShowScores to the store when toggled off', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show scores' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.tvShowScores).toBe(false);
  });

  it('writes standingsMode to the store when changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    const standingsGroup = screen.getByRole('radiogroup', { name: 'Standings mode' });
    fireEvent.click(within(standingsGroup).getByRole('radio', { name: 'Side' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.standingsMode).toBe('side');
  });

  it('writes standingsMode as null when Auto is chosen', () => {
    resetStore({ standingsMode: 'side' });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    const standingsGroup = screen.getByRole('radiogroup', { name: 'Standings mode' });
    fireEvent.click(within(standingsGroup).getByRole('radio', { name: 'Auto' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.standingsMode).toBeNull();
  });

  it('resyncs displayed values when store config changes externally', () => {
    render(<DisplayLayoutEditor />);
    expect(screen.getByRole('radio', { name: 'Strip' })).toHaveAttribute('aria-checked', 'true');
    act(() => {
      resetStore({ tvDisplayMode: 'list' });
    });
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('<DisplayLayoutEditor /> — court order & visibility (task 7)', () => {
  it('renders one row per court, in ascending order by default', () => {
    render(<DisplayLayoutEditor />);
    const rowIds = screen
      .getAllByTestId(/^court-order-row-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(rowIds).toEqual([
      'court-order-row-1',
      'court-order-row-2',
      'court-order-row-3',
      'court-order-row-4',
    ]);
  });

  it('renders courts in the manual courtOrder, unlisted courts appended ascending', () => {
    resetStore({ courtOrder: [3, 1] });
    render(<DisplayLayoutEditor />);
    const rowIds = screen
      .getAllByTestId(/^court-order-row-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(rowIds).toEqual([
      'court-order-row-3',
      'court-order-row-1',
      'court-order-row-2',
      'court-order-row-4',
    ]);
  });

  it('flags courts not present in a customized courtOrder as New', () => {
    resetStore({ courtOrder: [3, 1] });
    render(<DisplayLayoutEditor />);
    // Courts 2 and 4 weren't part of the manual order → flagged New.
    expect(screen.getAllByText('New')).toHaveLength(2);
  });

  it('does not flag anything New when courtOrder has never been customized', () => {
    render(<DisplayLayoutEditor />);
    expect(screen.queryByText('New')).toBeNull();
  });

  it('hides a court via the eye toggle, writing hiddenCourts', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide court 2' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.hiddenCourts).toEqual([2]);
  });

  it('shows a hidden court again via the same toggle, clearing it from hiddenCourts', () => {
    resetStore({ hiddenCourts: [2] });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Show court 2' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.hiddenCourts).toEqual([]);
  });

  it('surfaces a "show it?" nudge only for a hidden court with a live match — operator context only', () => {
    resetStore({ hiddenCourts: [2] });
    const schedule: ScheduleDTO = {
      assignments: [{ matchId: 'm1', slotId: 0, courtId: 2, durationSlots: 1 }],
      unscheduledMatches: [],
      softViolations: [],
      objectiveScore: null,
      infeasibleReasons: [],
      status: 'optimal',
    };
    useTournamentStore.setState({ schedule });
    useMatchStateStore.getState().setMatchStates({ m1: { matchId: 'm1', status: 'started' } });

    render(<DisplayLayoutEditor />);
    expect(screen.getByText(/Court 2 \(hidden\) has a live match/i)).toBeInTheDocument();
    // Only court 2 gets the nudge — courts 1, 3, 4 have no live match.
    expect(screen.getAllByText(/has a live match/i)).toHaveLength(1);
  });

  it('the nudge\'s Show action clears the court from hiddenCourts', () => {
    resetStore({ hiddenCourts: [2] });
    const schedule: ScheduleDTO = {
      assignments: [{ matchId: 'm1', slotId: 0, courtId: 2, durationSlots: 1 }],
      unscheduledMatches: [],
      softViolations: [],
      objectiveScore: null,
      infeasibleReasons: [],
      status: 'optimal',
    };
    useTournamentStore.setState({ schedule });
    useMatchStateStore.getState().setMatchStates({ m1: { matchId: 'm1', status: 'called' } });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');

    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.hiddenCourts).toEqual([]);
  });

  it('does not surface the nudge when the court is hidden but has no live match', () => {
    resetStore({ hiddenCourts: [2] });
    render(<DisplayLayoutEditor />);
    expect(screen.queryByText(/has a live match/i)).toBeNull();
  });

  it('shows a Reset control once order or visibility is customized, and it clears both', () => {
    resetStore({ courtOrder: [3, 1], hiddenCourts: [2] });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<DisplayLayoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Reset court order/i }));
    const last = setConfig.mock.calls.at(-1)![0];
    expect(last.courtOrder).toBeUndefined();
    expect(last.hiddenCourts).toBeUndefined();
  });

  it('does not render a Reset control when order/visibility are untouched', () => {
    render(<DisplayLayoutEditor />);
    expect(screen.queryByRole('button', { name: /Reset court order/i })).toBeNull();
  });
});
