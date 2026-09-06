/**
 * Package 10b (v3 consolidated plan) — the one side formatter.
 * docs/reference/contracts/match-card.md §2.1/§3.1/§3.2,
 * state-and-formatting §6.1/§6.2.
 */
import { describe, expect, it } from 'vitest';
import {
  formatSideCondensed,
  formatSideLines,
  meetSideFromIds,
  resolveFeederReference,
  sideFromWire,
  sideSummaryPhrase,
  type Side,
} from '../sides';
import { matchCardFixtures, formats } from '../__fixtures__/matchCard';

describe('meetSideFromIds', () => {
  it('resolves every id to its own PersonLine — one participant per line', () => {
    const side = meetSideFromIds(['p1', 'p2'], { p1: 'Ana Silva', p2: 'Ben Ito' });
    expect(formatSideLines(side)).toEqual(['Ana Silva', 'Ben Ito']);
    expect(side.unresolved).toBeNull();
  });

  it('never invents a person for an empty side — "To be decided", never TBD', () => {
    const side = meetSideFromIds([], {});
    expect(formatSideLines(side)).toEqual(['To be decided']);
  });

  it('falls back to the raw id rather than throwing on an unmapped name', () => {
    const side = meetSideFromIds(['p9'], {});
    expect(formatSideLines(side)).toEqual(['p9']);
  });
});

describe('sideFromWire', () => {
  it('builds a bye side from the discriminated union', () => {
    const side = sideFromWire({ persons: [], unresolved: { kind: 'bye' } });
    expect(formatSideLines(side)).toEqual(['Bye']);
  });

  it('builds a pending_member side: known names, then "partner to be confirmed"', () => {
    const side = sideFromWire({
      persons: [{ id: 'p1', name: 'Ana Silva' }],
      unresolved: { kind: 'pending_member', known: [{ id: 'p1', name: 'Ana Silva' }], missing: 1 },
    });
    expect(formatSideLines(side)).toEqual(['Ana Silva', 'partner to be confirmed']);
  });

  it('carries the raw feeder id as the reference, unresolved by this layer', () => {
    const side = sideFromWire({ unresolved: { kind: 'winner_of', reference: 'pu-42' } });
    expect(formatSideLines(side)).toEqual(['Winner of pu-42']);
  });

  it('treats an absent wire side as undetermined, never a blank row', () => {
    expect(formatSideLines(sideFromWire(undefined))).toEqual(['To be decided']);
    expect(formatSideLines(sideFromWire(null))).toEqual(['To be decided']);
  });

  it('never emits TBD, an em dash, or "No players"', () => {
    const cases = [
      sideFromWire(undefined),
      sideFromWire({ unresolved: { kind: 'bye' } }),
      sideFromWire({ unresolved: { kind: 'undetermined' } }),
    ];
    for (const side of cases) {
      const text = formatSideLines(side).join(' ');
      expect(text).not.toMatch(/^TBD$/);
      expect(text).not.toMatch(/^–$/);
      expect(text).not.toMatch(/No players/);
    }
  });
});

describe('resolveFeederReference', () => {
  it('substitutes the friendly label for a winner_of/loser_of reference', () => {
    const side: Side = {
      persons: [],
      unresolved: { kind: 'winner_of', reference: 'pu-42' },
      seed: null,
      participantKey: null,
    };
    const resolved = resolveFeederReference(side, new Map([['pu-42', 'QF1']]));
    expect(formatSideLines(resolved)).toEqual(['Winner of QF1']);
  });

  it('is a no-op for a resolved side', () => {
    const side = meetSideFromIds(['p1'], { p1: 'Ana Silva' });
    expect(resolveFeederReference(side, new Map())).toBe(side);
  });
});

describe('formatSideCondensed / sideSummaryPhrase', () => {
  it('condenses a doubles side with " / ", never a rebuilt string parsed apart later', () => {
    const side = meetSideFromIds(['p1', 'p2'], { p1: 'Ana Silva', p2: 'Ben Ito' });
    expect(formatSideCondensed(side)).toBe('Ana Silva / Ben Ito');
  });

  it('builds "{sideA} versus {sideB}", joining persons within a side with "and"', () => {
    const a = meetSideFromIds(['p1', 'p2'], { p1: 'Ana Silva', p2: 'Ben Ito' });
    const b = meetSideFromIds(['p3', 'p4'], { p3: 'Chidi Okeke', p4: 'Dan Reyes' });
    expect(sideSummaryPhrase(a, b)).toBe(
      'Ana Silva and Ben Ito versus Chidi Okeke and Dan Reyes',
    );
  });
});

describe('Gate B fixtures — every side renders a non-empty label', () => {
  const flat = Object.entries(matchCardFixtures).flatMap(([key, value]) =>
    key === 'MC-13'
      ? Object.entries(formats).map(([variant, data]) => [`MC-13/${variant}`, data] as const)
      : [[key, value] as const],
  );

  it.each(flat)('%s: neither side is a blank row', (_key, data) => {
    for (const side of (data as (typeof matchCardFixtures)['MC-01']).sides) {
      const lines = formatSideLines(side);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toBe('');
        expect(line).not.toMatch(/^TBD$/);
        expect(line).not.toMatch(/^–$/);
      }
    }
  });

  it('MC-12: side B is the word "Bye", in the same shape as a name', () => {
    expect(formatSideLines(matchCardFixtures['MC-12'].sides[1])).toEqual(['Bye']);
  });

  it('MC-04: side B is the known name plus "partner to be confirmed" — never invented', () => {
    expect(formatSideLines(matchCardFixtures['MC-04'].sides[1])).toEqual([
      'Chidi Okeke',
      'partner to be confirmed',
    ]);
  });

  it('MC-11: the withheld side reads "Player not published"', () => {
    expect(formatSideLines(matchCardFixtures['MC-11'].sides[1])).toEqual(['Player not published']);
  });
});
