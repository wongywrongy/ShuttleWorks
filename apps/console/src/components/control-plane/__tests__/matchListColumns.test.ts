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
 *  label on Bracket. See `bandedRowGeometry.test.ts` for the arithmetic.
 *  No ordinal `#` column (SP-CONSOLE-REFINE G6): the event code / play-unit
 *  label is the row's identity; a per-group counter carried none. */
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
    it('has the unified 6-column anatomy in order, with no ordinal column', () => {
      // P3: `Status` is gone and `Score` sits BETWEEN the two sides — a game
      // is read from one paired cell, not by aligning two per-side columns
      // across a name (match-card contract §3.4 / §6.2).
      expect(columns.map((c) => c.label)).toEqual([
        '', 'Event', 'Side A', 'Score', 'Side B', '',
      ]);
      expect(columns.map((c) => c.className)).toEqual([
        // The leading mark: an issue, or an exceptional LIVE / not-scheduled
        // cue. Never a routine state word.
        'w-5 shrink-0',
        // The one per-list column: sized to its own label vocabulary.
        eventClass,
        // The sides floor at NAME_COL_MIN, not at zero — see
        // `bandedRowGeometry.test.ts` for the arithmetic behind 10rem.
        'min-w-[10rem] flex-[3]',
        // w-40: three paired games with their separators
        // ("18–21, 21–15, 21–13") at text-2sm tabular.
        'w-40 shrink-0 text-center',
        'min-w-[10rem] flex-[3]',
        'w-8 shrink-0',
      ]);
    });

    it('gives no column a collapse priority — nothing here is optional', () => {
      // With Status and Issues gone the row holds only what an operator
      // reads. jsdom can't evaluate container queries anyway; the Console
      // browser contracts cover the real reflow.
      expect(columns.map((c) => c.priority ?? 1)).toEqual([1, 1, 1, 1, 1, 1]);
      expect(COL_PRIORITY_CLASS[2]).toBe('hidden @2xl/table:block');
    });

    it('the cell map mirrors the column spec (geometry + priority visibility)', () => {
      expect(cell).toEqual({
        warnGutter: 'w-5 shrink-0',
        event: eventClass,
        side: 'min-w-[10rem] flex-[3]',
        score: 'w-40 shrink-0 text-center',
        actionGutter: 'w-8 shrink-0',
      });
    });
  },
);
