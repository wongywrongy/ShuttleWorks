import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveView } from '../../features/bracket/LiveView';
import { deriveChipState } from '../../features/bracket/LiveView';
import type { BracketTournamentDTO } from '../../api/bracketDto';

const EMPTY: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, events: [], participants: [],
  play_units: [], assignments: [], results: [],
};

const WITH_ONE_ASSIGNMENT: BracketTournamentDTO = {
  courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
  start_time: null, participants: [], results: [],
  events: [{ id: 'evt-1', discipline: 'MS', format: 'se', bracket_size: 2, participant_count: 2, rounds: [], status: 'generated' }],
  play_units: [{ id: 'pu-1', event_id: 'evt-1', round_index: 0, match_index: 0, side_a: null, side_b: null, duration_slots: 2, dependencies: [], slot_a: { participant_id: null, feeder_play_unit_id: null }, slot_b: { participant_id: null, feeder_play_unit_id: null } }],
  assignments: [{ play_unit_id: 'pu-1', slot_id: 0, court_id: 1, duration_slots: 2, actual_start_slot: null, actual_end_slot: null, started: false, finished: false }],
};

// Base DTO used by deriveChipState unit tests — starts clean (no result, no actual_start)
const BASE: BracketTournamentDTO = {
  courts: 2, total_slots: 16, rest_between_rounds: 1, interval_minutes: 15,
  start_time: null, events: [], participants: [],
  play_units: [{ id: 'pu-x', event_id: 'e1', round_index: 0, match_index: 0, side_a: null, side_b: null, duration_slots: 2, dependencies: [], slot_a: { participant_id: null, feeder_play_unit_id: null }, slot_b: { participant_id: null, feeder_play_unit_id: null } }],
  assignments: [{ play_unit_id: 'pu-x', slot_id: 4, court_id: 1, duration_slots: 2, actual_start_slot: null, actual_end_slot: null, started: false, finished: false }],
  results: [],
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

describe('deriveChipState', () => {
  it('returns "scheduled" when no result and no actual_start_slot and slot not past', () => {
    expect(deriveChipState('pu-x', BASE, 2)).toBe('scheduled');
  });

  it('returns "finished" when a result row exists for the play_unit', () => {
    const data: BracketTournamentDTO = {
      ...BASE,
      results: [{ play_unit_id: 'pu-x', winner_side: 'A', walkover: false, finished_at_slot: 6 }],
    };
    expect(deriveChipState('pu-x', data, 2)).toBe('finished');
  });

  it('returns "started" when actual_start_slot is set and no result', () => {
    const data: BracketTournamentDTO = {
      ...BASE,
      assignments: [{ play_unit_id: 'pu-x', slot_id: 4, court_id: 1, duration_slots: 2, actual_start_slot: 4, actual_end_slot: null, started: true, finished: false }],
    };
    expect(deriveChipState('pu-x', data, 5)).toBe('started');
  });

  it('returns "late" when currentSlot >= slot_id + 1 and no result, no actual_start', () => {
    // slot_id = 4, so late fires at currentSlot >= 5
    expect(deriveChipState('pu-x', BASE, 5)).toBe('late');
    expect(deriveChipState('pu-x', BASE, 10)).toBe('late');
  });

  it('returns "scheduled" (not late) when currentSlot < slot_id + 1', () => {
    expect(deriveChipState('pu-x', BASE, 4)).toBe('scheduled');
  });
});
