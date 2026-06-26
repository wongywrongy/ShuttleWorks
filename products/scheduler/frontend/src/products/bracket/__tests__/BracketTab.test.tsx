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
import { BracketTab } from '../BracketTab';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useBracket } from '../../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// --- Mock useBracket so the component doesn't start polling ---
vi.mock('../../../hooks/useBracket', () => ({
  useBracket: vi.fn(() => ({
    data: null,
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

// --- Mock bracketClient so BracketApiProvider never calls the real API ---
vi.mock('../../../api/bracketClient', async () => {
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
  // Reset useBracket to the default null-data return value.
  vi.mocked(useBracket).mockReturnValue({
    data: null,
    setData: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
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
  it('renders the Setup form (engine timing) on bracket-setup tab', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // The Tournament section is engine-timing only now — identity + venue
    // were extracted to workspace settings / Venue & schedule.
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tournament name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Courts/i)).not.toBeInTheDocument();
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

  it('renders a composed empty state when draw-dependent views have no bracket data', () => {
    useUiStore.setState({ activeTab: 'bracket-draw' });
    renderBracketTab();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Events to add events and generate draws/i)).toBeInTheDocument();
    // Should not render the Draw content or Setup form
    expect(screen.queryByLabelText(/Rest between rounds/i)).not.toBeInTheDocument();
  });

  it('shows the empty-state CTA on bracket-schedule tab', () => {
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    renderBracketTab();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
  });

  it('shows the empty-state CTA on bracket-live tab', () => {
    useUiStore.setState({ activeTab: 'bracket-live' });
    renderBracketTab();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
  });

  it('renders bracket load errors as inline alerts', () => {
    vi.mocked(useBracket).mockReturnValue({
      data: null,
      setData: vi.fn(),
      loading: false,
      error: 'Network failed',
      refresh: vi.fn(),
    });
    useUiStore.setState({ activeTab: 'bracket-draw' });
    renderBracketTab();

    expect(screen.getByRole('alert')).toHaveTextContent('Bracket data is unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
  });
});

function makePopulatedBracket(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 2, participant_count: 2, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    play_units: [{
      id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
      side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
    }],
    assignments: [{
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    }],
    results: [],
  };
}

describe('BracketTab — Schedule chrome (data populated)', () => {
  it('renders header + table + sidebar on bracket-schedule tab', () => {
    // Override the default null-data mock for this test only.
    vi.mocked(useBracket).mockReturnValue({
      data: makePopulatedBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    renderBracketTab();

    // Header: play-unit count summary.
    expect(screen.getByText(/play unit.*scheduled across/i)).toBeInTheDocument();

    // Table: the "X of Y scheduled" header strip.
    expect(screen.getByText(/of 1 scheduled/i)).toBeInTheDocument();

    // Sidebar: empty hint by default (nothing selected).
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });
});

describe('BracketTab — Setup chrome', () => {
  it('renders the Setup sections in the Configuration switcher', () => {
    // Default mock (null data) is fine — Setup doesn't depend on bracket data.
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // The actions-bar Seg renders a radio per section. Tournament data +
    // Share were extracted to workspace settings, so only these remain.
    expect(screen.getByRole('radio', { name: /^Tournament$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Events and roster$/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Tournament data$/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Share$/i })).toBeNull();
  });

  it('renders the Tournament section content by default', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // Tournament section shows the engine-timing field by default.
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });
});
