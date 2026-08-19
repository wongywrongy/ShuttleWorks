import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketDrawView } from '../BracketDrawView';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

const eventData = {
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  events: [
    {
      id: 'e1',
      discipline: "Men's Singles",
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [['u1']],
      status: 'started',
    },
  ],
  play_units: [
    {
      id: 'u1',
      event_id: 'e1',
      round_index: 0,
      match_index: 0,
      side_a: null,
      side_b: null,
      slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
      duration_slots: 1,
      dependencies: [],
    },
  ],
  results: [{ play_unit_id: 'u1', winner_side: 'A', walkover: false, finished_at_slot: 3 }],
  assignments: [],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
} as unknown as BracketTournamentDTO;

describe('BracketDrawView', () => {
  it('renders the event rounds with the matchup sides and marks the winner', () => {
    render(<BracketDrawView data={eventData} eventId="e1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByTestId('draw-winner')).toHaveTextContent('Alice');
  });

  it('shows an empty state when the event has no generated rounds', () => {
    const noRounds = {
      ...eventData,
      events: [{ ...eventData.events[0], rounds: [] }],
    } as unknown as BracketTournamentDTO;
    render(<BracketDrawView data={noRounds} eventId="e1" />);
    expect(screen.getByTestId('bracket-draw-empty')).toBeInTheDocument();
  });
});
