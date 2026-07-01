/**
 * Characterization tests for `matchStateStore` — SP-REFACTOR safety net.
 *
 * These PIN CURRENT BEHAVIOR of the live match-state store before any
 * refactor touches it (SP-REFACTOR-2 "safety net first"). The store sits on
 * the Operations run path and is consumed cross-product (Meet + Operations +
 * Bracket); F-ARCH-3 may relocate it, so its transitions must be regression-
 * detectable first. Baseline coverage was 35.95% lines / 16.66% funcs.
 *
 * Behavior-descriptive, not aspirational. Where the store calls `new Date()` /
 * `Date.now()` (buildLiveState currentTime/lastSynced, recordConflict
 * occurredAt) we pin STRUCTURE (present, right type), never the exact value.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useMatchStateStore } from '../matchStateStore';
import type { MatchStateDTO } from '../../api/dto';

const get = () => useMatchStateStore.getState();

function mkState(matchId: string, status: MatchStateDTO['status'], extra: Partial<MatchStateDTO> = {}): MatchStateDTO {
  return { matchId, status, ...extra };
}

beforeEach(() => {
  // reset() is itself pinned below; used here for per-test isolation of the
  // module-singleton store.
  get().reset();
});

describe('matchStateStore — initial / reset', () => {
  it('starts with empty maps and null liveState', () => {
    const s = get();
    expect(s.matchStates).toEqual({});
    expect(s.liveState).toBeNull();
    expect(s.pendingCommandsByMatchId).toEqual({});
    expect(s.recentConflictsByMatchId).toEqual({});
    expect(s.canonicalVersionsByMatchId).toEqual({});
  });

  it('reset() clears every map and nulls liveState', () => {
    get().setMatchState('m1', mkState('m1', 'called'));
    get().setPendingCommand('m1', 'cmd-1');
    get().recordConflict('m1', 'conflict', 'boom');
    get().setMatchVersion('m1', 7);

    get().reset();

    const s = get();
    expect(s.matchStates).toEqual({});
    expect(s.liveState).toBeNull();
    expect(s.pendingCommandsByMatchId).toEqual({});
    expect(s.recentConflictsByMatchId).toEqual({});
    expect(s.canonicalVersionsByMatchId).toEqual({});
  });
});

describe('matchStateStore — setMatchStates / setMatchState', () => {
  it('setMatchStates replaces the map and builds liveState around it', () => {
    const states = { m1: mkState('m1', 'called'), m2: mkState('m2', 'scheduled') };
    get().setMatchStates(states);

    const s = get();
    expect(s.matchStates).toEqual(states);
    expect(s.liveState).not.toBeNull();
    expect(s.liveState!.matchStates).toEqual(states);
    // buildLiveState stamps these from `new Date()` — pin type, not value.
    expect(typeof s.liveState!.currentTime).toBe('string');
    expect(typeof s.liveState!.lastSynced).toBe('string');
  });

  it('setMatchState merges one entry, preserves others, rebuilds liveState', () => {
    get().setMatchStates({ m1: mkState('m1', 'called') });
    get().setMatchState('m2', mkState('m2', 'started'));

    const s = get();
    expect(Object.keys(s.matchStates).sort()).toEqual(['m1', 'm2']);
    expect(s.matchStates.m2.status).toBe('started');
    expect(s.liveState!.matchStates.m2.status).toBe('started');
  });

  it('setMatchState produces a NEW matchStates object (immutable update)', () => {
    get().setMatchStates({ m1: mkState('m1', 'called') });
    const before = get().matchStates;
    get().setMatchState('m2', mkState('m2', 'scheduled'));
    expect(get().matchStates).not.toBe(before);
  });
});

describe('matchStateStore — setCurrentTime / setLastSynced', () => {
  it('setCurrentTime updates liveState.currentTime when liveState exists', () => {
    get().setMatchStates({ m1: mkState('m1', 'called') });
    get().setCurrentTime('09:41');
    expect(get().liveState!.currentTime).toBe('09:41');
  });

  it('setCurrentTime is a no-op (stays null) when liveState is null', () => {
    get().setCurrentTime('09:41');
    expect(get().liveState).toBeNull();
  });

  it('setLastSynced updates liveState.lastSynced when liveState exists', () => {
    get().setMatchStates({ m1: mkState('m1', 'called') });
    get().setLastSynced('2026-06-30T00:00:00.000Z');
    expect(get().liveState!.lastSynced).toBe('2026-06-30T00:00:00.000Z');
  });

  it('setLastSynced is a no-op (stays null) when liveState is null', () => {
    get().setLastSynced('2026-06-30T00:00:00.000Z');
    expect(get().liveState).toBeNull();
  });
});

describe('matchStateStore — pending commands (Step F)', () => {
  it('setPendingCommand records match_id -> command_id', () => {
    get().setPendingCommand('m1', 'cmd-42');
    expect(get().pendingCommandsByMatchId).toEqual({ m1: 'cmd-42' });
  });

  it('clearPendingCommand removes only that match, leaves others', () => {
    get().setPendingCommand('m1', 'cmd-1');
    get().setPendingCommand('m2', 'cmd-2');
    get().clearPendingCommand('m1');
    expect(get().pendingCommandsByMatchId).toEqual({ m2: 'cmd-2' });
  });

  it('clearPendingCommand on an absent match is harmless', () => {
    get().clearPendingCommand('ghost');
    expect(get().pendingCommandsByMatchId).toEqual({});
  });
});

describe('matchStateStore — applyOptimisticStatus', () => {
  it('creates a scheduled-based entry when the match is unknown', () => {
    get().applyOptimisticStatus('new1', 'called');
    expect(get().matchStates.new1).toEqual({ matchId: 'new1', status: 'called' });
    expect(get().liveState!.matchStates.new1.status).toBe('called');
  });

  it('merges the new status over an existing entry, preserving other fields', () => {
    get().setMatchState('m1', mkState('m1', 'called', {
      calledAt: '2026-06-30T10:00:00.000Z',
      actualStartTime: '2026-06-30T10:05:00.000Z',
    }));
    get().applyOptimisticStatus('m1', 'started');

    const entry = get().matchStates.m1;
    expect(entry.status).toBe('started');
    expect(entry.calledAt).toBe('2026-06-30T10:00:00.000Z');
    expect(entry.actualStartTime).toBe('2026-06-30T10:05:00.000Z');
  });
});

describe('matchStateStore — conflicts (Step G)', () => {
  it('recordConflict stores flavour + message with a numeric occurredAt', () => {
    get().recordConflict('m1', 'stale_version', 'version mismatch');
    const rec = get().recentConflictsByMatchId.m1;
    expect(rec.flavour).toBe('stale_version');
    expect(rec.message).toBe('version mismatch');
    // occurredAt comes from Date.now() — pin type, not value.
    expect(typeof rec.occurredAt).toBe('number');
  });

  it('a second conflict for the same match overwrites the first', () => {
    get().recordConflict('m1', 'conflict', 'first');
    get().recordConflict('m1', 'stale_version', 'second');
    const rec = get().recentConflictsByMatchId.m1;
    expect(rec.flavour).toBe('stale_version');
    expect(rec.message).toBe('second');
  });

  it('dismissConflict removes only that match', () => {
    get().recordConflict('m1', 'conflict', 'a');
    get().recordConflict('m2', 'conflict', 'b');
    get().dismissConflict('m1');
    expect(get().recentConflictsByMatchId.m1).toBeUndefined();
    expect(get().recentConflictsByMatchId.m2).toBeDefined();
  });
});

describe('matchStateStore — setMatchVersion', () => {
  it('records the canonical version per match', () => {
    get().setMatchVersion('m1', 3);
    get().setMatchVersion('m2', 9);
    expect(get().canonicalVersionsByMatchId).toEqual({ m1: 3, m2: 9 });
  });

  it('a later version for the same match overwrites the earlier', () => {
    get().setMatchVersion('m1', 3);
    get().setMatchVersion('m1', 4);
    expect(get().canonicalVersionsByMatchId.m1).toBe(4);
  });
});
