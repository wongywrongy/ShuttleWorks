/**
 * Banded-row geometry — the owner's rulings, held to arithmetic.
 *
 * > "every row should have the same height. it should already consider the
 * >  names and their length. doesn't matter for singles or doubles. this
 * >  allows uniformity. right now we have so much squish line wrapping etc"
 *
 * > "the side A and side B name for every row is too much. we dont need to
 * >  list it. waste of space."
 *
 * > "some rows are still uneven WDC R16C splits into 2 lines. which is
 * >  unacceptable."
 *
 * Every one of these numbers is a layout outcome jsdom cannot compute: it has
 * no font metrics, no container queries and no stylesheet. What IS checkable —
 * and what a later "just shave a few pixels" edit would break silently — is
 * the arithmetic the classes encode, measured against the real data.
 *
 * The measurements come from the two seeded demo workspaces over HTTP.
 *
 * 194 real side labels (names only — the school left the row, so the
 * measurement and the render finally describe the same string):
 *
 *   longest doubles pairing    37 chars  "Diego Alcantara / Shruti Kalyanaraman"
 *   longest single name        18 chars  "Rohan Balakrishnan"
 *   longest unbreakable token  12 chars  "Kalyanaraman"
 *   median side label          16 chars
 *   p95                        33 chars
 *
 * 60 play-unit labels off the seeded double-elimination draw, plus the meet's
 * event ranks:
 *
 *   longest bracket label      10 chars  "XDC L R327" (also "XDC L R166")
 *   longest meet event rank     4 chars  "XD11"
 *
 * The 12-char token is the hard floor for a name column: a column narrower
 * than that word forces a mid-word break, the "Nashville / Badminto / n"
 * failure already fixed once on the Hub.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BANDED_ROW_BASE,
  NAME_COL_MIN,
  type BandedListColumn,
} from '../BandedList';
import {
  BANDED_ROW_MIN_H,
  COL_PRIORITY_MIN_CONTAINER_PX,
  bandedRowClasses,
  bandedRowLines,
  dockMinContentWidth,
} from '../bandedDockWidth';
import {
  BRACKET_EVENT_COL,
  BRACKET_MATCH_LIST_COLUMNS,
  BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  MEET_EVENT_COL,
  MEET_MATCH_LIST_COLUMNS,
  MEET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
} from '../matchListColumns';

const SRC = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

// ── The measured data ──────────────────────────────────────────────────────
const LONGEST_SIDE_LABEL = 37;
const LONGEST_WRAPPED_LINE = 19; // "Shruti Kalyanaraman", the longer half
const LONGEST_UNBREAKABLE_TOKEN = 12; // "Kalyanaraman"
const LONGEST_BRACKET_LABEL = 10; // "XDC L R327"
const LONGEST_MEET_RANK = 4; // "XD11"

// ── The type scale the rows are built from ─────────────────────────────────
/** `text-2sm` = `--text-2sm` = 0.8125rem — the data-row body size since the
 *  G5 density pass (SP-CONSOLE-REFINE); `BANDED_ROW_BASE` carries it. */
const TEXT_2SM_PX = 13;
/** `leading-relaxed`, the heaviest leading any banded cell uses. */
const LEADING_RELAXED = 1.625;
const LINE_BOX_PX = TEXT_2SM_PX * LEADING_RELAXED; // 21.125
/** Conservative mixed-case advance for Geist — real names run nearer 0.5em,
 *  so every derivation below has slack rather than being on the edge. */
const CHAR_PX = 0.55 * TEXT_2SM_PX; // 7.15
/** Both event cells are `font-semibold`, which is wider than body text. */
const CHAR_PX_SEMIBOLD = 0.58 * TEXT_2SM_PX; // 7.54
/** `px-1.5`, both sides — the inner inset on the bracket event cell. Its
 *  content box is that much narrower than the column. */
const BRACKET_EVENT_INSET_PX = 12;

/** px a Tailwind width/height class declares: `min-h-12` → 48 (ladder step ×
 *  4px), `min-w-[10rem]` → 160. Deliberately re-implemented here rather than
 *  imported: a shared parser would let a bad class and a bad test agree. */
const classPx = (cls: string): number => {
  const rem = /-\[(\d+(?:\.\d+)?)rem\]$/.exec(cls);
  if (rem) return Number(rem[1]) * 16;
  const step = /-(\d+)$/.exec(cls);
  expect(step, `${cls} declares no parseable width`).not.toBeNull();
  return Number(step![1]) * 4;
};

/** A column set with nothing that can wrap — numbers, a status, an action
 *  gutter. Bracket Draws' shape, which is the surface that pays when the
 *  reservation is global. */
const PLAIN_COLUMNS: BandedListColumn[] = [
  { label: 'Code', className: 'w-16 shrink-0' },
  { label: 'Size', className: 'w-12 shrink-0 text-right' },
  { label: 'Status', className: 'w-28 shrink-0 text-right' },
];

describe('a row reserves the lines ITS OWN columns need', () => {
  it('reserves 2 lines for a column set carrying a name, 1 for one that is not', () => {
    // The ruling — "it should already consider the names and their length" —
    // is a per-list property, not a constant. A name wraps, so a list of
    // names reserves the second line; a list of fixed-width numeric cells has
    // nothing that can wrap and must not be charged for it.
    expect(bandedRowLines(MEET_MATCH_LIST_COLUMNS)).toBe(2);
    expect(bandedRowLines(BRACKET_MATCH_LIST_COLUMNS)).toBe(2);
    expect(bandedRowLines(PLAIN_COLUMNS)).toBe(1);
  });

  it('reads the reservation off the columns, with no second per-surface knob', () => {
    // `NAME_COL_MIN` is the marker, so name-ness is declared once — in the
    // column definition. A hand-set `rowLines` prop would be a second number
    // to keep in step with the first, which is the drift the derivation
    // exists to prevent. No banded surface may pass one.
    const SURFACES = [
      'products/meet/matches/MatchesSpreadsheet.tsx',
      'products/bracket/BracketMatchesTab.tsx',
      'products/bracket/BracketRosterTab.tsx',
      'products/bracket/BracketDrawsTab.tsx',
      'products/bracket/StandingsTable.tsx',
      'products/bracket/standingsColumns.ts',
      'products/entries/EntriesDesk.tsx',
    ];
    for (const rel of SURFACES) {
      expect(read(rel), rel).not.toMatch(/rowLines=|BANDED_ROW_MIN_H\[/);
    }
  });

  it('every reservation is at least that many line boxes tall', () => {
    // 21.125px a line; the class must cover it or a wrapped row is taller than
    // an unwrapped one again and the list goes ragged.
    for (const lines of [1, 2] as const) {
      expect(classPx(BANDED_ROW_MIN_H[lines])).toBeGreaterThanOrEqual(
        lines * LINE_BOX_PX,
      );
    }
  });

  it('every reservation is on the spacing ladder', () => {
    // BRAND.md §4 — 0/2/4/8/12/16/24/32/48/64/96. 24px is the first rung at
    // or above 22.75 (and exactly WCAG 2.2 SC 2.5.8's minimum target for a
    // clickable row); 48px the first at or above 45.5. The next rungs would
    // waste 8px and 18px on every row of every list.
    const LADDER = [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96];
    for (const lines of [1, 2] as const) {
      expect(LADDER).toContain(classPx(BANDED_ROW_MIN_H[lines]));
    }
  });

  it('a name list reserves strictly more than a plain one', () => {
    // The whole point of deriving it. Under the global `BANDED_ROW_LINES = 2`
    // these were equal, and Bracket Draws paid 48px a row to hold 28px of
    // buttons and numbers.
    expect(classPx(BANDED_ROW_MIN_H[2])).toBeGreaterThan(
      classPx(BANDED_ROW_MIN_H[1]),
    );
  });

  it('it is a MIN-height, so an outlier grows instead of being clipped', () => {
    // Truncation is banned product-wide, so a label longer than anything in
    // the measured data must be able to take another line. `h-12` would clip
    // it (or overflow it, which is worse — it would overlap the next row).
    for (const lines of [1, 2] as const) {
      expect(BANDED_ROW_MIN_H[lines].startsWith('min-h-')).toBe(true);
    }
    expect(BANDED_ROW_BASE).not.toMatch(/(?:^|\s)h-\d/);
    expect(BANDED_ROW_BASE).not.toMatch(/min-h-/);
  });

  it('composes the shell out of the shared base plus that reservation', () => {
    for (const cols of [MEET_MATCH_LIST_COLUMNS, PLAIN_COLUMNS]) {
      const shell = bandedRowClasses(cols);
      expect(shell).toContain(BANDED_ROW_BASE);
      expect(shell).toContain(BANDED_ROW_MIN_H[bandedRowLines(cols)]);
    }
  });

  it('singles and doubles land on the same height in the reserved range', () => {
    // The point of the first ruling, restated as the property it needs: any
    // label from 1 up to the reserved line count produces the identical row
    // height.
    const lines = bandedRowLines(MEET_MATCH_LIST_COLUMNS);
    const rowHeight = (n: number) =>
      Math.max(classPx(BANDED_ROW_MIN_H[lines]), n * LINE_BOX_PX);
    expect(rowHeight(1)).toBe(rowHeight(lines));
    // …and beyond it, the row grows rather than losing characters.
    expect(rowHeight(lines + 1)).toBeGreaterThan(rowHeight(1));
  });
});

describe('flexible name columns have a real minimum, not `min-w-0`', () => {
  it('clears the longest unbreakable token with headroom', () => {
    // Below the widest single WORD, `break-words` starts breaking mid-word.
    expect(classPx(NAME_COL_MIN)).toBeGreaterThan(
      LONGEST_UNBREAKABLE_TOKEN * CHAR_PX,
    );
  });

  it('holds the worst measured label inside the reserved lines', () => {
    // Two rulings, one invariant: the column must be wide enough that the
    // 37-char pairing fits in the lines the row reserves. This is the
    // assertion that fails if EITHER number is narrowed later. The 37 chars
    // are names only — the school no longer rides along in the same cell, so
    // this measurement describes what the row actually renders.
    const charsPerLine = Math.floor(classPx(NAME_COL_MIN) / CHAR_PX);
    expect(charsPerLine).toBeGreaterThanOrEqual(LONGEST_WRAPPED_LINE);
    expect(
      charsPerLine * bandedRowLines(MEET_MATCH_LIST_COLUMNS),
    ).toBeGreaterThanOrEqual(LONGEST_SIDE_LABEL);
  });

  it('every column carrying a person or team name uses it', () => {
    // Source-scan, the same call `matchListParity.test.ts` makes: these column
    // sets live in five different products and only a scan holds all five.
    // Standings is in the list because `Participant.name` is a player OR a
    // team — "Nashville Badminton Association" is in-vocabulary there.
    const NAME_COLUMNS: ReadonlyArray<readonly [string, string]> = [
      ['components/control-plane/matchListColumns.ts', "label: 'Side A'"],
      ['components/control-plane/matchListColumns.ts', "label: 'Side B'"],
      ['products/bracket/BracketRosterTab.tsx', "label: 'Player'"],
      ['products/bracket/standingsColumns.ts', "label: 'Player'"],
      ['products/entries/EntriesDesk.tsx', "label: 'Entrant'"],
    ];
    for (const [file, marker] of NAME_COLUMNS) {
      const line = read(file)
        .split('\n')
        .find((l) => l.includes(marker));
      expect(line, `${file} has no ${marker} column`).toBeDefined();
      expect(line, `${marker} in ${file}`).toContain('NAME_COL_MIN');
      expect(line, `${marker} in ${file}`).not.toContain('min-w-0');
    }
  });

  it('the one-line branch still works, even with no surface using it today', () => {
    // Bracket Draws WAS this surface. Its `Code` column looked like a short
    // fixed token and turned out to be operator text capped at 40 characters:
    // at w-16 it wrapped "md-classic" into "md-" / "classic" in every row, so
    // the 7px it appeared to save was bought by the very wrapping the
    // reservation exists to prevent. It is a name column now, and every banded
    // surface in the app declares one.
    //
    // So the 1-line branch has no production consumer. It is kept because the
    // reservation is DERIVED — a future column set without a name must get one
    // line without anyone remembering to ask — and it is tested directly here
    // rather than through a surface, because pretending a consumer exists is
    // how the Draws entry above went stale.
    expect(bandedRowLines([{ label: 'Pos', className: 'w-7 shrink-0' }])).toBe(1);
    expect(bandedRowClasses([{ label: 'Pos', className: 'w-7 shrink-0' }])).toContain(
      BANDED_ROW_MIN_H[1],
    );
  });
});

describe('the event column is derived from each list own label vocabulary', () => {
  /** Content width a cell of `cls` offers, minus any inner inset. */
  const contentPx = (cls: string, inset = 0) => classPx(cls) - inset;

  it('holds the longest bracket play-unit label on ONE line', () => {
    // "XDC L R327" at text-sm font-semibold. The shared `w-20` left 68px of
    // content for ~81px of label, so `break-words` split it at its space and
    // the row went to two lines — an identifier broken across lines, inside a
    // uniform row that then held one line of everything else.
    expect(
      contentPx(BRACKET_EVENT_COL, BRACKET_EVENT_INSET_PX),
    ).toBeGreaterThanOrEqual(LONGEST_BRACKET_LABEL * CHAR_PX_SEMIBOLD);
  });

  it('leaves the bracket label headroom for a longer discipline code', () => {
    // The discipline code is operator data; "XDC" is not a ceiling. Two
    // characters of slack, so the next one that appears does not immediately
    // wrap.
    expect(
      contentPx(BRACKET_EVENT_COL, BRACKET_EVENT_INSET_PX),
    ).toBeGreaterThanOrEqual((LONGEST_BRACKET_LABEL + 2) * CHAR_PX_SEMIBOLD);
  });

  it('holds the longest meet event rank, and is narrower for it', () => {
    // "XD11" is 4 chars — a third of the bracket's worst case. Meet was
    // spending the bracket's width on it, and taking that ~32px from the two
    // name columns.
    expect(contentPx(MEET_EVENT_COL)).toBeGreaterThanOrEqual(
      LONGEST_MEET_RANK * CHAR_PX_SEMIBOLD,
    );
    expect(classPx(MEET_EVENT_COL)).toBeLessThan(classPx(BRACKET_EVENT_COL));
    // …and narrower than the one-size `w-20` both lists used to share, which
    // is where the width given back to Side A / Side B comes from.
    expect(classPx(MEET_EVENT_COL)).toBeLessThan(80);
  });

  it('is the ONLY column the two lists differ on', () => {
    // Everything else stays shared — same anatomy, same priorities, same
    // labels, so the two surfaces still cannot drift.
    expect(MEET_MATCH_LIST_COLUMNS.map((c) => c.label)).toEqual(
      BRACKET_MATCH_LIST_COLUMNS.map((c) => c.label),
    );
    expect(MEET_MATCH_LIST_COLUMNS.map((c) => c.priority)).toEqual(
      BRACKET_MATCH_LIST_COLUMNS.map((c) => c.priority),
    );
    const differing = MEET_MATCH_LIST_COLUMNS.filter(
      (c, i) => c.className !== BRACKET_MATCH_LIST_COLUMNS[i].className,
    ).map((c) => c.label);
    expect(differing).toEqual(['Event']);
  });
});

describe('the dock floor is derived from the column set', () => {
  /** The narrowest container at which every column in `cols` is visible. */
  const highestTier = (cols: BandedListColumn[]) =>
    Math.max(...cols.map((c) => COL_PRIORITY_MIN_CONTAINER_PX[c.priority ?? 1]));

  it('never leaves the list below the tier its own columns query', () => {
    // Defect D11's class: the 560 default sat under the 672 `@2xl` tier, so
    // selecting a match deleted `#` and `Status` with nothing to say so.
    for (const cols of [MEET_MATCH_LIST_COLUMNS, BRACKET_MATCH_LIST_COLUMNS]) {
      expect(dockMinContentWidth(cols)).toBeGreaterThanOrEqual(
        highestTier(cols),
      );
      expect(highestTier(cols)).toBe(672);
    }
  });

  it('also covers the columns own declared widths plus the row gutter', () => {
    // A priority-3 set whose fixed cells alone exceed 896: the tier term is
    // not enough on its own, which is why the formula is a max of both.
    const wide: BandedListColumn[] = [
      { label: 'A', className: 'w-80 shrink-0' },
      { label: 'B', className: 'w-80 shrink-0' },
      { label: 'C', className: 'w-80 shrink-0' },
      { label: 'D', className: 'w-80 shrink-0', priority: 3 },
    ];
    // 4 × 320 + 3 × 12 gap + 40 inset = 1356, above the 896 tier.
    expect(dockMinContentWidth(wide)).toBe(1356);
  });

  it('re-derives per list when the event column changes width', () => {
    // Meet: 16 + 32 + 48 + 160 + 160 + 88 + 32 = 536 columns, + 6 × 12 gap =
    // 608, + 40 inset = 648 — under the 672 tier, so the TIER binds.
    expect(dockMinContentWidth(MEET_MATCH_LIST_COLUMNS)).toBe(672);
    // Bracket: the same sum with a 112px event column = 600, + 72 + 40 = 712,
    // above the tier, so the sum binds. One shared floor could not be both.
    expect(dockMinContentWidth(BRACKET_MATCH_LIST_COLUMNS)).toBe(712);
  });

  it('reads `w-[5.5rem]` and `min-w-[10rem]` as well as ladder steps', () => {
    // The arbitrary-value columns have to count toward the sum or the floor
    // silently under-reports by 248px on both lists.
    expect(BRACKET_MATCH_LIST_COLUMNS[5].className).toContain('w-[5.5rem]');
    expect(BRACKET_MATCH_LIST_COLUMNS[3].className).toContain('min-w-[10rem]');
    expect(dockMinContentWidth(BRACKET_MATCH_LIST_COLUMNS)).toBeGreaterThan(
      highestTier(BRACKET_MATCH_LIST_COLUMNS),
    );
  });

  it('no banded surface hand-picks its floor any more', () => {
    const SURFACES = [
      'products/meet/matches/MatchesSpreadsheet.tsx',
      'products/bracket/BracketMatchesTab.tsx',
      'products/bracket/BracketRosterTab.tsx',
      'products/bracket/BracketDrawsTab.tsx',
    ];
    for (const rel of SURFACES) {
      const src = read(rel);
      // A numeric literal is exactly the guess this replaces. (LiveView's
      // deliberate `minContentWidth={0}` pinned rail is not a banded list and
      // is not in this set.)
      expect(src, rel).not.toMatch(/minContentWidth=\{\d+\}/);
      expect(src, rel).toMatch(/minContentWidth=\{[A-Z_]+\}/);
    }
  });

  it('each match floor is the derived value, not a copy of it', () => {
    expect(MEET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH).toBe(
      dockMinContentWidth(MEET_MATCH_LIST_COLUMNS),
    );
    expect(BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH).toBe(
      dockMinContentWidth(BRACKET_MATCH_LIST_COLUMNS),
    );
  });
});
