import { describe, it, expect } from 'vitest';
import {
  getMatchPlayerIds,
  isPlayerActive,
  isPlayerResting,
  getPlayerStatuses,
  computeTrafficLight,
  computeAllTrafficLights,
} from '../trafficLight';
import type {
  MatchDTO,
  MatchStateDTO,
  PlayerDTO,
  ScheduleDTO,
  ScheduleAssignment,
  TournamentConfig,
} from '../../api/dto';

// ---- Fixture builders -----------------------------------------------------
// interval 30 + defaultRestMinutes 30 → restSlots = ceil(30/30) = 1.
const cfg = (over: Partial<TournamentConfig> = {}): TournamentConfig => ({
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  courtCount: 4,
  breaks: [],
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  ...over,
});

const match = (o: Partial<MatchDTO> & { id: string }): MatchDTO => ({
  sideA: [],
  sideB: [],
  durationSlots: 2,
  ...o,
});

const player = (o: Partial<PlayerDTO> & { id: string }): PlayerDTO => ({
  name: o.id,
  groupId: 'g',
  availability: [],
  ...o,
});

const state = (
  matchId: string,
  status: MatchStateDTO['status'],
  o: Partial<MatchStateDTO> = {},
): MatchStateDTO => ({ matchId, status, ...o });

const assign = (
  matchId: string,
  slotId: number,
  durationSlots = 2,
  courtId = 1,
): ScheduleAssignment => ({ matchId, slotId, courtId, durationSlots });

const sched = (assignments: ScheduleAssignment[]): ScheduleDTO => ({
  assignments,
  unscheduledMatches: [],
  softViolations: [],
  objectiveScore: null,
  infeasibleReasons: [],
  status: 'feasible',
});

const statesOf = (...arr: MatchStateDTO[]): Record<string, MatchStateDTO> =>
  Object.fromEntries(arr.map((s) => [s.matchId, s]));

// ===========================================================================
describe('getMatchPlayerIds', () => {
  it('concatenates sideA, then sideB, then sideC in order', () => {
    const m = match({ id: 'm', sideA: ['a1', 'a2'], sideB: ['b1'], sideC: ['c1', 'c2'] });
    expect(getMatchPlayerIds(m)).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);
  });

  it('omits sideC when absent (dual match)', () => {
    expect(getMatchPlayerIds(match({ id: 'm', sideA: ['a1'], sideB: ['b1'] }))).toEqual(['a1', 'b1']);
  });

  it('returns only the populated side for a bye (one empty side)', () => {
    expect(getMatchPlayerIds(match({ id: 'm', sideA: ['solo'], sideB: [] }))).toEqual(['solo']);
  });

  it('returns [] when both sides are empty', () => {
    expect(getMatchPlayerIds(match({ id: 'm', sideA: [], sideB: [] }))).toEqual([]);
  });
});

// ===========================================================================
describe('isPlayerActive', () => {
  const matches = [
    match({ id: 'called', sideA: ['p1'], sideB: ['x'], eventRank: 'MS1' }),
    match({ id: 'started', sideA: ['p2'], sideB: ['y'], matchNumber: 7 }),
    match({ id: 'sched', sideA: ['p3'], sideB: ['z'] }),
    match({ id: 'fin', sideA: ['p4'], sideB: ['w'] }),
    match({ id: 'nolabel', sideA: ['p5'], sideB: ['q'] }),
  ];
  const states = statesOf(
    state('called', 'called'),
    state('started', 'started'),
    state('sched', 'scheduled'),
    state('fin', 'finished'),
    state('nolabel', 'called'),
  );

  it('flags a player in a called match; label uses eventRank', () => {
    expect(isPlayerActive('p1', states, matches)).toEqual({
      active: true,
      matchId: 'called',
      matchLabel: 'MS1',
      status: 'called',
    });
  });

  it('flags a player in a started match; label falls back to M<matchNumber>', () => {
    expect(isPlayerActive('p2', states, matches)).toEqual({
      active: true,
      matchId: 'started',
      matchLabel: 'M7',
      status: 'started',
    });
  });

  it('label is "M?" when neither eventRank nor matchNumber are set', () => {
    expect(isPlayerActive('p5', states, matches).matchLabel).toBe('M?');
  });

  it('does NOT flag scheduled or finished matches', () => {
    expect(isPlayerActive('p3', states, matches)).toEqual({ active: false });
    expect(isPlayerActive('p4', states, matches)).toEqual({ active: false });
  });

  it('returns inactive for a player not in any active match', () => {
    expect(isPlayerActive('ghost', states, matches)).toEqual({ active: false });
  });

  it('skips the excluded match', () => {
    expect(isPlayerActive('p1', states, matches, 'called')).toEqual({ active: false });
  });

  it('treats a match with no state entry as inactive', () => {
    const m = [match({ id: 'lonely', sideA: ['p9'], sideB: [] })];
    expect(isPlayerActive('p9', {}, m)).toEqual({ active: false });
  });
});

// ===========================================================================
describe('isPlayerResting', () => {
  it('rests a player inside the cooldown window after their finished match', () => {
    // fin: slot 0 + dur 2 → endSlot 2; restSlots 1 → availableAtSlot 3.
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'], matchNumber: 1 })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([assign('fin', 0, 2)]);
    const r = isPlayerResting('p1', states, matches, [player({ id: 'p1' })], schedule, cfg(), 2);
    expect(r).toEqual({
      resting: true,
      availableAtSlot: 3,
      matchId: 'fin',
      matchLabel: 'M1',
    });
  });

  it('is not resting once currentSlot reaches availableAtSlot', () => {
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([assign('fin', 0, 2)]);
    // availableAtSlot is 3; at slot 3 the cooldown is over.
    expect(isPlayerResting('p1', states, matches, [], schedule, cfg(), 3).resting).toBe(false);
  });

  it('is not resting when the player has no finished match', () => {
    const matches = [match({ id: 'fin', sideA: ['other'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([assign('fin', 0, 2)]);
    expect(isPlayerResting('p1', states, matches, [], schedule, cfg(), 0).resting).toBe(false);
  });

  it('honours a per-player minRestMinutes over the config default', () => {
    // minRest 60 / interval 30 → restSlots 2; endSlot 2 → availableAtSlot 4.
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([assign('fin', 0, 2)]);
    const players = [player({ id: 'p1', minRestMinutes: 60 })];
    const r = isPlayerResting('p1', states, matches, players, schedule, cfg(), 3);
    expect(r.resting).toBe(true);
    expect(r.availableAtSlot).toBe(4);
  });

  it('prefers actualEndTime (legacy HH:mm) over the scheduled end slot', () => {
    // actualEndTime 10:00 → slot 2 (vs assignment fallback slot 0+5=5).
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished', { actualEndTime: '10:00' }));
    const schedule = sched([assign('fin', 0, 5)]);
    const r = isPlayerResting('p1', states, matches, [], schedule, cfg(), 2);
    expect(r.resting).toBe(true);
    expect(r.availableAtSlot).toBe(3); // endSlot 2 + restSlots 1
  });

  it('picks the most recently finished match when several exist', () => {
    const matches = [
      match({ id: 'early', sideA: ['p1'], sideB: ['x'], matchNumber: 1 }),
      match({ id: 'late', sideA: ['p1'], sideB: ['y'], matchNumber: 2 }),
    ];
    const states = statesOf(state('early', 'finished'), state('late', 'finished'));
    // early ends at slot 2, late ends at slot 6 → rest is measured from 'late'.
    const schedule = sched([assign('early', 0, 2), assign('late', 4, 2)]);
    const r = isPlayerResting('p1', states, matches, [], schedule, cfg(), 6);
    expect(r.matchId).toBe('late');
    expect(r.availableAtSlot).toBe(7);
  });

  it('ignores a finished match that has no schedule assignment', () => {
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([]); // no assignment for 'fin'
    expect(isPlayerResting('p1', states, matches, [], schedule, cfg(), 0).resting).toBe(false);
  });

  it('skips the excluded match', () => {
    const matches = [match({ id: 'fin', sideA: ['p1'], sideB: ['x'] })];
    const states = statesOf(state('fin', 'finished'));
    const schedule = sched([assign('fin', 0, 2)]);
    expect(isPlayerResting('p1', states, matches, [], schedule, cfg(), 2, 'fin').resting).toBe(false);
  });
});

// ===========================================================================
describe('getPlayerStatuses', () => {
  it('returns [] for an unknown matchId', () => {
    expect(getPlayerStatuses('nope', sched([]), [], {}, [], cfg(), 0)).toEqual([]);
  });

  it('marks an available player (name falls back to id when player unknown)', () => {
    const candidate = match({ id: 'c', sideA: ['ghost'], sideB: [] });
    const statuses = getPlayerStatuses('c', sched([]), [candidate], {}, [], cfg(), 0);
    expect(statuses).toEqual([{ playerId: 'ghost', playerName: 'ghost', status: 'available' }]);
  });

  it('marks an active player with a "Playing <label>" reason', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const blocker = match({ id: 'b', sideA: ['p1'], sideB: ['x'], matchNumber: 3 });
    const states = statesOf(state('b', 'started'));
    const players = [player({ id: 'p1', name: 'Alice' })];
    const [s] = getPlayerStatuses('c', sched([]), [candidate, blocker], states, players, cfg(), 0);
    expect(s).toEqual({
      playerId: 'p1',
      playerName: 'Alice',
      status: 'active',
      reason: 'Playing M3',
      matchId: 'b',
    });
  });

  it('uses "Called to <label>" for a called blocker', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const blocker = match({ id: 'b', sideA: ['p1'], sideB: ['x'], eventRank: 'WD2' });
    const states = statesOf(state('b', 'called'));
    const [s] = getPlayerStatuses('c', sched([]), [candidate, blocker], states, [], cfg(), 0);
    expect(s.status).toBe('active');
    expect(s.reason).toBe('Called to WD2');
  });

  it('marks a resting player with a slots-remaining reason', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const finished = match({ id: 'f', sideA: ['p1'], sideB: ['x'], matchNumber: 1 });
    const states = statesOf(state('f', 'finished'));
    const players = [player({ id: 'p1', name: 'Alice' })];
    const schedule = sched([assign('f', 0, 2)]); // end 2, avail 3
    const [s] = getPlayerStatuses('c', schedule, [candidate, finished], states, players, cfg(), 2);
    expect(s).toEqual({
      playerId: 'p1',
      playerName: 'Alice',
      status: 'resting',
      reason: 'Resting after M1 (1 slot remaining)',
      matchId: 'f',
      availableAtSlot: 3,
    });
  });

  it('active check takes precedence over resting for the same player', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const finished = match({ id: 'f', sideA: ['p1'], sideB: ['x'], matchNumber: 1 });
    const calledElsewhere = match({ id: 'b', sideA: ['p1'], sideB: ['y'], eventRank: 'XD1' });
    const states = statesOf(state('f', 'finished'), state('b', 'called'));
    const schedule = sched([assign('f', 0, 2)]);
    const [s] = getPlayerStatuses('c', schedule, [candidate, finished, calledElsewhere], states, [], cfg(), 2);
    expect(s.status).toBe('active');
    expect(s.reason).toBe('Called to XD1');
  });
});

// ===========================================================================
describe('computeTrafficLight', () => {
  it('is green with no reason for a started match', () => {
    const r = computeTrafficLight('m', sched([]), [], statesOf(state('m', 'started')), [], cfg(), 0);
    expect(r).toEqual({ status: 'green' });
  });

  it('is green with no reason for a finished match', () => {
    const r = computeTrafficLight('m', sched([]), [], statesOf(state('m', 'finished')), [], cfg(), 0);
    expect(r).toEqual({ status: 'green' });
  });

  it('is green with "Already called" for a called match', () => {
    const r = computeTrafficLight('m', sched([]), [], statesOf(state('m', 'called')), [], cfg(), 0);
    expect(r).toEqual({ status: 'green', reason: 'Already called' });
  });

  it('is green "Ready to call" when every player is available', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: ['p2'] });
    const r = computeTrafficLight('c', sched([]), [candidate], {}, [], cfg(), 0);
    expect(r).toEqual({ status: 'green', reason: 'Ready to call' });
  });

  it('treats a bye (one empty side) of available players as green', () => {
    const candidate = match({ id: 'c', sideA: ['solo'], sideB: [] });
    const r = computeTrafficLight('c', sched([]), [candidate], {}, [], cfg(), 0);
    expect(r.status).toBe('green');
  });

  it('is red when a single player is actively playing', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const blocker = match({ id: 'b', sideA: ['p1'], sideB: ['x'], matchNumber: 3 });
    const states = statesOf(state('b', 'started'));
    const players = [player({ id: 'p1', name: 'Alice' })];
    const r = computeTrafficLight('c', sched([]), [candidate, blocker], states, players, cfg(), 0);
    expect(r).toEqual({
      status: 'red',
      reason: 'Alice is Playing M3',
      blockedBy: ['b'],
      playersBlocked: ['Alice'],
    });
  });

  it('is red and lists each blocker when multiple players are active', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: ['p2'] });
    const b1 = match({ id: 'b1', sideA: ['p1'], sideB: ['x'], matchNumber: 3 });
    const b2 = match({ id: 'b2', sideA: ['p2'], sideB: ['y'], eventRank: 'MS1' });
    const states = statesOf(state('b1', 'started'), state('b2', 'called'));
    const players = [player({ id: 'p1', name: 'Alice' }), player({ id: 'p2', name: 'Bob' })];
    const r = computeTrafficLight('c', sched([]), [candidate, b1, b2], states, players, cfg(), 0);
    expect(r.status).toBe('red');
    expect(r.reason).toBe('Alice: Playing M3; Bob: Called to MS1');
    expect(r.blockedBy).toEqual(['b1', 'b2']);
    expect(r.playersBlocked).toEqual(['Alice', 'Bob']);
  });

  it('is yellow when a single player is resting', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: [] });
    const finished = match({ id: 'f', sideA: ['p1'], sideB: ['x'], matchNumber: 1 });
    const states = statesOf(state('f', 'finished'));
    const players = [player({ id: 'p1', name: 'Alice' })];
    const schedule = sched([assign('f', 0, 2)]); // end 2, avail 3
    const r = computeTrafficLight('c', schedule, [candidate, finished], states, players, cfg(), 2);
    expect(r).toEqual({
      status: 'yellow',
      reason: 'Alice is Resting after M1 (1 slot remaining)',
      playersResting: ['Alice'],
      availableInSlots: 1,
    });
  });

  it('is yellow with a combined reason when multiple players rest; uses the latest availability', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: ['p2'] });
    const fa = match({ id: 'fa', sideA: ['p1'], sideB: ['x'] });
    const fb = match({ id: 'fb', sideA: ['p2'], sideB: ['y'] });
    const states = statesOf(state('fa', 'finished'), state('fb', 'finished'));
    const players = [player({ id: 'p1', name: 'Alice' }), player({ id: 'p2', name: 'Bob' })];
    // fa end 2 → avail 3; fb end 3 → avail 4. earliest-available = max = 4.
    const schedule = sched([assign('fa', 0, 2), assign('fb', 0, 3)]);
    const r = computeTrafficLight('c', schedule, [candidate, fa, fb], states, players, cfg(), 2);
    expect(r.status).toBe('yellow');
    expect(r.reason).toBe('Alice & Bob are resting (2 slots)');
    expect(r.playersResting).toEqual(['Alice', 'Bob']);
    expect(r.availableInSlots).toBe(2);
  });

  it('red beats yellow when one player is active and another is resting', () => {
    const candidate = match({ id: 'c', sideA: ['p1'], sideB: ['p2'] });
    const resting = match({ id: 'f', sideA: ['p1'], sideB: ['x'] });
    const active = match({ id: 'b', sideA: ['p2'], sideB: ['y'], matchNumber: 9 });
    const states = statesOf(state('f', 'finished'), state('b', 'started'));
    const players = [player({ id: 'p1', name: 'Alice' }), player({ id: 'p2', name: 'Bob' })];
    const schedule = sched([assign('f', 0, 2)]);
    const r = computeTrafficLight('c', schedule, [candidate, resting, active], states, players, cfg(), 2);
    expect(r.status).toBe('red');
    expect(r.playersBlocked).toEqual(['Bob']);
  });
});

// ===========================================================================
describe('computeAllTrafficLights', () => {
  it('returns an empty map when schedule is null', () => {
    expect(computeAllTrafficLights(null, [], {}, [], cfg(), 0).size).toBe(0);
  });

  it('returns an empty map when config is null', () => {
    const schedule = sched([assign('c', 0, 2)]);
    expect(computeAllTrafficLights(schedule, [], {}, [], null, 0).size).toBe(0);
  });

  it('produces one keyed result per scheduled assignment', () => {
    const c1 = match({ id: 'c1', sideA: ['p1'], sideB: ['p2'] });
    const c2 = match({ id: 'c2', sideA: ['p3'], sideB: ['p4'] });
    const blocker = match({ id: 'b', sideA: ['p1'], sideB: ['x'], matchNumber: 5 });
    const states = statesOf(state('b', 'started'));
    const schedule = sched([assign('c1', 0, 2), assign('c2', 2, 2)]);
    const result = computeAllTrafficLights(
      schedule,
      [c1, c2, blocker],
      states,
      [player({ id: 'p1', name: 'Alice' })],
      cfg(),
      0,
    );
    expect([...result.keys()].sort()).toEqual(['c1', 'c2']);
    expect(result.get('c1')?.status).toBe('red'); // p1 is playing in 'b'
    expect(result.get('c2')?.status).toBe('green'); // p3/p4 free
  });
});
