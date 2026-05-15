import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleView } from '../../features/bracket/ScheduleView';
import type { BracketTournamentDTO } from '../../api/bracketDto';

const EMPTY: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, events: [], participants: [],
  play_units: [], assignments: [], results: [],
};

const WITH_TWO_ASSIGNMENTS: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, participants: [], results: [],
  events: [
    { id: 'evt-1', discipline: 'MS', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' },
    { id: 'evt-2', discipline: 'WS', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'started' },
  ],
  play_units: [
    { id: 'pu-1', event_id: 'evt-1', round_index: 0, match_index: 0, side_a: null, side_b: null, duration_slots: 2, dependencies: [], slot_a: { participant_id: null, feeder_play_unit_id: null }, slot_b: { participant_id: null, feeder_play_unit_id: null } },
    { id: 'pu-2', event_id: 'evt-2', round_index: 0, match_index: 0, side_a: null, side_b: null, duration_slots: 2, dependencies: [], slot_a: { participant_id: null, feeder_play_unit_id: null }, slot_b: { participant_id: null, feeder_play_unit_id: null } },
  ],
  assignments: [
    { play_unit_id: 'pu-1', slot_id: 0, court_id: 1, duration_slots: 2, actual_start_slot: null, actual_end_slot: null, started: false, finished: false },
    { play_unit_id: 'pu-2', slot_id: 2, court_id: 2, duration_slots: 2, actual_start_slot: null, actual_end_slot: null, started: false, finished: false },
  ],
};

describe('ScheduleView', () => {
  it('renders empty-state CTA when no assignments exist', () => {
    render(<ScheduleView data={EMPTY} />);
    expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
  });

  it('renders a chip for each assignment', () => {
    render(<ScheduleView data={WITH_TWO_ASSIGNMENTS} />);
    expect(screen.getByText('pu-1')).toBeInTheDocument();
    expect(screen.getByText('pu-2')).toBeInTheDocument();
  });

  it('aggregates placements from all events (not filtered by one event)', () => {
    render(<ScheduleView data={WITH_TWO_ASSIGNMENTS} />);
    // Both chips from different events are rendered
    const chips = screen.getAllByText(/^pu-/);
    expect(chips).toHaveLength(2);
  });

  it('chips are not interactive (no role=button)', () => {
    render(<ScheduleView data={WITH_TWO_ASSIGNMENTS} />);
    // display-only — no buttons in the gantt block area
    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });
});
