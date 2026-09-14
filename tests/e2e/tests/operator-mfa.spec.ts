import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = process.env.E2E_MFA_FIXTURE_DB;
test.skip(!fixture, 'Run through tests/e2e/run-operator-mfa.sh with its disposable database.');

function otp(encoded: string): string {
  const bits = [...encoded.replace(/=+$/, '')].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

function sessionFixture(action: 'read' | 'expire', email: string): string {
  if (!fixture?.startsWith('/tmp/sw-operator-mfa.') || !fixture.endsWith('/mfa.db')) throw new Error('Disposable MFA fixture required');
  return execFileSync(process.env.E2E_PYTHON ?? resolve('../../.venv/bin/python'), ['-c', `
import datetime, sqlite3, sys
db, action, email = sys.argv[1:]
with sqlite3.connect(db) as connection:
    if action == 'expire':
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        connection.execute('UPDATE auth_sessions SET created_at=?, last_seen_at=? WHERE user_id=(SELECT id FROM users WHERE email=?) AND revoked_at IS NULL', (now-datetime.timedelta(hours=2), now-datetime.timedelta(minutes=61), email))
    print(connection.execute('SELECT last_seen_at FROM auth_sessions WHERE user_id=(SELECT id FROM users WHERE email=?) AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 1', (email,)).fetchone()[0])
`, fixture, action, email], { encoding: 'utf8' }).trim();
}

/** Wait into a fresh 30-second step: each step's code is accepted once. */
async function nextStep(page: import('@playwright/test').Page, used: Set<number>): Promise<void> {
  for (;;) {
    const step = Math.floor(Date.now() / 30_000);
    const remaining = 30_000 - Date.now() % 30_000;
    if (!used.has(step) && remaining >= 3_000) { used.add(step); return; }
    await page.waitForTimeout(remaining + 100);
  }
}

test('real MFA enrollment and expired-session recovery preserve a private unsent draft', async ({ page, playwright }) => {
  test.setTimeout(150_000);
  const usedSteps = new Set<number>();
  const email = `mfa-${Date.now()}@example.test`;
  const password = 'a private browser ceremony passphrase';
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up an authenticator' })).toBeVisible();
  expect((await page.request.get('/api/tournaments')).status()).toBe(401);
  await page.getByRole('button', { name: 'Create setup key' }).click();
  const secret = await page.getByLabel('Authenticator setup key').innerText();
  const sessionCookie = async () => (await page.context().cookies()).find((cookie) => cookie.name === 'sw_session')?.value;
  const passwordStage = await sessionCookie();
  await nextStep(page, usedSteps);
  await page.getByLabel('Authenticator code', { exact: true }).fill(otp(secret));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const codes = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(8);
  const firstCodes = await codes.allTextContents();

  // Confirmation rotates the cookie; the password-stage credential is dead.
  expect(await sessionCookie()).not.toBe(passwordStage);
  const stale = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL, extraHTTPHeaders: { cookie: `sw_session=${passwordStage}` },
  });
  expect((await stale.get('/api/auth/me')).status()).toBe(401);
  await stale.dispose();
  await page.getByRole('button', { name: 'I have saved my codes' }).click();

  // Settings reissues recovery codes from a current authenticator code; the
  // first set stops working and the new set is shown exactly once.
  await page.goto('/settings?section=security');
  await expect(page.getByText('8 of 8 recovery codes remain unused.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Issue new recovery codes' }).click();
  // Scoped: the Change password section above has its own Current password.
  const proof = page.locator('form').filter({ has: page.getByLabel('Authenticator code', { exact: true }) });
  await proof.getByLabel('Current password', { exact: true }).fill(password);
  await nextStep(page, usedSteps);
  await proof.getByLabel('Authenticator code', { exact: true }).fill(otp(secret));
  await proof.getByRole('button', { name: 'Issue new recovery codes' }).click();
  const reissued = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(reissued).toHaveCount(8);
  const recovery = await reissued.allTextContents();
  expect(recovery.filter((code) => firstCodes.includes(code))).toEqual([]);
  await page.getByRole('button', { name: 'I have saved my codes' }).click();
  await expect(page.getByRole('list', { name: 'Recovery codes' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Recovery codes' })).toHaveCount(0);
  const draft = page.getByLabel('New password', { exact: true });
  await expect(draft).toBeVisible();
  const beforeInput = sessionFixture('read', email);
  await draft.click();
  await draft.fill('an unsent password draft');
  await expect.poll(() => sessionFixture('read', email)).not.toBe(beforeInput);
  const afterInput = sessionFixture('read', email);
  for (let i = 0; i < 3; i += 1) expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect(sessionFixture('read', email)).toBe(afterInput);
  sessionFixture('expire', email);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const dialog = page.getByRole('dialog', { name: 'Session verification' });
  await expect(dialog).toBeVisible();
  await expect(draft).toBeAttached();
  await expect(draft).toBeHidden();
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByLabel('Authenticator or recovery code').fill(firstCodes[1]);
  await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();  // a replaced code is refused
  await dialog.getByLabel('Authenticator or recovery code').fill(recovery[0]);
  await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(draft).toBeVisible();
  await expect(draft).toHaveValue('an unsent password draft');
});
