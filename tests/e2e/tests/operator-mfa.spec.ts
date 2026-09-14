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
  return execFileSync(resolve('../../.venv/bin/python'), ['-c', `
import datetime, sqlite3, sys
db, action, email = sys.argv[1:]
with sqlite3.connect(db) as connection:
    if action == 'expire':
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        connection.execute('UPDATE auth_sessions SET created_at=?, last_seen_at=? WHERE user_id=(SELECT id FROM users WHERE email=?) AND revoked_at IS NULL', (now-datetime.timedelta(hours=2), now-datetime.timedelta(minutes=61), email))
    print(connection.execute('SELECT last_seen_at FROM auth_sessions WHERE user_id=(SELECT id FROM users WHERE email=?) AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 1', (email,)).fetchone()[0])
`, fixture, action, email], { encoding: 'utf8' }).trim();
}

test('real MFA enrollment and expired-session recovery preserve a private unsent draft', async ({ page }) => {
  test.setTimeout(60_000);
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
  const remaining = 30_000 - Date.now() % 30_000;
  if (remaining < 3_000) await page.waitForTimeout(remaining + 100);
  await page.getByLabel('Authenticator code', { exact: true }).fill(otp(secret));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const codes = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(8);
  const recovery = await codes.allTextContents();
  await page.getByRole('button', { name: 'I have saved my codes' }).click();
  await page.goto('/settings?section=security');
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
  await dialog.getByLabel('Authenticator or recovery code').fill(recovery[0]);
  await dialog.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(draft).toBeVisible();
  await expect(draft).toHaveValue('an unsent password draft');
});
