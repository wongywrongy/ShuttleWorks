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

/** Each surface takes its own instance of the shared column spec — the two
 *  lists differ only in the width of the event column, which each derives
 *  from its own label vocabulary (`matchListColumns.ts`). The instances still
 *  come from the shared module: neither surface may build its own. */
const SURFACES = [
  { rel: 'products/meet/matches/MatchesSpreadsheet.tsx', prefix: 'MEET_' },
  { rel: 'products/bracket/BracketMatchesTab.tsx', prefix: 'BRACKET_' },
];

/** The shared names a surface must take from control-plane, never define.
 *  The first two are per-list, so they arrive under the surface's prefix. */
const PREFIXED_NAMES = ['MATCH_LIST_COLUMNS', 'MATCH_CELL'];
const SHARED_NAMES = ['STATUS_LABEL', 'STATUS_PILL_TONE'];

describe('match-list parity', () => {
  for (const { rel, prefix } of SURFACES) {
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
      for (const name of PREFIXED_NAMES) {
        expect(controlPlaneImports).toContain(`${prefix}${name}`);
      }
      for (const name of SHARED_NAMES) {
        expect(controlPlaneImports).toContain(name);
      }
    });

    it(`${rel} defines no rival copy of the shared names`, () => {
      const src = read(rel);
      // Redefining a shared name locally — under its own name, a prefixed one
      // or the old one — is exactly the drift this guard exists to stop.
      expect(src).not.toMatch(
        /(?:const|let|var|function|enum)\s+(?:(?:MEET_|BRACKET_)?MATCH_LIST_COLUMNS|MATCH_COLUMNS|(?:MEET_|BRACKET_)?MATCH_CELL|STATUS_LABEL|STATUS_CLASS|STATUS_PILL_TONE)\b/,
      );
      expect(src).not.toMatch(/from '\.\/matchStatus'/);
    });
  }

  it('the old bracket-local vocabulary file is gone', () => {
    expect(() => read('products/bracket/matchStatus.ts')).toThrow();
  });
});
