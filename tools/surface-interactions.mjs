import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { expandedRecipes, inventoryControls } from './surface-interaction-recipes.mjs';

// The lineup endpoint is a pure projection of its posted state; it does not
// persist a generation. Its confirmation still uses the blocked state write.
export function isReadOnlyCaptureRequest(method, url, origin) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const target = new URL(url);
  return method === 'POST' && target.origin === origin && /^\/api\/tournaments\/[0-9a-f-]+\/meet\/lineup$/.test(target.pathname);
}

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

export async function captureInteractions({ browser, tier, surfaces, base, viewports, assetDir, assetDirName, auth, inventories = [], entrantStorageState }) {
  const records = [];
  const recipes = [...interactionRecipes(tier, surfaces).map(recipe => ({ ...recipe, video: true })), ...expandedRecipes(tier, surfaces, inventories)];
  const knownControls = new Set(inventories.flatMap(inventory => inventory.controls.map(control => `${inventory.path}|${inventory.viewport}|${control.selector}`)));
  const captureRecipe = async (index, recipe) => {
    for (const [viewport, width, height] of viewports) {
      if (process.env.SURFACE_INTERACTION_FILTER && !recipe.name.includes(process.env.SURFACE_INTERACTION_FILTER)) continue;
      if (recipe.viewport && recipe.viewport !== viewport) continue;
      const ref = `I${String(index + 1).padStart(2, '0')}`;
      const record = { ref, name: recipe.name, requestedUrl: base + recipe.path, viewport, reducedMotion: 'no-preference', ok: false, frames: [], consoleErrors: [], blockedRequests: [] };
      const usesEntrantSession = /My entries \(signed in\)|Entry receipt|Signed-in outcome|Account-created outcome/.test(recipe.name);
      const context = await browser.newContext({ ...(usesEntrantSession ? { storageState: entrantStorageState } : {}), viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'no-preference', ...(recipe.video ? { recordVideo: { dir: assetDir, size: { width, height } } } : {}) });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const video = page.video();
      if (tier === 'console' && auth) await page.route('**/api/auth/me', route => route.fulfill(auth));
      page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text().slice(0, 200)); });
      // Guard the recipe itself against accidentally submitting live data.
      await page.route('**/*', route => {
        const request = route.request();
        if (isReadOnlyCaptureRequest(request.method(), request.url(), new URL(base).origin)) return route.fallback();
        record.blockedRequests.push({ method: request.method(), url: request.url() });
        return route.abort('blockedbyclient');
      });
      const saveFrame = async (caption) => {
        const png = await page.screenshot({ animations: 'allow' });
        const file = `${ref}-${viewport}-${record.frames.length}.png`;
        writeFileSync(join(assetDir, file), png);
        record.frames.push({ caption, url: page.url(), assetPath: `${assetDirName}/${file}`, controls: await inventoryControls(page) });
      };
      const frame = async (caption) => {
        await page.waitForTimeout(700);
        await saveFrame(caption);
        if (caption === 'Before action') return;
        const region = await page.evaluate(() => {
          const roots = [...document.querySelectorAll('[role="dialog"], [data-testid="workspace-inspector"], [data-testid="bracket-player-detail"], [data-testid="bracket-match-detail"]')];
          const candidates = roots.flatMap(root => [root, ...root.querySelectorAll('*')]);
          const element = candidates.find(item => item.clientHeight > 100 && /auto|scroll/.test(getComputedStyle(item).overflowY) && item.scrollHeight > item.clientHeight + 4);
          if (!element) return null;
          element.setAttribute('data-interaction-scroll', 'active');
          return { top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight };
        });
        if (!region) return;
        try {
          for (let top = region.height - 40; top < region.total; top += region.height - 40) {
            const actual = await page.locator('[data-interaction-scroll="active"]').evaluate((element, y) => { element.scrollTop = y; return element.scrollTop; }, top);
            await page.waitForTimeout(100);
            await saveFrame(`${caption} · panel continuation at ${actual}px`);
            if (actual + region.height >= region.total) break;
          }
        } finally {
          await page.locator('[data-interaction-scroll="active"]').evaluate((element, top) => { element.scrollTop = top; element.removeAttribute('data-interaction-scroll'); }, region.top);
        }
      };
      try {
        const response = await page.goto(record.requestedUrl, { waitUntil: 'networkidle', timeout: 30000 });
        if (!response?.ok()) throw new Error(`Interaction route returned HTTP ${response?.status()}`);
        await page.evaluate(() => document.fonts.ready);
        await frame('Before action');
        for (const [caption, selector, expected, position, action] of recipe.steps) {
          const candidates = page.locator(selector).filter({ visible: true });
          const target = position === 'last' ? candidates.last() : candidates.first();
          if (await target.isDisabled()) { await frame(`${caption} — disabled in this state`); continue; }
          await target.scrollIntoViewIfNeeded();
          await target.hover();
          await page.waitForTimeout(400);
          if (action?.select !== undefined) await target.selectOption(action.select);
          else await target.click();
          await page.locator(expected).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 5000 });
          await frame(caption);
        }
        record.ok = record.consoleErrors.length === 0 && record.blockedRequests.length === 0;
        if (record.blockedRequests.length) record.error = "Control requires a server write; capture did not submit it";
        if (record.ok && new URL(page.url()).pathname === new URL(record.frames[0].url).pathname) {
          const controls = record.frames.at(-1)?.controls ?? [];
          const children = expandedRecipes(tier, [], [{ label: recipe.name, path: recipe.path, viewport, controls }]);
          for (const child of children) {
            const key = `${child.path}|${viewport}|${child.steps[0][1]}`;
            const choiceKey = `${key}|${JSON.stringify(child.steps[0][4] ?? {})}`;
            if (knownControls.has(key) || knownControls.has(choiceKey)) continue;
            knownControls.add(choiceKey);
            recipes.push({ ...child, depth: (recipe.depth ?? 0) + 1, steps: [...recipe.steps, ...child.steps] });
          }
        }
      } catch (error) { record.error = error.message.split('\n')[0]; await frame('Observed state when verification failed').catch(() => {}); }
      record.finalUrl = page.url();
      await context.close();
      if (video) {
      const original = await video.path();
      const file = `${ref}-${viewport}.webm`;
      await video.saveAs(join(assetDir, file));
      if (original !== join(assetDir, file)) unlinkSync(original);
      record.videoAsset = `${assetDirName}/${file}`;
      }
      writeFileSync(join(assetDir, `${ref}-${viewport}.json`), JSON.stringify(record, null, 2));
      records.push(record);
      console.log(`${ref} ${viewport}: ${recipe.name} — ${record.ok ? 'complete' : record.error ?? 'console errors'}`);
    }
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < recipes.length) {
      const index = cursor++;
      await captureRecipe(index, recipes[index]);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return records.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }) || a.viewport.localeCompare(b.viewport));
}

export function interactionSections(records, esc) {
  return records.flatMap(record => record.frames.map((frame, index) => `<section class="sheet ${record.viewport}" ${index === 0 ? `id="${record.ref}-${record.viewport}"` : ''}><p class="eyebrow">${record.ref} · ${record.viewport} · action ${index}/${record.frames.length - 1}</p><h2>${esc(record.name)}</h2>${index === 0 && record.videoAsset ? `<div class="interaction-video"><p>Play the recorded action sequence (normal motion; includes initial loading).</p><video controls preload="none" poster="${esc(frame.assetPath)}" src="${esc(record.videoAsset)}" style="width:100%;max-height:70vh"></video></div>` : ''}<div class="frame"><div class="capture"><img loading="lazy" decoding="async" src="${esc(frame.assetPath)}" alt="${esc(frame.caption).replace(/"/g, "&quot;").replace(/'/g, "&#39;")}"><\/div><aside><h2>${esc(frame.caption)}</h2><p class="path">${esc(frame.url)}</p><p>${record.ok ? 'Verified interaction' : `Incomplete: ${esc(record.error ?? 'browser errors')}`}</p><p>Recorded UI state. PDF shows keyframes; use the HTML book to play the motion.</p><p>Review the selected control, revealed panel, focus, and surrounding context.</p></aside></div></section>`)).join('');
}

export function interactionIndexSections(records, esc) {
  const sections = [];
  for (let start = 0; start < records.length; start += 16) {
    sections.push(`<section class="index"><h1>Interaction state index</h1><p>PDF sequences show each action and its resulting UI. Images lead; the side column records the action and route.</p><ul>${records.slice(start, start + 16).map(record => `<li><a href="#${record.ref}-${record.viewport}">${record.ref} · ${esc(record.viewport)} · ${esc(record.name)}</a> · ${record.frames.length} frames${record.ok ? '' : ' · INCOMPLETE'}</li>`).join('')}</ul></section>`);
  }
  return sections.join('');
}
