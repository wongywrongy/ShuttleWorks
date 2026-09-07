import { expect, test, type Page } from "@playwright/test";

const TAIPEI_TID = required("E2E_TAIPEI_TID");
const KOREA_TID = required("E2E_KOREA_TID");
const DISPLAY_TOKEN = required("E2E_DISPLAY_TOKEN");
const VIEWER_EMAIL = required("E2E_VIEWER_EMAIL");
const VIEWER_PASSWORD = required("E2E_VIEWER_PASSWORD");

type HarnessEvent = {
  kind: "error" | "unhandledrejection" | "console.error" | "boundary";
  message: string;
  route: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is required; run tests/e2e/run-console-contracts.sh`,
    );
  return value;
}

async function fatalHarnessEvents(page: Page): Promise<HarnessEvent[]> {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __swErrorHarness?: { events: HarnessEvent[] } }
    ).__swErrorHarness;
    if (!harness) throw new Error("build is missing VITE_ERROR_HARNESS=1");
    return harness.events.filter((event) =>
      ["error", "unhandledrejection", "boundary"].includes(event.kind),
    );
  });
}

test.describe("canonical console browser contracts", () => {
  test("Taipei is a populated six-court live tournament with a real queue", async ({
    page,
  }) => {
    await page.goto(`/tournaments/${TAIPEI_TID}/operations/live`);

    await expect(page.getByTestId("run-surface")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("run-court-grid")).toBeVisible();
    const liveCards = page.locator('[data-testid^="run-card-"]');
    await expect(liveCards).toHaveCount(6);
    await expect(page.locator('[data-testid^="run-queue-row-"]')).toHaveCount(
      24,
    );
    await expect(page.getByTestId("run-court-grid")).not.toContainText(
      /winner of/i,
    );
    await expect(page.getByTestId("run-court-grid")).not.toContainText(
      /court 7/i,
    );
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("Taipei Plan is court queues, its Timeline toggle is the grid, and its public display is projected", async ({
    page,
  }) => {
    await page.goto(`/tournaments/${TAIPEI_TID}/operations/plan`);
    // P2: court queues are the default; the court-by-time grid is the
    // secondary Timeline view, which this test then opens.
    await expect(page.getByTestId("plan-court-queues")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("plan-view-timeline").click();
    await expect(page.getByTestId("unified-ops-board")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('[data-testid^="ops-block-"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="ops-cell-6-"]').first(),
    ).toBeVisible();
    expect(await fatalHarnessEvents(page)).toEqual([]);

    await page.goto(`/display?token=${encodeURIComponent(DISPLAY_TOKEN)}`);
    await expect(page.getByTestId("bracket-display")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Configure display")).toHaveCount(0);
    await expect(page.getByText("Workspace", { exact: true })).toHaveCount(0);
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("Korea is upcoming, fully configured, and has no playing court", async ({
    page,
  }) => {
    // The readiness checklist lives on Overview, once. The consolidated
    // route is canonical; retired section aliases are not part of the flow.
    await page.goto(`/tournaments/${KOREA_TID}/overview`);
    await expect(page.getByTestId("overview-ready-summary")).toContainText(
      /setup complete/i,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("overview-checklist")).toHaveCount(0);
    await page.goto(`/tournaments/${KOREA_TID}/setup/details`);
    await expect(page.getByLabel("Tournament name")).toBeVisible({
      timeout: 15_000,
    });
    expect(await fatalHarnessEvents(page)).toEqual([]);

    await page.goto(`/tournaments/${KOREA_TID}/operations/live`);
    await expect(page.getByTestId("run-surface")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("run-court-grid")).not.toContainText(
      /\blive\b/i,
    );
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("retired workspace URLs are not alternate product surfaces", async ({ page }) => {
    for (const retiredPath of [
      "competition/draws",
      "publish/links",
      "bracket-draws",
      "nonsense/overview",
    ]) {
      await page.goto(`/tournaments/${KOREA_TID}/${retiredPath}`);
      await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
      await expect(page.getByTestId("workspace-not-found")).toBeVisible();
      await expect(page).toHaveURL(
        new RegExp(`/tournaments/${KOREA_TID}/${retiredPath}$`),
      );
    }
    for (const retiredPath of ["/tracking", "/live-ops"]) {
      await page.goto(retiredPath);
      await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${retiredPath.replace("/", "\\/")}$`));
    }
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("audit: six courts form balanced rows with one queue", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tournaments/${TAIPEI_TID}/operations/live`);
    const cards = page.locator('[data-testid^="run-card-"]');
    await expect(cards).toHaveCount(6);
    const positions = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y) };
    }));
    expect(new Set(positions.map((position) => position.x)).size).toBe(3);
    expect(new Set(positions.map((position) => position.y)).size).toBe(2);
    await expect(page.getByText('On deck', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('live-six-courts.png'), fullPage: true });
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("audit: publication is staged on its canonical owners", async ({ page }, testInfo) => {
    const created = await page.request.post('/api/tournaments', { headers: { 'X-ShuttleWorks-CSRF': '1' }, data: { name: 'Publication review' } });
    expect(created.ok()).toBe(true);
    const publicationTid = (await created.json()).id;
    const configured = await page.request.put(`/api/tournaments/${publicationTid}/entry-page`, { headers: { 'X-ShuttleWorks-CSRF': '1' }, data: { slug: 'publication-review', isOpen: true } });
    expect(configured.ok()).toBe(true);
    await page.goto(`/tournaments/${publicationTid}/setup/public-site`);
    const publication = page.getByTestId('sharing-publication');
    await expect(publication).toBeVisible();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('/entry-page/publication')) writes.push(request.postData() ?? '');
    });
    await publication.getByRole('combobox', { name: 'Public audience' }).click();
    await page.getByRole('option', { name: 'Unlisted', exact: true }).click();
    await expect(publication.getByRole('status')).toContainText('Unsaved changes');
    expect(writes).toEqual([]);
    await publication.getByRole('button', { name: 'Discard changes' }).click();
    expect(writes).toEqual([]);
    await publication.getByRole('combobox', { name: 'Public audience' }).click();
    await page.getByRole('option', { name: 'Unlisted', exact: true }).click();
    const savedResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/entry-page/publication'));
    await publication.getByRole('button', { name: 'Save publication changes' }).click();
    const response = await savedResponse;
    expect(response.ok(), await response.text()).toBe(true);
    await expect(publication.getByRole('status')).toContainText('Publication settings saved');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({ audience: 'unlisted' });
    await page.screenshot({ path: testInfo.outputPath('publish-site.png'), fullPage: true });
    await page.reload();
    await expect(publication.getByRole('combobox', { name: 'Public audience' })).toContainText('Unlisted');
    await page.goto(`/tournaments/${TAIPEI_TID}/display/board`);
    // P4 replaced the raw mono `?token=…` field with a readable label
    // ("Venue board · <host>"); the real URL stays on Copy / Open fullscreen
    // and on `title`. The contract here is that the moved route's owner shows
    // the venue-board link control, not what the old field was called.
    await expect(page.getByTestId('display-link-label')).toBeVisible();
    await expect(page.getByTestId('display-link-label')).toContainText('Venue board');
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("audit: a checked-out tournament keeps publication drafts after refusal", async ({ page }) => {
    await page.goto(`/tournaments/${TAIPEI_TID}/setup/public-site`);
    const publication = page.getByTestId('sharing-publication');
    await expect(publication).toBeVisible();
    await publication.getByRole('combobox', { name: 'Public audience' }).click();
    await page.getByRole('option', { name: 'Private', exact: true }).click();
    await publication.getByRole('button', { name: 'Save publication changes' }).click();
    await expect(publication.getByRole('alert')).toContainText('Return control before publishing');
    await expect(publication.getByRole('combobox', { name: 'Public audience' })).toContainText('Private');
    await expect(publication.getByRole('status')).toContainText('Unsaved changes');
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });

  test("the API-created Taipei viewer sees live data but cannot issue writes", async ({
    page,
  }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD },
    });
    expect(login.ok()).toBe(true);

    const writes: string[] = [];
    page.on("request", (request) => {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
        request.url().includes("/api/")
      ) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto(`/tournaments/${TAIPEI_TID}/operations/live`);
    await expect(page.getByTestId("read-only-banner")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("read-only-banner")).toContainText(
      /view-only access/i,
    );
    const cards = page.locator('[data-testid^="run-card-"]');
    await expect(cards).toHaveCount(6);
    await cards.first().click();
    await expect(page.getByTestId("run-detail-panel")).toBeVisible();
    const actions = page.locator('[data-testid^="run-act-"]');
    for (let index = 0; index < (await actions.count()); index += 1) {
      await expect(actions.nth(index)).toBeDisabled();
    }
    expect(writes).toEqual([]);
    expect(await fatalHarnessEvents(page)).toEqual([]);
  });
});
