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
 * The V3 "an already-migrated roster still gets its names fixed" describe was
 * DELETED by SP-DM-3 P6 Task 3 (card §C6, R-DM-7(a)) along with the repair it
 * pinned: `healBracketRosterNames` decided a stored row was corrupt by testing
 * `name === id` and PERSISTED its guess. Nothing writes such a row any more —
 * pinned by `bracketMigration.test.ts`'s "NC 3" describe.
 */

/**
 * SP-DM-3 P6 Task 1, controller amendment — the guard Task 3's safety
 * argument rests on, and Task 2's.
 *
 * The EXTRACTION half of the bracket-roster migration only ever runs against
 * an EMPTY roster (`BracketTab.tsx`: `if (!bracketRosterMigrated &&
 * bracketPlayers.length === 0)`). Only the extraction — the
 * `healBracketRosterNames` pass below it was NOT gated by that check and DID
 * run against a populated roster, which is what Task 3 deleted, so the effect
 * is now wholly empty-roster-only. The
 * extraction guard is the whole reason Task 2's "omit a member no
 * participant can name" is safe: the roster blob is where REMARKS and
 * AVAILABILITY live — operator data, not a projection — so omission can only
 * ever decline to *create* a row. It can never destroy one, because
 * reconcile's output is not written when a roster already exists.
 *
 * Weaken or delete the length check and this goes red: the reconciled
 * doubles members would replace the seeded row and take its remarks with
 * them. (Verified by perturbation — see the Task 1 report.)
 *
 * Deliberately placed BELOW the V3 heal describe, with its own fixture:
 * Task 3 deleted that describe wholesale and this pin survived it.
 */
describe('BracketTab — the roster migration never overwrites an existing roster', () => {
  /** A draw whose reconcile output shares no id with the seeded roster, so
   *  a write from reconcile is unmistakable. Local to this describe so it
   *  outlived the V3 describe above, helper and all. */
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
    // being non-empty. Nothing else in the effect writes the roster now
    // (the name repair that used to run after the guard is gone), so any
    // write here came from reconcile.
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
