/**
 * The Draws row's body cells must derive their geometry from `DRAW_COLUMNS`.
 *
 * Written after a real drift. The `Code` column's spec was widened (its
 * content is an operator-defined draw id, not a short token) but its BODY cell
 * still carried a hardcoded `w-16`. The header followed the spec and the body
 * did not, so two things broke at once: `md-classic` kept wrapping inside a
 * cell that was no longer 64px on paper, and every header cell after Code sat
 * ~96px right of its column, which is why `FORMAT` printed on top of `SIZE`.
 *
 * A rendering test would not have caught it: both cells render, and jsdom has
 * no layout. The invariant is lexical, so the test is too.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../BracketDrawsTab.tsx'),
  'utf8',
);

describe('the Draws row cannot drift from its column spec', () => {
  it('every body cell takes its geometry from DRAW_COLUMNS', () => {
    // Each `role="cell"` opens a body cell; its className must reference the
    // spec rather than restating a width that the spec can move out from under.
    const cells = SRC.split('role="cell"').slice(1);
    expect(cells.length).toBeGreaterThanOrEqual(7);
    const offenders = cells
      .map((chunk, i) => [i, chunk.slice(0, 220)] as const)
      .filter(([, chunk]) => !chunk.includes('colClass(DRAW_COLUMNS['))
      .map(([i, chunk]) => `cell ${i}: ${chunk.split('\n')[1]?.trim() ?? chunk.slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it('no body cell restates a bare Tailwind width', () => {
    // The specific shape that drifted: `className="w-16 shrink-0 …"`.
    const cells = SRC.split('role="cell"').slice(1).map((c) => c.slice(0, 220));
    for (const chunk of cells) {
      expect(chunk, chunk.slice(0, 90)).not.toMatch(/className="[^"]*\bw-\d/);
    }
  });
});

/**
 * The row has a width BUDGET, and it has been blown twice.
 *
 * At 1280 the Draws content box is about 950px. Widening one column without
 * checking the total is what put "FORMAT" ink on top of "SIZE" and turned
 * "Single elimination" into one character per line at 273px a row: the
 * `flex-1` column absorbs every overrun by collapsing, so the damage never
 * appears where the change was made.
 *
 * jsdom cannot lay this out, so the check is arithmetic on the spec itself.
 */

const CONTENT_BUDGET_PX = 950; // ~1280 viewport, minus the rail and sidebar
const GAP_PX = 12; // gap-3 between cells
const INSET_PX = 40; // px-5 pair on the row

/** px a Tailwind width/min-width class declares; 0 when it declares none. */
function declaredPx(cls: string): number {
  const rem = /(?:^|\s)(?:min-)?w-\[(\d+(?:\.\d+)?)rem\]/.exec(cls);
  if (rem) return parseFloat(rem[1]) * 16;
  const step = /(?:^|\s)(?:min-)?w-(\d+(?:\.\d+)?)(?:\s|$)/.exec(cls);
  return step ? parseFloat(step[1]) * 4 : 0;
}

describe('the Draws row fits its width budget', () => {
  // Parsed from the source so the test reads the shipped spec, not a copy.
  const specBlock = SRC.slice(SRC.indexOf('const DRAW_COLUMNS'), SRC.indexOf('];', SRC.indexOf('const DRAW_COLUMNS')));
  const classNames = [...specBlock.matchAll(/className: '([^']+)'/g)].map((m) => m[1]);

  it('declares seven columns', () => {
    expect(classNames).toHaveLength(7);
  });

  it('every column, at its declared floor, fits the content box', () => {
    const declared = classNames.map(declaredPx);
    // A column declaring nothing would silently pass; none may.
    expect(declared.filter((px) => px === 0)).toEqual([]);
    const total =
      declared.reduce((a, b) => a + b, 0) + GAP_PX * (classNames.length - 1) + INSET_PX;
    expect(total, `columns total ${total}px against a ${CONTENT_BUDGET_PX}px box`).
      toBeLessThanOrEqual(CONTENT_BUDGET_PX);
  });

  it('the growing column carries a floor, so it cannot be crushed to zero', () => {
    const grower = classNames.find((c) => c.includes('flex-1'));
    expect(grower).toBeDefined();
    expect(grower, 'the flex-1 column must not be min-w-0').not.toContain('min-w-0');
    expect(declaredPx(grower!)).toBeGreaterThan(0);
  });
});
