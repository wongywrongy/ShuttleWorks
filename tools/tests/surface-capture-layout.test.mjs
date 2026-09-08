import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CAPTURE = resolve(ROOT, 'tools/surface-capture.mjs');
const RUN_INTEGRATION = process.env.SURFACE_CAPTURE_INTEGRATION === '1';

function runCapture(args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CAPTURE, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`surface capture exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function pngSize(base64) {
  const png = Buffer.from(base64, 'base64');
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('surface capture preserves paginated query state and covers a long document', {
  skip: !RUN_INTEGRATION,
}, async () => {
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/modules')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([{ moduleId: 'bracket', status: 'enabled' }]));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><html><head><title>Fixture</title><style>html,body{margin:0}body{height:2400px;background:linear-gradient(#174dbc 0 1200px,#f2a900 1200px 2400px)}h1{position:absolute;top:0}</style></head><body><h1>Completed page 2</h1></body></html>`);
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const outputDir = await mkdtemp(join(tmpdir(), 'surface-capture-integration-'));
  const output = join(outputDir, 'fixture.pdf');
  try {
    await runCapture(['entrant', base, output], {
      CAPTURE_LABEL: 'Discovery · Season calendar',
      CAPTURE_LIMIT: '1',
      CAPTURE_SETTLE_MS: '0',
    });
    const manifest = JSON.parse(await readFile(join(outputDir, 'fixture.manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'complete');
    assert.equal(manifest.surfaceCount, 1);
    assert.equal(manifest.failedViewports.length, 0);
    assert.equal(manifest.surfaces[0].path, '/e/');
    assert.equal(manifest.surfaces[0].viewports.desktop.documentHeight, 2400);
    assert.equal(manifest.surfaces[0].viewports.mobile.documentHeight, 2400);
    assert.equal(manifest.surfaces[0].viewports.desktop.segments, 3);
    assert.equal(manifest.surfaces[0].viewports.mobile.segments, 3);

    const html = await readFile(join(outputDir, 'fixture.html'), 'utf8');
    const images = [...html.matchAll(/src="data:image\/png;base64,([^\"]+)"/g)].map((match) => pngSize(match[1]));
    assert.deepEqual(images, [
      { width: 2880, height: 1800 },
      { width: 2880, height: 1800 },
      { width: 2880, height: 1200 },
      { width: 780, height: 1688 },
      { width: 780, height: 1688 },
      { width: 780, height: 1424 },
    ]);
    assert.ok((await readFile(output)).byteLength > 0, 'PDF artifact should be generated');
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('inventory capture adds an internal list-end sheet and valid PDF', {
  skip: !RUN_INTEGRATION,
}, async () => {
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/modules')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([{ moduleId: 'bracket', status: 'enabled' }]));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><html><head><style>html,body{margin:0}body{height:900px}.list-shell{height:auto}[data-list-scroll]{height:500px;overflow-y:auto;background:linear-gradient(#174dbc 0 600px,#f2a900 600px 1200px)}.list-content{height:1200px}.pager{margin-top:8px}</style></head><body><main><h1>Roster</h1><div class="list-shell"><div data-list-scroll><div class="list-content">${'<p>Player row</p>'.repeat(100)}</div><p class="pager">Showing 101–200 of 253 · Next</p></div></div></main></body></html>`);
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const outputDir = await mkdtemp(join(tmpdir(), 'surface-capture-inventory-'));
  const output = join(outputDir, 'inventory.pdf');
  try {
    await runCapture(['console', base, output], {
      CAPTURE_LABEL: 'Hub — workspace list',
      CAPTURE_LIMIT: '1',
      CAPTURE_SETTLE_MS: '0',
    });
    const manifest = JSON.parse(await readFile(join(outputDir, 'inventory.manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'complete');
    assert.equal(manifest.surfaces[0].path, '/');
    for (const viewport of ['desktop', 'mobile']) {
      assert.equal(manifest.surfaces[0].viewports[viewport].scrollEndSegments, 1);
      assert.ok(manifest.surfaces[0].viewports[viewport].scrollRegions.length >= 1);
    }
    const html = await readFile(join(outputDir, 'inventory.html'), 'utf8');
    assert.match(html, /supplemental list end/);
    assert.match(html, /This does not represent a complete record capture/);
    const expectedImages = manifest.surfaces[0].viewports.desktop.segments
      + manifest.surfaces[0].viewports.mobile.segments + 2;
    assert.equal([...html.matchAll(/src="data:image\/png;base64,/g)].length, expectedImages);
    assert.ok((await readFile(output)).byteLength > 0, 'inventory PDF artifact should be generated');
    await runCapture(['console', base, join(outputDir, 'omitted.html')], {
      CAPTURE_LABEL: 'Participants · Entries',
      CAPTURE_LIMIT: '0',
      CAPTURE_SETTLE_MS: '0',
    });
    const omitted = JSON.parse(await readFile(join(outputDir, 'omitted.manifest.json'), 'utf8'));
    assert.equal(omitted.surfaceCount, 0, 'disabled routes must not remain in the planned count');
    assert.equal(omitted.surfaces.length, 0);
    assert.equal(omitted.captureContext.routeCoverage.stateSheets, 0);
    assert.ok(omitted.captureContext.omittedStates.some((state) => state.label === 'Participants · Entries'));
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(outputDir, { recursive: true, force: true });
  }
});

// The current book is a product inventory, not a compatibility URL census.
// It must follow the canonical workflow registry and contain no pre-
// consolidation aliases. Historical redirect behavior is documented by the
// route contract and is deliberately excluded from visual capture.
test('capture inventory covers every canonical workflow route and excludes aliases', async () => {
  const capture = await readFile(CAPTURE, 'utf8');
  const nav = await readFile(
    resolve(ROOT, 'apps/console/src/platform/product-shell/workspaceNav.ts'),
    'utf8',
  );
  const routesBlock = nav.slice(
    nav.indexOf('export const WORKFLOW_ROUTES'),
    nav.indexOf('export interface WorkflowRedirect'),
  );
  const routePaths = [...routesBlock.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(routePaths.length >= 20, 'workflow routes should be discoverable');

  const surfacesBlock = capture.slice(
    capture.indexOf('const CONSOLE_SURFACES = ['),
    capture.indexOf('const ENTRANT_SURFACES = ['),
  );
  assert.equal(capture.includes('const CONSOLE_ALIAS_PATHS = ['), false);
  assert.equal(capture.includes('const CONSOLE_ALIASES ='), false);
  assert.equal(capture.includes('ENTRANT_COMPATIBILITY_SURFACES'), false);
  assert.doesNotMatch(capture, /\[\"[^\"]*Compatibility[^\"]*\",/);
  assert.doesNotMatch(capture, /\[\"Display · Missing capability\",/);
  assert.doesNotMatch(capture, /\[\"Invite · Missing fixture token\",/);
  assert.doesNotMatch(capture, /\[\"Module guard · Meet (?:matches|team structure) unavailable\",/);
  assert.match(capture, /reviewedBuildSha: REVIEWED_BUILD_SHA/);
  assert.match(capture, /workingTreeFingerprint: WORKING_TREE_FINGERPRINT/);
  assert.match(capture, /effectiveDemoInstant: EFFECTIVE_DEMO_INSTANT/);
  for (const routePath of routePaths) {
    assert.ok(
      surfacesBlock.includes(`/${routePath}\``) || surfacesBlock.includes(`/${routePath}?`),
      `capture inventory is missing workflow route ${routePath}`,
    );
  }
});
