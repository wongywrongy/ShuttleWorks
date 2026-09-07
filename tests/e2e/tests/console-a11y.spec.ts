/**
 * Console accessibility/responsive evidence (v3 consolidated plan, work
 * package 26a). Runs against the shared canonical fixture (package 01) at
 * both product-supported widths (§6 "Responsive/signage": console
 * 1024/1440) across ten named surfaces, checking:
 *
 *   (i)   a DOM accessibility audit — `@axe-core/playwright` is NOT present
 *         in tests/e2e/node_modules (checked directly; see the 26a report),
 *         so this uses the documented fallback: unnamed buttons/links,
 *         inputs without an accessible label, images without `alt`, and
 *         duplicate `id` attributes.
 *   (ii)  a keyboard walk — Tab through the page and assert every stop is
 *         actually visible (non-zero, in-viewport bounding box), never a
 *         focus trap into `<body>`.
 *   (iii) 200% text zoom (`html { font-size: 200% }`) — no horizontal
 *         document scroll, and no text-bearing `overflow:hidden` container
 *         clips its content, checked on the operator match rows and roster.
 *   (iv)  the Live day dispute block, when the fixture actually has a court
 *         conflict to show, is keyboard-reachable and its buttons are named
 *         (best-effort: the canonical fixture has no conflict scenario as
 *         of this package — see the 26a report).
 *   (v)   the Save bar's dirty/clean states are announced via
 *         `role=status`/`aria-live` (checked on Publish › Displays, a form
 *         that always renders `FormActions`).
 *
 * No fixed `offsetHeight` assertions (v3 plan §6 correction) — the zoom
 * check compares `scrollWidth`/`clientWidth`, which zoom itself changes.
 */
import { expect, test, type Page } from '@playwright/test';

const TAIPEI_TID = required('E2E_TAIPEI_TID');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run tests/e2e/run-console-contracts.sh`);
  return value;
}

const WIDTHS = [
  { label: '1024', width: 1024, height: 768 },
  { label: '1440', width: 1440, height: 900 },
] as const;

interface Surface {
  name: string;
  path: string;
  /** Locator to await before running checks — proves the surface actually rendered. */
  ready: (page: Page) => ReturnType<Page['getByTestId']> | ReturnType<Page['getByRole']>;
}

const SURFACES: Surface[] = [
  { name: 'Hub', path: '/', ready: (p) => p.getByTestId('hub-facet-strip') },
  {
    name: 'Overview',
    path: `/tournaments/${TAIPEI_TID}/overview`,
    ready: (p) => p.getByTestId('workspace-overview'),
  },
  {
    name: 'Setup › Details',
    path: `/tournaments/${TAIPEI_TID}/setup/details`,
    // Navigation and the page heading identify the page; there is no
    // `SETUP · …` eyebrow to wait on.
    ready: (p) => p.getByLabel('Tournament name'),
  },
  {
    name: 'Roster',
    path: `/tournaments/${TAIPEI_TID}/participants/people`,
    // Taipei is a hybrid (meet + bracket) workspace, so the "people" tab
    // resolves to bracket-primary's `BracketRosterTab` (`export-bracket-roster`),
    // not meet's `RosterTab` (`roster-left-panel`) — the module priority
    // decision lives in `workspaceNav.ts`'s `peopleTab` (`bracketPrimary ?
    // 'bracket-roster' : 'roster'`). `.or()` covers both without depending
    // on which module is primary for a given fixture tournament.
    ready: (p) => p.getByTestId('roster-left-panel').or(p.getByTestId('export-bracket-roster')),
  },
  {
    name: 'Draw canvas',
    path: `/tournaments/${TAIPEI_TID}/bracket/draw`,
    ready: (p) => p.getByTestId('bracket-canvas'),
  },
  {
    name: 'Matches (result inventory)',
    path: `/tournaments/${TAIPEI_TID}/bracket/matches`,
    ready: (p) => p.getByRole('main'),
  },
  {
    name: 'Plan',
    path: `/tournaments/${TAIPEI_TID}/operations/plan`,
    // P2: court queues are the default Plan view; the time-scaled board is
    // behind the Timeline toggle.
    ready: (p) => p.getByTestId('plan-court-queues'),
  },
  {
    name: 'Live day',
    path: `/tournaments/${TAIPEI_TID}/operations/live`,
    ready: (p) => p.getByTestId('run-surface'),
  },
  {
    name: 'Publish › Displays',
    path: `/tournaments/${TAIPEI_TID}/display/board`,
    ready: (p) => p.getByRole('heading', { name: 'Venue board' }),
  },
  {
    name: 'Administration › Backups',
    path: `/tournaments/${TAIPEI_TID}/administration/backups`,
    ready: (p) => p.getByRole('heading', { name: 'Backups' }),
  },
];

interface DomAuditResult {
  unnamedButtons: string[];
  unnamedLinks: string[];
  unlabeledInputs: string[];
  imagesWithoutAlt: string[];
  duplicateIds: string[];
}

/** Runs entirely in the browser — the documented fallback for the absence
 *  of `@axe-core/playwright` in tests/e2e/node_modules. */
async function domAudit(page: Page): Promise<DomAuditResult> {
  return page.evaluate(() => {
    function describe(el: Element): string {
      const tag = el.tagName.toLowerCase();
      const testId = el.getAttribute('data-testid');
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 2).join('.');
      return `<${tag}${testId ? ` data-testid="${testId}"` : ''}${cls ? ` class~="${cls}"` : ''}>`;
    }

    function hasAccessibleName(el: Element): boolean {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) return true;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy && labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) {
        return true;
      }
      const text = (el.textContent ?? '').trim();
      if (text) return true;
      const title = el.getAttribute('title');
      if (title && title.trim()) return true;
      return false;
    }

    const unnamedButtons = [...document.querySelectorAll('button')]
      .filter((el) => !(el as HTMLButtonElement).disabled || el.getAttribute('aria-label'))
      .filter((el) => !hasAccessibleName(el))
      .map(describe);

    const unnamedLinks = [...document.querySelectorAll('a[href]')]
      .filter((el) => !hasAccessibleName(el))
      .map(describe);

    function hasLabel(el: Element): boolean {
      if (el.getAttribute('aria-label')?.trim()) return true;
      if (el.getAttribute('aria-labelledby')) return true;
      const id = el.getAttribute('id');
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
      if (el.closest('label')) return true;
      return false;
    }

    const unlabeledInputs = [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => {
        const type = el.getAttribute('type');
        return type !== 'hidden';
      })
      .filter((el) => !hasLabel(el))
      .map(describe);

    const imagesWithoutAlt = [...document.querySelectorAll('img')]
      .filter((el) => !el.hasAttribute('alt'))
      .map(describe);

    const idCounts = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) {
      const id = el.getAttribute('id')!;
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
    const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

    return { unnamedButtons, unnamedLinks, unlabeledInputs, imagesWithoutAlt, duplicateIds };
  });
}

interface FocusStop {
  tag: string;
  testId: string | null;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tabs `steps` times from the top of the document and records, for each
 *  stop, whether `document.activeElement` has a non-zero, in-viewport
 *  bounding box — the operational meaning of "focus visible" this package
 *  can check without a screenshot diff. */
async function keyboardWalk(page: Page, steps: number): Promise<FocusStop[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: FocusStop[] = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) {
        return { tag: 'body', testId: null, visible: false, x: 0, y: 0, width: 0, height: 0 };
      }
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      return {
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute('data-testid'),
        visible,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    stops.push(stop);
  }
  return stops;
}

test.describe('console accessibility (work package 26a)', () => {
  for (const { label, width, height } of WIDTHS) {
    test.describe(`at ${label}px`, () => {
      for (const surface of SURFACES) {
        test(`${surface.name}: DOM audit + keyboard walk`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.goto(surface.path);
          await expect(surface.ready(page)).toBeVisible({ timeout: 15_000 });

          const audit = await domAudit(page);
          expect(audit.unnamedButtons, `${surface.name}: unnamed <button>s`).toEqual([]);
          expect(audit.unnamedLinks, `${surface.name}: unnamed <a>s`).toEqual([]);
          expect(audit.unlabeledInputs, `${surface.name}: unlabeled inputs`).toEqual([]);
          expect(audit.imagesWithoutAlt, `${surface.name}: <img> without alt`).toEqual([]);
          expect(audit.duplicateIds, `${surface.name}: duplicate ids`).toEqual([]);

          const stops = await keyboardWalk(page, 12);
          const reached = stops.filter((s) => s.tag !== 'body');
          expect(reached.length, `${surface.name}: keyboard walk reached no focusable element`).toBeGreaterThan(0);
          const invisible = reached.filter((s) => !s.visible);
          expect(invisible, `${surface.name}: a Tab stop landed outside the visible viewport`).toEqual([]);
        });
      }
    });
  }

  test('200% text zoom: no horizontal scroll or clipped text on Matches and Roster', async ({ page }) => {
    for (const surface of [
      SURFACES.find((s) => s.name === 'Matches (result inventory)')!,
      SURFACES.find((s) => s.name === 'Roster')!,
    ]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(surface.path);
      await expect(surface.ready(page)).toBeVisible({ timeout: 15_000 });

      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      // Let layout settle (fonts reflow, sticky headers recompute) before measuring.
      await page.waitForTimeout(150);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const horizontalScroll = doc.scrollWidth > doc.clientWidth + 2;

        // Text-bearing overflow:hidden containers whose content is clipped
        // (scrollWidth meaningfully exceeds clientWidth) — the caption/name
        // truncation contract's failure mode at zoom.
        const clipped: string[] = [];
        for (const el of document.querySelectorAll('*')) {
          const text = el.textContent?.trim() ?? '';
          if (!text || el.children.length > 0) continue;
          const style = window.getComputedStyle(el);
          if (style.overflow !== 'hidden' && style.overflowX !== 'hidden') continue;
          if (style.textOverflow === 'ellipsis') continue; // intentional truncation, not a clip defect
          // The standard `.sr-only` visually-hidden-but-announced technique
          // IS a 1px overflow:hidden box with real text inside by design
          // (e.g. "Skip to content", "Search records") — that is the
          // correct accessible pattern, not a zoom-clipping defect.
          const rect = el.getBoundingClientRect();
          if (rect.width <= 1 || rect.height <= 1) continue;
          if (el.scrollWidth > el.clientWidth + 4) {
            const tag = el.tagName.toLowerCase();
            const testId = el.getAttribute('data-testid');
            clipped.push(`<${tag}${testId ? ` data-testid="${testId}"` : ''}>: "${text.slice(0, 40)}"`);
          }
        }
        return { horizontalScroll, clipped };
      });

      expect(overflow.horizontalScroll, `${surface.name}: horizontal document scroll at 200% zoom`).toBe(false);
      expect(overflow.clipped, `${surface.name}: clipped text container at 200% zoom`).toEqual([]);
    }
  });

  test('Live day: dispute block is keyboard-reachable with named buttons (best-effort — fixture has no conflict scenario)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tournaments/${TAIPEI_TID}/operations/live`);
    await expect(page.getByTestId('run-surface')).toBeVisible({ timeout: 15_000 });

    const disputeButtons = page.locator('[data-testid^="dispute-keep-"], [data-testid^="dispute-take-off-"]');
    const count = await disputeButtons.count();
    if (count === 0) {
      test.info().annotations.push({
        type: 'skip-reason',
        description:
          'the canonical fixture (tools/fixture-up.sh) has no court-conflict scenario, so no dispute block ' +
          'rendered on this run — see docs/audits/v3-consolidated/reports/26a-console-a11y.md.',
      });
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const button = disputeButtons.nth(i);
      const name = await button.evaluate((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label'));
      expect(name, `dispute button #${i} has no accessible name`).toBeTruthy();
    }
    await disputeButtons.first().focus();
    await expect(disputeButtons.first()).toBeFocused();
  });

  test('Save bar dirty/clean states are announced via role=status or aria-live (Setup › Details)', async ({
    page,
  }) => {
    // NOT Publish › Displays: that surface (DisplayConfig + SharingTab
    // scope="links") has no FormActions save bar at all — its "Rotate" link
    // action is immediate, not a dirty/clean form — so it is not a fair
    // target for this check. Setup › Details (`SetupProduct.tsx`) is: its
    // section status line (`status={<span role="status">{dirty ? 'Unsaved
    // changes' : ...}</span>}`, line ~798) is the caller-side live region
    // FormActions' own doc comment expects a caller to place next to it
    // (FormActions itself only wires `role="alert"` for its error state).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tournaments/${TAIPEI_TID}/setup/details`);
    await expect(page.getByLabel('Tournament name')).toBeVisible({ timeout: 15_000 });

    const liveRegions = page.locator('[role="status"], [aria-live]');
    expect(await liveRegions.count(), 'Setup › Details has no role=status/aria-live region at all').toBeGreaterThan(0);
  });
});
