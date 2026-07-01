/**
 * SP-E4 — Bracket Configuration is two tabs: Engine and Structure.
 *
 * Engine tab = the SAME scoring field set as the Meet Engine tab (score
 * type / points / match format / deuce) plus the bracket-specific rest
 * between rounds. Structure tab = the draw facts (type / size / seeding /
 * active disciplines), read from the existing draws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BracketTab } from '../BracketTab';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useBracket } from '../../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: vi.fn(),
}));

vi.mock('../../../api/bracketClient', async () => {
  const React = await import('react');
  const BracketApiContext = React.createContext<object | null>(null);
  return {
    BracketApiContext,
    BracketApiProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(BracketApiContext.Provider, { value: {} }, children),
    useBracketApi: () => ({ get: vi.fn().mockResolvedValue(null) }),
  };
});

function populated(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [
      {
        id: 'MS-1', discipline: 'MS', format: 'se',
        bracket_size: 8, participant_count: 6, rounds: [], status: 'generated',
      },
      {
        id: 'WD-1', discipline: 'WD', format: 'rr',
        bracket_size: 4, participant_count: 4, rounds: [], status: 'draft',
      },
    ],
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  };
}

function renderBracketTab() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1']}>
      <Routes>
        <Route path="/tournaments/:id" element={<BracketTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useBracket).mockReturnValue({
    data: populated(),
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  useUiStore.setState({ activeTab: 'bracket-setup' });
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 1,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      scoringFormat: 'simple',
      setsToWin: 2,
      pointsPerSet: 21,
      deuceEnabled: true,
      tournamentName: 'Bracket A',
    },
    bracketPlayers: [],
  });
});

describe('Bracket Configuration — two tabs', () => {
  it('renders exactly two tabs: Engine and Structure', () => {
    renderBracketTab();
    expect(screen.getByRole('radio', { name: /^Engine$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Structure$/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Tournament$/i })).toBeNull();
  });

  it('Engine tab shows the same scoring field set as Meet + rest between rounds', () => {
    renderBracketTab();
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Points per set')).toBeInTheDocument();
    expect(screen.getByLabelText('Match format')).toBeInTheDocument();
    expect(screen.getByLabelText('Deuce enabled')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });

  it('toggling score type to Sets writes scoringFormat=badminton to the store', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderBracketTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Sets' }));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0];
    expect(last.scoringFormat).toBe('badminton');
  });

  it('Structure tab shows draw type / size / seeding / active disciplines', () => {
    renderBracketTab();
    fireEvent.click(screen.getByRole('radio', { name: /^Structure$/i }));
    expect(screen.getByText(/Active disciplines/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Draw type' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Draw size' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Seeding' })).toBeInTheDocument();
    // The draws' own facts render (single elimination / round robin draw types).
    expect(screen.getByText(/Single elimination/i)).toBeInTheDocument();
  });
});
