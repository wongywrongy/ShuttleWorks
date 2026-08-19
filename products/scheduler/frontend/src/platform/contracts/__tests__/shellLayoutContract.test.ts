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
const workspaceRow = readSrc('products/hub/WorkspaceRow.tsx');

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

/**
 * A Hub row is NAME (`min-w-0 flex-1`) beside four `shrink-0` siblings —
 * Modules, Date, Next action, the overflow menu. At 390px measured
 * `scrollWidth` 424 vs `clientWidth` 334: the siblings alone exceed the row,
 * so `flex-1`'s hypothetical size (basis 0, min-width 0) stayed 0 and the
 * row's only identifying text disappeared. The column header above it,
 * sharing the same widths, collapsed the same way — 0px with `overflow:
 * visible`, so its text spilled instead of clipping.
 *
 * The fix reuses BandedTable's own mechanism (`@container/table` sizing +
 * `hidden …:block|flex` priority classes, `components/control-plane/
 * BandedList.tsx`) rather than inventing a new one, applied directly to the
 * row (and mirrored on the header) since neither is `columns`-config-driven.
 * Modules yields first (priority 3), Date next (priority 2) — both are
 * metadata the inspector panel already repeats; the name never yields.
 */
describe('the Hub row keeps its name at a narrow container width', () => {
  it('the row is its own `@container/table` sizing context', () => {
    expect(workspaceRow).toMatch(/@container\/table/);
  });

  it('the name cell is still the one flexible, unhidden column — with a floor', () => {
    // `min-w-0` was the earlier pin. Flexible, but free to collapse: at 390px
    // it measured 63px and `break-words` then broke the name MID-word
    // ("Invitatio/nal"). Wrapping is necessary, not sufficient — the box still
    // has to have room, so the floor is part of the invariant now.
    expect(workspaceRow).toMatch(/className="flex min-w-\[12rem\] flex-1 items-center gap-2\.5"/);
  });

  it('the Modules glyphs yield first — priority 3, hides soonest', () => {
    expect(workspaceRow).toMatch(/COL_PRIORITY_CLASS_FLEX\[3\]/);
  });

  it('the Date cell yields next — priority 2, both branches (dated and undated)', () => {
    // DateCell has two `return`s (the undated spacer, the dated label); both
    // must carry the priority class, or the 64px column reserves its width
    // whenever ANY row in the list happens to be undated.
    const hits = workspaceRow.match(/COL_PRIORITY_CLASS\[2\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('the Hub column header shares the row\'s container and the same two priorities', () => {
    expect(hubPage).toMatch(/@container\/table/);
    expect(hubPage).toMatch(/COL_PRIORITY_CLASS\[3\]/);
    expect(hubPage).toMatch(/COL_PRIORITY_CLASS\[2\]/);
  });
});

/**
 * The Roster actions bar's trailing control ("+ Add school") sat past the
 * viewport on a school roster long enough to push the bar's `scrollWidth`
 * (424) past its `clientWidth` (334) — data-dependent, so a short roster
 * (Nashville) was fine and a long one was not. `overflow-x: visible` on the
 * bar plus the page root's `overflow-hidden` clipped the overflow with no
 * scrollbar and no way to reach it.
 */
describe('the Roster actions bar reaches its trailing control on a narrow container', () => {
  const actionsBarWrap = /<div className="(shrink-0 overflow-x-auto[^"]*)">\s*<MeetActionsBar/.exec(
    rosterTab,
  )?.[1];

  it('the actions bar is wrapped in its own scrollable container', () => {
    // The Entries desk / desk-row prior art (above): what does not fit gets
    // a scrollbar rather than clipping silently.
    expect(actionsBarWrap).toBeDefined();
    expect(actionsBarWrap).toMatch(/\boverflow-x-auto\b/);
  });

  it('that wrapper does not also clip with overflow-hidden', () => {
    expect(actionsBarWrap).not.toMatch(/\boverflow-hidden\b/);
  });

  it('nor on the y axis, now that the bar can be two rows tall', () => {
    // `overflow-y-hidden` shipped alongside the x-axis scroller. Harmless
    // while the bar was a fixed 44px; once `ActionsBar` wraps it would clip
    // the second row off — the same defect on the other axis.
    expect(actionsBarWrap).not.toMatch(/\boverflow-y-hidden\b/);
  });
});

/**
 * `ActionsBar` is the top zone of every workspace surface, and at 768px on
 * Meet Matches it failed twice at once (browser pass, 2026-08-12): the status
 * text spanned x=142-200 while the search input started at x=166 — 34px of
 * overlap, one string printed on top of another — and "Regenerate from roster"
 * ended at x=794 against a document `scrollWidth` of 768, off screen with
 * nothing to scroll and no way to reach it.
 *
 * Cause: `h-11` (a FIXED height, so nothing could move to a second line) with
 * `shrink-0` control groups (so they could not give width back) and a
 * `min-w-0` status box (so it was crushed while its text kept its own width
 * and spilled). The bar now wraps: a minimum height, `flex-wrap` on the bar
 * and on both groups. Wrapping, not clipping and not an ellipsis — hiding
 * characters is banned outright by `truncationContract.test.ts`.
 */
describe('the shared actions bar wraps rather than clipping at tablet width', () => {
  const actionsBar = readSrc('components/control-plane/ActionsBar.tsx');
  const header = /<header className="([^"]*)"/.exec(code(actionsBar))?.[1];

  it('the bar wraps', () => {
    expect(header).toBeDefined();
    expect(header).toMatch(/\bflex-wrap\b/);
  });

  it('its height is a minimum, not a fixed 44px', () => {
    // `h-11` cannot grow, so a second row has nowhere to be.
    expect(header).toMatch(/\bmin-h-11\b/);
    expect(header).not.toMatch(/(?<![\w-])h-11(?![\w-])/);
  });

  it('the control group wraps and can still yield width', () => {
    // `shrink-0` on the controls is what put the trailing button past the
    // viewport edge: the group refused to give anything back, so the overflow
    // had to go somewhere, and it went off screen.
    const controls = /<div className="(ml-auto[^"]*)"/.exec(code(actionsBar))?.[1];
    expect(controls).toBeDefined();
    expect(controls).toMatch(/\bflex-wrap\b/);
    expect(controls).not.toMatch(/\bshrink-0\b/);
  });

  it('the status group wraps instead of overlapping the control beside it', () => {
    const status = /<div className="(flex min-w-0[^"]*)"/.exec(code(actionsBar))?.[1];
    expect(status).toBeDefined();
    expect(status).toMatch(/\bflex-wrap\b/);
  });

  it('the bar clips on neither axis', () => {
    expect(header).not.toMatch(/\boverflow-hidden\b/);
  });
});
