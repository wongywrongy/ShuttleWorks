import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { SSR_TEST_FILES } from '../vitest.test-files';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

function rootScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
}

function entrantScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'apps/entrant/package.json'), 'utf8')).scripts;
}

function recipeCommands(makefile: string, target: string): string[] {
  const lines = makefile.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${target}:`).test(line));
  if (start < 0) return [];

  const commands: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('\t')) {
      commands.push(line.slice(1).replace(/^[@-]+/, ''));
    } else if (line.trim() === '' || line.startsWith('#')) {
      continue;
    } else {
      break;
    }
  }
  return commands;
}

function entrantTestsContainingCreateServer(): string[] {
  const testDir = join(REPO_ROOT, 'apps/entrant/tests');
  return readdirSync(testDir)
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => /\bcreateServer\s*\(\s*\{/.test(readFileSync(join(testDir, name), 'utf8')))
    .map((name) => `tests/${name}`)
    .sort();
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

test('exposes explicit entrant test tiers while retaining the complete suite', () => {
  const root = rootScripts();
  const entrant = entrantScripts();

  expect(root['test:entrant:unit']).toBe('npm --prefix apps/entrant run test:unit');
  expect(root['test:entrant:ssr']).toBe('npm --prefix apps/entrant run test:ssr');
  expect(entrant['test:unit']).toBe('vitest run --config vitest.unit.config.ts');
  expect(entrant['test:ssr']).toBe('vitest run --config vitest.ssr.config.ts');
  expect(entrant['test:run']).toBe('vitest run');
});

test('keeps the entrant SSR list tied to every createServer test and partitions all tests', () => {
  const all = readdirSync(join(REPO_ROOT, 'apps/entrant/tests'))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => `tests/${name}`)
    .sort();
  const ssr: string[] = [...SSR_TEST_FILES].sort();
  const discoveredSsr = entrantTestsContainingCreateServer();
  const unit = all.filter((name) => !ssr.includes(name));

  expect(ssr).toEqual(discoveredSsr);
  expect(ssr).toHaveLength(19);
  expect(new Set([...unit, ...ssr])).toEqual(new Set(all));
  expect(unit).not.toEqual([]);
  expect(new Set(unit).size + new Set(ssr).size).toBe(all.length);
});

test('keeps check full and defines the narrower fast developer gate', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');

  expect(makefile).toMatch(/^check: check-full$/m);
  const full = recipeCommands(makefile, 'check-full');
  const fast = recipeCommands(makefile, 'check-fast');
  expect(full.length).toBeGreaterThan(0);
  expect(fast.length).toBeGreaterThan(0);

  for (const command of [
    'npm run lint:scheduler',
    'cd apps/console && npx tsc -b',
    'npm --prefix apps/console run test:run',
    'npm run depcruise',
    'npm run lint:entrant',
    'npm run typecheck:entrant',
    'npm run test:entrant',
    'npm run depcruise:entrant',
    'ruff check $(PY_SOURCES)',
    'cd apps/api/src && lint-imports --config ../.importlinter',
    'pytest',
    'npm run docs:freshness',
  ]) {
    expect(full).toContain(command);
  }

  for (const command of [
    'npm run lint:scheduler',
    'cd apps/console && npx tsc -b',
    'npm --prefix apps/console run test:run',
    'npm run depcruise',
    'npm run lint:entrant',
    'npm run typecheck:entrant',
    'npm run test:entrant:unit',
    'npm run depcruise:entrant',
    'ruff check $(PY_SOURCES)',
    'cd apps/api/src && lint-imports --config ../.importlinter',
    "pytest tests/backend/unit -m 'not slow'",
    'npm run docs:freshness',
  ]) {
    expect(fast).toContain(command);
  }
  expect(fast).not.toContain('npm run test:entrant');
  expect(fast).not.toContain('pytest');
});

test('installs e2e dependencies only through the explicit bootstrap target', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');

  const install = recipeCommands(makefile, 'test-e2e-install');
  expect(install.length).toBeGreaterThan(0);
  expect(install).toContain('cd tests/e2e && npm install && npx playwright install --with-deps chromium');
  for (const target of ['test-e2e', 'test-e2e-rebuild', 'test-e2e-dev']) {
    const recipe = recipeCommands(makefile, target);
    expect(recipe.length).toBeGreaterThan(0);
    expect(recipe.some((line) => line.includes('npx playwright test'))).toBe(true);
    expect(recipe).not.toContain('npm install');
  }
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
