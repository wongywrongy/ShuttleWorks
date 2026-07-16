import { describe, expect, it } from 'vitest';
import { MATCH_CELL, MATCH_LIST_COLUMNS } from '../matchListColumns';
import { COL_PRIORITY_CLASS } from '../BandedList';

describe('MATCH_LIST_COLUMNS — the one column geometry both match lists share', () => {
  it('has the unified 7-column anatomy in order', () => {
    expect(MATCH_LIST_COLUMNS.map((c) => c.label)).toEqual([
      '', '#', 'Event', 'Side A', 'Side B', 'Status', '',
    ]);
    expect(MATCH_LIST_COLUMNS.map((c) => c.className)).toEqual([
      'w-4 shrink-0',
      'w-8 shrink-0',
      'w-20 shrink-0',
      'min-w-0 flex-[3]',
      'min-w-0 flex-[3]',
      'w-[5.5rem] shrink-0 text-right',
      'w-8 shrink-0',
    ]);
  });

  it('collapses # and Status first when the surface narrows', () => {
    // jsdom can't evaluate container queries — pin the class strings; the
    // interaction-smoke Playwright scenario covers the real reflow.
    expect(MATCH_LIST_COLUMNS.map((c) => c.priority ?? 1)).toEqual([
      1, 2, 1, 1, 1, 2, 1,
    ]);
    expect(COL_PRIORITY_CLASS[2]).toBe('hidden @2xl/table:block');
  });

  it('MATCH_CELL mirrors the column spec (geometry + priority visibility)', () => {
    expect(MATCH_CELL).toEqual({
      warnGutter: 'w-4 shrink-0',
      number: 'w-8 shrink-0 hidden @2xl/table:block',
      event: 'w-20 shrink-0',
      side: 'min-w-0 flex-[3]',
      status: 'w-[5.5rem] shrink-0 text-right hidden @2xl/table:block',
      actionGutter: 'w-8 shrink-0',
    });
  });
});
