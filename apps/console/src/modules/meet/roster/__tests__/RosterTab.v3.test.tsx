/**
 * V3 package 14 — roster empty state and row keyboard access.
 *
 * V3-OC32.1: the empty-school copy must describe the next domain step
 * without pointing away from the adjacent "Add school" action.
 *
 * X8/"row navigation works by keyboard": a clickable player row must also
 * be reachable and operable from the keyboard, per the same contract
 * `selectableRowProps` gives `BandedTable`/`DenseDataTable` rows elsewhere.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import { RosterTab } from '../RosterTab';

vi.mock('../../../../hooks/useMatchStateSync', () => ({
  useMatchStateSync: vi.fn(),
}));

vi.mock('../../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 'workspace-1',
}));

const config = {
  intervalMinutes: 15,
  dayStart: '09:00',
  dayEnd: '17:00',
  breaks: [],
  courtCount: 2,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  rankCounts: { BS: 20 },
} as TournamentConfig;

const groups = [{ id: 'g1', name: 'Kingsway BC' }] as RosterGroupDTO[];

const player = (id: string, name: string): PlayerDTO =>
  ({ id, name, groupId: 'g1', ranks: [], availability: [] }) as PlayerDTO;

beforeEach(() => {
  // URL-backed dense state is global: without this, one test's filter params
  // leak into the next and the suite becomes order-dependent.
  window.history.replaceState(null, '', '/');
  useUiStore.setState({ activeTournamentRole: 'operator' });
});

describe('RosterTab — empty school roster (V3-OC32.1)', () => {
  it('describes the next domain step instead of pointing at a distant toolbar', () => {
    useTournamentStore.setState({ config, groups: [], players: [] });
    render(<RosterTab />);

    expect(
      screen.getByText('Add a school, then add its players and positions.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/actions bar/i)).not.toBeInTheDocument();
    // The action stays adjacent to the copy — the toolbar's own "Add
    // school" plus the empty-state's own, not a redirect to either.
    expect(screen.getAllByRole('button', { name: 'Add school' }).length).toBeGreaterThan(0);
  });
});

describe('RosterTab — player row keyboard access', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      config,
      groups,
      players: [player('p1', 'Alex Tan'), player('p2', 'Ben Carter')],
    });
  });

  it('exposes each player row as a focusable, named control', () => {
    render(<RosterTab />);
    const row = screen.getByTestId('player-row-p1');
    expect(row).toHaveAttribute('tabIndex', '0');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAccessibleName(/Alex Tan/);
  });

  it('toggles selection on Enter when the row itself has focus', () => {
    render(<RosterTab />);
    const row = screen.getByTestId('player-row-p1');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles selection on Space when the row itself has focus', () => {
    render(<RosterTab />);
    const row = screen.getByTestId('player-row-p2');
    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  it('still toggles on click (unchanged mouse behavior)', () => {
    render(<RosterTab />);
    const row = screen.getByTestId('player-row-p1');
    fireEvent.click(row);
    expect(row).toHaveAttribute('data-selected', 'true');
  });
});

describe('RosterTab — 100-row inventory contract', () => {
  it('shows 100 players by default, reaches page two, and searches the full roster', () => {
    const players = Array.from({ length: 101 }, (_, index) => player(
      `p-${index + 1}`,
      index === 100 ? 'Zzz Late Roster Player' : `Player ${index + 1}`,
    ));
    useTournamentStore.setState({ config, groups, players });
    render(<RosterTab />);

    expect(screen.getAllByTestId(/^player-row-/)).toHaveLength(100);
    expect(within(screen.getByTestId('player-list')).queryByTestId('player-row-p-101')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(screen.getByTestId('player-list')).getByTestId('player-row-p-101')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Filter players…');
    fireEvent.change(search, { target: { value: 'Zzz Late Roster Player' } });
    expect(within(screen.getByTestId('player-list')).getByTestId('player-row-p-101')).toBeInTheDocument();
    expect(within(screen.getByTestId('player-list')).getAllByTestId(/^player-row-/)).toHaveLength(1);
  });
});
describe('RosterTab — default school selection', () => {
  it('shows the first school without writing a filter the operator never chose', () => {
    useTournamentStore.setState({
      config,
      groups,
      players: [player('p1', 'Alex Tan')],
    });
    render(<RosterTab />);

    expect(screen.getByTestId('player-row-p1')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('clears a persisted school that no longer exists', () => {
    window.history.replaceState(null, '', '/?meet-roster-filters.filter.school=gone');
    useTournamentStore.setState({
      config,
      groups,
      players: [player('p1', 'Alex Tan')],
    });
    render(<RosterTab />);

    expect(screen.getByTestId('player-row-p1')).toBeInTheDocument();
    expect(window.location.search).not.toContain('school');
  });
});
