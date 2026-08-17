import { describe, expect, it } from 'vitest';
import { formatPlayerName, formatSideName, sideNameLines, sideSurnameLine } from '../names';

describe('BWF name presentation', () => {
  it('moves the surname first, uppercased', () => {
    expect(formatPlayerName('Kei Nakamura')).toBe('NAKAMURA Kei');
    expect(formatPlayerName('Amir Al Fakhouri')).toBe('FAKHOURI Amir Al');
  });

  it('leaves mononyms, TBD and feeder placeholders untouched', () => {
    expect(formatPlayerName('Ronaldinho')).toBe('Ronaldinho');
    expect(formatPlayerName('TBD')).toBe('TBD');
    expect(formatPlayerName('Winner of MDC QF1')).toBe('Winner of MDC QF1');
    expect(formatPlayerName('Loser of XDC R163')).toBe('Loser of XDC R163');
  });

  it('formats every player in a joined side, preserving the joiner', () => {
    expect(formatSideName('Kei Nakamura / Vincent Tran')).toBe('NAKAMURA Kei / TRAN Vincent');
    expect(formatSideName('Kei Nakamura & Vincent Tran', ' & ')).toBe('NAKAMURA Kei & TRAN Vincent');
  });

  it('splits a side into one formatted line per player', () => {
    expect(sideNameLines('Sakura Ito / Maria Sanchez')).toEqual(['ITO Sakura', 'SANCHEZ Maria']);
    expect(sideNameLines('Mei Lin')).toEqual(['LIN Mei']);
  });
});

describe('sideSurnameLine — the venue board line (TV-1)', () => {
  it('reduces a doubles side to one line of surnames', () => {
    expect(sideSurnameLine('Amir Fakhouri / Bryce Whitmore')).toBe('FAKHOURI / WHITMORE');
  });

  it('handles the ampersand joiner the board uses', () => {
    expect(sideSurnameLine('Amir Fakhouri & Bryce Whitmore', ' & ')).toBe(
      'FAKHOURI / WHITMORE',
    );
  });

  it('passes placeholders through whole — they have no surname to take', () => {
    expect(sideSurnameLine('Winner of QF1')).toBe('Winner of QF1');
    expect(sideSurnameLine('TBD')).toBe('TBD');
  });

  it('keeps a mononym as itself', () => {
    expect(sideSurnameLine('Ronaldinho')).toBe('RONALDINHO');
  });
});
