import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function rootScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
}

test('each surface has a launch script named after it', () => {
  const scripts = rootScripts();
  // The operator product and the public entrant site are launched by name.
  // If either is renamed, the Makefile targets and the docs recipe go stale
  // silently — this is the assertion that makes that loud.
  expect(scripts['dev:scheduler']).toBeDefined();
  expect(scripts['dev:entrant']).toBeDefined();
});

test('the Makefile targets invoke the scripts that actually exist', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  const scripts = rootScripts();

  expect(makefile).toContain('entrant-dev:');
  expect(makefile).toContain('local-dev:');

  // Every `npm run X` the Makefile INVOKES must be a real root script — and a
  // `#` line invokes nothing. Comments are stripped first (the same idiom
  // `helpers/nginxConf.ts` uses on nginx.conf, and for the same reason: that
  // file is mostly prose and the prose names paths). Without this the
  // `make check` type-gate comment, which explains why the gate runs `tsc -b`
  // rather than `npm run build`, reddened a green tree by quoting CI's own
  // command — `build` is a workspace script, not a root one. Nothing can hide
  // behind the strip: a recipe line always begins with a TAB, never a `#`.
  const recipes = makefile.replace(/^\s*#.*$/gm, '');
  const invoked = [...recipes.matchAll(/npm run ([a-z:.-]+)/g)].map((m) => m[1]);
  const missing = invoked.filter((name) => !(name in scripts));
  expect(missing).toEqual([]);
});

/** The recipe lines of a Makefile target (everything indented under it). */
function recipe(makefile: string, target: string): string {
  const body = makefile.split(new RegExp(`^${target}:.*$`, 'm'))[1] ?? '';
  return body.split(/^\S/m)[0];
}

test('the entrant dev server does not collide with the operator dev server', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  // 5173 is the SPA; the entrant app must not silently steal it. `react-router
  // dev` reads ONLY a --port flag — a PORT env var is a no-op, and the loser of
  // the race silently increments, so asserting the digits appear somewhere is
  // not enough: the flag has to be there.
  for (const target of ['entrant-dev', 'local-dev']) {
    expect(recipe(makefile, target)).toContain('--port 5174');
  }
  // The operator SPA is pinned too, rather than trusting Vite's default.
  expect(recipe(makefile, 'local-dev')).toContain('--port 5173');
});

test('each surface gets the backend variable its own code reads', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  // The entrant SSR server reads API_BASE_URL (apiFetch.server.ts, which throws
  // when unset). VITE_API_PROXY_TARGET belongs to the operator SPA's dev proxy
  // and does nothing for the entrant app — setting it there was a silent crash.
  for (const target of ['entrant-dev', 'local-dev']) {
    expect(recipe(makefile, target)).toContain('API_BASE_URL=http://localhost:8600 npm run dev:entrant');
  }
  expect(recipe(makefile, 'entrant-dev')).not.toContain('VITE_API_PROXY_TARGET');
  // ...and the operator SPA still gets its own.
  expect(recipe(makefile, 'local-dev')).toContain(
    'VITE_API_PROXY_TARGET=http://localhost:8600 npm run dev:scheduler',
  );
});
