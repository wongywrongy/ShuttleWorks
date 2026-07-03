/**
 * Tests for DisplayLayoutEditor — the Display Configuration "Board layout"
 * controls (tv* fields + standingsMode). Writes through `setConfig`
 * immediately, same persist path as BracketEngineSection/ScoringFields —
 * `useTournamentState`'s debounce coalesces the PUT.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { DisplayLayoutEditor } from '../DisplayLayoutEditor';
import { useTournamentStore } from '../../../../store/tournamentStore';
import type { TournamentConfig } from '../../../../api/dto';

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
