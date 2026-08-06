/**
 * BracketTab — null-data routing guard.
 *
 * Verifies that Setup/Roster/Events render correctly on a fresh tournament
 * where GET /bracket returns 404 (data === null), and that Draw/Schedule/Live
 * show the empty-state CTA instead of crashing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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


/** Config sections are collapsed by default; open them before asserting on
 *  any control inside one (a negative assertion would otherwise pass without
 *  testing anything). */
function expandConfigSections() {
  screen
    .getAllByRole('button', { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

describe('BracketTab — fresh tournament (data === null)', () => {
  it('renders the Engine tab (scoring + rest) on bracket-setup tab', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    expandConfigSections();
    // The Engine section surfaces scoring + the bracket-specific rest;
    // identity + venue were extracted to workspace settings / Venue & schedule.
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tournament name/i)).not.toBeInTheDocument();
    // Must NOT show the draw empty-state CTA.
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('renders the Roster tab (player list + Add player button) on bracket-roster tab', () => {
    useUiStore.setState({ activeTab: 'bracket-roster' });
    renderBracketTab();
    expect(screen.getByRole('button', { name: /Add player/i })).toBeInTheDocument();
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('renders the unified Draws surface (New draw) on bracket-draws tab', () => {
    useUiStore.setState({ activeTab: 'bracket-draws' });
    renderBracketTab();
    // Draws absorbed the former Events spreadsheet; with no bracket data
    // yet it shows the empty state with the New draw action (the create
    // flow opens a layer, not a separate page).
    expect(screen.getByTestId('bracket-new-draw')).toBeInTheDocument();
    expect(screen.queryByText(/No draws generated yet/i)).not.toBeInTheDocument();
  });

  it('renders a composed empty state when draw-dependent views have no bracket data', () => {
    useUiStore.setState({ activeTab: 'bracket-draw' });
    renderBracketTab();
    expect(screen.getByRole('heading', { name: 'No draws generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Draws to create a draw and generate it/i)).toBeInTheDocument();
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

describe('BracketTab — selection survives the 2.5s poll (audit D1)', () => {
  /** `useBracket` polls every 2.5s and replaces `data` with a NEW OBJECT each
   *  time. A reset effect keyed on `[data]` therefore wiped the operator's
   *  selection on every poll: clicking a chip on the Plan timeline appeared to
   *  be a dead handler — the ring showed, then silently vanished. The effect
   *  must compare CONTENT (is the selected unit still there?), not identity. */
  it('keeps the selected play unit when a poll returns an equal-but-new object', async () => {
    const user = userEvent.setup();
    vi.mocked(useBracket).mockReturnValue({
      data: makePopulatedBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    const { rerender } = renderBracketTab();

    const chip = document.querySelector('[data-testid="bracket-block-pu1"]');
    expect(chip).not.toBeNull();
    await user.click(chip!);
    expect(
      document.querySelector('[data-testid="bracket-block-pu1"]')?.className,
    ).toMatch(/ring-2/);

    // The poll lands: same content, brand-new object reference.
    vi.mocked(useBracket).mockReturnValue({
      data: makePopulatedBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={['/tournaments/t1/bracket-schedule']}>
        <Routes>
          <Route path="/tournaments/:id/*" element={<BracketTab />} />
        </Routes>
      </MemoryRouter>,
    );

    // Selection must still be there.
    expect(
      document.querySelector('[data-testid="bracket-block-pu1"]')?.className,
    ).toMatch(/ring-2/);
  });

  it('drops the selection when the selected play unit is gone (regenerate)', async () => {
    const user = userEvent.setup();
    vi.mocked(useBracket).mockReturnValue({
      data: makePopulatedBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    useUiStore.setState({ activeTab: 'bracket-schedule' });
    const { rerender } = renderBracketTab();
    await user.click(document.querySelector('[data-testid="bracket-block-pu1"]')!);

    // A regenerate: the draw comes back with different play units.
    const regenerated = makePopulatedBracket();
    regenerated.play_units[0].id = 'pu-NEW';
    regenerated.assignments[0].play_unit_id = 'pu-NEW';
    vi.mocked(useBracket).mockReturnValue({
      data: regenerated,
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    rerender(
      <MemoryRouter initialEntries={['/tournaments/t1/bracket-schedule']}>
        <Routes>
          <Route path="/tournaments/:id/*" element={<BracketTab />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      document.querySelector('[data-testid="bracket-block-pu-NEW"]')?.className,
    ).not.toMatch(/ring-2/);
  });
});

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
    // The actions-bar Seg renders a radio per section: Engine + Events.
    expect(screen.getByRole('radio', { name: /^Engine$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Events$/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Tournament data$/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Share$/i })).toBeNull();
  });

  it('renders the Engine section content by default', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    expandConfigSections();
    // Engine section shows scoring + the engine-timing field by default.
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });
});
