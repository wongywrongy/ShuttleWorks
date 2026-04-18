import { test, expect } from '@playwright/test';
import { SEED_TOURNAMENT } from '../fixtures/seed';

/**
 * Seed the server with the fixture config + groups but zero players and
 * zero matches — useTournamentState will hydrate this on page load.
 */
async function seedEmptyServer(
  request: import('@playwright/test').APIRequestContext,
): Promise<void> {
  await request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: SEED_TOURNAMENT.state.config,
      groups: SEED_TOURNAMENT.state.groups,
      players: [],
      matches: [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

test.describe('roster tab — new position-centric UI', () => {

  test('bulk-import adds multiple players to the active school', async ({ page }) => {
    await seedEmptyServer(page.request);
    await page.goto('/');
    await page.getByTestId('tab-roster').click();

    // The player pool shows an empty state on load.
    await expect(page.getByTestId('player-pool')).toContainText(/no players yet/i);

    // Expand the bulk importer and paste a list.
    await page.getByTestId('bulk-import-toggle').click();
    const textarea = page.getByTestId('bulk-import-textarea');
    await textarea.fill('Toan Le\nKyle Wong\nSean Hsieh');
    await page.getByTestId('bulk-import-commit').click();

    // Three chips land in the pool.
    await expect(page.locator('[data-testid^="pool-chip-"]')).toHaveCount(3);

    // Let the debounced PUT flush, then inspect server-side state.
    await page.waitForTimeout(800);
    const body = await (await page.request.get('/api/tournament/state')).json();
    const players = body.players ?? [];
    expect(players.length).toBe(3);
    expect(new Set(players.map((p: { groupId: string }) => p.groupId)).size).toBe(1);
  });

  test('drag a player chip onto a position cell assigns that rank', async ({ page }) => {
    // Start with a handful of players already imported — seed the server so
    // useTournamentState hydrates this state.
    const firstSchoolId = SEED_TOURNAMENT.state.groups[0].id;
    await page.request.put('/api/tournament/state', {
      data: {
        version: 1,
        config: SEED_TOURNAMENT.state.config,
        groups: SEED_TOURNAMENT.state.groups,
        players: [
          { id: 'p1', name: 'Toan Le', groupId: firstSchoolId, ranks: [], availability: [] },
          { id: 'p2', name: 'Kyle Wong', groupId: firstSchoolId, ranks: [], availability: [] },
        ],
        matches: [],
        schedule: null,
        scheduleStats: null,
        scheduleIsStale: false,
      },
    });

    await page.goto('/');
    await page.getByTestId('tab-roster').click();

    // Wait for the pool chip and grid cell to mount before synthesizing drag.
    await expect(page.getByTestId('pool-chip-p1')).toBeVisible();

    const activeSchoolId = firstSchoolId;

    const sourceSelector = '[data-testid="pool-chip-p1"]';
    const targetSelector = `[data-testid="pos-cell-${activeSchoolId}-MD1"]`;
    await expect(page.locator(targetSelector)).toBeVisible();

    // Synthesize the drag with real pointer events so dnd-kit responds.
    await page.evaluate(
      async ([src, tgt]) => {
        const source = document.querySelector(src) as HTMLElement;
        const target = document.querySelector(tgt) as HTMLElement;
        if (!source || !target) throw new Error('drag endpoints missing');
        const sr = source.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const sx = sr.left + sr.width / 2;
        const sy = sr.top + sr.height / 2;
        const ex = tr.left + tr.width / 2;
        const ey = tr.top + tr.height / 2;
        const fire = (type: string, x: number, y: number, el?: EventTarget | null) =>
          (el ?? document).dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y,
              button: 0,
            }),
          );
        fire('mousedown', sx, sy, source);
        await new Promise((r) => setTimeout(r, 10));
        for (let i = 1; i <= 20; i++) {
          fire('mousemove', sx + ((ex - sx) * i) / 20, sy + ((ey - sy) * i) / 20, document);
          await new Promise((r) => setTimeout(r, 12));
        }
        await new Promise((r) => setTimeout(r, 100));
        fire('mouseup', ex, ey, document);
      },
      [sourceSelector, targetSelector],
    );

    // Let the debounced PUT flush, then check the server file.
    await page.waitForTimeout(800);
    const body = await (await page.request.get('/api/tournament/state')).json();
    const p1 = (body.players ?? []).find((p: { id: string }) => p.id === 'p1');
    expect(p1?.ranks ?? []).toContain('MD1');
  });

  test('details panel exposes the per-player spreadsheet for availability/notes', async ({ page }) => {
    await seedEmptyServer(page.request);
    await page.goto('/');
    await page.getByTestId('tab-roster').click();

    // Expand the collapsible "Player details" panel.
    await page.getByTestId('roster-details-toggle').click();
    // Spreadsheet's "Add player" button is inside.
    await expect(page.getByTestId('add-player-row')).toBeVisible();
  });
});
