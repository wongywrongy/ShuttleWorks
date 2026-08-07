/**
 * The Entries desk's display vocabulary (SP-E1-1).
 *
 * Pure lookups, but load-bearing ones: these codes cross the HTTP boundary
 * from `services/entries.py` (`SkipReason`) and the spec §6 state machine, so
 * the tests below are as much a record of the wire vocabulary as they are a
 * check on the maps.
 *
 * The rule the fallbacks encode: an unrecognized code is SHOWN, never hidden.
 * A desk that silently dropped a reason it didn't know would tell the operator
 * an entry was fine when the server said otherwise.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTRY_STATE_LABEL,
  ENTRY_STATE_TONE,
  NEEDS_REVIEW,
  hasAttention,
  reasonLabel,
  skipReasonLabel,
} from '../entryDisplay';
import type { EntryState } from '../../../api/dto';

const ALL_STATES: EntryState[] = [
  'unverified',
  'pending',
  'confirmed',
  'rejected',
  'waitlisted',
  'withdrawn',
];

describe('entry state vocabulary', () => {
  it('labels and tones every state in the spec §6 machine', () => {
    for (const state of ALL_STATES) {
      expect(ENTRY_STATE_LABEL[state]).toBeTruthy();
      expect(ENTRY_STATE_TONE[state]).toBeTruthy();
    }
  });

  it('reserves the green (live) tone for confirmed only', () => {
    // DESIGN_COLOR: green means success/live. A pending entry is not a
    // success, and colouring it green would read as "already handled".
    const green = ALL_STATES.filter((s) => ENTRY_STATE_TONE[s] === 'green');
    expect(green).toEqual(['confirmed']);
  });
});

describe('pending reasons', () => {
  it('gives the R7 soft-duplicate flag a human label', () => {
    expect(reasonLabel(NEEDS_REVIEW)).toMatch(/review/i);
  });

  it('shows an unknown reason code verbatim rather than hiding it', () => {
    expect(reasonLabel('SOME_FUTURE_REASON')).toBe('SOME_FUTURE_REASON');
  });

  it('hasAttention is true only when needs_review is present', () => {
    expect(hasAttention([NEEDS_REVIEW])).toBe(true);
    expect(hasAttention([NEEDS_REVIEW, 'over_cap'])).toBe(true);
    expect(hasAttention(['over_cap'])).toBe(false);
    expect(hasAttention([])).toBe(false);
  });
});

describe('commit skip reasons', () => {
  it('labels every code services/entries.py can emit', () => {
    // Mirrors `SkipReason` — renaming one there is a contract change and
    // must break here.
    for (const code of [
      'UNMAPPABLE_EVENT',
      'DRAW_NOT_EDITABLE',
      'STATE_CONFLICT',
      'INVALID_PLAYER',
    ]) {
      expect(skipReasonLabel(code)).not.toBe(code);
      expect(skipReasonLabel(code).length).toBeGreaterThan(0);
    }
  });

  it('shows an unknown skip code verbatim rather than swallowing it', () => {
    // A skip the desk cannot explain is still a roster player the operator
    // did NOT get. Showing the raw code is worse copy and better information.
    expect(skipReasonLabel('NEW_BACKEND_REASON')).toBe('NEW_BACKEND_REASON');
  });
});
