import { chromium } from '../tests/e2e/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
const base = process.env.ENTRANT_BASE_URL || 'http://127.0.0.1:15174';
const out = 'docs/audits/surface-book-remediation/evidence/account-journey';
const next = '/e/2026-korea-masters-t030/enter';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = [];
await mkdir(out, { recursive: true });
async function outcome(kind, token, name) {
  await page.goto(`${base}/e/${kind}?token=${encodeURIComponent(token)}`, { waitUntil: 'networkidle' });
  const before = (await page.locator('h1').first().textContent() || '').trim();
  if (kind === 'reset') await page.getByLabel('New password').fill('RecoveryProbe!2026-valid');
  let postStatus = null;
  const onResponse = response => { if (response.url().includes('/e/account/')) postStatus = response.status(); };
  page.on('response', onResponse);
  await page.locator('form button').click();
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  const after = (await page.locator('h1').first().textContent() || '').trim();
  report.push({ step: name, status: page.url().replace(/token=[^&]+/, 'token=<redacted>'), endpointStatus: postStatus, heading: after, initialHeading: before });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
if (process.env.EXPIRED_VERIFY_TOKEN) await outcome('verify', process.env.EXPIRED_VERIFY_TOKEN, '05-expired-verification');
await outcome('verify', 'invalid-token-for-journey', '06-invalid-verification');
if (process.env.VALID_VERIFY_TOKEN) await outcome('verify', process.env.VALID_VERIFY_TOKEN, '07-valid-verification');
if (process.env.EXPIRED_RESET_TOKEN) await outcome('reset', process.env.EXPIRED_RESET_TOKEN, '08-expired-reset');
await outcome('reset', 'invalid-reset-token-for-journey', '09-invalid-reset');

if (process.env.VALID_RESET_TOKEN) {
await page.goto(`${base}/e/reset?token=${encodeURIComponent(process.env.VALID_RESET_TOKEN)}&next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
await page.getByLabel('New password').fill(process.env.NEW_PASSWORD);
await page.getByLabel('New password').press('Enter');
await page.waitForLoadState('networkidle');
report.push({ step: 'valid password reset', status: page.url().replace(/token=[^&]+/, 'token=<redacted>'), heading: (await page.locator('h1').first().textContent() || '').trim() });
await page.screenshot({ path: `${out}/10-password-reset-done.png`, fullPage: true });
}

async function login(password, name) {
  await page.goto(`${base}/e/login?next=${encodeURIComponent(next)}&switch=1`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(process.env.ACCOUNT_EMAIL);
  await page.getByLabel('Password').fill(password);
  let postStatus = null;
  const onResponse = response => { if (response.url().includes('/e/account/login')) postStatus = response.status(); };
  page.on('response', onResponse);
  await page.getByLabel('Password').press('Enter');
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  report.push({ step: name, status: page.url(), endpointStatus: postStatus, heading: (await page.locator('h1').first().textContent() || '').trim(), form: await page.locator('form').count() === 1 });
}
if (process.env.VALID_RESET_TOKEN) {
  await login(process.env.OLD_PASSWORD, 'old password login');
  await login(process.env.NEW_PASSWORD, 'new password login');
}
console.log(JSON.stringify({ report, credentialsPrinted: false, tokensPrinted: false }, null, 2));
await browser.close();
