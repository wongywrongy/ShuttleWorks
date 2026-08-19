import { describe, it, expect } from 'vitest';
import { liveMatches, sideLabel } from '../bracketDisplayData';
import type { BracketTournamentDTO } from '../../../../api/bracketDto';

export const data = {
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
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
  assignments: [
    {
      play_unit_id: 'u1',
      slot_id: 0,
      court_id: 2,
      duration_slots: 1,
      actual_start_slot: null,
      actual_end_slot: null,
      started: true,
      finished: false,
    },
  ],
  results: [],
  events: [],
  courts: 4,
  total_slots: 0,
  rest_between_rounds: 0,
  interval_minutes: 30,
  start_time: null,
} as unknown as BracketTournamentDTO;

/** A fresh draw: one match actually started, the rest of the round merely
 *  assigned to a court and slot. Two courts so the per-court lane rule shows. */
function draw(): BracketTournamentDTO {
  const unit = (id: string) => ({
    ...data.play_units[0],
    id,
    slot_a: { participant_id: 'p1', feeder_play_unit_id: null },
    slot_b: { participant_id: 'p2', feeder_play_unit_id: null },
  });
  const assign = (id: string, court: number, slot: number, started = false) => ({
    play_unit_id: id,
    slot_id: slot,
    court_id: court,
    duration_slots: 1,
    actual_start_slot: null,
    actual_end_slot: null,
    started,
    finished: false,
  });
  return {
    ...data,
    play_units: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(unit),
    assignments: [
      assign('u1', 1, 0, true), // on court now
      assign('u2', 1, 1), // next on court 1
      assign('u3', 1, 2), // later — not live
      assign('u4', 2, 0), // next on court 2 (nothing started there)
      assign('u5', 2, 1), // later — not live
      assign('u6', 2, 2), // later — not live
    ],
  } as unknown as BracketTournamentDTO;
}

describe('bracketDisplayData', () => {
  it('sideLabel resolves a slot participant id to its name', () => {
    expect(sideLabel(data.play_units[0], 'a', data.participants)).toBe('Alice');
    expect(sideLabel(data.play_units[0], 'b', data.participants)).toBe('Bob');
  });
  it('liveMatches lists on-court matches with court + sides', () => {
    const live = liveMatches(data);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ court: 2, sideA: 'Alice', sideB: 'Bob', status: 'on-court' });
  });

  // A whole unstarted draw used to render as "CALLED" — every assignment that
  // wasn't finished became a live card claiming to be calling to court.
  it('shows what is on court plus one imminent match per court, and nothing else', () => {
    const live = liveMatches(draw());
    expect(live.map((r) => [r.puId, r.status])).toEqual([
      ['u1', 'on-court'],
      ['u2', 'next'],
      ['u4', 'next'],
    ]);
  });

  it('never labels an unstarted match "called" — the bracket has no called state', () => {
    expect(liveMatches(draw()).some((r) => r.status === ('called' as string))).toBe(false);
  });
});
