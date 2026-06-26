import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BracketDrawsTab } from '../BracketDrawsTab';
import { useTournamentStore } from '../../../store/tournamentStore';

// The Draws surface is the unified create + manage + open surface (it
// absorbed the former Events spreadsheet). These tests cover the ported
// management behaviors plus the new create-in-a-layer and open-draw flows.

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

describe('BracketDrawsTab — spreadsheet', () => {
  it('renders the column headers', () => {
    renderDraws();
    for (const col of ['ID', 'Discipline', 'Format', 'Size', 'Participants', 'Status', 'Action', 'Open']) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
  });

  it('renders a row for each event', () => {
    renderDraws();
    expect(screen.getAllByText('MS').length).toBeGreaterThan(0);
    expect(screen.getByText('Single elimination')).toBeInTheDocument();
  });

  it('shows an empty state with a New draw action when there are no draws', () => {
    mockBracketData = { ...makeBracketData(), events: [] };
    renderDraws();
    expect(screen.getByText('No draws yet')).toBeInTheDocument();
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
  });

  it('disables Open until the draw is generated', () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    renderDraws();
    expect(screen.getByTestId('bracket-open-draw-MS')).toBeDisabled();
  });
});
