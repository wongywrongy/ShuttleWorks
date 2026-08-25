/**
 * BracketTab — null-data routing guard.
 *
 * Verifies that Setup/Roster/Events render correctly on a fresh tournament
 * where GET /bracket returns 404 (data === null), and that Draw/Schedule/Live
 * show the empty-state CTA instead of crashing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// The bracket schedule/live views (timeline, sidebar, live list) retired
// onto the unified Operations Plan/Run surfaces at SP-CONSOLE-4 B4 — their
// chrome, empty states, and the D1 selection-survives-poll behavior are
// covered by the operations suites (selection there is key-based, so the
// D1 identity-churn class cannot recur).

describe('BracketTab — Setup chrome', () => {
  it('renders Configuration as one surface, with no section switcher', () => {
    // Default mock (null data) is fine — Setup doesn't depend on bracket data.
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // The actions-bar Seg is gone: Engine and Events were merged into a
    // single stack of sections. Every former section is a heading now.
    expect(screen.queryByRole('radio', { name: /^Engine$/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Events$/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scoring' })).toBeInTheDocument();
    // Tournament data + Share stayed out — they live in workspace settings.
    expect(screen.queryByRole('heading', { name: /^Tournament data$/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Share$/i })).toBeNull();
  });

  it('renders the Engine section content by default', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    expandConfigSections();
    // Engine section shows scoring + the engine-timing field by default.
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });
});

/**
 * V3 — the D3 fix (`bracketMigration.ts`, slug→name from the TEAM display
 * name) changed nothing an operator could see, because the migration runs
 * ONCE per bracket and its output is persisted on the tournament blob. A
 * workspace migrated by the pre-fix build kept its slug names for good: the
 * matches ROW resolves names from the live snapshot and read correctly, while
 * the roster list, the draw participant picker and the match detail panel all
 * read the stored roster and read `cormac-delahunt`. One stale seam, three
 * symptoms — so the repair belongs where the roster is loaded, not at each.
 */
/**
 * SP-DM-3 P6 Task 1, controller amendment — the guard Task 3's safety
 * argument rests on, and Task 2's.
 *
 * The bracket-roster migration only ever runs against an EMPTY roster
 * (`BracketTab.tsx`: `if (!bracketRosterMigrated && bracketPlayers.length
 * === 0)`). That is the whole reason Task 2's "omit a member no participant
 * can name" is safe: the roster blob is where REMARKS and AVAILABILITY live
 * — operator data, not a projection — so omission can only ever decline to
 * *create* a row. It can never destroy one, because reconcile's output is
 * not written when a roster already exists.
 *
 * Weaken or delete the length check and this goes red: the reconciled
 * doubles members would replace the seeded row and take its remarks with
 * them. (Verified by perturbation — see the Task 1 report.)
 */
describe('BracketTab — the roster migration never overwrites an existing roster', () => {
  /** A draw whose reconcile output shares no id with the seeded roster, so
   *  a write from reconcile is unmistakable. Local to this describe: Task 3
   *  deletes the V3 describe below, helper and all. */
  function doublesDraw(): BracketTournamentDTO {
    const b = makePopulatedBracket();
    b.participants = [
      {
        id: 'MD1-T1',
        name: 'Cormac Delahunt / Jae Hyun Choi',
        members: ['cormac-delahunt', 'jae-hyun-choi'],
      },
    ];
    return b;
  }

  it('does not write reconcile output over a populated roster', () => {
    vi.mocked(useBracket).mockReturnValue({
      data: doublesDraw(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    // NOT migrated — the only thing holding reconcile off is the roster
    // being non-empty. The seeded row is inert to the name repair that
    // runs after the guard (its name is not its id, and the snapshot
    // knows nothing about its id), so any write here came from reconcile.
    useTournamentStore.setState({
      bracketRosterMigrated: false,
      bracketPlayers: [
        { id: 'p-solo', name: 'Solo Operator', notes: 'ankle taped' },
      ],
    });
    useUiStore.setState({ activeTab: 'bracket-roster' });
    renderBracketTab();

    const roster = useTournamentStore.getState().bracketPlayers;
    expect(roster).toEqual([
      { id: 'p-solo', name: 'Solo Operator', notes: 'ankle taped' },
    ]);
    expect(screen.queryByText('Cormac Delahunt')).toBeNull();
  });
});

describe('BracketTab — an already-migrated roster still gets its names fixed', () => {
  /** Doubles-only draw: the team display name is the only place the two
   *  members' real names survive. */
  function doublesOnlyBracket(): BracketTournamentDTO {
    const b = makePopulatedBracket();
    b.participants = [
      {
        id: 'MD1-T1',
        name: 'Cormac Delahunt / Jae Hyun Choi',
        members: ['cormac-delahunt', 'jae-hyun-choi'],
      },
    ];
    return b;
  }

  it('replaces stored slug names on load and leaves operator names alone', () => {
    vi.mocked(useBracket).mockReturnValue({
      data: doublesOnlyBracket(),
      setData: vi.fn(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    // The state a pre-fix build left behind: migrated, and wrong.
    useTournamentStore.setState({
      bracketRosterMigrated: true,
      bracketPlayers: [
        { id: 'cormac-delahunt', name: 'cormac-delahunt' },
        { id: 'jae-hyun-choi', name: 'J. Choi' },
      ],
    });
    useUiStore.setState({ activeTab: 'bracket-roster' });
    renderBracketTab();

    expect(screen.getByText('Cormac Delahunt')).toBeInTheDocument();
    expect(screen.queryByText('cormac-delahunt')).toBeNull();
    // The hand-typed name is not a slug and is never touched.
    expect(screen.getByText('J. Choi')).toBeInTheDocument();
  });
});
