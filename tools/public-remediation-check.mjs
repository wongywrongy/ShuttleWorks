/**
 * Focused browser evidence for the public remediation pass.
 *
 * Run against the already-running entrant origin; this script only reads
 * public documents and writes screenshots under the gitignored evidence
 * directory. It does not submit entries, authenticate, or claim delivery or
 * payment success.
 *
 *   PUBLIC_REMEDIATION_BASE=http://127.0.0.1:15174 \
 *   PUBLIC_REMEDIATION_SLUG=2026-korea-masters-t030 \
 *   node tools/public-remediation-check.mjs
 */
import { mkdir } from 'node:fs/promises';
import playwright from '../tests/e2e/node_modules/playwright/index.js';

const { chromium } = playwright;

const base = process.env.PUBLIC_REMEDIATION_BASE ?? 'http://127.0.0.1:15174';
const slug = process.env.PUBLIC_REMEDIATION_SLUG ?? '2026-korea-masters-t030';
const out = '.playwright-mcp/public-remediation';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const routes = [
    ['schedule', `/e/${slug}/schedule`],
    ['draw', `/e/${slug}/draws/MS?view=round&round=0`],
    ['regulations', `/e/${slug}/regulations`],
    ['login-safe-next', `/e/login?next=${encodeURIComponent(`/e/${slug}/enter/signed-in`)}`],
  ];
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, path] of routes) {
      const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      if (!response || response.status() >= 400) throw new Error(`${name}: HTTP ${response?.status()}`);
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      if (overflow.documentWidth > overflow.viewportWidth) {
        throw new Error(`${name} at ${width}px scrolls horizontally: ${JSON.stringify(overflow)}`);
      }
      if (name === 'schedule') {
        const visible = await page.locator('main').innerText();
        if (!visible.includes('Schedule / Live')) throw new Error('schedule heading missing');
      }
      if (name === 'draw') {
        if (!(await page.getByRole('link', { name: /^Round$/ }).count())) {
          throw new Error('draw has no explicit Round view continuation');
        }
      }
      if (name === 'login-safe-next') {
        const next = await page.locator('input[name="next"]').inputValue();
        if (next !== `/e/${slug}/enter/signed-in`) throw new Error(`unsafe or lost next: ${next}`);
      }
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    }
  }
  await page.goto(`${base}/e/${slug}/regulations`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  const zoomOverflow = await page.evaluate(() => ({
    overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 5)
      .map((node) => `${node.tagName}.${node.className}`),
  }));
  if (zoomOverflow.overflowing) throw new Error(`regulations scroll horizontally at 200% text size: ${JSON.stringify(zoomOverflow)}`);
  console.log(`Public remediation checks passed for ${slug}; screenshots: ${out}`);
} finally {
  await browser.close();
}
