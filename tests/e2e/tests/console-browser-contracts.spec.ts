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

  test("Taipei Plan is a court-by-time grid and its public display is projected", async ({
    page,
  }) => {
    await page.goto(`/tournaments/${TAIPEI_TID}/operations/plan`);
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
    await page.goto(`/tournaments/${KOREA_TID}/setup`);
    await expect(
      page.getByRole("region", { name: "Readiness checklist" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/overall:\s*ready/i)).toBeVisible();
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
