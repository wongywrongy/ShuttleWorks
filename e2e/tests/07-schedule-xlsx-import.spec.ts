import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SEED_TOURNAMENT } from '../fixtures/seed';

type Assignment = { matchId: string; slotId: number; courtId: number; durationSlots: number };

const SEED_ASSIGNMENTS: Assignment[] = [
  { matchId: 'm1', slotId: 0, courtId: 1, durationSlots: 1 },
  { matchId: 'm2', slotId: 0, courtId: 2, durationSlots: 1 },
  { matchId: 'm3', slotId: 1, courtId: 1, durationSlots: 1 },
  { matchId: 'm4', slotId: 1, courtId: 2, durationSlots: 1 },
];

async function seedWithSchedule(page: Page): Promise<void> {
  const s = SEED_TOURNAMENT.state;
  await page.request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: s.config,
      groups: s.groups,
      players: s.players,
      matches: s.matches,
      schedule: {
        assignments: SEED_ASSIGNMENTS,
        unscheduledMatches: [],
        softViolations: [],
        objectiveScore: null,
        infeasibleReasons: [],
        status: 'feasible',
      },
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

function sortByMatchId(arr: Assignment[]): Assignment[] {
  return [...arr].sort((a, b) => a.matchId.localeCompare(b.matchId));
}

test.describe('schedule XLSX import — disaster recovery', () => {
  test.beforeEach(async ({ page }) => {
    await resetServerState(page);
    await seedWithSchedule(page);
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('round-trip: export then re-import restores the same schedule', async ({ page }) => {
    await page.goto('/');

    // Export via the Schedule tab.
    await page.getByTestId('tab-schedule').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-schedule').click(),
    ]);
    const tmp = path.join(os.tmpdir(), `schedule-${Date.now()}.xlsx`);
    await download.saveAs(tmp);

    // Blow away the schedule server-side (keep config/groups/players/matches).
    await page.request.put('/api/tournament/state', {
      data: {
        version: 1,
        config: SEED_TOURNAMENT.state.config,
        groups: SEED_TOURNAMENT.state.groups,
        players: SEED_TOURNAMENT.state.players,
        matches: SEED_TOURNAMENT.state.matches,
        schedule: {
          assignments: [],
          unscheduledMatches: [],
          softViolations: [],
          objectiveScore: null,
          infeasibleReasons: [],
          status: 'unknown',
        },
        scheduleStats: null,
        scheduleIsStale: false,
      },
    });
    await page.reload();

    // Upload via BackupPanel on the Setup tab.
    await page.getByTestId('tab-setup').click();
    await page.getByTestId('schedule-import-file').setInputFiles(tmp);

    await expect(page.getByTestId('schedule-import-modal')).toBeVisible();
    await expect(page.getByTestId('schedule-import-summary')).toContainText(
      `Matched 4 of 4 rows.`,
    );

    await page.getByTestId('schedule-import-apply').click();
    await expect(page.getByTestId('schedule-import-modal')).not.toBeVisible();

    // Poll the server until the autosave lands the restored assignments.
    await expect
      .poll(
        async () => {
          const r = await page.request.get('/api/tournament/state');
          const j = await r.json();
          return j.schedule?.assignments?.length ?? 0;
        },
        { timeout: 10_000 },
      )
      .toBe(SEED_ASSIGNMENTS.length);

    const after = await page.request.get('/api/tournament/state');
    const afterJson = await after.json();
    const got = sortByMatchId(
      (afterJson.schedule?.assignments ?? []).map((a: Assignment) => ({
        matchId: a.matchId,
        slotId: a.slotId,
        courtId: a.courtId,
        durationSlots: a.durationSlots,
      })),
    );
    expect(got).toEqual(sortByMatchId(SEED_ASSIGNMENTS));

    await fs.unlink(tmp).catch(() => {});
  });

  test('bad file is rejected with a toast, no modal opens', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-setup').click();

    const bogus = path.join(os.tmpdir(), `bogus-${Date.now()}.xlsx`);
    await fs.writeFile(bogus, 'not a real spreadsheet');
    await page.getByTestId('schedule-import-file').setInputFiles(bogus);

    await expect(page.getByText(/Could not read XLSX|schedule export/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('schedule-import-modal')).not.toBeVisible();

    await fs.unlink(bogus).catch(() => {});
  });
});
