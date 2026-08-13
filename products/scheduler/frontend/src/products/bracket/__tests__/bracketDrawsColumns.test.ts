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
