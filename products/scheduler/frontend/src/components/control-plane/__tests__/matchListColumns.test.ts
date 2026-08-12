import { describe, expect, it } from 'vitest';
import {
  BRACKET_MATCH_CELL,
  BRACKET_MATCH_LIST_COLUMNS,
  MEET_MATCH_CELL,
  MEET_MATCH_LIST_COLUMNS,
} from '../matchListColumns';
import { COL_PRIORITY_CLASS } from '../BandedList';

/** The two lists share one anatomy and differ in exactly one column width —
 *  the event code, which holds a 4-char rank on Meet and a 10-char play-unit
 *  label on Bracket. See `bandedRowGeometry.test.ts` for the arithmetic. */
const LISTS = [
  {
    name: 'Meet',
    columns: MEET_MATCH_LIST_COLUMNS,
    cell: MEET_MATCH_CELL,
    eventClass: 'w-12 shrink-0',
  },
  {
    name: 'Bracket',
    columns: BRACKET_MATCH_LIST_COLUMNS,
    cell: BRACKET_MATCH_CELL,
    eventClass: 'w-28 shrink-0',
  },
] as const;

describe.each(LISTS)(
  '$name match list — the shared column geometry',
  ({ columns, cell, eventClass }) => {
    it('has the unified 7-column anatomy in order', () => {
      expect(columns.map((c) => c.label)).toEqual([
        '', '#', 'Event', 'Side A', 'Side B', 'Status', '',
      ]);
      expect(columns.map((c) => c.className)).toEqual([
        'w-4 shrink-0',
        'w-8 shrink-0',
        // The one per-list column: sized to its own label vocabulary.
        eventClass,
        // The sides floor at NAME_COL_MIN, not at zero — see
        // `bandedRowGeometry.test.ts` for the arithmetic behind 10rem.
        'min-w-[10rem] flex-[3]',
        'min-w-[10rem] flex-[3]',
        'w-[5.5rem] shrink-0 text-right',
        'w-8 shrink-0',
      ]);
    });

    it('collapses # and Status first when the surface narrows', () => {
      // jsdom can't evaluate container queries — pin the class strings; the
      // interaction-smoke Playwright scenario covers the real reflow.
      expect(columns.map((c) => c.priority ?? 1)).toEqual([
        1, 2, 1, 1, 1, 2, 1,
      ]);
      expect(COL_PRIORITY_CLASS[2]).toBe('hidden @2xl/table:block');
    });

    it('the cell map mirrors the column spec (geometry + priority visibility)', () => {
      expect(cell).toEqual({
        warnGutter: 'w-4 shrink-0',
        number: 'w-8 shrink-0 hidden @2xl/table:block',
        event: eventClass,
        side: 'min-w-[10rem] flex-[3]',
        status: 'w-[5.5rem] shrink-0 text-right hidden @2xl/table:block',
        actionGutter: 'w-8 shrink-0',
      });
    });
  },
);
