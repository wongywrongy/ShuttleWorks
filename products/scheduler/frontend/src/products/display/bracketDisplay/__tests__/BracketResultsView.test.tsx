import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketResultsView } from '../BracketResultsView';
import { eventChampion } from '../bracketDisplayData';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

const decided = {
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

const undecided = { ...decided, results: [] } as unknown as BracketTournamentDTO;

describe('eventChampion', () => {
  it('returns the winner of the final round when decided', () => {
    expect(eventChampion(decided, 'e1')).toBe('Alice');
  });
  it('returns null when undecided', () => {
    expect(eventChampion(undecided, 'e1')).toBeNull();
  });
});

describe('BracketResultsView', () => {
  it('shows the champion when an event is decided', () => {
    render(<BracketResultsView data={decided} />);
    expect(screen.getByTestId('champion-e1')).toHaveTextContent('Alice');
  });
  it('shows an empty state when there are no results', () => {
    render(<BracketResultsView data={undecided} />);
    expect(screen.getByTestId('bracket-results-empty')).toBeInTheDocument();
  });
});
