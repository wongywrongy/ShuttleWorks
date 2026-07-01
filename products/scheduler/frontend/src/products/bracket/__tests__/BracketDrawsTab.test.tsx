import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BracketDrawsTab } from '../BracketDrawsTab';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { PlayUnitDTO, AssignmentDTO, ResultDTO } from '../../../api/bracketDto';

// The Draws surface is the unified create + manage + open surface (it
// absorbed the former Events spreadsheet; the list is a grid of draw
// cards). These tests cover the ported management behaviors plus the
// create-in-a-layer and open-draw flows.

const mockEventUpsert = vi.fn();
const mockEventGenerate = vi.fn();
const mockSetData = vi.fn();
const mockRefresh = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't-1',
}));

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    eventUpsert: mockEventUpsert,
    eventGenerate: mockEventGenerate,
    get: vi.fn().mockResolvedValue(null),
  }),
  BracketApiContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({
    data: mockBracketData,
    setData: mockSetData,
    loading: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

let mockBracketData: ReturnType<typeof makeBracketData> | null;

function makeBracketData(overrides?: {
  status?: 'draft' | 'generated' | 'started';
  participantCount?: number;
  bracketSize?: number;
  playUnits?: PlayUnitDTO[];
  assignments?: AssignmentDTO[];
  results?: ResultDTO[];
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
    play_units: overrides?.playUnits ?? [],
    assignments: overrides?.assignments ?? [],
    results: overrides?.results ?? [],
  };
}

function makePlayUnit(id: string, over?: Partial<PlayUnitDTO>): PlayUnitDTO {
  return {
    id,
    event_id: 'MS',
    round_index: 0,
    match_index: 0,
    side_a: ['p-a'],
    side_b: ['p-b'],
    duration_slots: 1,
    dependencies: [],
    slot_a: { participant_id: null, feeder_play_unit_id: null },
    slot_b: { participant_id: null, feeder_play_unit_id: null },
    ...over,
  };
}

function renderDraws() {
  return render(
    <MemoryRouter>
      <BracketDrawsTab />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockBracketData = makeBracketData();
  mockEventUpsert.mockReset();
  mockEventGenerate.mockReset();
  mockSetData.mockReset();
  mockRefresh.mockReset();
  mockNavigate.mockReset();
  useTournamentStore.setState({
    bracketPlayers: [
      { id: 'p-alex', name: 'Alex Tan' },
      { id: 'p-ben', name: 'Ben Carter' },
    ],
  });
});

describe('BracketDrawsTab — draw cards', () => {
  it('renders a card per draw with format, size, and participant meta', () => {
    mockBracketData = makeBracketData({ participantCount: 3, bracketSize: 8 });
    renderDraws();
    const card = screen.getByTestId('bracket-draw-card-MS');
    expect(within(card).getByText('Single elimination')).toBeInTheDocument();
    expect(within(card).getByText('8')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /3 entered/i })).toBeInTheDocument();
  });

  it('renders a card for each event', () => {
    renderDraws();
    expect(screen.getAllByText('MS').length).toBeGreaterThan(0);
    expect(screen.getByText('Single elimination')).toBeInTheDocument();
  });

  it('shows an empty state with a New draw action when there are no draws', () => {
    mockBracketData = { ...makeBracketData(), events: [] };
    renderDraws();
    expect(screen.getByText('No draws yet')).toBeInTheDocument();
  });

  it('shows the DONE/LIVE/READY/PEND progress line when the draw has matches', () => {
    mockBracketData = makeBracketData({
      status: 'started',
      playUnits: [
        makePlayUnit('pu-1'),
        makePlayUnit('pu-2'),
        makePlayUnit('pu-3'),
        makePlayUnit('pu-4'),
      ],
      assignments: [
        { play_unit_id: 'pu-2', slot_id: 1, court_id: 1, duration_slots: 1, actual_start_slot: null, actual_end_slot: null, started: true, finished: false },
        { play_unit_id: 'pu-3', slot_id: 2, court_id: 2, duration_slots: 1, actual_start_slot: null, actual_end_slot: null, started: false, finished: false },
      ],
      results: [
        { play_unit_id: 'pu-1', winner_side: 'A', walkover: false, finished_at_slot: null },
      ],
    });
    renderDraws();
    const card = screen.getByTestId('bracket-draw-card-MS');
    // done=1 (pu-1) · live=1 (pu-2) · ready=1 (pu-3) · pending=1 (pu-4)
    expect(within(card).getByText('DONE').parentElement).toHaveTextContent(/DONE\s*1/);
    expect(within(card).getByText('LIVE').parentElement).toHaveTextContent(/LIVE\s*1/);
    expect(within(card).getByText('READY').parentElement).toHaveTextContent(/READY\s*1/);
    expect(within(card).getByText('PEND').parentElement).toHaveTextContent(/PEND\s*1/);
  });

  it('omits the progress line while the draw has no matches', () => {
    renderDraws();
    const card = screen.getByTestId('bracket-draw-card-MS');
    expect(within(card).queryByText('DONE')).not.toBeInTheDocument();
  });
});

describe('BracketDrawsTab — status + generate', () => {
  it('renders the Draft pill for draft status', () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    renderDraws();
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  });

  it('renders the Generated pill for generated status', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    expect(screen.getByText(/Generated/i)).toBeInTheDocument();
  });

  it('disables Generate when participant count != size', () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 0, bracketSize: 4 });
    renderDraws();
    expect(screen.getByRole('button', { name: /Generate/i })).toBeDisabled();
  });

  it('enables Generate when participant count == size', () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 4, bracketSize: 4 });
    renderDraws();
    expect(screen.getByRole('button', { name: /Generate/i })).not.toBeDisabled();
  });

  it('shows Re-generate when generated', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    expect(screen.getByRole('button', { name: /Re-generate/i })).toBeInTheDocument();
  });

  it('shows locked when started', () => {
    mockBracketData = makeBracketData({ status: 'started' });
    renderDraws();
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });

  it('calls eventGenerate with wipe=false when Generate is clicked', async () => {
    mockBracketData = makeBracketData({ status: 'draft', participantCount: 4, bracketSize: 4 });
    const next = { ...mockBracketData };
    mockEventGenerate.mockResolvedValue(next);
    renderDraws();
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await vi.waitFor(() => expect(mockEventGenerate).toHaveBeenCalledWith('MS', { wipe: false }));
    expect(mockSetData).toHaveBeenCalledWith(next);
  });
});

describe('BracketDrawsTab — participant picker', () => {
  it('opens and closes the picker', () => {
    renderDraws();
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByText(/Pick participants/i)).not.toBeInTheDocument();
  });

  it('commits singles picks via eventUpsert', async () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    const next = { ...mockBracketData };
    mockEventUpsert.mockResolvedValue(next);
    renderDraws();
    fireEvent.click(screen.getByRole('button', { name: /entered/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'MS',
        expect.objectContaining({
          discipline: 'MS',
          format: 'se',
          participants: expect.arrayContaining([
            expect.objectContaining({ id: 'p-alex', name: 'Alex Tan' }),
            expect.objectContaining({ id: 'p-ben', name: 'Ben Carter' }),
          ]),
        }),
      ),
    );
    expect(mockSetData).toHaveBeenCalledWith(next);
  });
});

describe('BracketDrawsTab — create in a layer', () => {
  it('opens the New draw layer and creates an event via eventUpsert', async () => {
    mockBracketData = makeBracketData();
    const next = { ...mockBracketData };
    mockEventUpsert.mockResolvedValue(next);
    renderDraws();

    // No inline add-row; clicking New draw opens a dialog layer.
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New draw' })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText('MS'), { target: { value: 'WS' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));

    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'WS',
        expect.objectContaining({ discipline: 'MS', format: 'se', participants: [] }),
      ),
    );
  });

  it('disables Create draw until an ID is entered', () => {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Create draw/i })).toBeDisabled();
  });
});

describe('BracketDrawsTab — open draw', () => {
  it('navigates to the draw canvas with the event id when generated', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-open-draw-MS'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/bracket-draw?event=MS'));
    // The footer action must not also bubble into the card-level click.
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('disables Open until the draw is generated', () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    renderDraws();
    expect(screen.getByTestId('bracket-open-draw-MS')).toBeDisabled();
  });

  it('opens the draw when the card itself is clicked once generated', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-card-MS'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/bracket-draw?event=MS'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('does not navigate on card click while the draw is draft', () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-card-MS'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
