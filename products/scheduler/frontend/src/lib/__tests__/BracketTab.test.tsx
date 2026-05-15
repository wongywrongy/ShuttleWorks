/**
 * BracketTab — null-data routing guard.
 *
 * Verifies that Setup/Roster/Events render correctly on a fresh tournament
 * where GET /bracket returns 404 (data === null), and that Draw/Schedule/Live
 * show the empty-state CTA instead of crashing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BracketTab } from '../../features/bracket/BracketTab';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';

// --- Mock useBracket so the component doesn't start polling ---
vi.mock('../../hooks/useBracket', () => ({
  useBracket: () => ({
    data: null,
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

// --- Mock bracketClient so BracketApiProvider never calls the real API ---
vi.mock('../../api/bracketClient', async () => {
  const React = await import('react');
  // Minimal context so BracketRosterTab's context-check doesn't throw.
  const BracketApiContext = React.createContext<object | null>(null);
  return {
    BracketApiContext,
    BracketApiProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(BracketApiContext.Provider, { value: {} }, children),
    useBracketApi: () => ({
      get: vi.fn().mockResolvedValue(null),
      exportJsonUrl: () => '/export.json',
      exportCsvUrl: () => '/export.csv',
      exportIcsUrl: () => '/export.ics',
    }),
  };
});

/** Helper — render BracketTab mounted at /tournaments/t-1 */
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
  // Reset stores to known defaults.
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
      tournamentName: 'Test Tournament',
    },
    bracketPlayers: [],
  });
});

describe('BracketTab — fresh tournament (data === null)', () => {
  it('renders the Setup form (Identity + Schedule & Venue) on bracket-setup tab', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // SetupTab renders Identity and Schedule & Venue sections.
    expect(screen.getByLabelText(/Tournament name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Courts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Start time/i)).toBeInTheDocument();
    // Must NOT show the draw empty-state CTA.
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('renders the Roster tab (player list + Add player button) on bracket-roster tab', () => {
    useUiStore.setState({ activeTab: 'bracket-roster' });
    renderBracketTab();
    expect(screen.getByRole('button', { name: /Add player/i })).toBeInTheDocument();
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('renders the Events spreadsheet (headers + Add event) on bracket-events tab', () => {
    useUiStore.setState({ activeTab: 'bracket-events' });
    renderBracketTab();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add event/i })).toBeInTheDocument();
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty-state CTA (not a crash) on bracket-draw tab', () => {
    useUiStore.setState({ activeTab: 'bracket-draw' });
    renderBracketTab();
    expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
    // Should not render the Draw content or Setup form
    expect(screen.queryByLabelText(/Tournament name/i)).not.toBeInTheDocument();
  });

  it('shows the empty-state CTA on bracket-schedule tab', () => {
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    renderBracketTab();
    expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
  });

  it('shows the empty-state CTA on bracket-live tab', () => {
    useUiStore.setState({ activeTab: 'bracket-live' });
    renderBracketTab();
    expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
  });
});
