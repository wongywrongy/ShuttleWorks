import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Explicit, reversible recipes: never infer clicks from arbitrary action text.
export function interactionRecipes(tier, surfaces) {
  const find = (label) => surfaces.find(([name]) => name === label)?.[1];
  if (tier === 'console') return [
    { name: 'Workspace action menu', path: find('Hub — workspace list'), steps: [
      ['Open workspace actions', 'button[aria-label="More actions"]', '[role="menu"]'],
    ] },
    { name: 'Live-day match selection', path: find('Operations · Live day'), steps: [
      ['Select a queued match', '[data-testid^="run-queue-row-"]', '[aria-label="Match detail"]'],
    ] },
  ].filter(recipe => recipe.path);
  return [
    { name: 'Player path and round selection', path: find('Results draw · Singles full bracket') ?? find('Draw · Singles full bracket'), steps: [
      ['Enable path selection', 'button:text-is("Highlight path")', 'button[aria-pressed="true"]'],
      ['Select a player and highlight their path', '[data-bracket-grid] [data-person-id]', '[data-bracket-grid][data-pinned-person]:not([data-pinned-person=""])'],
      ['Select the final round', '[data-round-jump]', '[data-round-jump][aria-current="true"]', 'last'],
      ['Clear the selected path', 'button:text-is("Clear path")', '[data-bracket-grid][data-pinned-person=""]'],
    ] },
  ].filter(recipe => recipe.path);
}

export async function captureInteractions({ browser, tier, surfaces, base, viewports, assetDir, assetDirName, auth }) {
  const records = [];
  for (const [index, recipe] of interactionRecipes(tier, surfaces).entries()) {
    for (const [viewport, width, height] of viewports) {
      const ref = `I${String(index + 1).padStart(2, '0')}`;
      const record = { ref, name: recipe.name, requestedUrl: base + recipe.path, viewport, reducedMotion: 'no-preference', ok: false, frames: [], consoleErrors: [] };
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'no-preference', recordVideo: { dir: assetDir, size: { width, height } } });
      const page = await context.newPage();
      const video = page.video();
      if (tier === 'console' && auth) await page.route('**/api/auth/me', route => route.fulfill(auth));
      page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text().slice(0, 200)); });
      // Guard the recipe itself against accidentally submitting live data.
      await page.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.fallback() : route.abort('blockedbyclient'));
      const frame = async (caption) => {
        await page.waitForTimeout(700);
        const png = await page.screenshot({ animations: 'allow' });
        const file = `${ref}-${viewport}-${record.frames.length}.png`;
        writeFileSync(join(assetDir, file), png);
        record.frames.push({ caption, url: page.url(), assetPath: `${assetDirName}/${file}`, png: png.toString('base64') });
      };
      try {
        const response = await page.goto(record.requestedUrl, { waitUntil: 'networkidle', timeout: 30000 });
        if (!response?.ok()) throw new Error(`Interaction route returned HTTP ${response?.status()}`);
        await page.evaluate(() => document.fonts.ready);
        await frame('Before action');
        for (const [caption, selector, expected, position] of recipe.steps) {
          const candidates = page.locator(selector);
          const target = position === 'last' ? candidates.last() : candidates.first();
          await target.scrollIntoViewIfNeeded();
          await target.hover();
          await page.waitForTimeout(400);
          await target.click();
          await page.locator(expected).first().waitFor({ state: 'visible', timeout: 5000 });
          await frame(caption);
        }
        record.ok = record.consoleErrors.length === 0;
      } catch (error) { record.error = error.message.split('\n')[0]; }
      record.finalUrl = page.url();
      await context.close();
      const original = await video.path();
      const file = `${ref}-${viewport}.webm`;
      await video.saveAs(join(assetDir, file));
      if (original !== join(assetDir, file)) unlinkSync(original);
      record.videoAsset = `${assetDirName}/${file}`;
      record.videoBase64 = readFileSync(join(assetDir, file)).toString('base64');
      records.push(record);
      console.log(`${ref} ${viewport}: ${recipe.name} — ${record.ok ? 'complete' : record.error ?? 'console errors'}`);
    }
  }
  return records;
}

export function interactionSections(records, esc) {
  return records.flatMap(record => record.frames.map((frame, index) => `<section class="sheet ${record.viewport}"><p class="eyebrow">${record.ref} · ${record.viewport} · action ${index}/${record.frames.length - 1}</p><h2>${esc(record.name)} · ${esc(frame.caption)}</h2><p class="path">${esc(frame.url)} · ${record.ok ? 'Verified interaction' : `Incomplete: ${esc(record.error ?? 'browser errors')}`}</p>${index === 0 ? `<div class="interaction-video"><p>Play the recorded action sequence (normal motion; includes initial loading).</p><video controls preload="none" poster="data:image/png;base64,${frame.png}" src="data:video/webm;base64,${record.videoBase64}" style="width:100%;max-height:70vh"></video></div>` : ''}<div class="frame"><div class="capture"><img src="data:image/png;base64,${frame.png}" alt="${esc(frame.caption)}"><p class="caption">Recorded UI state. PDF shows keyframes; use the HTML book to play the motion.</p></div></div></section>`)).join('');
}
