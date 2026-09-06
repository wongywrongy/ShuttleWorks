/**
 * Console twin of `tests/backend/unit/test_court_occupancy.py` — the two
 * derivations must produce byte-identical bucket counts over the same
 * fixture (contract §10 "Operational truth").
 */
import { describe, it, expect } from 'vitest';
import {
  courtsFree,
  deriveCourtStates,
  deriveDisputes,
  disputedCourtCount,
  occupiedCourtCount,
  occupiesCourtNow,
  holdsCourtCommitment,
  type OccupancyMatchLike,
} from '../courtOccupancy';

const m = (id: string, status: OccupancyMatchLike['status'], court: number | null): OccupancyMatchLike => ({
  id,
  status,
  court,
});

describe('courtOccupancy', () => {
  it('two playing matches on one court are one dispute, zero occupied', () => {
    const matches = [m('a', 'playing', 1), m('b', 'playing', 1), m('c', 'playing', 2)];
    const states = deriveCourtStates(matches);
    expect(states.get(1)).toBe('disputed');
    expect(states.get(2)).toBe('occupied');
    expect(occupiedCourtCount(states)).toBe(1);
    expect(disputedCourtCount(states)).toBe(1);

    const disputes = deriveDisputes(matches);
    expect(disputes).toHaveLength(1);
    expect(disputes[0].courtId).toBe(1);
    expect(new Set(disputes[0].claims.map((c) => c.matchKey))).toEqual(new Set(['a', 'b']));
  });

  it('matches the backend fixture bucket counts byte-for-byte', () => {
    // Same fixture as test_court_occupancy.py::test_disputed_court_is_excluded_from_both_free_and_occupied_counts
    const matches = [m('a', 'playing', 1), m('b', 'playing', 1)];
    const states = deriveCourtStates(matches);
    expect(courtsFree(4, states)).toBe(3);
    expect(occupiedCourtCount(states)).toBe(0);
    expect(disputedCourtCount(states)).toBe(1);
  });

  it('a called match does not occupy or dispute a court', () => {
    const matches = [m('a', 'called', 1), m('b', 'playing', 2)];
    const states = deriveCourtStates(matches);
    expect(states.has(1)).toBe(false);
    expect(states.get(2)).toBe('occupied');
    expect(deriveDisputes(matches)).toEqual([]);
  });

  it('a court nobody claims is free', () => {
    const states = deriveCourtStates([m('a', 'scheduled', null)]);
    expect(states.size).toBe(0);
    expect(courtsFree(3, states)).toBe(3);
  });

  it('occupiesCourtNow accepts both vocabularies', () => {
    expect(occupiesCourtNow('playing')).toBe(true);
    expect(occupiesCourtNow('started')).toBe(true);
    expect(occupiesCourtNow('called')).toBe(false);
    expect(occupiesCourtNow('done')).toBe(false);
  });

  it('holdsCourtCommitment includes called and terminal states', () => {
    expect(holdsCourtCommitment('called')).toBe(true);
    expect(holdsCourtCommitment('playing')).toBe(true);
    expect(holdsCourtCommitment('finished')).toBe(true);
    expect(holdsCourtCommitment('retired')).toBe(true);
    expect(holdsCourtCommitment('scheduled')).toBe(false);
  });
});
