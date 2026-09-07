/**
 * Meet twin of the bracket export's formula-injection test: a school name or a
 * player name typed as `=1+1` must reach the workbook as inert text.
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
  Object.assign(URL, {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: () => {},
  });
  HTMLAnchorElement.prototype.click = () => {};
});

describe('meet xlsx exports are formula-injection safe', () => {
  it('quotes a `=1+1` school banner and player name in the roster export', async () => {
    sheets.length = 0;
    const { exportRosterXlsx } = await import('../xlsxExports');
    type Players = Parameters<typeof exportRosterXlsx>[0];
    type Groups = Parameters<typeof exportRosterXlsx>[1];
    await exportRosterXlsx(
      [{ id: 'p1', name: '=1+1', groupId: 'g1', ranks: ['MS1'] }] as unknown as Players,
      [{ id: 'g1', name: '=cmd' }] as unknown as Groups,
      { rankCounts: { MS: 1 } } as unknown as Parameters<typeof exportRosterXlsx>[2],
    );
    const values = sheets[0].allValues();
    expect(values).toContain("'=cmd");
    expect(values).toContain("'=1+1");
    expect(values).toContain(1); // the position number stays numeric
  });

  it('quotes a `=1+1` side name in the matches export', async () => {
    sheets.length = 0;
    const { exportMatchesXlsx } = await import('../xlsxExports');
    type Matches = Parameters<typeof exportMatchesXlsx>[0];
    type Players = Parameters<typeof exportMatchesXlsx>[1];
    type Groups = Parameters<typeof exportMatchesXlsx>[2];
    await exportMatchesXlsx(
      [{ id: 'm1', matchNumber: 1, eventRank: 'MS1', sideA: ['p1'], sideB: ['p2'] }] as unknown as Matches,
      [
        { id: 'p1', name: '=1+1', groupId: 'g1' },
        { id: 'p2', name: 'Ada', groupId: 'g2' },
      ] as unknown as Players,
      [
        { id: 'g1', name: '@evil' },
        { id: 'g2', name: 'Riverside' },
      ] as unknown as Groups,
    );
    const values = sheets[0].allValues();
    expect(values).toContain("'=1+1");
    expect(values).toContain("'@evil");
    expect(values).toContain('Ada');
    expect(values).toContain(1); // match number stays numeric
  });
});
