import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';

const FIXTURES = [
  'app/lib/__boundary_fixture__.server.ts',
  'app/components/__boundary_fixture__.tsx',
  'app/routes/__boundary_fixture__.tsx',
  'app/lib/__leak__.server.ts',
  'app/lib/__reexport__.ts',
  'app/components/__indirect__.tsx',
];

function cleanup(): void {
  for (const f of FIXTURES) rmSync(f, { force: true });
}
afterEach(cleanup);

/** Runs the real CLI the CI job runs. Returns exit code + combined output. */
function depcruise(): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['depcruise', 'app', '--output-type', 'err'], {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the entrant app is clean against its own boundary rules', () => {
  const { code, out } = depcruise();
  expect(out).toContain('no dependency violations found');
  expect(code).toBe(0);
});

test('importing the operator frontend is an error', () => {
  // apps/console/src/api/client.ts is module-singleton, browser-coupled and
  // withCredentials-bearing (spec §4). Shared across requests in one node
  // process, its module state is a cross-entrant leak. The rule is the thing
  // that stops someone reaching for it.
  mkdirSync('app/lib', { recursive: true });
  writeFileSync(
    'app/routes/__boundary_fixture__.tsx',
    "import { apiClient } from '../../../console/src/api/client';\n" +
      'export const fixture = apiClient;\n',
  );

  const { code, out } = depcruise();
  expect(out).toContain('entrant-no-operator-frontend');
  expect(code).not.toBe(0);
});

test('a client-reachable module importing a .server module is an error', () => {
  mkdirSync('app/lib', { recursive: true });
  mkdirSync('app/components', { recursive: true });
  writeFileSync('app/lib/__boundary_fixture__.server.ts', 'export const serverOnly = 1;\n');
  writeFileSync(
    'app/components/__boundary_fixture__.tsx',
    "import { serverOnly } from '../lib/__boundary_fixture__.server';\n" +
      'export function Fixture() { return serverOnly; }\n',
  );

  const { code, out } = depcruise();
  expect(out).toContain('entrant-server-only-stays-server');
  expect(code).not.toBe(0);
});

test('a one-hop re-export barrel does not launder a .server import (transitive case)', () => {
  // Direct-import matching alone (a plain `to.path` restriction) only sees
  // the edge component -> barrel, not barrel -> *.server.ts, so a re-export
  // barrel would sail through clean — the exact leak this rule exists to
  // stop, one hop removed. `to.reachable: true` walks the transitive graph,
  // not just direct edges, which is what catches this.
  mkdirSync('app/lib', { recursive: true });
  mkdirSync('app/components', { recursive: true });
  writeFileSync('app/lib/__leak__.server.ts', 'export const leaked = 1;\n');
  writeFileSync('app/lib/__reexport__.ts', "export { leaked } from './__leak__.server';\n");
  writeFileSync(
    'app/components/__indirect__.tsx',
    "import { leaked } from '../lib/__reexport__';\n" +
      'export function Indirect() { return leaked; }\n',
  );

  const { code, out } = depcruise();
  expect(out).toContain('entrant-server-only-stays-server');
  expect(code).not.toBe(0);
});

test('CI runs the entrant gates', () => {
  const ci = readFileSync('../../.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('npm run lint:entrant');
  expect(ci).toContain('npm run typecheck:entrant');
  expect(ci).toContain('npm --prefix apps/entrant run test:run');
  expect(ci).toContain('npm run depcruise:entrant');
  // The export-level half of entrant-server-only-stays-server. Asserted here
  // so narrowing the depcruise rule off app/routes/ (Task 15) cannot quietly
  // become "routes are unguarded" if someone later trims the CI job.
  expect(ci).toContain('npm --prefix apps/entrant run build');
  expect(ci).toContain('npm run knip:entrant || true');
});
