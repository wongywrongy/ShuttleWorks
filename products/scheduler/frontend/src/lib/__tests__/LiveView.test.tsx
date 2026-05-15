import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveView } from '../../features/bracket/LiveView';
import type { BracketTournamentDTO } from '../../api/bracketDto';

const EMPTY: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, events: [], participants: [],
  play_units: [], assignments: [], results: [],
};

const WITH_ONE_ASSIGNMENT: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, participants: [], results: [],
  events: [{ id: 'evt-1', discipline: 'Tennis', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' }],
  play_units: [{ id: 'pu-1', event_id: 'evt-1', round_index: 0, match_index: 0, side_a: null, side_b: null, duration_slots: 2, dependencies: [], slot_a: { participant_id: null, feeder_play_unit_id: null }, slot_b: { participant_id: null, feeder_play_unit_id: null } }],
  assignments: [{ play_unit_id: 'pu-1', slot_id: 0, court_id: 1, duration_slots: 2, actual_start_slot: null, actual_end_slot: null, started: false, finished: false }],
};

describe('LiveView', () => {
  it('renders empty-state CTA when no events are generated', () => {
    render(<LiveView data={EMPTY} onChange={() => {}} refresh={async () => {}} />);
    expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
  });

  it('renders play_unit chip when an assignment exists', () => {
    render(<LiveView data={WITH_ONE_ASSIGNMENT} onChange={() => {}} refresh={async () => {}} />);
    expect(screen.getByText('pu-1')).toBeInTheDocument();
  });
});
