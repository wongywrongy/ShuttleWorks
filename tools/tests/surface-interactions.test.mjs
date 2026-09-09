import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionRecipes, interactionSections } from '../surface-interactions.mjs';

test('filtered books only record interactions for included routes', () => {
  assert.deepEqual(interactionRecipes('console', []), []);
  const recipes = interactionRecipes('entrant', [['Results draw · Singles full bracket', '/e/demo/draws/MS']]);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].path, '/e/demo/draws/MS');
  assert.equal(recipes[0].steps.length, 4);
});
test('HTML offers controllable motion and a static frame for every action, including failures', () => {
  const html = interactionSections([{ref:'I01',viewport:'mobile',name:'Menu',ok:false,error:'missing control',videoAsset:'assets/clip.webm',frames:[{caption:'Before',url:'/demo',assetPath:'assets/frame.png'},{caption:'After',url:'/demo',assetPath:'assets/frame.png'}]}], text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'));
  assert.equal((html.match(/<section /g) ?? []).length, 2);
  assert.equal((html.match(/<video /g) ?? []).length, 1);
  assert.match(html, /controls preload="none"/);
  assert.doesNotMatch(html, /autoplay/);
  assert.match(html, /Incomplete: missing control/);
  assert.match(html, /PDF shows keyframes/);
});

test('expanded inventory captures menus and every finite choice without replaying disabled controls', async () => {
  const { expandedRecipes } = await import('../surface-interaction-recipes.mjs');
  const recipes = expandedRecipes('entrant', [], [{label:'Schedule',path:'/e/demo/schedule',viewport:'mobile',controls:[
    {label:'More filters',selector:'summary',tag:'summary',expanded:null},
    {label:'Status',selector:'select',tag:'select',expanded:null,options:[{value:'all',label:'All',selected:true},{value:'live',label:'Live'},{value:'done',label:'Done'}]},
    {label:'Unavailable',selector:'button',tag:'button',expanded:'false',disabled:true},
  ]}]);
  assert.equal(recipes.length,3);
  assert.ok(recipes.every(recipe=>recipe.viewport==='mobile'));
  assert.deepEqual(recipes.slice(1).map(recipe=>recipe.steps[0][4].select),['live','done']);
});

test('the recorder blocks a write triggered by a UI control', { skip: process.env.SURFACE_CAPTURE_INTEGRATION !== '1' }, async () => {
  const { createServer } = await import('node:http');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const { captureInteractions } = await import('../surface-interactions.mjs');
  const require = createRequire(new URL('../../tests/e2e/package.json', import.meta.url));
  const { chromium } = require('playwright');
  let writes = 0;
  const server = createServer((request, response) => {
    if (request.method === 'POST') writes++;
    response.setHeader('Content-Type', 'text/html');
    response.end(`<button aria-label="More actions" onclick="document.querySelector('[role=menu]').hidden=false;fetch('/write',{method:'POST'}).catch(()=>{})">Menu</button><div role="menu" hidden>Open</div>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'surface-interaction-guard-'));
  const browser = await chromium.launch();
  const previousFilter = process.env.SURFACE_INTERACTION_FILTER;
  process.env.SURFACE_INTERACTION_FILTER = 'Workspace action menu';
  try {
    const records = await captureInteractions({ browser, tier:'console', surfaces:[['Hub — workspace list','/']], base:`http://127.0.0.1:${server.address().port}`, viewports:[['desktop',640,480]], assetDir:directory, assetDirName:'assets' });
    assert.equal(records.length,1);
    assert.equal(writes,0,'a review capture must not submit server changes');
    assert.equal(records[0].ok,false,'blocked writes must not be reported as a completed journey');
  } finally {
    if (previousFilter === undefined) delete process.env.SURFACE_INTERACTION_FILTER;
    else process.env.SURFACE_INTERACTION_FILTER = previousFilter;
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});

test('only the same-origin pure lineup preview is exempt from the write guard', async () => {
  const { isReadOnlyCaptureRequest } = await import('../surface-interactions.mjs');
  const origin = 'http://127.0.0.1:14180';
  const preview = '/api/tournaments/12345678-1234-1234-1234-123456789abc/meet/lineup';
  assert.equal(isReadOnlyCaptureRequest('POST',origin+preview,origin),true);
  assert.equal(isReadOnlyCaptureRequest('POST','http://example.test'+preview,origin),false);
  assert.equal(isReadOnlyCaptureRequest('PUT',origin+'/api/tournaments/id/state',origin),false);
  assert.equal(isReadOnlyCaptureRequest('POST',origin+preview+'/commit',origin),false);
});
