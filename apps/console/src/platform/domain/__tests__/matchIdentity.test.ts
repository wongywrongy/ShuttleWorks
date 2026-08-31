/** F-UNI-21/22/23/26: focused contract tests for the new identity seam. */
import { describe, expect, it } from 'vitest';
import {
  bracketMatchIdentity,
  decomposeMeetEventRank,
  formatMatchIdentity,
  meetMatchIdentity,
  meetMatchIdentityFromStored,
} from '../matchIdentity';

describe('match identity value object', () => {
  it('formats round-robin coordinates without parsing an id', () => {
    const identity = bracketMatchIdentity({
      event_code: 'MS',
      phase: {
        kind: 'round_robin',
        round_index: 0,
        stage: 'R1',
        segment: null,
      },
      sequence: 2,
    });

    expect(identity).toEqual({
      source: 'bracket',
      event_code: 'MS',
      phase: {
        kind: 'round_robin',
        round_index: 0,
        stage: 'R1',
        segment: null,
      },
      sequence: 2,
    });
    expect(formatMatchIdentity(identity)).toBe('MS R1·2');
  });

  it('formats elimination round-of-k with the disambiguating separator', () => {
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MD',
          phase: {
            kind: 'elimination',
            round_index: 0,
            stage: 'R32',
            segment: null,
          },
          sequence: 2,
        }),
      ),
    ).toBe('MD R32·2');
  });

  it('preserves conventional QF/SF and final labels', () => {
    const phase = (stage: string) => ({
      kind: 'elimination' as const,
      round_index: 0,
      stage,
      segment: null,
    });
    expect(formatMatchIdentity(bracketMatchIdentity({ event_code: 'MS', phase: phase('QF'), sequence: 2 }))).toBe('MS QF2');
    expect(formatMatchIdentity(bracketMatchIdentity({ event_code: 'MS', phase: phase('SF'), sequence: 2 }))).toBe('MS SF2');
    expect(formatMatchIdentity(bracketMatchIdentity({ event_code: 'MS', phase: phase('F'), sequence: 1 }))).toBe('MS F');
  });

  it('preserves segment and grand-final conventions', () => {
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MS',
          phase: {
            kind: 'elimination',
            round_index: 1,
            stage: 'SF',
            segment: 'L',
            main_segment: 'W',
          },
          sequence: 1,
        }),
      ),
    ).toBe('MS L SF1');
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MS',
          phase: { kind: 'elimination', round_index: 0, stage: 'GF', segment: 'GF' },
          sequence: 1,
        }),
      ),
    ).toBe('MS GF');
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MS',
          phase: { kind: 'elimination', round_index: 1, stage: 'GF', segment: 'GF' },
          sequence: 1,
        }),
      ),
    ).toBe('MS GF-R');
  });

  it('omits only the configured main segment', () => {
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MS',
          phase: {
            kind: 'elimination',
            round_index: 0,
            stage: 'QF',
            segment: 'W',
            main_segment: 'W',
          },
          sequence: 1,
        }),
      ),
    ).toBe('MS QF1');
    expect(
      formatMatchIdentity(
        bracketMatchIdentity({
          event_code: 'MS',
          phase: {
            kind: 'elimination',
            round_index: 0,
            stage: 'QF',
            segment: 'W',
            main_segment: 'E',
          },
          sequence: 1,
        }),
      ),
    ).toBe('MS W QF1');
  });

  it('formats Meet event rank and ordinal fallback without inventing a bracket phase', () => {
    const ranked = meetMatchIdentity({ event_code: 'MS', position: 1, sequence: 1 });
    expect(ranked.phase).toBeNull();
    expect(formatMatchIdentity(ranked)).toBe('MS1');
    expect(formatMatchIdentity(meetMatchIdentity({ event_code: '', sequence: 7 }))).toBe('M7');
    expect(formatMatchIdentity(meetMatchIdentity({ event_code: 'MS', position: null, sequence: 7 }))).toBe('MS');
    expect(formatMatchIdentity(meetMatchIdentity({ event_code: '', position: null, sequence: null }), 'abcdefghi')).toBe('abcdef');
  });

  it('decomposes the legacy Meet rank at one seam, including numeric event codes', () => {
    expect(decomposeMeetEventRank('MS12')).toEqual({ event_code: 'MS', position: 12 });
    expect(decomposeMeetEventRank('U101', ['U10', 'U'])).toEqual({
      event_code: 'U10',
      position: 1,
    });
    expect(
      meetMatchIdentityFromStored({
        event_rank: 'U101',
        sequence: 9,
        configured_event_codes: ['U10'],
      }),
    ).toEqual({
      source: 'meet',
      event_code: 'U10',
      phase: null,
      position: 1,
      sequence: 9,
    });
  });
});
