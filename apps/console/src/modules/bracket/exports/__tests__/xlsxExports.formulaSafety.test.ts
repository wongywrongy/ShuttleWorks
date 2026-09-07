/**
 * A player name typed as `=1+1` must land in the workbook as inert text
 * (`'=1+1`), not as a live Excel formula. ExcelJS is faked so the assertion is
 * about the VALUE handed to the cell, not about zip output.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

interface FakeCell {
  value: unknown;
  font?: unknown;
  fill?: unknown;
  border?: unknown;
  alignment?: unknown;
}

const sheets: FakeSheet[] = [];

class FakeRow {
  height = 0;
  font: unknown;
  alignment: unknown;
  private cells = new Map<number, FakeCell>();
  getCell(c: number): FakeCell {
    if (!this.cells.has(c)) this.cells.set(c, { value: null });
    return this.cells.get(c)!;
  }
  values(): unknown[] {
    return [...this.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.value);
  }
}

class FakeSheet {
  columns: unknown[] = [];
  private rows = new Map<number, FakeRow>();
  getRow(r: number): FakeRow {
    if (!this.rows.has(r)) this.rows.set(r, new FakeRow());
    return this.rows.get(r)!;
  }
  getColumn(): { alignment: unknown; font: unknown } {
    return { alignment: null, font: null };
  }
  mergeCells(): void {}
  allValues(): unknown[] {
    return [...this.rows.values()].flatMap((r) => r.values());
  }
}

class FakeWorkbook {
  creator = '';
  created = new Date(0);
  xlsx = { writeBuffer: async () => new ArrayBuffer(8) };
  addWorksheet(): FakeSheet {
    const s = new FakeSheet();
    sheets.push(s);
    return s;
  }
}

vi.mock('exceljs', () => ({ default: { Workbook: FakeWorkbook } }));

beforeAll(() => {
  // jsdom implements neither; the download path is incidental to this test.
  Object.assign(URL, {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: () => {},
  });
  // The download anchor's click would otherwise make jsdom attempt (and log a
  // slow failure on) a real navigation.
  HTMLAnchorElement.prototype.click = () => {};
});

describe('xlsx exports are formula-injection safe', () => {
  it('quotes a `=1+1` side name in the bracket matches export', async () => {
    sheets.length = 0;
    const { exportBracketMatchesXlsx } = await import('../xlsxExports');
    await exportBracketMatchesXlsx([
      {
        event: 'MS',
        discipline: 'Singles',
        n: 1,
        match: 'R1',
        sideA: '=1+1',
        sideB: '+cmd|calc',
        status: 'scheduled',
      },
    ]);
    const values = sheets[0].allValues();
    expect(values).toContain("'=1+1");
    expect(values).toContain("'+cmd|calc");
    expect(values).not.toContain('=1+1');
    // The match number stays a real number, not quoted text.
    expect(values).toContain(1);
  });

  it('quotes a `=1+1` player name and notes in the bracket roster export', async () => {
    sheets.length = 0;
    const { exportBracketRosterXlsx } = await import('../xlsxExports');
    await exportBracketRosterXlsx(
      [
        {
          id: 'p1',
          name: '=1+1',
          notes: '@SUM(A1)',
          restSlots: 2,
          availability: [],
        } as unknown as Parameters<typeof exportBracketRosterXlsx>[0][number],
      ],
      new Map(),
    );
    const values = sheets[0].allValues();
    expect(values).toContain("'=1+1");
    expect(values).toContain("'@SUM(A1)");
    expect(values).toContain(2); // restSlots stays numeric
  });
});
