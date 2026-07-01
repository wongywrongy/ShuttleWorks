import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MatchDetailPanel } from '../MatchDetailPanel';
import { useUiStore } from '../../../store/uiStore';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// A.8 pattern — module-level mock so the hook doesn't throw
// "useBracketApi must be used inside a <BracketApiProvider>" when
// the component is rendered bare (no provider) in tests.
const mockMatchAction = vi.fn();
const mockRecordResult = vi.fn();

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    matchAction: mockMatchAction,
    recordResult: mockRecordResult,
  }),
  BracketApiContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

// SP-F3 — result writes route through the bracket result queue. Mock the hook
// to capture the submitted result input (the queue's IndexedDB + version
// optimistic-concurrency plumbing is covered by its own unit tests).
const mockSubmitResult = vi.fn();
vi.mock('../../../hooks/useBracketResultQueue', () => ({
  useBracketResultQueue: () => ({ submit: mockSubmitResult }),
}));

const EMPTY_DATA: BracketTournamentDTO = {
  courts: 2,
  total_slots: 16,
  rest_between_rounds: 1,
  interval_minutes: 15,
  start_time: null,
  events: [],
  participants: [],
  play_units: [],
  assignments: [],
  results: [],
};

const DATA_WITH_MATCH: BracketTournamentDTO = {
  courts: 2,
  total_slots: 16,
  rest_between_rounds: 1,
  interval_minutes: 15,
  start_time: null,
  events: [
    { id: 'evt-1', discipline: 'MS', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' },
  ],
  participants: [
    { id: 'p-a', name: 'Alice' },
    { id: 'p-b', name: 'Bob' },
  ],
  play_units: [
    {
      id: 'pu-1',
      event_id: 'evt-1',
      round_index: 0,
      match_index: 0,
      side_a: ['p-a'],
      side_b: ['p-b'],
      duration_slots: 2,
      dependencies: [],
      slot_a: { participant_id: 'p-a', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p-b', feeder_play_unit_id: null },
    },
  ],
  assignments: [
    {
      play_unit_id: 'pu-1',
      slot_id: 4,
      court_id: 1,
      duration_slots: 2,
      actual_start_slot: null,
      actual_end_slot: null,
      started: false,
      finished: false,
    },
  ],
  results: [],
};

beforeEach(() => {
  mockMatchAction.mockReset();
  mockRecordResult.mockReset();
  mockSubmitResult.mockReset();
  useUiStore.setState({ bracketSelectedMatchId: null });
});

describe('MatchDetailPanel', () => {
  it('renders empty state when no match selected', () => {
    useUiStore.setState({ bracketSelectedMatchId: null });
    render(<MatchDetailPanel data={EMPTY_DATA} onChange={() => {}} />);
    expect(screen.getByText(/Select a match/i)).toBeInTheDocument();
  });

  it('renders match not found when selected id has no matching play_unit', () => {
    useUiStore.setState({ bracketSelectedMatchId: 'pu-missing' });
    render(<MatchDetailPanel data={EMPTY_DATA} onChange={() => {}} />);
    expect(screen.getByText(/Match not found/i)).toBeInTheDocument();
  });

  it('populates panel with match details on chip click (via bracketSelectedMatchId)', () => {
    useUiStore.setState({ bracketSelectedMatchId: 'pu-1' });
    render(<MatchDetailPanel data={DATA_WITH_MATCH} onChange={() => {}} />);
    // play unit id shown as panel heading
    expect(screen.getByText('pu-1')).toBeInTheDocument();
    // participant names appear
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows Start button when assignment exists and not yet started', () => {
    useUiStore.setState({ bracketSelectedMatchId: 'pu-1' });
    render(<MatchDetailPanel data={DATA_WITH_MATCH} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
  });

  it('calls matchAction with action=start when Start is clicked', async () => {
    mockMatchAction.mockResolvedValue(DATA_WITH_MATCH);
    useUiStore.setState({ bracketSelectedMatchId: 'pu-1' });
    const onChange = vi.fn();
    render(<MatchDetailPanel data={DATA_WITH_MATCH} onChange={onChange} />);
    const startBtn = screen.getByRole('button', { name: /Start/i });
    startBtn.click();
    await vi.waitFor(() =>
      expect(mockMatchAction).toHaveBeenCalledWith({ play_unit_id: 'pu-1', action: 'start' }),
    );
    expect(onChange).toHaveBeenCalledWith(DATA_WITH_MATCH);
  });

  // SP-E4 — Sets mode captures a set-by-set score into BracketResult.score.
  // SP-F3 — the result is enqueued through the queue, not posted directly.
  it('records winner + score JSON in Sets mode (started match)', async () => {
    // Engine in Sets (badminton) mode, best of 3.
    useTournamentStore.setState({
      config: {
        intervalMinutes: 30,
        dayStart: '09:00',
        dayEnd: '18:00',
        courtCount: 2,
        breaks: [],
        defaultRestMinutes: 0,
        freezeHorizonSlots: 0,
        scoringFormat: 'badminton',
        setsToWin: 2,
        pointsPerSet: 21,
        deuceEnabled: true,
      },
    });
    const startedData: BracketTournamentDTO = {
      ...DATA_WITH_MATCH,
      assignments: [{ ...DATA_WITH_MATCH.assignments[0], started: true }],
    };
    useUiStore.setState({ bracketSelectedMatchId: 'pu-1' });
    render(<MatchDetailPanel data={startedData} onChange={vi.fn()} />);

    // Sets-mode score entry, not the plain win buttons.
    expect(screen.getByTestId('bracket-score-entry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alice wins/i })).toBeNull();

    fireEvent.change(screen.getByLabelText('Set 1 Alice score'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Set 1 Bob score'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Set 2 Alice score'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Set 2 Bob score'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Record result/i }));

    await waitFor(() => expect(mockSubmitResult).toHaveBeenCalled());
    expect(mockSubmitResult).toHaveBeenCalledWith({
      matchId: 'pu-1',
      winnerSide: 'A',
      seenVersion: 1,
      finishedAtSlot: 6,
      score: { sets: [{ sideA: 21, sideB: 18 }, { sideA: 21, sideB: 15 }] },
    });
  });

  it('keeps plain win buttons in Simple mode (started match)', () => {
    useTournamentStore.setState({
      config: {
        intervalMinutes: 30,
        dayStart: '09:00',
        dayEnd: '18:00',
        courtCount: 2,
        breaks: [],
        defaultRestMinutes: 0,
        freezeHorizonSlots: 0,
        scoringFormat: 'simple',
      },
    });
    const startedData: BracketTournamentDTO = {
      ...DATA_WITH_MATCH,
      assignments: [{ ...DATA_WITH_MATCH.assignments[0], started: true }],
    };
    useUiStore.setState({ bracketSelectedMatchId: 'pu-1' });
    render(<MatchDetailPanel data={startedData} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Alice wins/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bob wins/i })).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-score-entry')).toBeNull();
  });
});
