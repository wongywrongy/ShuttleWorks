/**
 * V3-OC33.1 — the empty match inventory offers exactly one valid next step,
 * chosen by roster readiness, and withholds the disabled "Add match"
 * override until a match actually exists to override.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MatchesTab } from '../MatchesTab';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { useUiStore } from '../../../../store/uiStore';
import { useMatchStateStore } from '../../../../store/matchStateStore';
import type { PlayerDTO, TournamentConfig } from '../../../../api/dto';

vi.mock('../../../../api/client', () => ({
  apiClient: {
    getMatchStates: vi.fn().mockResolvedValue({}),
  },
}));

const TID = 'test-tid';

const player = (id: string, name: string): PlayerDTO =>
  ({ id, name, groupId: 'g1', ranks: ['MS1'], availability: [] }) as PlayerDTO;

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ activeTournamentRole: 'operator' });
  useMatchStateStore.setState({ matchStates: {} });
});

const renderTab = () =>
  render(
    <MemoryRouter initialEntries={[`/tournaments/${TID}/matches`]}>
      <Routes>
        <Route path="/tournaments/:id/matches" element={<MatchesTab />} />
      </Routes>
    </MemoryRouter>,
  );

describe('<MatchesTab /> — empty inventory, roster not ready', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      config: {} as TournamentConfig,
      groups: [],
      players: [],
      matches: [],
    });
  });

  it('offers "Add players" as the one primary action', () => {
    renderTab();
    expect(
      screen.getByText('Matches can be generated once players are on the roster.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('empty-add-players')).toHaveTextContent('Add players');
    expect(screen.queryByTestId('empty-generate-matches')).not.toBeInTheDocument();
  });

  it('withholds the toolbar Add match action', () => {
    renderTab();
    expect(screen.queryByTestId('add-match-row')).not.toBeInTheDocument();
  });
});

describe('<MatchesTab /> — empty inventory, roster ready', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      config: { rankCounts: { MS: 1 } } as unknown as TournamentConfig,
      groups: [{ id: 'g1', name: 'North' }],
      players: [player('p1', 'Alex'), player('p2', 'Ben')],
      matches: [],
    });
  });

  it('offers "Generate matches" as the one primary action, not "Add match by hand"', () => {
    renderTab();
    expect(screen.getByTestId('empty-generate-matches')).toHaveTextContent(
      'Generate matches',
    );
    expect(screen.queryByTestId('empty-add-players')).not.toBeInTheDocument();
    expect(screen.queryByText(/Add match by hand/)).not.toBeInTheDocument();
  });

  it('still withholds the toolbar Add match action before any match exists', () => {
    renderTab();
    expect(screen.queryByTestId('add-match-row')).not.toBeInTheDocument();
  });

  it('the toolbar Regenerate control reads "Generate matches" before a first generation', () => {
    renderTab();
    expect(screen.getByTestId('regenerate-toggle')).toHaveTextContent('Generate matches');
  });
});

describe('<MatchesTab /> — toolbar once matches exist', () => {
  it('shows Add match and relabels the toggle "Regenerate from roster"', () => {
    useTournamentStore.setState({
      config: { rankCounts: { MS: 1 } } as unknown as TournamentConfig,
      groups: [{ id: 'g1', name: 'North' }],
      players: [player('p1', 'Alex'), player('p2', 'Ben')],
      matches: [
        {
          id: 'm1',
          sideA: ['p1'],
          sideB: ['p2'],
          matchType: 'dual',
          eventRank: 'MS1',
          durationSlots: 1,
        },
      ],
    });
    renderTab();
    expect(screen.getByTestId('add-match-row')).toBeInTheDocument();
    expect(screen.getByTestId('regenerate-toggle')).toHaveTextContent('Regenerate from roster');
  });
});
