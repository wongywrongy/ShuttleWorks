import { describe, it, expect } from 'vitest';
import { safeCellText } from '../spreadsheetSafe';

describe('safeCellText', () => {
  it('leaves ordinary text untouched', () => {
    for (const s of ['Ada Lovelace', "O'Brien", 'St. Mary’s / U15', '', 'A - B']) {
      expect(safeCellText(s)).toBe(s);
    }
  });

  it('quotes every formula-leading character', () => {
    expect(safeCellText('=1+1')).toBe("'=1+1");
    expect(safeCellText('=HYPERLINK("http://evil","click")')).toBe(
      '\'=HYPERLINK("http://evil","click")',
    );
    expect(safeCellText("+cmd|'/c calc'!A0")).toBe("'+cmd|'/c calc'!A0");
    expect(safeCellText('-2+3')).toBe("'-2+3");
    expect(safeCellText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCellText('\t=1+1')).toBe("'\t=1+1");
    expect(safeCellText('\r=1+1')).toBe("'\r=1+1");
  });

  it('sees past leading spaces, the way Excel does', () => {
    expect(safeCellText('   =1+1')).toBe("'   =1+1");
    expect(safeCellText('  Ada')).toBe('  Ada');
  });

  it('quotes only once, so a repeat call is not cumulative in the sheet', () => {
    expect(safeCellText(safeCellText('=1+1'))).toBe("'=1+1");
  });

  it('stringifies non-strings and maps nullish to the empty cell', () => {
    expect(safeCellText(7)).toBe('7');
    expect(safeCellText(null)).toBe('');
    expect(safeCellText(undefined)).toBe('');
  });
});
