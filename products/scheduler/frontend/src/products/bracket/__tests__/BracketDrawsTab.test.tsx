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
const mockEventPatch = vi.fn();
const mockEventNextRound = vi.fn();
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
    eventPatch: mockEventPatch,
    eventNextRound: mockEventNextRound,
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
  format?: string;
  config?: Record<string, unknown>;
  rounds?: string[][];
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
        format: overrides?.format ?? 'se',
        bracket_size: overrides?.bracketSize ?? 4,
        participant_count: overrides?.participantCount ?? 0,
        rounds: overrides?.rounds ?? [],
        status: overrides?.status ?? 'draft',
        ...(overrides?.config ? { config: overrides.config } : {}),
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
  mockEventPatch.mockReset();
  mockEventNextRound.mockReset();
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

describe('BracketDrawsTab — draw rows', () => {
  it('renders a row per draw with format, size, and entered meta', () => {
    mockBracketData = makeBracketData({ participantCount: 3, bracketSize: 8 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('Single elimination')).toBeInTheDocument();
    expect(within(row).getByText('3/8')).toBeInTheDocument();
  });

  it('groups draws under a discipline band', () => {
    renderDraws();
    expect(screen.getByTestId('bracket-draw-group-MS')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-draw-row-MS')).toBeInTheDocument();
  });

  it('colors the entered count as a warning while short of the target size', () => {
    mockBracketData = makeBracketData({ participantCount: 3, bracketSize: 8 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('3/8')).toHaveClass('text-status-warning');
  });

  it('renders the entered count muted once the draw is full', () => {
    mockBracketData = makeBracketData({ participantCount: 4, bracketSize: 4 });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).getByText('4/4')).not.toHaveClass('text-status-warning');
  });

  it('shows an empty state with a New draw action when there are no draws', () => {
    mockBracketData = { ...makeBracketData(), events: [] };
    renderDraws();
    expect(screen.getByText('No draws yet')).toBeInTheDocument();
  });

  it('shows the DONE/LIVE/READY/PENDING progress strip when the draw has matches', () => {
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
    const row = screen.getByTestId('bracket-draw-row-MS');
    // Sentence-case in the DOM, uppercased by StatusCount's CSS — the strip
    // reads DONE / LIVE / READY / PENDING on screen (X1: no second literal).
    expect(within(row).getByText('Done').parentElement).toHaveTextContent(/Done\s*1/);
    expect(within(row).getByText('Live').parentElement).toHaveTextContent(/Live\s*1/);
    expect(within(row).getByText('Ready').parentElement).toHaveTextContent(/Ready\s*1/);
    expect(within(row).getByText('Pending').parentElement).toHaveTextContent(/Pending\s*1/);
  });

  it('shows a placeholder instead of the strip while the draw has no matches', () => {
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(within(row).queryByText('Done')).not.toBeInTheDocument();
  });

  // D4 — PROGRESS was the row's flex-1 grower while Format was fixed-width,
  // so the four counters (~184px of content that cannot reflow) got whatever
  // was left: 104px at 1280 (colliding with the STATUS chip) and 904px at
  // full width. The counters now own a fixed column; Format grows and wraps.
  it('gives the progress counters a fixed column, not the row leftovers', () => {
    mockBracketData = makeBracketData({
      status: 'started',
      playUnits: [makePlayUnit('pu-1')],
      results: [
        { play_unit_id: 'pu-1', winner_side: 'A', walkover: false, finished_at_slot: null },
      ],
    });
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    const cell = within(row).getByText('Done').closest('[role="cell"]');
    // w-48, not w-52: the row's seven columns overran their ~950px budget and
    // the flex-1 Format column absorbed it by collapsing to zero. Progress
    // gave back 16px as part of re-budgeting the row. The PROPERTY under test
    // is unchanged - a fixed column rather than the leftovers - and
    // `bracketDrawsColumns.test.ts` now holds the total.
    expect(cell?.className).toContain('w-48');
    expect(cell?.className).not.toContain('flex-1');
    // Clipping a tally is the same crime as ellipsising a name.
    expect(cell?.className).not.toContain('overflow-hidden');
    // The header cell derives from the same column spec, so the two cannot
    // drift on a future priority change.
    expect(
      screen.getByRole('columnheader', { name: 'Progress' }).className,
    ).toContain('w-48');
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

  it('a started draw offers no generate-family action (the STARTED pill carries the state)', () => {
    // Intentional change (2026-07-15 polish audit): the raw "— (locked)"
    // action-cell text is gone — status lives in the pill, and the
    // Configuration page's hard-lock ribbon explains the why.
    mockBracketData = makeBracketData({ status: 'started' });
    renderDraws();
    expect(screen.getByText(/started/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate|Re-generate/i })).toBeNull();
    expect(screen.queryByText(/locked/i)).toBeNull();
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

describe('BracketDrawsTab — draw detail panel', () => {
  it('opens the panel on row click and closes on Escape', () => {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-row-MS'));
    expect(screen.getByTestId('draw-detail-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    // The dock retains the pane while its close-width transition runs;
    // completing the transition unmounts it.
    fireEvent.transitionEnd(screen.getByTestId('detail-dock'));
    expect(screen.queryByTestId('draw-detail-panel')).not.toBeInTheDocument();
  });

  it('commits singles picks from the panel via eventUpsert', async () => {
    mockBracketData = makeBracketData({ status: 'draft' });
    const next = { ...mockBracketData };
    mockEventUpsert.mockResolvedValue(next);
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-draw-row-MS'));
    const panel = screen.getByTestId('draw-detail-panel');
    const checkboxes = within(panel).getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(within(panel).getByRole('button', { name: /^Save participants$/i }));
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

  it('row action buttons do not open the panel', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-open-draw-MS'));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('draw-detail-panel')).not.toBeInTheDocument();
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

// The Discipline box was bare free text defaulting to the literal string
// "MS", while Meet's equivalent field is regex-validated, uppercased and
// length-capped. It now runs on Meet's own `validateEventCode`.
describe('BracketDrawsTab — draw identity validation', () => {
  function openNewDraw() {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    return screen.getByRole('dialog');
  }

  it('uppercases both the draw ID and the discipline', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw();
    fireEvent.change(within(dialog).getByPlaceholderText('MS'), {
      target: { value: ' ws ' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Discipline/i), {
      target: { value: 'wd' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'WS',
        expect.objectContaining({ discipline: 'WD' }),
      ),
    );
  });

  it('refuses a discipline carrying digits or spaces', () => {
    const dialog = openNewDraw();
    fireEvent.change(within(dialog).getByPlaceholderText('MS'), {
      target: { value: 'WS' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Discipline/i), {
      target: { value: 'W S1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/letters only/i);
    expect(mockEventUpsert).not.toHaveBeenCalled();
  });

  // An upsert onto an existing id REPLACES that draw, participants and all.
  it('refuses a draw ID that already exists', () => {
    const dialog = openNewDraw();
    fireEvent.change(within(dialog).getByPlaceholderText('MS'), {
      target: { value: 'ms' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/already a draw/i);
    expect(mockEventUpsert).not.toHaveBeenCalled();
  });

  // Dedupe belongs to the ID, never the discipline: MS1 and MS2 are both MS.
  it('lets a second draw share an existing discipline', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw();
    fireEvent.change(within(dialog).getByPlaceholderText('MS'), {
      target: { value: 'MS2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith(
        'MS2',
        expect.objectContaining({ discipline: 'MS' }),
      ),
    );
  });
});

describe('BracketDrawsTab — format picker card grid', () => {
  function openNewDraw(id: string) {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('MS'), { target: { value: id } });
    return dialog;
  }

  it('defaults to the single-elimination card selected', () => {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('format-card-se')).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByTestId('format-card-rr')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders unimplemented formats as disabled Planned roadmap cards', () => {
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-new-draw'));
    const dialog = screen.getByRole('dialog');
    for (const id of ['groups', 'ladder']) {
      const card = within(dialog).getByTestId(`format-card-${id}`);
      expect(card).toBeDisabled();
      expect(card).toHaveAttribute('aria-disabled', 'true');
    }
    expect(within(dialog).getAllByText('Planned')).toHaveLength(2);
  });

  it('picking de + toggling grand-final reset sends config.grand_final_reset', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw('MD');
    fireEvent.click(within(dialog).getByTestId('format-card-de'));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Grand final reset/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('MD', {
        discipline: 'MS',
        format: 'de',
        config: { grand_final_reset: true },
        duration_slots: 1,
        participants: [],
      }),
    );
  });

  it('picking monrad sends the consolation choice into config', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw('WS');
    fireEvent.click(within(dialog).getByTestId('format-card-monrad'));
    fireEvent.change(within(dialog).getByLabelText(/Consolation/i), {
      target: { value: 'plate' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('WS', {
        discipline: 'MS',
        format: 'monrad',
        config: { consolation: 'plate' },
        duration_slots: 1,
        participants: [],
      }),
    );
  });

  it('picking swiss sends the round count into config', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw('XD');
    fireEvent.click(within(dialog).getByTestId('format-card-swiss'));
    fireEvent.change(within(dialog).getByLabelText(/Swiss rounds/i), {
      target: { value: '5' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('XD', {
        discipline: 'MS',
        format: 'swiss',
        config: { swiss_rounds: 5 },
        duration_slots: 1,
        participants: [],
      }),
    );
  });

  it('column-target fields land as top-level body keys, not in config', async () => {
    mockEventUpsert.mockResolvedValue({ ...makeBracketData() });
    const dialog = openNewDraw('MX');
    fireEvent.change(within(dialog).getByLabelText(/Seeded players/i), {
      target: { value: '4' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Bracket size/i), {
      target: { value: '16' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create draw/i }));
    await vi.waitFor(() =>
      expect(mockEventUpsert).toHaveBeenCalledWith('MX', {
        discipline: 'MS',
        format: 'se',
        seeded_count: 4,
        bracket_size: 16,
        duration_slots: 1,
        participants: [],
      }),
    );
  });
});

describe('BracketDrawsTab — configure a draft draw', () => {
  it('opens the Configure layer prefilled and PATCHes via eventPatch', async () => {
    mockBracketData = makeBracketData({ status: 'draft', bracketSize: 4 });
    const next = { ...mockBracketData };
    mockEventPatch.mockResolvedValue(next);
    renderDraws();
    fireEvent.click(screen.getByTestId('bracket-configure-MS'));
    const dialog = screen.getByRole('dialog');
    // Prefilled from the event's persisted column echo.
    expect(within(dialog).getByLabelText(/Bracket size/i)).toHaveValue(4);
    fireEvent.change(within(dialog).getByLabelText(/Seeded players/i), {
      target: { value: '2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Save$/i }));
    await vi.waitFor(() =>
      expect(mockEventPatch).toHaveBeenCalledWith(
        'MS',
        expect.objectContaining({ seeded_count: 2, bracket_size: 4 }),
      ),
    );
    expect(mockSetData).toHaveBeenCalledWith(next);
  });

  it('offers Configure only while the draw is draft', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    expect(screen.queryByTestId('bracket-configure-MS')).not.toBeInTheDocument();
  });
});

describe('BracketDrawsTab — swiss progressive rows', () => {
  const swissData = (results: ResultDTO[]) =>
    makeBracketData({
      status: 'generated',
      format: 'swiss',
      config: { swiss_rounds: 3 },
      rounds: [['pu-1', 'pu-2']],
      playUnits: [makePlayUnit('pu-1'), makePlayUnit('pu-2', { match_index: 1 })],
      results,
    });

  it('shows Round k of K and generates the next round once results are in', async () => {
    mockBracketData = swissData([
      { play_unit_id: 'pu-1', winner_side: 'A', walkover: false, finished_at_slot: null },
      { play_unit_id: 'pu-2', winner_side: 'B', walkover: false, finished_at_slot: null },
    ]);
    const next = { ...mockBracketData };
    mockEventNextRound.mockResolvedValue(next);
    renderDraws();
    const row = screen.getByTestId('bracket-draw-row-MS');
    expect(row).toHaveTextContent(/Round\s*1\s*of\s*3/);
    const btn = within(row).getByTestId('bracket-next-round-MS');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await vi.waitFor(() => expect(mockEventNextRound).toHaveBeenCalledWith('MS'));
    expect(mockSetData).toHaveBeenCalledWith(next);
    // The quiet action must not bubble into the whole-card open-draw click.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables Next round while any match of the draw lacks a result', () => {
    mockBracketData = swissData([
      { play_unit_id: 'pu-1', winner_side: 'A', walkover: false, finished_at_slot: null },
    ]);
    renderDraws();
    expect(screen.getByTestId('bracket-next-round-MS')).toBeDisabled();
  });

  it('offers no Next round on non-swiss draws', () => {
    mockBracketData = makeBracketData({ status: 'generated' });
    renderDraws();
    expect(screen.queryByTestId('bracket-next-round-MS')).not.toBeInTheDocument();
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
});
