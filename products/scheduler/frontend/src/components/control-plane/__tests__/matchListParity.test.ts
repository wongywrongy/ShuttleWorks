/**
 * Drift guard (spec 2026-07-14 §1): both match lists MUST consume the
 * shared column spec and shared status vocabulary — no local copies.
 * Source-scan style, same approach as the module-contract tests: the
 * cheapest honest way to pin "imports the shared thing, defines no rival".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const SURFACES = [
  'products/meet/matches/MatchesSpreadsheet.tsx',
  'products/bracket/BracketMatchesTab.tsx',
];

/** The shared names a surface must take from control-plane, never define. */
const SHARED_NAMES = ['MATCH_LIST_COLUMNS', 'MATCH_CELL', 'STATUS_LABEL', 'STATUS_CLASS'];

describe('match-list parity', () => {
  for (const rel of SURFACES) {
    it(`${rel} imports the shared column spec and status vocabulary`, () => {
      const src = read(rel);
      // Each shared name must arrive through a control-plane import — a bare
      // mention is not enough, or a same-named local shadow would satisfy it.
      const controlPlaneImports = [
        ...src.matchAll(
          /import\s*\{([\s\S]*?)\}\s*from\s*'[^']*components\/control-plane'/g,
        ),
      ]
        .map((m) => m[1])
        .join(',');
      for (const name of SHARED_NAMES) {
        expect(controlPlaneImports).toContain(name);
      }
    });

    it(`${rel} defines no rival copy of the shared names`, () => {
      const src = read(rel);
      // Redefining a shared name locally — under its own name or the old one —
      // is exactly the drift this guard exists to stop.
      expect(src).not.toMatch(
        /(?:const|let|var|function|enum)\s+(?:MATCH_LIST_COLUMNS|MATCH_COLUMNS|MATCH_CELL|STATUS_LABEL|STATUS_CLASS)\b/,
      );
      expect(src).not.toMatch(/from '\.\/matchStatus'/);
    });
  }

  it('the old bracket-local vocabulary file is gone', () => {
    expect(() => read('products/bracket/matchStatus.ts')).toThrow();
  });
});
