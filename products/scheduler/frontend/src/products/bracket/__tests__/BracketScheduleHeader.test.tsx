/**
 * Tests for BracketScheduleHeader — the count strip above the bracket
 * Schedule grid. Exports moved to the per-view header (Schedule) and
 * Setup → Tournament data, so this strip renders the play-unit count
 * summary only.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketScheduleHeader } from '../BracketScheduleHeader';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

function makeData(assignments: number, courts: number): BracketTournamentDTO {
  return {
    courts,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [],
    participants: [],
    play_units: [],
    assignments: Array.from({ length: assignments }, (_, i) => ({
      play_unit_id: `pu${i}`, slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    })),
    results: [],
  };
}

describe('<BracketScheduleHeader />', () => {
  it('renders the empty-bracket count', () => {
    render(<BracketScheduleHeader data={makeData(0, 4)} />);
    expect(screen.getByText(/0 play units scheduled across 4 courts/i)).toBeInTheDocument();
  });

  it('renders the populated count', () => {
    render(<BracketScheduleHeader data={makeData(8, 4)} />);
    expect(screen.getByText(/8 play units scheduled across 4 courts/i)).toBeInTheDocument();
  });

  it('renders no export links — exports live in the view header and Setup', () => {
    render(<BracketScheduleHeader data={makeData(8, 4)} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
