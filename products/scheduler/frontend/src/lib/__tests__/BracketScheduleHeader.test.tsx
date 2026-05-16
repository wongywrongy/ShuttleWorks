/**
 * Tests for BracketScheduleHeader — the controls strip above the
 * bracket Schedule grid. Renders the play-unit count summary and
 * three Export buttons (JSON / CSV / ICS) linked to the api-client
 * URL builders.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketScheduleHeader } from '../../features/bracket/BracketScheduleHeader';
import type { BracketTournamentDTO } from '../../api/bracketDto';

// Mock useTournamentId so the header sees a stable tid in the test.
vi.mock('../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));

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

  it('renders three Export buttons with the correct hrefs', () => {
    render(<BracketScheduleHeader data={makeData(8, 4)} />);
    const json = screen.getByRole('link', { name: /export json/i });
    const csv = screen.getByRole('link', { name: /export csv/i });
    const ics = screen.getByRole('link', { name: /export ics/i });
    expect(json.getAttribute('href')).toMatch(/\/t1\/.*\.json/i);
    expect(csv.getAttribute('href')).toMatch(/\/t1\/.*\.csv/i);
    expect(ics.getAttribute('href')).toMatch(/\/t1\/.*\.ics/i);
  });
});
