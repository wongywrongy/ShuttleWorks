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

describe('match-list parity', () => {
  for (const rel of SURFACES) {
    it(`${rel} uses the shared column spec and status vocabulary`, () => {
      const src = read(rel);
      expect(src).toContain('MATCH_LIST_COLUMNS');
      expect(src).not.toMatch(/const MATCH_COLUMNS/);
      expect(src).toContain('STATUS_LABEL');
      // No resurrected local vocabulary:
      expect(src).not.toMatch(/from '\.\/matchStatus'/);
    });
  }

  it('the old bracket-local vocabulary file is gone', () => {
    expect(() => read('products/bracket/matchStatus.ts')).toThrow();
  });
});
