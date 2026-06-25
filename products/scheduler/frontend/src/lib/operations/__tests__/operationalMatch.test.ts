/**
 * Unit tests for the Phase B cross-engine Operations view-model adapters.
 *
 * These pin the field-mapping contract so the (deferred) hybrid merge
 * can rely on a stable normalized shape. Both adapters must be pure —
 * the tests assert deterministic output with no clock dependency.
 */
import { describe, expect, it } from 'vitest';
import {
  bracketToOperational,
  meetMatchesToOperational,
} from '../operationalMatch';
import type { MatchDTO, MatchStateDTO, ScheduleDTO } from '../../../api/dto';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

// ---- Meet adapter ----------------------------------------------------------

describe('meetMatchesToOperational', () => {
  const names: Record<string, string> = {
    p1: 'Alice',
    p2: 'Bob',
    p3: 'Carol',
    p4: 'Dan',
  };

  const matches: MatchDTO[] = [
    { id: 'm1', sideA: ['p1'], sideB: ['p2'], durationSlots: 1 },
    { id: 'm2', sideA: ['p3', 'p4'], sideB: ['p1', 'p2'], durationSlots: 1 },
    { id: 'm3', sideA: ['p1'], sideB: ['p3'], durationSlots: 1 }, // unassigned/waiting
  ];

  const schedule: ScheduleDTO = {
    assignments: [
      { matchId: 'm1', slotId: 4, courtId: 2, durationSlots: 1 },
      { matchId: 'm2', slotId: 6, courtId: 1, durationSlots: 1 },
    ],
    unscheduledMatches: ['m3'],
    softViolations: [],
    objectiveScore: null,
    infeasibleReasons: [],
    status: 'optimal',
  };

  it('emits one row per match including unassigned (waiting) ones', () => {
    const rows = meetMatchesToOperational(matches, schedule, {}, names);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(['m1', 'm2', 'm3']);
    expect(rows.every((r) => r.source === 'meet')).toBe(true);
  });

  it('maps court/slot from the schedule assignment', () => {
    const rows = meetMatchesToOperational(matches, schedule, {}, names);
    expect(rows[0].courtLabel).toBe('C2');
    expect(rows[0].slot).toBe(4);
    expect(rows[1].courtLabel).toBe('C1');
    expect(rows[1].slot).toBe(6);
  });

  it('leaves court/slot undefined for unassigned matches', () => {
    const rows = meetMatchesToOperational(matches, schedule, {}, names);
    expect(rows[2].courtLabel).toBeUndefined();
    expect(rows[2].slot).toBeUndefined();
  });

  it('resolves side names (doubles joined with /) and falls back to id', () => {
    const rows = meetMatchesToOperational(matches, schedule, {}, names);
    expect(rows[0].sideA).toBe('Alice');
    expect(rows[0].sideB).toBe('Bob');
    expect(rows[1].sideA).toBe('Carol / Dan');
    // Unknown id falls back to the raw id.
    const unknown = meetMatchesToOperational(
      [{ id: 'mx', sideA: ['ghost'], sideB: [], durationSlots: 1 }],
      null,
      {},
      names,
    );
    expect(unknown[0].sideA).toBe('ghost');
    expect(unknown[0].sideB).toBe('TBD');
  });

  it('reads status + score from match state, defaulting to scheduled', () => {
    const states: Record<string, MatchStateDTO> = {
      m1: { matchId: 'm1', status: 'started', score: { sideA: 11, sideB: 7 } },
    };
    const rows = meetMatchesToOperational(matches, schedule, states, names);
    expect(rows[0].status).toBe('started');
    expect(rows[0].score).toEqual({ sideA: 11, sideB: 7 });
    // No state → scheduled, no score.
    expect(rows[1].status).toBe('scheduled');
    expect(rows[1].score).toBeUndefined();
  });

  it('honours the actualCourtId override over the scheduled court', () => {
    const states: Record<string, MatchStateDTO> = {
      m1: { matchId: 'm1', status: 'called', actualCourtId: 5 },
    };
    const rows = meetMatchesToOperational(matches, schedule, states, names);
    expect(rows[0].courtLabel).toBe('C5');
  });

  it('handles a null schedule (everything waiting)', () => {
    const rows = meetMatchesToOperational(matches, null, {}, names);
    expect(rows.every((r) => r.courtLabel === undefined && r.slot === undefined)).toBe(true);
  });
});

// ---- Bracket adapter -------------------------------------------------------

describe('bracketToOperational', () => {
  const data: BracketTournamentDTO = {
    courts: 2,
    total_slots: 20,
    rest_between_rounds: 1,
    interval_minutes: 15,
    start_time: null,
    events: [],
    participants: [
      { id: 'a', name: 'Team A' },
      { id: 'b', name: 'Team B' },
    ],
    play_units: [
      {
        id: 'pu1',
        event_id: 'e1',
        round_index: 0,
        match_index: 0,
        side_a: ['a'],
        side_b: ['b'],
        duration_slots: 1,
        dependencies: [],
        slot_a: { participant_id: 'a', feeder_play_unit_id: null },
        slot_b: { participant_id: 'b', feeder_play_unit_id: null },
      },
      {
        id: 'pu2',
        event_id: 'e1',
        round_index: 1,
        match_index: 0,
        side_a: null,
        side_b: null,
        duration_slots: 1,
        dependencies: ['pu1'],
        slot_a: { participant_id: null, feeder_play_unit_id: 'pu1' },
        slot_b: { participant_id: null, feeder_play_unit_id: null },
      },
    ],
    assignments: [
      {
        play_unit_id: 'pu1',
        slot_id: 3,
        court_id: 1,
        duration_slots: 1,
        actual_start_slot: 3,
        actual_end_slot: null,
        started: true,
        finished: false,
      },
    ],
    results: [],
  };

  it('emits one row per play-unit including waiting (unassigned) ones', () => {
    const rows = bracketToOperational(data);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(['pu1', 'pu2']);
    expect(rows.every((r) => r.source === 'bracket')).toBe(true);
  });

  it('maps court/slot from the assignment, undefined when unassigned', () => {
    const rows = bracketToOperational(data);
    expect(rows[0].courtLabel).toBe('C1');
    expect(rows[0].slot).toBe(3);
    expect(rows[1].courtLabel).toBeUndefined();
    expect(rows[1].slot).toBeUndefined();
  });

  it('resolves side names, with feeder / Bye labels for pending sides', () => {
    const rows = bracketToOperational(data);
    expect(rows[0].sideA).toBe('Team A');
    expect(rows[0].sideB).toBe('Team B');
    expect(rows[1].sideA).toBe('Winner of pu1');
    expect(rows[1].sideB).toBe('Bye');
  });

  it('derives started from actual_start_slot and never produces a score', () => {
    const rows = bracketToOperational(data);
    expect(rows[0].status).toBe('started');
    expect(rows[1].status).toBe('scheduled');
    expect(rows.every((r) => r.score === undefined)).toBe(true);
  });

  it('derives finished when a result exists (priority over started)', () => {
    const withResult: BracketTournamentDTO = {
      ...data,
      results: [
        { play_unit_id: 'pu1', winner_side: 'A', walkover: false, finished_at_slot: 4 },
      ],
    };
    const rows = bracketToOperational(withResult);
    expect(rows[0].status).toBe('finished');
  });
});
