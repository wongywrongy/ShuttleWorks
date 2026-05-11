import { test, expect } from '@playwright/test';
import { SEED_TOURNAMENT } from '../fixtures/seed';
import { seedServer } from '../fixtures/server-state';

test.describe('solve happy path — SolverHud populates from SSE', () => {
  test.beforeEach(async ({ context, request }) => {
    // With server-side persistence, useTournamentState hydrates from the
    // server on mount — seed the file so this test starts from a known
    // tournament regardless of what the previous spec left behind.
    await seedServer(request, SEED_TOURNAMENT);
    await context.addInitScript((seed) => {
      window.localStorage.setItem('scheduler-storage', JSON.stringify(seed));
    }, SEED_TOURNAMENT);
  });

  test('generate fills HUD with model stats, phases, and a final objective', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-schedule').click();
    await page.getByRole('button', { name: /generate schedule/i }).click();

    // SolverHud fills in once SSE arrives. `model_built` comes first, then phases.
    const hud = page.getByTestId('solver-hud');
    // "Model 4 · 16 intervals · 7 no-overlap" — assert the model-stats node
    // shows the interval count that proves the interval refactor landed.
    await expect(hud.getByTestId('solver-hud-model')).toContainText(/intervals/, { timeout: 10_000 });

    // A phase pill is visible — one of presolve | search | proving.
    await expect(hud.getByTestId('solver-hud-phase')).toHaveText(
      /Presolve|Searching|Proving optimal/,
      { timeout: 10_000 },
    );

    // Solutions and objective must appear by the time solve completes.
    // (CSS gap separates the label and number into sibling nodes — innerText
    // collapses them, so no whitespace between in the text match.)
    await expect(hud.getByTestId('solver-hud-solutions')).toContainText(/Solutions\s*\d+/, {
      timeout: 15_000,
    });
    await expect(hud.getByTestId('solver-hud-objective')).toContainText(/Objective\s*\d+/, {
      timeout: 15_000,
    });

    // Drag-gantt appears once solve finishes and status echoes the schedule.
    const gantt = page.getByTestId('drag-gantt');
    await expect(gantt).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('drag-gantt-status')).toContainText(/\d+ matches scheduled/);
  });
});
