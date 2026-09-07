/**
 * `stateWords.ts` is the one authority for the console's operational
 * vocabulary (contract §2, §10 "Copy" row). The canonical word set must
 * contain no MATCH state spelled "Live" — "Live" survives only as a
 * lifecycle/section word (§1), never a match state — and `playing` renders
 * "On court".
 */
import { describe, it, expect } from 'vitest';
import { STATE_WORD } from '../stateWords';

describe('STATE_WORD', () => {
  it('has no match-state word spelled "Live"', () => {
    // `live` itself is retained as the lifecycle/section word ("Live now"),
    // but the console's match-state role (`onCourt`) must never say "Live".
    expect(STATE_WORD.onCourt).toBe('On court');
    expect(STATE_WORD.onCourt).not.toBe('Live');
  });

  it('spells `playing` as "On court"', () => {
    expect(STATE_WORD.onCourt).toBe('On court');
  });

  it('carries a retired word distinct from done', () => {
    expect(STATE_WORD.retired).toBe('Retired');
    expect(STATE_WORD.retired).not.toBe(STATE_WORD.done);
  });
});
