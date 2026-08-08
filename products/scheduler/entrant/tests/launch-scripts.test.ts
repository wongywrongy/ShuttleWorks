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

  // Every `npm run X` the Makefile invokes must be a real root script.
  const invoked = [...makefile.matchAll(/npm run ([a-z:.-]+)/g)].map((m) => m[1]);
  const missing = invoked.filter((name) => !(name in scripts));
  expect(missing).toEqual([]);
});

test('the entrant dev server does not collide with the operator dev server', () => {
  const makefile = readFileSync(join(REPO_ROOT, 'Makefile'), 'utf8');
  // 5173 is the SPA; the entrant app must not silently steal it, because Vite
  // would quietly increment the port and the docs recipe would be wrong.
  expect(makefile).toContain('5174');
});
