/**
 * Shell layout contract — holds the operator shell's landmark structure and
 * its narrow-viewport reachability to the files that actually ship.
 *
 * The 2026-08-11 design audit (theme T4) found the workspace content column
 * resolving to ~110px at 390px, with two surfaces vanishing entirely rather
 * than crowding: no scrollbar, no swipe, nothing to hint they existed. The
 * shell fix (an off-canvas rail) is behaviour and is tested as behaviour in
 * `product-shell/__tests__/WorkspaceShell.responsive.test.tsx`.
 *
 * What is left over is layout — flex minimums, overflow axes, and one
 * landmark element. jsdom applies no stylesheet and runs no layout engine, so
 * a rendering test cannot see any of it: `getBoundingClientRect()` is all
 * zeroes and `getComputedStyle` knows nothing of a Tailwind class. These are
 * therefore file-level assertions, the same call `motionContract.test.ts`
 * makes for the same reason. Each pins the specific mechanism that failed,
 * not a whole className string.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

const readSrc = (p: string) => readFileSync(path.join(SRC, p), 'utf8');

const authedLayout = readSrc('app/AuthedLayout.tsx');
const appShell = readSrc('app/AppShell.tsx');
const rosterTab = readSrc('products/meet/roster/RosterTab.tsx');
const hubPage = readSrc('products/hub/HubPage.tsx');

/** Source with comments removed — these files DISCUSS `<main>` in prose, and
 *  a doc comment is not a landmark. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Opening `<main` tags, ignoring the closing `</main>`. */
const mainTags = (src: string) => code(src).match(/<main[\s>]/g) ?? [];

describe('one main landmark per authenticated page', () => {
  it('AuthedLayout owns it', () => {
    expect(mainTags(authedLayout)).toHaveLength(1);
  });

  it('AppShell nests no second one inside it', () => {
    // `<main id="main">` inside AuthedLayout's `<main>` is invalid HTML and
    // screen readers announce two main regions.
    expect(mainTags(appShell)).toHaveLength(0);
  });

  it('the skip link still lands on the pane, which still carries the id', () => {
    expect(appShell).toContain('href="#main"');
    expect(appShell).toContain('<div id="main"');
  });

  it('the Roster desk does not open a third one for a pane', () => {
    expect(mainTags(rosterTab)).toHaveLength(0);
  });
});

/**
 * `/roster`'s position grid measured `{width: 0, left: 540}` at 390px. The
 * mechanism: a `w-[260px] shrink-0` aside next to a `min-w-0 flex-1` grid.
 * Flex `grow` only fires on POSITIVE free space, so once the aside alone
 * exceeds the row the grid's hypothetical size (basis 0, min-width 0) stays
 * 0 — and the row's `overflow-hidden` clipped the result with no scrollbar to
 * say anything was there.
 */
describe('the Roster desk survives a narrow viewport', () => {
  const deskRow = /<div className="relative flex min-h-0 flex-1 ([^"]*)"/.exec(rosterTab)?.[1];
  const gridPane = /data-testid="roster-right-panel"\s+className="([^"]*)"/.exec(rosterTab)?.[1];

  it('the grid pane keeps a width floor instead of collapsing to zero', () => {
    expect(gridPane).toBeDefined();
    expect(gridPane).toMatch(/\bmin-w-\[\d+px\]/);
    expect(gridPane).not.toMatch(/\bmin-w-0\b/);
  });

  it('the desk scrolls horizontally rather than clipping what does not fit', () => {
    // The Entries desk's prior art: what cannot fit gets a scrollbar, which
    // is at least an affordance. `overflow-hidden` is not.
    expect(deskRow).toBeDefined();
    expect(deskRow).toMatch(/\boverflow-x-auto\b/);
    expect(deskRow).not.toMatch(/\boverflow-hidden\b/);
  });
});

/**
 * The Hub command bar is one unstacking row (wordmark · search · New
 * workspace). At 390px the shortcut hint printed on top of the truncated
 * wordmark. Both are decoration — the rail two centimetres left carries the
 * same monogram, and a tablet has no Ctrl key — so both stand down and the
 * two controls that do work get the width.
 */
describe('the Hub command bar fits a narrow viewport', () => {
  it('drops the wordmark below `sm` instead of colliding with the search', () => {
    expect(hubPage).toMatch(/<ShuttleWorksMark className="[^"]*\bhidden\b[^"]*\bsm:inline-flex\b/);
  });

  it('drops the keyboard-shortcut hint with it', () => {
    const kbd = /<kbd className="([^"]*)"/.exec(code(hubPage))?.[1];
    expect(kbd).toBeDefined();
    expect(kbd).toMatch(/\bhidden\b/);
    expect(kbd).toMatch(/\bsm:block\b/);
  });
});
