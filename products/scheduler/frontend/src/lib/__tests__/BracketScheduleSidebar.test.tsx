/**
 * Tests for BracketScheduleSidebar — right-rail details pane keyed
 * off selectedId. Renders play unit metadata + sides + state badge.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketScheduleSidebar } from '../../features/bracket/BracketScheduleSidebar';
import type { BracketTournamentDTO } from '../../api/bracketDto';

function makeData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 4,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: '09:00',
    events: [{
      id: 'MS-1', discipline: 'MS', format: 'se',
      bracket_size: 2, participant_count: 2, rounds: [], status: 'generated',
    }],
    participants: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    play_units: [{
      id: 'pu1', event_id: 'MS-1', round_index: 0, match_index: 0,
      side_a: ['p1'], side_b: ['p2'], duration_slots: 1, dependencies: [],
      slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
      slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
    }],
    assignments: [{
      play_unit_id: 'pu1', slot_id: 0, court_id: 1, duration_slots: 1,
      actual_start_slot: null, actual_end_slot: null, started: false, finished: false,
    }],
    results: [],
  };
}

describe('<BracketScheduleSidebar />', () => {
  it('renders the empty hint when selectedId is null', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId={null} />);
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });

  it('renders the empty hint when selectedId does not resolve', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="stale-id" />);
    expect(screen.getByText(/click a match to see details/i)).toBeInTheDocument();
  });

  it('renders discipline + round + match + court + slot when a play unit is selected', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/MS/i)).toBeInTheDocument();
    expect(screen.getByText(/R1 M1/i)).toBeInTheDocument();
    expect(screen.getByText(/C1/i)).toBeInTheDocument();
    expect(screen.getByText(/09:00/i)).toBeInTheDocument();
  });

  it('renders the side rosters', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/Alice/i)).toBeInTheDocument();
    expect(screen.getByText(/Bob/i)).toBeInTheDocument();
  });

  it('renders "TBD" for null sides', () => {
    const data = makeData();
    data.play_units[0].side_a = null;
    render(<BracketScheduleSidebar data={data} selectedId="pu1" />);
    expect(screen.getAllByText(/TBD/i).length).toBeGreaterThan(0);
  });

  it('renders a "Ready" state badge when no result exists', () => {
    render(<BracketScheduleSidebar data={makeData()} selectedId="pu1" />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it('renders "Winner: Side A" when a winner result exists', () => {
    const data = makeData();
    data.results = [{ play_unit_id: 'pu1', winner_side: 'A', walkover: false, finished_at_slot: 0 }];
    render(<BracketScheduleSidebar data={data} selectedId="pu1" />);
    expect(screen.getByText(/winner: side a/i)).toBeInTheDocument();
  });
});
