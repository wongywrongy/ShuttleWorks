import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useUiStore } from '../../../store/uiStore';
import { BracketViewHeader } from '../BracketViewHeader';
import type {
  BracketTournamentDTO,
  ScheduleNextOut,
} from '../../../api/bracketDto';

// The header opens BracketScheduleModal, which streams the solve via
// useBracketApi().scheduleNextWithProgress() and commits a chosen
// candidate via commitRound(). The strip it renders for the live view
// (EventsFilterStrip) calls useBracket(). Mock both so no provider /
// network is needed. ``streamResult`` is swapped per test to drive the
// candidate-vs-no-result branches.
let streamResult: ScheduleNextOut;
const scheduleNextWithProgress = vi.fn(
  (callbacks: {
    onModelBuilt?: (e: { numMatches: number }) => void;
    onProgress?: (e: { solution_count: number; elapsed_ms: number }) => void;
    onPhase?: (e: { phase: string }) => void;
  }) => {
    // Drive the same callback shape a real SSE stream would.
    callbacks.onModelBuilt?.({ numMatches: 1 });
    callbacks.onPhase?.({ phase: 'search' });
    callbacks.onProgress?.({ solution_count: 1, elapsed_ms: 12 });
    return Promise.resolve(streamResult);
  },
);
const commitRound = vi.fn(() => Promise.resolve(FIXTURE));

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    scheduleNextWithProgress,
    commitRound,
    exportJsonUrl: () => '/j',
    exportCsvUrl: () => '/c',
    exportIcsUrl: () => '/i',
  }),
}));
vi.mock('../../../hooks/useBracket', () => ({
  useBracket: () => ({ data: FIXTURE }),
}));

// One ready-to-schedule play unit (sides set, no assignment, no result,
// no deps) so the "Schedule next round" button renders.
const FIXTURE: BracketTournamentDTO = {
  courts: 2,
  total_slots: 32,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  participants: [],
  results: [],
  events: [
    { id: 'MS', discipline: 'MS', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' },
  ],
  play_units: [
    {
      id: 'F0', event_id: 'MS', round_index: 0, match_index: 0,
      side_a: ['P1'], side_b: ['P2'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: 'P1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'P2', feeder_play_unit_id: null },
    },
  ],
  assignments: [],
};

function renderHeader(onRefresh: () => Promise<void> = () => Promise.resolve()) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-live']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <BracketViewHeader
              view="live"
              data={FIXTURE}
              eventId="MS"
              onEventId={() => {}}
              onRefresh={onRefresh}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BracketViewHeader — streaming schedule-next', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] });
    scheduleNextWithProgress.mockClear();
    commitRound.mockClear();
  });

  it('streams a solve, presents candidates, and commits the selected one', async () => {
    streamResult = {
      status: 'optimal',
      play_unit_ids: ['F0'],
      started_at_current_slot: 0,
      runtime_ms: 1,
      infeasible_reasons: [],
      candidates: [
        {
          solution_id: 's1',
          objective_score: 10,
          found_at_seconds: 0.2,
          assignments: [
            { play_unit_id: 'F0', slot_id: 0, court_id: 0, duration_slots: 1 },
          ],
        },
        {
          solution_id: 's2',
          objective_score: 12,
          found_at_seconds: 0.4,
          assignments: [
            { play_unit_id: 'F0', slot_id: 1, court_id: 0, duration_slots: 1 },
          ],
        },
      ],
    };

    const onRefresh = vi.fn(() => Promise.resolve());
    renderHeader(onRefresh);
    fireEvent.click(screen.getByRole('button', { name: /Schedule next round/ }));

    // The stream ran with the progress callbacks.
    await waitFor(() => expect(scheduleNextWithProgress).toHaveBeenCalled());

    // Candidates surface for selection.
    const candidate = await screen.findByRole('button', { name: /Candidate #1/ });
    expect(screen.getByText(/2 candidates/i)).toBeInTheDocument();

    fireEvent.click(candidate);

    await waitFor(() =>
      expect(commitRound).toHaveBeenCalledWith({
        assignments: [
          { play_unit_id: 'F0', slot_id: 0, court_id: 0, duration_slots: 1 },
        ],
      }),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const toast = useUiStore.getState().toasts.at(-1)!;
    expect(toast.level).toBe('success');
    expect(toast.message).toMatch(/Scheduled 1 match/i);
  });

  it('shows a warn toast and no candidates when the solve is infeasible', async () => {
    streamResult = {
      status: 'infeasible',
      play_unit_ids: ['F0'],
      started_at_current_slot: 0,
      runtime_ms: 1,
      infeasible_reasons: [],
      candidates: [],
    };

    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Schedule next round/ }));

    await waitFor(() => expect(useUiStore.getState().toasts.length).toBe(1));
    const toast = useUiStore.getState().toasts[0];
    expect(toast.level).toBe('warn');
    expect(toast.message).toMatch(/No matches could be scheduled/i);
    expect(commitRound).not.toHaveBeenCalled();
  });
});
