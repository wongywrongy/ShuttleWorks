import { describe, expect, it } from 'vitest';
import { formatPlayerName, formatSideName, sideNameLines, sideSurnameLine } from '../names';

describe('canonical name presentation', () => {
  it('preserves the stored display name verbatim', () => {
    expect(formatPlayerName('Kei Nakamura')).toBe('Kei Nakamura');
    expect(formatPlayerName('Amir Al Fakhouri')).toBe('Amir Al Fakhouri');
  });

  it('leaves mononyms, TBD and feeder placeholders untouched', () => {
    expect(formatPlayerName('Ronaldinho')).toBe('Ronaldinho');
    expect(formatPlayerName('TBD')).toBe('TBD');
    expect(formatPlayerName('Winner of MDC QF1')).toBe('Winner of MDC QF1');
    expect(formatPlayerName('Loser of XDC R163')).toBe('Loser of XDC R163');
  });

  it('formats every player in a joined side, preserving the joiner', () => {
    expect(formatSideName('Kei Nakamura / Vincent Tran')).toBe('Kei Nakamura / Vincent Tran');
    expect(formatSideName('Kei Nakamura & Vincent Tran', ' & ')).toBe('Kei Nakamura & Vincent Tran');
  });

  it('splits a side into one formatted line per player', () => {
    expect(sideNameLines('Sakura Ito / Maria Sanchez')).toEqual(['Sakura Ito', 'Maria Sanchez']);
    expect(sideNameLines('Mei Lin')).toEqual(['Mei Lin']);
  });
});

describe('sideSurnameLine — the venue board line', () => {
  it('reduces a doubles side to one line while preserving names', () => {
    expect(sideSurnameLine('Amir Fakhouri / Bryce Whitmore')).toBe('Amir Fakhouri / Bryce Whitmore');
  });

  it('handles the ampersand joiner the board uses', () => {
    expect(sideSurnameLine('Amir Fakhouri & Bryce Whitmore', ' & ')).toBe(
      'Amir Fakhouri / Bryce Whitmore',
    );
  });

  it('passes placeholders through whole — they have no surname to take', () => {
    expect(sideSurnameLine('Winner of QF1')).toBe('Winner of QF1');
    expect(sideSurnameLine('TBD')).toBe('TBD');
  });

  it('keeps a mononym as itself', () => {
    expect(sideSurnameLine('Ronaldinho')).toBe('Ronaldinho');
  });
});
