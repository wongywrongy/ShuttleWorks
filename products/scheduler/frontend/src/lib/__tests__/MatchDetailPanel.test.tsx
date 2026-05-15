import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchDetailPanel } from '../../features/bracket/MatchDetailPanel';
import { useUiStore } from '../../store/uiStore';
import type { BracketTournamentDTO } from '../../api/bracketDto';

// A.8 pattern — module-level mock so the hook doesn't throw
// "useBracketApi must be used inside a <BracketApiProvider>" when
// the component is rendered bare (no provider) in tests.
const mockMatchAction = vi.fn();
const mockRecordResult = vi.fn();

vi.mock('../../api/bracketClient', () => ({
  useBracketApi: () => ({
    matchAction: mockMatchAction,
    recordResult: mockRecordResult,
  }),
  BracketApiContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
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
});
