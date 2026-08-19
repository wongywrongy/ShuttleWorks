import { test, expect, type Page } from '@playwright/test';
import { SEED_TOURNAMENT } from '../fixtures/seed';

/**
 * Pushes the fixture tournament through the real server endpoint so the
 * frontend hydrates it on mount. `useTournamentState` prefers server over
 * localStorage, so seeding via localStorage alone won't reach the app.
 */
async function seedServerFromFixture(
  page: Page,
  seed: typeof SEED_TOURNAMENT,
): Promise<void> {
  const s = seed.state;
  await page.request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: s.config,
      groups: s.groups,
      players: s.players,
      matches: s.matches,
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

async function resetServerState(page: Page): Promise<void> {
  await page.request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: null,
      groups: [],
      players: [],
      matches: [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

test.describe('server-side persistence + stale banner + determinism', () => {
  test.beforeEach(async ({ page }) => {
    await resetServerState(page);
    await seedServerFromFixture(page, SEED_TOURNAMENT);
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test('schedule survives a browser refresh', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
    const beforeBlocks = await page.locator('[data-testid^="block-"]').count();
    expect(beforeBlocks).toBeGreaterThan(0);

    // Give the debounced PUT time to flush.
    await page.waitForTimeout(800);

    // Wipe localStorage so the reload has to rehydrate from the server.
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByTestId('tab-schedule').click();

    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 5_000 });
    const afterBlocks = await page.locator('[data-testid^="block-"]').count();
    expect(afterBlocks).toBe(beforeBlocks);
  });

  test('editing a player after solving shows the stale banner', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });

    // Let the debounced PUT flush the freshly-solved schedule to the server
    // before we fetch + mutate state.
    await page.waitForTimeout(800);

    // Sanity: confirm the solve persisted to the server.
    const current = await (await page.request.get('/api/tournament/state')).json();
    expect(current.schedule).not.toBeNull();
    expect((current.schedule?.assignments ?? []).length).toBeGreaterThan(0);

    // Mark stale on the server — simulates a downstream edit.
    await page.request.put('/api/tournament/state', {
      data: { ...current, scheduleIsStale: true },
    });
    // Confirm the write landed.
    const afterPut = await (await page.request.get('/api/tournament/state')).json();
    expect(afterPut.scheduleIsStale).toBe(true);
    expect(afterPut.schedule).not.toBeNull();

    await page.reload();
    // Wait until the useTournamentState hydration has landed in the store.
    // The Schedule tab-enabled check alone races the hydration, because the
    // tab becomes enabled as soon as Zustand's localStorage persist kicks
    // in (which ignores scheduleIsStale). Poll the Zustand store directly
    // until the server-side stale flag reaches memory.
    await page.waitForFunction(
      () => {
        const store = (window as unknown as {
          __STORE__?: { getState(): { scheduleIsStale: boolean; schedule: unknown } };
        }).__STORE__;
        return !!store && store.getState().scheduleIsStale === true && store.getState().schedule !== null;
      },
      { timeout: 10_000 },
    );

    await page.getByTestId('tab-schedule').click();
    await expect(page.getByTestId('stale-banner')).toBeVisible({ timeout: 5_000 });
  });

  test('deterministic re-solve — same inputs produce identical assignments', async ({ page }) => {
    await page.goto('/');

    // Wait for the debounced PUT (500 ms) to flush, then read the schedule
    // straight from the server file — that's the authoritative post-solve
    // state and avoids chasing Zustand internals from Playwright.
    const captureAssignments = async (): Promise<string> => {
      await page.waitForTimeout(800);
      const res = await page.request.get('/api/tournament/state');
      const body = (await res.json()) as {
        schedule: {
          assignments: { matchId: string; slotId: number; courtId: number }[];
        } | null;
      };
      const assigns = body.schedule?.assignments ?? [];
      return JSON.stringify(
        [...assigns]
          .map((a) => ({
            matchId: a.matchId,
            slotId: a.slotId,
            courtId: a.courtId,
          }))
          .sort((a, b) => a.matchId.localeCompare(b.matchId)),
      );
    };

    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const first = await captureAssignments();
    // A non-empty schedule is enough; the exact assignment count depends on
    // how many fixture matches pair up feasibly. What we care about is that
    // regenerate produces the same layout.
    expect(first).not.toBe('[]');

    // Click Generate a second time — the first click flips the button into
    // a "Click again to replace" confirmation, the second click actually fires.
    const genBtn = page.getByTestId('schedule-generate');
    await genBtn.click();
    await expect(genBtn).toContainText(/click again to replace/i);
    await genBtn.click();
    await expect(page.getByTestId('drag-gantt')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const second = await captureAssignments();

    expect(second).toBe(first);
  });
});
