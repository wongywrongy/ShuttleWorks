/**
 * The client match-state machine must MIRROR the backend contract
 * (`backend/services/match_state.py::VALID_TRANSITIONS`). Interaction-audit
 * finding A1: the two tables were authored independently and diverged, so the
 * Run surface offered four transitions the server always refused — each press
 * 409'd behind a misleading "version mismatch" toast with a futile Retry.
 *
 * These tests pin the mirror. If the backend table changes, one of these fails.
 */
import { describe, it, expect } from 'vitest';
import {
  VALID_TRANSITIONS,
  isValidTransition,
  transitionPath,
} from '../matchTransitions';

describe('matchTransitions — mirrors the backend contract', () => {
  it('pins the table (client `started` === backend `playing`)', () => {
    expect(VALID_TRANSITIONS).toEqual({
      scheduled: ['called', 'scheduled'],
      called: ['started', 'scheduled', 'called'],
      started: ['finished', 'scheduled', 'started'],
      finished: ['started', 'finished'],
    });
  });

  it('permits the transitions the backend permits', () => {
    expect(isValidTransition('scheduled', 'called')).toBe(true);
    expect(isValidTransition('called', 'started')).toBe(true);
    expect(isValidTransition('called', 'scheduled')).toBe(true); // undo call
    expect(isValidTransition('started', 'finished')).toBe(true);
    expect(isValidTransition('started', 'scheduled')).toBe(true); // undo start
    expect(isValidTransition('finished', 'started')).toBe(true); // undo finish
  });

  it('same-state writes are legal (backend route short-circuits the guard)', () => {
    // This is what makes editing the score of a finished match work.
    expect(isValidTransition('finished', 'finished')).toBe(true);
    expect(isValidTransition('scheduled', 'scheduled')).toBe(true);
  });

  it('rejects the four transitions the backend refuses (the A1 bugs)', () => {
    expect(isValidTransition('started', 'called')).toBe(false); // old "undo to called"
    expect(isValidTransition('scheduled', 'finished')).toBe(false); // record after-the-fact
    expect(isValidTransition('called', 'finished')).toBe(false); // record after-the-fact
    expect(isValidTransition('finished', 'scheduled')).toBe(false); // over-wide undo
  });

  describe('transitionPath — walks an illegal-but-reachable jump legally', () => {
    it('returns a single step for a directly legal transition', () => {
      expect(transitionPath('scheduled', 'called')).toEqual(['called']);
      expect(transitionPath('finished', 'started')).toEqual(['started']);
    });

    it('walks called → finished via started (after-the-fact score recording)', () => {
      // The operator scores a match that was never explicitly started. The
      // button's intent stands; we reach it through the legal path instead of
      // firing a request the server will refuse.
      expect(transitionPath('called', 'finished')).toEqual(['started', 'finished']);
    });

    it('walks scheduled → finished via called + started', () => {
      expect(transitionPath('scheduled', 'finished')).toEqual([
        'called',
        'started',
        'finished',
      ]);
    });

    it('returns the same-state no-op step for a re-assert', () => {
      expect(transitionPath('finished', 'finished')).toEqual(['finished']);
    });

    it('takes the shortest path, never a cycle', () => {
      // started → scheduled is direct; it must not route via called.
      expect(transitionPath('started', 'scheduled')).toEqual(['scheduled']);
    });
  });
});
