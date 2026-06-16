import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUiStore } from '../../store/uiStore';
import { BracketViewHeader } from '../../features/bracket/BracketViewHeader';
import type { BracketTournamentDTO, ScheduleNextOut } from '../../api/bracketDto';

// The header calls useBracketApi().scheduleNext(); the strip it renders
// for the live view (EventsFilterStrip) calls useBracket(). Mock both so
// no provider / network is needed. ``scheduleNextResult`` is swapped per
// test to drive the toast-branch logic.
let scheduleNextResult: ScheduleNextOut;
const scheduleNext = vi.fn(() => Promise.resolve(scheduleNextResult));

vi.mock('../../api/bracketClient', () => ({
  useBracketApi: () => ({
    scheduleNext,
    exportJsonUrl: () => '/j',
    exportCsvUrl: () => '/c',
    exportIcsUrl: () => '/i',
  }),
}));
vi.mock('../../hooks/useBracket', () => ({
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

function renderHeader() {
  return render(
    <BracketViewHeader
      view="live"
      data={FIXTURE}
      eventId="MS"
      onEventId={() => {}}
      onRefresh={() => Promise.resolve()}
    />,
  );
}

describe('BracketViewHeader — schedule-next toast', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] });
    scheduleNext.mockClear();
  });

  it('shows a warn (not success) toast when the solver returns infeasible with ready ids', async () => {
    // The backend returns the ready set in play_unit_ids even when the
    // solve fails — the toast must NOT claim those were scheduled.
    scheduleNextResult = {
      status: 'infeasible',
      play_unit_ids: ['F0'],
      started_at_current_slot: 0,
      runtime_ms: 1,
      infeasible_reasons: [],
    };
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Schedule next round/ }));

    await waitFor(() => expect(scheduleNext).toHaveBeenCalled());
    await waitFor(() => expect(useUiStore.getState().toasts.length).toBe(1));
    const toast = useUiStore.getState().toasts[0];
    expect(toast.level).toBe('warn');
    expect(toast.message).toMatch(/No matches could be scheduled/i);
  });

  it('shows a success toast when the solver returns optimal with scheduled ids', async () => {
    scheduleNextResult = {
      status: 'optimal',
      play_unit_ids: ['F0'],
      started_at_current_slot: 0,
      runtime_ms: 1,
      infeasible_reasons: [],
    };
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Schedule next round/ }));

    await waitFor(() => expect(useUiStore.getState().toasts.length).toBe(1));
    const toast = useUiStore.getState().toasts[0];
    expect(toast.level).toBe('success');
    expect(toast.message).toMatch(/Scheduled 1 match/i);
  });
});
