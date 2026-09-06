import { chromium } from '../tests/e2e/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const base = process.env.ENTRANT_URL ?? 'http://127.0.0.1:15174';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const result = {};

async function inspect(name, path, cookie) {
  if (cookie) await context.addCookies([{ name: 'sw_play_session', value: cookie, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  result[name] = await page.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent?.trim(),
    links: [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') })),
    form: Boolean(document.querySelector('form[action="/e/account/login"]')),
  }));
  await page.close();
}

await inspect('noCookieSafe', '/e/login?next=/e/spring-open/enter');
await inspect('cookieSafe', '/e/login?next=/e/spring-open/enter', 'browser-check-session');
await inspect('cookieExternal', '/e/login?next=https%3A%2F%2Fevil.example%2F', 'browser-check-session');
await writeFile('/tmp/public-login-continuation-final.json', JSON.stringify(result, null, 2));
await browser.close();
