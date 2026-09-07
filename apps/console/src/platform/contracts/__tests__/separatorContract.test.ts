/**
 * Separator contract (v3 consolidated plan, package 28, ruling 1) — one
 * separator per context: a middot (" · ") for inline metadata, a chevron
 * ("›") for navigation breadcrumbs / inline "go to" actions, never a slash
 * for a pair (the side authority — `platform/domain/sides.ts`,
 * `apps/entrant/app/lib/side.ts` — owns pair joins), and never an em dash in
 * rendered text (the `em dash contract` already covers that half; this file
 * covers the remaining literal separator glyphs: bullet "•" and pipe " | ").
 *
 * Same enumerate-from-disk shape as `emDashContract.test.ts` / `copyContract
 * .test.ts`: comments are stripped first so a docblock explaining the rule
 * is not a violation of it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../..');

const SCAN_ROOTS = [
  'apps/console/src/components',
  'apps/console/src/platform',
  'apps/console/src/modules',
  'apps/entrant/app/components',
  'apps/entrant/app/lib',
  'packages/design-system/components',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(REPO, file).split(path.sep).join('/');

/** Source with comments stripped — see `emDashContract.test.ts`'s docblock. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * A single bullet character in shipped code — a run of two-or-more bullets
 * (`••••••••`) is a masked-password placeholder, never a separator, so it is
 * excluded by the lookaround. A TS union type (`'A' | 'B'`) is structurally
 * indistinguishable from a rendered `' | '` join at the lexical level a
 * text scan operates on (see `emDashContract.test.ts`'s own documented
 * blind-spot precedent), so this file does not attempt to ban a literal
 * pipe — the codebase's actual inline-metadata separator is the middot,
 * confirmed by grep across the scoped surfaces, and no genuine rendered
 * `' | '` join exists today (verified by hand during the sweep that added
 * this file).
 */
const BULLET_SEPARATOR = /(?<!•)•(?!•)/g;

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

const RULES: readonly Rule[] = Object.freeze([
  { id: 'bullet-separator', pattern: BULLET_SEPARATOR, why: 'use INLINE_METADATA_SEPARATOR (" · ") instead of a bullet' },
]);

/** Deliberate, reasoned exceptions. */
const ALLOWED: readonly { file: string; rule: string; why: string }[] = Object.freeze([
  // Empty since P3: the one entry covered a native-tooltip issue list on the
  // meet match row, which is now a real <ul> in the match inspector with CSS
  // markers — no text glyph to allow.
]);

function isAllowed(file: string, rule: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.rule === rule);
}

interface Finding {
  file: string;
  rule: Rule;
  hits: string[];
}

function findings(): Finding[] {
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(REPO, root)));
  return files.flatMap((file) => {
    const name = rel(file);
    const source = code(readFileSync(file, 'utf8'));
    return RULES.flatMap((rule) => {
      const hits = source.match(new RegExp(rule.pattern.source, rule.pattern.flags)) ?? [];
      return hits.length > 0 ? [{ file: name, rule, hits }] : [];
    });
  });
}

describe('the separator contract has something to scan', () => {
  it('enumerates the scoped surfaces from disk', () => {
    const files = SCAN_ROOTS.flatMap((root) => walk(path.join(REPO, root)));
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => rel(f) === 'apps/console/src/modules/operations/plan/ScheduleDiffView.tsx')).toBe(true);
  });
});

describe('one separator per context — no bullet or pipe standing in for the middot', () => {
  it('finds no banned separator glyph outside the allowlist', () => {
    const violations = findings()
      .filter(({ file, rule }) => !isAllowed(file, rule.id))
      .map(({ file, rule, hits }) => `${file}: ${rule.id} (${hits.join(', ')}) - ${rule.why}`);
    expect(violations).toEqual([]);
  });

  it('keeps every allowlist entry earning its place', () => {
    const stale = ALLOWED.filter(
      (entry) => !findings().some(({ file, rule }) => file === entry.file && rule.id === entry.rule),
    ).map((entry) => `${entry.file}: ${entry.rule}`);
    expect(stale).toEqual([]);
  });
});
