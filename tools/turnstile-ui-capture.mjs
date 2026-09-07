import { chromium } from '../tests/e2e/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/audits/surface-book-remediation/evidence/account-journey';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript(() => {
  window.turnstile = {
    render(_container, options) {
      window.setTimeout(() => options.callback('controlled-ui-token'), 25);
      return 'controlled-widget';
    },
    reset() {},
  };
});
const page = await context.newPage();
await page.route('https://challenges.cloudflare.com/**', route => route.abort());
let accountPosts = 0;
page.on('request', request => { if (request.url().includes('/e/account/')) accountPosts += 1; });
await page.goto('http://127.0.0.1:15174/e/signup', { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#turnstile-status')?.textContent === 'Human check complete.');
const result = {
  classification: 'controlled callback UI only; not production provider verification',
  statusText: await page.locator('#turnstile-status').textContent(),
  helpHidden: await page.locator('#turnstile-help').getAttribute('hidden') !== null,
  createAccountVisible: await page.getByRole('button', { name: 'Create account' }).isVisible(),
  accountPosts,
  callbackTokenSubmitted: false,
  productionTurnstileVerified: false,
};
await page.screenshot({ path: `${out}/11-human-check-controlled-complete.png`, fullPage: true });
await writeFile(`${out}/11-human-check-controlled-complete.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
await browser.close();
