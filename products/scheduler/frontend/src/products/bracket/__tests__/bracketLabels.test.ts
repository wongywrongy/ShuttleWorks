import { describe, it, expect } from 'vitest';
import { playUnitLabel, buildPlayUnitLabels, sideLabel, disciplineLabel } from '../bracketLabels';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

describe('playUnitLabel — single elimination stage names', () => {
  it('3-round event (maxRound=2): R0→QF, R1→SF, R2→F', () => {
    const at = (roundIndex: number, matchIndex: number) =>
      playUnitLabel({ discipline: 'MS', format: 'se', roundIndex, matchIndex, maxRound: 2 });
    expect(at(0, 0)).toBe('MS QF1');
    expect(at(0, 3)).toBe('MS QF4');
    expect(at(1, 0)).toBe('MS SF1');
    expect(at(1, 1)).toBe('MS SF2');
    // the final is a single match → no match number
    expect(at(2, 0)).toBe('MS F');
  });

  it('5-round event (maxRound=4): R0→R32, R1→R16, R2→QF, R3→SF, R4→F', () => {
    const at = (roundIndex: number) =>
      playUnitLabel({ discipline: 'WD', format: 'se', roundIndex, matchIndex: 0, maxRound: 4 });
    expect(at(0)).toBe('WD R321');   // round of 32, match 1
    expect(at(1)).toBe('WD R161');   // round of 16
    expect(at(2)).toBe('WD QF1');
    expect(at(3)).toBe('WD SF1');
    expect(at(4)).toBe('WD F');
  });

  it('round-robin reads "R{round}·{match}" (1-indexed), no stage names', () => {
    expect(playUnitLabel({ discipline: 'MS', format: 'rr', roundIndex: 0, matchIndex: 1, maxRound: 2 }))
      .toBe('MS R1·2');
    expect(playUnitLabel({ discipline: 'MS', format: 'rr', roundIndex: 2, matchIndex: 0, maxRound: 2 }))
      .toBe('MS R3·1');
  });
});

describe('buildPlayUnitLabels', () => {
  const data = {
    events: [
      { id: 'e1', discipline: 'MS', format: 'se' },
      { id: 'e2', discipline: 'XD', format: 'rr' },
    ],
    play_units: [
      { id: 'pu-a', event_id: 'e1', round_index: 0, match_index: 0 }, // QF1 (maxRound 2)
      { id: 'pu-b', event_id: 'e1', round_index: 2, match_index: 0 }, // F
      { id: 'pu-c', event_id: 'e2', round_index: 1, match_index: 0 }, // RR R2·1
    ],
  } as unknown as BracketTournamentDTO;

  it('computes maxRound per event and labels each unit', () => {
    const m = buildPlayUnitLabels(data);
    expect(m.get('pu-a')).toBe('MS QF1');
    expect(m.get('pu-b')).toBe('MS F');
    expect(m.get('pu-c')).toBe('XD R2·1');
  });
});

describe('sideLabel feeder reference', () => {
  const slot = { participant_id: null, feeder_play_unit_id: 'pu-a' };
  it('uses the friendly label when provided', () => {
    const labels = new Map([['pu-a', 'MS QF1']]);
    expect(sideLabel(null, slot, {}, labels)).toBe('Winner of MS QF1');
  });
  it('falls back to the raw id when no label map is given', () => {
    expect(sideLabel(null, slot, {})).toBe('Winner of pu-a');
  });
});

describe('disciplineLabel', () => {
  it('maps the five known codes to full names', () => {
    expect(disciplineLabel('MS')).toBe("Men's Singles");
    expect(disciplineLabel('WS')).toBe("Women's Singles");
    expect(disciplineLabel('MD')).toBe("Men's Doubles");
    expect(disciplineLabel('WD')).toBe("Women's Doubles");
    expect(disciplineLabel('XD')).toBe('Mixed Doubles');
  });

  it('passes an unknown code through unchanged', () => {
    expect(disciplineLabel('GEN')).toBe('GEN');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(disciplineLabel('')).toBe('');
    expect(disciplineLabel(null)).toBe('');
    expect(disciplineLabel(undefined)).toBe('');
  });

  // Regression: the discipline-name lookup must not leak Object.prototype
  // members. A plain-object map would make disciplineLabel('toString') return
  // a function; the null-prototype map keeps these as pass-through raw codes.
  it('treats Object.prototype keys as unknown codes (pass-through)', () => {
    expect(disciplineLabel('toString')).toBe('toString');
    expect(disciplineLabel('constructor')).toBe('constructor');
    expect(disciplineLabel('valueOf')).toBe('valueOf');
    expect(disciplineLabel('hasOwnProperty')).toBe('hasOwnProperty');
  });
});
