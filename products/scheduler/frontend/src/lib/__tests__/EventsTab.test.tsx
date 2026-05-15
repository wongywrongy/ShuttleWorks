import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventsTab } from '../../features/bracket/EventsTab';
import { useTournamentStore } from '../../store/tournamentStore';

// --- Mock useBracket so the component doesn't start polling ---
const mockEventUpsert = vi.fn();
const mockEventGenerate = vi.fn();
const mockEventDelete = vi.fn();
const mockSetData = vi.fn();
const mockRefresh = vi.fn();

vi.mock('../../api/bracketClient', () => ({
  useBracketApi: () => ({
    eventUpsert: mockEventUpsert,
    eventGenerate: mockEventGenerate,
    eventDelete: mockEventDelete,
    get: vi.fn().mockResolvedValue(null),
  }),
  // BracketApiContext export is consumed by BracketRosterTab; not needed here
  BracketApiContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

// Stub useBracket — controls the data the EventsTab renders from.
vi.mock('../../hooks/useBracket', () => ({
  useBracket: () => ({
    data: mockBracketData,
    setData: mockSetData,
    loading: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

// Mutable bracket data shared across tests — reset in beforeEach.
let mockBracketData: ReturnType<typeof makeBracketData> | null;

function makeBracketData(overrides?: {
  status?: 'draft' | 'generated' | 'started';
  participantCount?: number;
  bracketSize?: number;
}) {
  return {
    courts: 4,
    total_slots: 32,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'MS',
        discipline: 'MS',
        format: 'se' as const,
        bracket_size: overrides?.bracketSize ?? 4,
        participant_count: overrides?.participantCount ?? 0,
        rounds: [],
        status: overrides?.status ?? 'draft',
      },
    ],
    participants: [],
    play_units: [],
    assignments: [],
    results: [],
  };
}

beforeEach(() => {
  mockBracketData = makeBracketData();
  mockEventUpsert.mockReset();
  mockEventGenerate.mockReset();
  mockEventDelete.mockReset();
  mockSetData.mockReset();
  mockRefresh.mockReset();
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-alex', name: 'Alex Tan' },
      { id: 'p-ben', name: 'Ben Carter' },
    ],
  });
});

describe('EventsTab', () => {
  it('renders the spreadsheet header columns', () => {
    render(<EventsTab />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Discipline')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Participants')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders a row for each event in the bracket data', () => {
    render(<EventsTab />);
    // 'MS' appears in both ID and Discipline columns; getAllByText handles that
    expect(screen.getAllByText('MS').length).toBeGreaterThan(0);
    expect(screen.getByText('SE')).toBeInTheDocument();
  });

  // --- Status pill rendering ---

  it('renders ○ Draft pill for draft status', () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    render(<EventsTab />);
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  });

  it('renders ● Generated pill for generated status', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    render(<EventsTab />);
    expect(screen.getByText(/Generated/i)).toBeInTheDocument();
  });

  it('renders ● Started pill for started status', () => {
    mockBracketData = makeBracketData({ status: 'started' });
    render(<EventsTab />);
    expect(screen.getByText(/Started/i)).toBeInTheDocument();
  });

  // --- Action button gating ---

  it('shows disabled Generate button when draft but participant count != size', () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 0, bracketSize: 4 });
    render(<EventsTab />);
    const btn = screen.getByRole('button', { name: /Generate/i });
    expect(btn).toBeDisabled();
  });

  it('shows enabled Generate button when draft and participant count == size >= 2', () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 4, bracketSize: 4 });
    render(<EventsTab />);
    const btn = screen.getByRole('button', { name: /Generate/i });
    expect(btn).not.toBeDisabled();
  });

  it('shows Re-generate button when status is generated', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    render(<EventsTab />);
    expect(screen.getByRole('button', { name: /Re-generate/i })).toBeInTheDocument();
  });

  it('shows locked span when status is started', () => {
    mockBracketData = makeBracketData({ status: 'started' });
    render(<EventsTab />);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });

  // --- Generate action ---

  it('calls eventGenerate with wipe=false when Generate is clicked', async () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 4, bracketSize: 4 });
    const mockTournament = { ...mockBracketData };
    mockEventGenerate.mockResolvedValue(mockTournament);
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await vi.waitFor(() => expect(mockEventGenerate).toHaveBeenCalledWith('MS', { wipe: false }));
    expect(mockSetData).toHaveBeenCalledWith(mockTournament);
  });

  // --- Picker open/close ---

  it('opens the participant picker when "N entered" is clicked', () => {
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
  });

  it('closes the participant picker when Cancel is clicked', () => {
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByText(/Pick participants/i)).not.toBeInTheDocument();
  });

  it('closes the picker when the same row button is clicked again (toggle)', () => {
    render(<EventsTab />);
    const trigger = screen.getByRole('button', { name: /entered/i });
    fireEvent.click(trigger);
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText(/Pick participants/i)).not.toBeInTheDocument();
  });

  // --- Singles picker commit calls eventUpsert ---

  it('commits singles picks as participants via eventUpsert', async () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    const mockTournament = { ...mockBracketData! };
    mockEventUpsert.mockResolvedValue(mockTournament);
    render(<EventsTab />);
    // Open the picker
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    // Check both players
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Alex Tan
    fireEvent.click(checkboxes[1]); // Ben Carter
    // Commit
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/i }));
    await vi.waitFor(() => expect(mockEventUpsert).toHaveBeenCalledWith(
      'MS',
      expect.objectContaining({
        discipline: 'MS',
        format: 'se',
        participants: expect.arrayContaining([
          expect.objectContaining({ id: 'p-alex', name: 'Alex Tan' }),
          expect.objectContaining({ id: 'p-ben', name: 'Ben Carter' }),
        ]),
      }),
    ));
    expect(mockSetData).toHaveBeenCalledWith(mockTournament);
  });

  // --- Doubles picker 2-step pair commit ---

  it('doubles picker commits pairs with members: [id_a, id_b]', async () => {
    mockBracketData = {
      ...makeBracketData(),
      events: [
        {
          id: 'MD',
          discipline: 'MD',
          format: 'se' as const,
          bracket_size: 4,
          participant_count: 0,
          rounds: [],
          status: 'draft' as const,
        },
      ],
    };
    const mockTournament = { ...mockBracketData };
    mockEventUpsert.mockResolvedValue(mockTournament);
    render(<EventsTab />);
    // Open doubles picker
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    expect(screen.getByText(/Pick player A \(pair 1\)/i)).toBeInTheDocument();
    // Click Alex as player A
    fireEvent.click(screen.getByRole('button', { name: 'Alex Tan' }));
    expect(screen.getByText(/Pick partner for Alex Tan/i)).toBeInTheDocument();
    // Click Ben as player B
    fireEvent.click(screen.getByRole('button', { name: 'Ben Carter' }));
    // Pair is committed in the list
    expect(screen.getByText('Alex Tan / Ben Carter')).toBeInTheDocument();
    // Commit pairs
    fireEvent.click(screen.getByRole('button', { name: /Commit pairs/i }));
    await vi.waitFor(() => expect(mockEventUpsert).toHaveBeenCalledWith(
      'MD',
      expect.objectContaining({
        participants: expect.arrayContaining([
          expect.objectContaining({
            members: ['p-alex', 'p-ben'],
          }),
        ]),
      }),
    ));
  });

  // --- DoublesPicker: self-pair and 0-pair guards ---

  it('disables player-A button in step B (self-pair prevention)', () => {
    mockBracketData = {
      ...makeBracketData(),
      events: [
        {
          id: 'MD',
          discipline: 'MD',
          format: 'se' as const,
          bracket_size: 4,
          participant_count: 0,
          rounds: [],
          status: 'draft' as const,
        },
      ],
    };
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    // Step A: pick Alex — advances to step B
    fireEvent.click(screen.getByRole('button', { name: 'Alex Tan' }));
    expect(screen.getByText(/Pick partner for Alex Tan/i)).toBeInTheDocument();
    // In step B the Alex Tan button must be disabled
    const alexBtn = screen.getByRole('button', { name: 'Alex Tan' });
    expect(alexBtn).toBeDisabled();
  });

  it('disables Commit pairs button when 0 pairs exist', () => {
    mockBracketData = {
      ...makeBracketData(),
      events: [
        {
          id: 'MD',
          discipline: 'MD',
          format: 'se' as const,
          bracket_size: 4,
          participant_count: 0,
          rounds: [],
          status: 'draft' as const,
        },
      ],
    };
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    const commitBtn = screen.getByRole('button', { name: /Commit pairs/i });
    expect(commitBtn).toBeDisabled();
  });

  // --- Add event row ---

  it('shows the new event row when + Add event is clicked', () => {
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add event/i }));
    expect(screen.getByPlaceholderText('MS')).toBeInTheDocument();
  });

  it('saves a new event row and calls eventUpsert', async () => {
    mockBracketData = makeBracketData();
    const mockTournament = { ...mockBracketData! };
    mockEventUpsert.mockResolvedValue(mockTournament);
    render(<EventsTab />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add event/i }));
    const idInput = screen.getByPlaceholderText('MS');
    fireEvent.change(idInput, { target: { value: 'WS' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await vi.waitFor(() => expect(mockEventUpsert).toHaveBeenCalledWith(
      'WS',
      expect.objectContaining({ discipline: 'MS', format: 'se', participants: [] }),
    ));
  });
});
