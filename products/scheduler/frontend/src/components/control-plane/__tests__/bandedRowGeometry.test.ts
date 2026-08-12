/**
 * Banded-row geometry — the owner's ruling, held to arithmetic.
 *
 * > "every row should have the same height. it should already consider the
 * >  names and their length. doesn't matter for singles or doubles. this
 * >  allows uniformity. right now we have so much squish line wrapping etc"
 *
 * Every one of these numbers is a layout outcome jsdom cannot compute: it has
 * no font metrics, no container queries and no stylesheet. What IS checkable —
 * and what a later "just shave a few pixels" edit would break silently — is
 * the arithmetic the classes encode, measured against the real data.
 *
 * The measurements come from the two seeded demo workspaces over HTTP,
 * 194 real side labels:
 *
 *   longest doubles pairing    37 chars  "Diego Alcantara / Shruti Kalyanaraman"
 *   longest single name        18 chars  "Rohan Balakrishnan"
 *   longest unbreakable token  12 chars  "Kalyanaraman"
 *   median side label          16 chars
 *   p95                        33 chars
 *
 * The 12-char token is the hard floor: a column narrower than that word forces
 * a mid-word break, the "Nashville / Badminto / n" failure already fixed once
 * on the Hub.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BANDED_ROW_CLASSES,
  BANDED_ROW_LINES,
  BANDED_ROW_MIN_H,
  NAME_COL_MIN,
  type BandedListColumn,
} from '../BandedList';
import {
  COL_PRIORITY_MIN_CONTAINER_PX,
  dockMinContentWidth,
} from '../bandedDockWidth';
import {
  MATCH_LIST_COLUMNS,
  MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
} from '../matchListColumns';

const SRC = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

// ── The measured data ──────────────────────────────────────────────────────
const LONGEST_SIDE_LABEL = 37;
const LONGEST_WRAPPED_LINE = 19; // "Shruti Kalyanaraman", the longer half
const LONGEST_UNBREAKABLE_TOKEN = 12; // "Kalyanaraman"

// ── The type scale the rows are built from ─────────────────────────────────
/** `text-sm` = `--text-sm` = 0.875rem. */
const TEXT_SM_PX = 14;
/** `leading-relaxed`, the heaviest leading any banded cell uses. */
const LEADING_RELAXED = 1.625;
const LINE_BOX_PX = TEXT_SM_PX * LEADING_RELAXED; // 22.75
/** Conservative mixed-case advance for Geist — real names run nearer 0.5em,
 *  so every derivation below has slack rather than being on the edge. */
const CHAR_PX = 0.55 * TEXT_SM_PX; // 7.7

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

describe('every banded row reserves the same number of lines', () => {
  it('reserves 2 lines — the measured worst case needs 2, the median needs 1', () => {
    // One line leaves every doubles pairing overflowing its row (the ragged
    // list the ruling is about); three spends a blank line on the 50%+ of
    // rows at or under the 16-char median.
    expect(BANDED_ROW_LINES).toBe(2);
  });

  it('the reservation is at least that many line boxes tall', () => {
    // 2 × 22.75 = 45.5px of text; the class must cover it or a doubles row is
    // taller than a singles row again and the list goes ragged.
    expect(classPx(BANDED_ROW_MIN_H)).toBeGreaterThanOrEqual(
      BANDED_ROW_LINES * LINE_BOX_PX,
    );
  });

  it('the reservation is on the spacing ladder', () => {
    // BRAND.md §4 — 0/2/4/8/12/16/24/32/48/64/96. 48px is the first rung at or
    // above 45.5; the next (64px) would waste 18px on every row of every list.
    expect([0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96]).toContain(
      classPx(BANDED_ROW_MIN_H),
    );
  });

  it('it is a MIN-height, so an outlier grows instead of being clipped', () => {
    // Truncation is banned product-wide, so a label longer than anything in
    // the measured data must be able to take a third line. `h-12` would clip
    // it (or overflow it, which is worse — it would overlap the next row).
    expect(BANDED_ROW_MIN_H.startsWith('min-h-')).toBe(true);
    expect(BANDED_ROW_CLASSES).toContain(BANDED_ROW_MIN_H);
    expect(BANDED_ROW_CLASSES).not.toMatch(/(?:^|\s)h-\d/);
  });

  it('singles and doubles land on the same height in the reserved range', () => {
    // The point of the ruling, restated as the property it needs: any label
    // from 1 up to BANDED_ROW_LINES lines produces the identical row height.
    const rowHeight = (lines: number) =>
      Math.max(classPx(BANDED_ROW_MIN_H), lines * LINE_BOX_PX);
    expect(rowHeight(1)).toBe(rowHeight(BANDED_ROW_LINES));
    // …and beyond it, the row grows rather than losing characters.
    expect(rowHeight(BANDED_ROW_LINES + 1)).toBeGreaterThan(rowHeight(1));
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
    // The two rulings are one invariant: the column must be wide enough that
    // the 37-char pairing fits in the 2 lines the row reserves. This is the
    // assertion that fails if EITHER number is narrowed later.
    const charsPerLine = Math.floor(classPx(NAME_COL_MIN) / CHAR_PX);
    expect(charsPerLine).toBeGreaterThanOrEqual(LONGEST_WRAPPED_LINE);
    expect(charsPerLine * BANDED_ROW_LINES).toBeGreaterThanOrEqual(
      LONGEST_SIDE_LABEL,
    );
  });

  it('every column carrying a person name uses it', () => {
    // Source-scan, the same call `matchListParity.test.ts` makes: these column
    // sets live in four different products and only a scan holds all four.
    const NAME_COLUMNS: ReadonlyArray<readonly [string, string]> = [
      ['components/control-plane/matchListColumns.ts', "label: 'Side A'"],
      ['components/control-plane/matchListColumns.ts', "label: 'Side B'"],
      ['products/bracket/BracketRosterTab.tsx', "label: 'Player'"],
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
});

describe('the dock floor is derived from the column set', () => {
  /** The narrowest container at which every column in `cols` is visible. */
  const highestTier = (cols: BandedListColumn[]) =>
    Math.max(...cols.map((c) => COL_PRIORITY_MIN_CONTAINER_PX[c.priority ?? 1]));

  it('never leaves the list below the tier its own columns query', () => {
    // Defect D11's class: the 560 default sat under the 672 `@2xl` tier, so
    // selecting a match deleted `#` and `Status` with nothing to say so.
    expect(dockMinContentWidth(MATCH_LIST_COLUMNS)).toBeGreaterThanOrEqual(
      highestTier(MATCH_LIST_COLUMNS),
    );
    expect(highestTier(MATCH_LIST_COLUMNS)).toBe(672);
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

  it('reads `w-[5.5rem]` and `min-w-[10rem]` as well as ladder steps', () => {
    // 16 + 32 + 80 + 160 + 160 + 88 + 32 = 568 columns, + 6 × 12 gap = 640,
    // + 40 inset = 680 — above the 672 tier, so the sum term is what binds.
    expect(dockMinContentWidth(MATCH_LIST_COLUMNS)).toBe(680);
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

  it('the shared match floor is the derived value, not a copy of it', () => {
    expect(MATCH_LIST_DOCK_MIN_CONTENT_WIDTH).toBe(
      dockMinContentWidth(MATCH_LIST_COLUMNS),
    );
  });
});
