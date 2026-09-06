import { chromium } from '../tests/e2e/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const base = process.env.ENTRANT_BASE_URL || 'http://127.0.0.1:15174';
const next = '/e/2026-korea-masters-t030/enter';
const email = process.env.ACCOUNT_EMAIL;
const password = process.env.ACCOUNT_PASSWORD;
const out = 'docs/audits/surface-book-remediation/evidence/account-journey';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = [];
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const heading = async () => (await page.locator('h1').first().textContent() || '').trim();

await page.goto(`${base}/e/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
report.push({ step: 'login page', status: page.url(), heading: await heading(), form: await page.locator('form').count() === 1,
  csrfCookie: (await context.cookies()).some(c => c.name === 'sw_play_csrf'), csrfField: await page.locator('input[name="_csrf"]').count() === 1 });
await shot('01-login-form');

await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill(password);
await page.getByLabel('Password').press('Enter');
await page.waitForLoadState('networkidle');
report.push({ step: 'keyboard login', status: page.url(), heading: await heading(), closedEntryHeading: /Korea Masters/i.test(await page.locator('body').innerText()),
  entrantCookie: (await context.cookies()).some(c => c.name === 'sw_play_session') });
await shot('02-after-login-entry');

await page.goto(`${base}/e/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
const body = await page.locator('body').innerText();
report.push({ step: 'authenticated continuation', status: page.url(), heading: await heading(), form: await page.locator('form').count() === 1,
  continuation: /Continue to this entry/i.test(body), nextPreserved: body.includes('Continue to this entry') });
await shot('03-authenticated-continuation');

await page.goto(`${base}/e/login?switch=1&next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
report.push({ step: 'switch account', status: page.url(), heading: await heading(), form: await page.locator('form').count() === 1,
  nextField: await page.locator('input[name="next"]').inputValue(), csrfField: await page.locator('input[name="_csrf"]').count() === 1 });
await shot('04-switch-account-form');

console.log(JSON.stringify({ report, screenshots: ['01-login-form.png', '02-after-login-entry.png', '03-authenticated-continuation.png', '04-switch-account-form.png'], credentialsPrinted: false }, null, 2));
await browser.close();
