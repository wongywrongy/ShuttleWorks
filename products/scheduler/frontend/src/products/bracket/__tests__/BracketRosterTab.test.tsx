import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { BracketRosterTab } from '../BracketRosterTab';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// SP-D7 S3: the roster is a BandedTable + right-docked DetailPanel with
// full multi-event entry. The bracket api + poll hook are mocked so the
// surface renders with a controlled snapshot; the tournament store is the
// real zustand store (roster edits are asserted against its state).

const mockEventUpsert = vi.fn();
const mockSetData = vi.fn();

let mockBracketData: BracketTournamentDTO | null = null;

vi.mock('../../../api/bracketClient', async () => {
  const { createContext } = await import('react');
  return {
    // Non-null default value so BracketRosterTab's provider-presence check
    // takes the provider path (and the mocked useBracket/useBracketApi).
    BracketApiContext: createContext<object | null>({}),
    useBracketApi: () => ({ eventUpsert: mockEventUpsert }),
  };
});

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({
    data: mockBracketData,
    setData: mockSetData,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

/** Draft MS (singles) + draft MD (doubles, one team) + generated WS. */
function makeBracketData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 16,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'MS',
        discipline: 'MS',
        format: 'se',
        bracket_size: 4,
        participant_count: 2,
        rounds: [],
        status: 'draft',
        seeded_count: 2,
        config: {},
        participants: [
          { id: 'p-alex-tan', name: 'Alex Tan' },
          { id: 'p-dana-liu', name: 'Dana Liu' },
        ],
      },
      {
        id: 'MD',
        discipline: 'MD',
        format: 'se',
        bracket_size: 4,
        participant_count: 1,
        rounds: [],
        status: 'draft',
        config: {},
        participants: [
          {
            id: 'MD-T1',
            name: 'Alex Tan / Ben Carter',
            members: ['p-alex-tan', 'p-ben-carter'],
          },
        ],
      },
      {
        id: 'WS',
        discipline: 'WS',
        format: 'se',
        bracket_size: 2,
        participant_count: 1,
        rounds: [['WS-R0-0']],
        status: 'generated',
        config: {},
        participants: [{ id: 'p-dana-liu', name: 'Dana Liu' }],
      },
    ],
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  };
}

const playerById = (id: string) =>
  useTournamentStore.getState().bracketPlayers.find((p) => p.id === id);

const openPanelFor = (rowId: string) => {
  fireEvent.click(screen.getByTestId(`roster-row-${rowId}`));
  return screen.getByTestId('bracket-player-detail');
};

beforeEach(() => {
  mockBracketData = null;
  mockEventUpsert.mockReset();
  mockSetData.mockReset();
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-alex-tan', name: 'Alex Tan' },
      { id: 'p-ben-carter', name: 'Ben Carter', notes: 'lefty' },
      { id: 'p-cole-park', name: 'Cole Park' },
      { id: 'p-dana-liu', name: 'Dana Liu' },
    ],
  });
});

describe('BracketRosterTab', () => {
  it('renders the player count and list of player names', () => {
    render(<BracketRosterTab />);
    // Meet-style header strip: eyebrow "Roster" + bold "4 players" count.
    expect(screen.getByText(/^Roster$/i)).toBeInTheDocument();
    expect(screen.getByText(/4 players/i)).toBeInTheDocument();
    expect(screen.getByText('Alex Tan')).toBeInTheDocument();
    expect(screen.getByText('Ben Carter')).toBeInTheDocument();
  });

  it('adds a new player via the + Add player button', () => {
    render(<BracketRosterTab />);
    fireEvent.click(screen.getByRole('button', { name: /Add player/i }));
    const input = screen.getByPlaceholderText(/New player name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Elle Ruiz' } });
    fireEvent.blur(input);
    const players = useTournamentStore.getState().bracketPlayers;
    expect(players.find((p) => p.name === 'Elle Ruiz')).toBeDefined();
  });

  it('deletes a player via the row overflow menu and updates the count', () => {
    // The inline Delete link moved into a per-row "…" overflow (SP-D7 S3).
    render(<BracketRosterTab />);
    fireEvent.click(screen.getByRole('button', { name: /Actions for Alex Tan/i }));
    fireEvent.click(screen.getByTestId('roster-delete-p-alex-tan'));
    const players = useTournamentStore.getState().bracketPlayers;
    expect(players).toHaveLength(3);
    expect(players.find((p) => p.id === 'p-alex-tan')).toBeUndefined();
  });
});

describe('BracketRosterTab — events badges', () => {
  beforeEach(() => {
    mockBracketData = makeBracketData();
  });

  it('badges singles entries from events[].participants (draft draws included)', () => {
    render(<BracketRosterTab />);
    const alexRow = screen.getByTestId('roster-row-p-alex-tan');
    expect(within(alexRow).getByText('MS')).toBeInTheDocument();
    expect(within(alexRow).getByText('MD')).toBeInTheDocument();
  });

  it('badges team members through the participant members list', () => {
    render(<BracketRosterTab />);
    const benRow = screen.getByTestId('roster-row-p-ben-carter');
    expect(within(benRow).getByText('MD')).toBeInTheDocument();
    expect(within(benRow).queryByText('MS')).not.toBeInTheDocument();
  });
});

describe('BracketRosterTab — detail panel', () => {
  beforeEach(() => {
    mockBracketData = makeBracketData();
  });

  it('opens the DetailPanel on row click and highlights the selection', () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    expect(within(panel).getByText('Alex Tan')).toBeInTheDocument();
    expect(within(panel).getByText('Player')).toBeInTheDocument();
    expect(screen.getByTestId('roster-row-p-alex-tan')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('writes a Min rest (slots) edit to the roster record', () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    const input = within(panel).getByLabelText('Min rest (slots)') as HTMLInputElement;
    expect(input.placeholder).toBe('default (1)');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(playerById('p-alex-tan')?.restSlots).toBe(3);
  });

  it('clears the rest override when the field is emptied', () => {
    useTournamentStore.setState({
      bracketPlayers: [{ id: 'p-alex-tan', name: 'Alex Tan', restSlots: 2 }],
    });
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    const input = within(panel).getByLabelText('Min rest (slots)');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(playerById('p-alex-tan')?.restSlots).toBeUndefined();
  });

  it('writes availability edits through as POSITIVE windows', () => {
    // Positive-window inversion itself is pinned by availabilityWindows
    // tests (S1); here we assert the write-through: adding one blocked
    // period 09:00–10:00 inside the default 08:00–22:00 day stores the
    // complement as the player's allowed windows.
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    fireEvent.click(within(panel).getByTestId('availability-add-period'));
    expect(playerById('p-alex-tan')?.availability).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '10:00', end: '22:00' },
    ]);
  });

  it('shows the session-anchor hint when no start time is set', () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    expect(
      within(panel).getByText(/Applies when the session start time is set/i),
    ).toBeInTheDocument();
  });
});

describe('BracketRosterTab — multi-event entry', () => {
  beforeEach(() => {
    mockBracketData = makeBracketData();
    mockEventUpsert.mockResolvedValue(makeBracketData());
  });

  it('singles toggle ON upserts with the event config echoed + player appended', async () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-cole-park');
    fireEvent.click(within(panel).getByTestId('events-category-singles'));
    await act(async () => {
      fireEvent.click(within(panel).getByTestId('event-toggle-MS'));
    });
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('MS', {
        discipline: 'MS',
        format: 'se',
        bracket_size: 4,
        seeded_count: 2,
        config: {},
        duration_slots: 1,
        participants: [
          { id: 'p-alex-tan', name: 'Alex Tan' },
          { id: 'p-dana-liu', name: 'Dana Liu' },
          { id: 'p-cole-park', name: 'Cole Park' },
        ],
      }),
    );
    expect(mockSetData).toHaveBeenCalled();
  });

  it('singles toggle OFF upserts with the player removed (config still echoed)', async () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    fireEvent.click(within(panel).getByTestId('events-category-singles'));
    await act(async () => {
      fireEvent.click(within(panel).getByTestId('event-toggle-MS'));
    });
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'MS',
        expect.objectContaining({
          discipline: 'MS',
          format: 'se',
          bracket_size: 4,
          seeded_count: 2,
          participants: [{ id: 'p-dana-liu', name: 'Dana Liu' }],
        }),
      ),
    );
  });

  it('doubles toggle ON pairs via the inline partner select before upserting', async () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-cole-park');
    fireEvent.click(within(panel).getByTestId('events-category-doubles'));
    fireEvent.click(within(panel).getByTestId('event-toggle-MD'));

    // Partner candidates exclude players already in the event (Alex + Ben
    // via team members) and the player themself.
    const select = within(panel).getByTestId('partner-select-MD') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain('Dana Liu');
    expect(optionLabels).not.toContain('Alex Tan');
    expect(optionLabels).not.toContain('Ben Carter');
    expect(optionLabels).not.toContain('Cole Park');
    expect(mockEventUpsert).not.toHaveBeenCalled();

    fireEvent.change(select, { target: { value: 'p-dana-liu' } });
    await act(async () => {
      fireEvent.click(within(panel).getByTestId('partner-confirm-MD'));
    });

    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('MD', {
        discipline: 'MD',
        format: 'se',
        bracket_size: 4,
        config: {},
        duration_slots: 1,
        participants: [
          {
            id: 'MD-T1',
            name: 'Alex Tan / Ben Carter',
            members: ['p-alex-tan', 'p-ben-carter'],
          },
          {
            id: 'MD-T2',
            name: 'Cole Park / Dana Liu',
            members: ['p-cole-park', 'p-dana-liu'],
          },
        ],
      }),
    );
  });

  it('doubles toggle OFF removes the team containing the player', async () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    fireEvent.click(within(panel).getByTestId('events-category-doubles'));
    await act(async () => {
      fireEvent.click(within(panel).getByTestId('event-toggle-MD'));
    });
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'MD',
        expect.objectContaining({ participants: [] }),
      ),
    );
  });

  it('renders non-draft events locked with no toggle (never upserts)', () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-dana-liu');
    fireEvent.click(within(panel).getByTestId('events-category-singles'));
    expect(within(panel).getByTestId('event-locked-WS')).toHaveTextContent(
      /locked — draw generated/,
    );
    expect(within(panel).queryByTestId('event-toggle-WS')).not.toBeInTheDocument();
    expect(mockEventUpsert).not.toHaveBeenCalled();
  });

  it('marks locked events the player is entered in (S5 fix)', () => {
    // Dana IS in the generated WS draw — the locked row must still say so.
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-dana-liu');
    fireEvent.click(within(panel).getByTestId('events-category-singles'));
    expect(within(panel).getByTestId('event-entered-WS')).toHaveTextContent(
      'Entered',
    );
  });

  it('shows no entered mark on locked events the player is not in', () => {
    render(<BracketRosterTab />);
    const panel = openPanelFor('p-alex-tan');
    fireEvent.click(within(panel).getByTestId('events-category-singles'));
    expect(within(panel).getByTestId('event-locked-WS')).toBeInTheDocument();
    expect(
      within(panel).queryByTestId('event-entered-WS'),
    ).not.toBeInTheDocument();
  });
});
