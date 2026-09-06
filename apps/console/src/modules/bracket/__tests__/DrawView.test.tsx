import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DrawView } from '../DrawView';
import type { TournamentDTO } from '../../../api/bracketDto';

vi.mock('../../../api/bracketClient', () => ({
  useBracketApi: () => ({
    recordResult: vi.fn(),
  }),
}));

/** DrawView reads the tournament id from the route and navigates to
 *  bracket-draws from its empty state, so mount it under a matching
 *  /tournaments/:id route. */
function renderDrawView(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t-1/bracket-draw']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

const NO_DRAW: TournamentDTO = {
  courts: 2,
  total_slots: 64,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  events: [
    {
      id: 'MS',
      discipline: 'MS',
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [],
      status: 'draft',
    },
  ],
  participants: [
    { id: 'p1', name: 'Player One' },
    { id: 'p2', name: 'Player Two' },
  ],
  play_units: [],
  assignments: [],
  results: [],
};

const GENERATED_DRAW: TournamentDTO = {
  ...NO_DRAW,
  events: [{ ...NO_DRAW.events[0], status: 'generated', rounds: [['m1', 'm2'], ['m3']] }],
  participants: [
    { id: 'p1', name: 'Player One' },
    { id: 'p2', name: 'Player Two' },
    { id: 'p3', name: 'Player Three' },
    { id: 'p4', name: 'Player Four' },
  ],
  play_units: [
    { id: 'm1', event_id: 'MS', round_index: 0, match_index: 0, side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p1', feeder_play_unit_id: null }, slot_b: { participant_id: 'p2', feeder_play_unit_id: null } },
    { id: 'm2', event_id: 'MS', round_index: 0, match_index: 1, side_a: ['p3'], side_b: ['p4'], duration_slots: 1, dependencies: [], slot_a: { participant_id: 'p3', feeder_play_unit_id: null }, slot_b: { participant_id: 'p4', feeder_play_unit_id: null } },
    { id: 'm3', event_id: 'MS', round_index: 1, match_index: 0, side_a: null, side_b: null, duration_slots: 1, dependencies: ['m1', 'm2'], slot_a: { participant_id: null, feeder_play_unit_id: 'm1' }, slot_b: { participant_id: null, feeder_play_unit_id: 'm2' } },
  ],
};

const SCHEDULED_DRAW: TournamentDTO = {
  ...GENERATED_DRAW,
  start_time: '09:00',
  interval_minutes: 30,
  assignments: [
    {
      play_unit_id: 'm1',
      slot_id: 2,
      court_id: 5,
      duration_slots: 1,
      actual_start_slot: null,
      actual_end_slot: null,
      started: false,
      finished: false,
    },
  ],
};

describe('DrawView', () => {
  it('never shows the raw slot index on a draw card (V3-OC16.1)', () => {
    renderDrawView(<DrawView data={SCHEDULED_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    // "slot 52 · court 5" is replaced by a real time + court; the reference
    // (m1's identity chip) stays as the secondary label.
    expect(screen.queryByText(/slot \d+/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/10:00 · Court 5/).length).toBeGreaterThan(0);
    // m3 has no assignment at all — "Not scheduled", never "–".
    expect(screen.getAllByText('Not scheduled').length).toBeGreaterThan(0);
  });


  it('renders a composed empty state when the selected event has no generated draw', () => {
    renderDrawView(<DrawView data={NO_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByRole('heading', { name: 'No draw generated' })).toBeInTheDocument();
    expect(screen.getByText(/Open Draws, enter participants for this event, then generate the draw/i)).toBeInTheDocument();
    // The empty state routes back to the unified Draws surface.
    expect(screen.getByRole('button', { name: 'Open Draws' })).toBeInTheDocument();
  });

  it('provides a mobile round inspector with explicit navigation and player search', () => {
    renderDrawView(<DrawView data={GENERATED_DRAW} eventId="MS" onChange={vi.fn()} refresh={async () => {}} />);

    expect(screen.getByTestId('mobile-round-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous round' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next round' })).toBeEnabled();
    expect(screen.getByLabelText('Find a player')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-round-card-m1')).toHaveTextContent('Player One');
    expect(screen.getByTestId('mobile-round-card-m2')).toHaveTextContent('Player Four');
    expect(screen.getByText('Draw checks')).toBeInTheDocument();
  });
});
