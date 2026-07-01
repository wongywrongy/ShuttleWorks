import { describe, it, expect } from 'vitest';
import { computeConstraintViolations } from '../constraintChecker';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  TournamentConfig,
  ConstraintViolation,
} from '../../api/dto';

/**
 * Characterization / safety-net tests for constraintChecker.
 *
 * The module exposes exactly one public function — `computeConstraintViolations`
 * — which runs three internal checks (player overlap, rest window, court
 * capacity) and concatenates their results in that fixed order. These tests lock
 * in the CURRENT behavior (including descriptions, severities, and known
 * adjacency limitations) so the module can be refactored safely.
 */

// ── Minimal fixture builders ───────────────────────────────────────────────

/** Minimal valid MatchDTO — callers spread overrides on top. */
const match = (o: Partial<MatchDTO> & { id: string }): MatchDTO => ({
  sideA: [],
  sideB: [],
  durationSlots: 1,
  ...o,
});

/** ScheduleAssignment builder. Note: the checker reads duration from the
 *  assignment (`durationSlots`), NOT from the match. */
const assign = (
  matchId: string,
  slotId: number,
  courtId: number,
  durationSlots = 1
): ScheduleAssignment => ({ matchId, slotId, courtId, durationSlots });

/** Minimal valid PlayerDTO. */
const player = (id: string, minRestMinutes?: number | null): PlayerDTO => ({
  id,
  name: id,
  groupId: 'g',
  availability: [],
  minRestMinutes,
});

/** The checker only reads `intervalMinutes` and `defaultRestMinutes`. */
const cfg = (overrides: Partial<TournamentConfig> = {}): TournamentConfig =>
  ({ intervalMinutes: 30, defaultRestMinutes: 60, ...overrides } as TournamentConfig);

const typesOf = (vs: ConstraintViolation[]) => vs.map((v) => v.type);

// ── Empty / no-violation baselines ─────────────────────────────────────────

describe('computeConstraintViolations — baselines', () => {
  it('returns [] for empty assignments', () => {
    expect(computeConstraintViolations([], [], [], cfg())).toEqual([]);
  });

  it('returns [] for a single isolated match', () => {
    const matches = [match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] })];
    const result = computeConstraintViolations(
      [assign('m1', 0, 1, 2)],
      matches,
      [player('p1'), player('p2')],
      cfg()
    );
    expect(result).toEqual([]);
  });

  it('returns [] when matches are well separated (distinct players, courts, rested)', () => {
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p3'], sideB: ['p4'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 10, 2, 2)];
    const players = [player('p1'), player('p2'), player('p3'), player('p4')];
    expect(computeConstraintViolations(assignments, matches, players, cfg())).toEqual([]);
  });

  it('skips assignments that reference a match not present in the matches list', () => {
    // No matching MatchDTO → `if (!match) continue` short-circuits every check.
    const result = computeConstraintViolations(
      [assign('ghost', 0, 1, 5), assign('ghost2', 0, 1, 5)],
      [],
      [],
      cfg()
    );
    expect(result).toEqual([]);
  });
});

// ── Player overlap (hard) ──────────────────────────────────────────────────

describe('computeConstraintViolations — player overlap', () => {
  it('flags a player double-booked across overlapping slots', () => {
    // p1 plays m1 [0,2) and m2 [1,3): 2 > 1 → overlap. Different courts so
    // court-capacity stays quiet; gap is negative so rest stays quiet.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 1, 2, 2)];
    const players = [player('p1'), player('p2'), player('p3')];

    const result = computeConstraintViolations(assignments, matches, players, cfg());
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'overlap',
      severity: 'hard',
      playerIds: ['p1'],
      matchIds: ['m1', 'm2'],
      description: 'Player overlap in M1 and M2',
    });
  });

  it('does NOT flag overlap when slots merely touch (end === next start)', () => {
    // m1 [0,2), m2 starts at 2 → 2 > 2 is false. Boundary is exclusive.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 2, 2, 1)];
    const players = [player('p1'), player('p2'), player('p3')];

    // defaultRestMinutes 0 → restSlots 0 → no rest violation either.
    const result = computeConstraintViolations(
      assignments,
      matches,
      players,
      cfg({ defaultRestMinutes: 0 })
    );
    expect(result).toEqual([]);
  });

  it('detects overlap for a player listed on sideC (tri-meet)', () => {
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['a'], sideB: ['b'], sideC: ['pc'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['pc'], sideB: ['d'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 1, 2, 2)];
    const players = [player('pc')];

    const result = computeConstraintViolations(assignments, matches, players, cfg());
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('overlap');
    expect(result[0].playerIds).toEqual(['pc']);
  });

  it('uses eventRank in the description when matchNumber is absent', () => {
    const matches = [
      match({ id: 'm1', eventRank: 'MS1', sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', eventRank: 'MS2', sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 1, 2, 2)];

    const result = computeConstraintViolations(assignments, matches, [], cfg());
    expect(result[0].description).toBe('Player overlap in MS1 and MS2');
  });
});

// ── Rest window (soft) ─────────────────────────────────────────────────────

describe('computeConstraintViolations — rest window', () => {
  it('flags a too-short rest gap between consecutive matches for a player', () => {
    // m1 [0,2), m2 [3,4): gap = 3 - 2 = 1. restSlots = ceil(60/30) = 2.
    // 1 < 2 and >= 0 → rest violation. No overlap (2 > 3 is false).
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 3, 1, 1)];
    const players = [player('p1'), player('p2'), player('p3')];

    const result = computeConstraintViolations(assignments, matches, players, cfg());
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'rest',
      severity: 'soft',
      playerIds: ['p1'],
      matchIds: ['m1', 'm2'],
      description: 'Rest violation: M1 to M2 (1/2 slots)',
    });
  });

  it('does NOT flag rest when the gap meets the required rest window', () => {
    // gap = 4 - 2 = 2; restSlots = 2; 2 < 2 is false → no violation.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 4, 1, 1)];
    const players = [player('p1')];

    expect(computeConstraintViolations(assignments, matches, players, cfg())).toEqual([]);
  });

  it("honors a player's own minRestMinutes over the tournament default", () => {
    // gap = 4 - 2 = 2. Default restSlots = ceil(60/30) = 2 → would NOT violate.
    // Player override minRestMinutes 120 → restSlots = ceil(120/30) = 4 → 2 < 4 violates.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 4, 1, 1)];
    const players = [player('p1', 120)];

    const result = computeConstraintViolations(assignments, matches, players, cfg());
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('rest');
    expect(result[0].description).toBe('Rest violation: M1 to M2 (2/4 slots)');
  });

  it('emits no rest violations when defaultRestMinutes is 0 (restSlots 0)', () => {
    // restSlots = ceil(0/30) = 0; gap >= 0 always, so gap < 0 is impossible.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
    ];
    const assignments = [assign('m1', 0, 1, 1), assign('m2', 1, 1, 1)];
    const players = [player('p1')];

    expect(
      computeConstraintViolations(assignments, matches, players, cfg({ defaultRestMinutes: 0 }))
    ).toEqual([]);
  });
});

// ── Court capacity (hard) ──────────────────────────────────────────────────

describe('computeConstraintViolations — court capacity', () => {
  it('flags two matches occupying the same court-slot', () => {
    // m1 court1 [0,2) occupies slots 0,1; m2 court1 slot1 → shared key "1-1".
    // Distinct players → no overlap; defaultRest 0 → no rest noise.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p3'], sideB: ['p4'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 1, 1, 1)];
    const players = [player('p1'), player('p2'), player('p3'), player('p4')];

    const result = computeConstraintViolations(
      assignments,
      matches,
      players,
      cfg({ defaultRestMinutes: 0 })
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'court_capacity',
      severity: 'hard',
      playerIds: [],
      matchIds: ['m1', 'm2'],
      description: 'Court 1 conflict: M1, M2 at slot 1',
    });
  });

  it('does NOT flag when matches share a slot but sit on different courts', () => {
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p3'], sideB: ['p4'] }),
    ];
    const assignments = [assign('m1', 0, 1, 1), assign('m2', 0, 2, 1)];
    const players = [player('p1'), player('p2'), player('p3'), player('p4')];

    expect(
      computeConstraintViolations(assignments, matches, players, cfg({ defaultRestMinutes: 0 }))
    ).toEqual([]);
  });

  it('emits one court_capacity violation per shared slot when matches fully overlap', () => {
    // Both on court1 [0,2): keys "1-0" and "1-1" each hold [m1, m2] → 2 violations.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p3'], sideB: ['p4'] }),
    ];
    const assignments = [assign('m1', 0, 1, 2), assign('m2', 0, 1, 2)];
    const players = [player('p1'), player('p2'), player('p3'), player('p4')];

    const result = computeConstraintViolations(
      assignments,
      matches,
      players,
      cfg({ defaultRestMinutes: 0 })
    );
    expect(result).toHaveLength(2);
    expect(typesOf(result)).toEqual(['court_capacity', 'court_capacity']);
    expect(result[0].description).toBe('Court 1 conflict: M1, M2 at slot 0');
    expect(result[1].description).toBe('Court 1 conflict: M1, M2 at slot 1');
  });

  it('falls back to a 6-char id slice in the label when no matchNumber/eventRank', () => {
    const matches = [
      match({ id: 'abcdef99', sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'zzzzzz99', sideA: ['p3'], sideB: ['p4'] }),
    ];
    const assignments = [assign('abcdef99', 0, 1, 1), assign('zzzzzz99', 0, 1, 1)];

    const result = computeConstraintViolations(
      assignments,
      matches,
      [],
      cfg({ defaultRestMinutes: 0 })
    );
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Court 1 conflict: abcdef, zzzzzz at slot 0');
  });
});

// ── Combined / ordering ────────────────────────────────────────────────────

describe('computeConstraintViolations — combined', () => {
  it('concatenates overlap, then rest, then court_capacity', () => {
    // Construct a schedule that triggers all three:
    //  - overlap+court_capacity: p1 in m1 [0,2) court1 and m2 [1,3) court1
    //    (shared player AND shared court-slot 1).
    //  - rest: p1's later match m3 [4,5) court2 starts 1 slot after m2 ends at 3.
    const matches = [
      match({ id: 'm1', matchNumber: 1, sideA: ['p1'], sideB: ['p2'] }),
      match({ id: 'm2', matchNumber: 2, sideA: ['p1'], sideB: ['p3'] }),
      match({ id: 'm3', matchNumber: 3, sideA: ['p1'], sideB: ['p4'] }),
    ];
    const assignments = [
      assign('m1', 0, 1, 2),
      assign('m2', 1, 1, 2),
      assign('m3', 4, 2, 1),
    ];
    const players = [player('p1'), player('p2'), player('p3'), player('p4')];

    const result = computeConstraintViolations(assignments, matches, players, cfg());
    const types = typesOf(result);

    // Ordering: all overlaps first, then rests, then court_capacity.
    expect(types[0]).toBe('overlap');
    expect(types[types.length - 1]).toBe('court_capacity');
    expect(types).toContain('rest');
    // Severities by type.
    for (const v of result) {
      if (v.type === 'rest') expect(v.severity).toBe('soft');
      else expect(v.severity).toBe('hard');
    }
  });
});
