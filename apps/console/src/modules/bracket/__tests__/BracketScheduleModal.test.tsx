import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useUiStore } from '../../../store/uiStore';
import { BracketScheduleModal } from '../BracketScheduleModal';
import type {
  BracketTournamentDTO,
  ScheduleNextOut,
} from '../../../api/bracketDto';

// BracketScheduleModal streams the solve via
// api.scheduleNextWithProgress() and commits a chosen candidate via
// commitRound(). It used to be exercised through the retired bracket
// live-view header (SP-CONSOLE-4 B4) — the modal is now hosted by the
// Operations Plan toolbar, so this drives it directly. ``streamResult``
// is swapped per test to drive the candidate-vs-no-result branches.
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

// Structural stand-in for the BracketApi surface the modal touches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = { scheduleNextWithProgress, commitRound } as any;

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

function renderModal(onCommitted: () => Promise<void> = () => Promise.resolve()) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/schedule']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={
            <BracketScheduleModal api={api} onClose={() => {}} onCommitted={onCommitted} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BracketScheduleModal — streaming schedule-next', () => {
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

    const onCommitted = vi.fn(() => Promise.resolve());
    renderModal(onCommitted);

    // The stream runs on mount, with the progress callbacks.
    await waitFor(() => expect(scheduleNextWithProgress).toHaveBeenCalled());

    // Candidates surface for selection.
    const candidate = await screen.findByRole('button', { name: /Option 1/ });
    expect(screen.getByText(/2 schedule options/i)).toBeInTheDocument();

    fireEvent.click(candidate);

    await waitFor(() =>
      expect(commitRound).toHaveBeenCalledWith({
        assignments: [
          { play_unit_id: 'F0', slot_id: 0, court_id: 0, duration_slots: 1 },
        ],
      }),
    );
    await waitFor(() => expect(onCommitted).toHaveBeenCalled());
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

    renderModal();

    await waitFor(() => expect(useUiStore.getState().toasts.length).toBe(1));
    const toast = useUiStore.getState().toasts[0];
    expect(toast.level).toBe('warn');
    expect(toast.message).toMatch(/No matches could be scheduled/i);
    expect(commitRound).not.toHaveBeenCalled();
  });
});
