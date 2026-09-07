/**
 * Brand seam contract (v3 consolidated plan, package 28, ruling 5) — ONE
 * owner for the brand string. `packages/brand/generated.ts` exports `BRAND`,
 * `BRAND_SIGNATURE` ("ShuttleWorks by Yunavero") and `brandedTitle`; the
 * console and entrant apps import those constants and never re-assemble the
 * product name + endorsement themselves. Renaming stays deferred (plan §3
 * "Rename and unified wordmark" — no new brand direction in this package).
 *
 * This does not forbid `BRAND.productName` / `BRAND.endorsement` appearing
 * next to each other as SEPARATE template-literal interpolations (that is
 * still reading the one source of truth); it forbids the literal strings
 * "ShuttleWorks" and "Yunavero"/"by Yunavero" from being HAND-TYPED as
 * string literals outside the brand package and its own tests/docs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../..');

const SCAN_ROOTS = [
  'apps/console/src',
  'apps/entrant/app',
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

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A hand-typed brand literal: the product name or the company name/
 * endorsement quoted directly in source, rather than read from `BRAND`. */
const BRAND_LITERAL = /['"`]ShuttleWorks\b(?!\.| Tournaments API| brand)[^'"`]*['"`]|['"`][^'"`]*\bYunavero\b[^'"`]*['"`]/g;

interface Finding {
  file: string;
  hits: string[];
}

function findings(): Finding[] {
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(REPO, root)));
  return files.flatMap((file) => {
    const name = rel(file);
    const source = code(readFileSync(file, 'utf8'));
    const hits = source.match(new RegExp(BRAND_LITERAL.source, 'g')) ?? [];
    return hits.length > 0 ? [{ file: name, hits }] : [];
  });
}

/**
 * Deliberate exceptions: the seam's own definition files, and app-shell
 * chrome that legitimately needs the literal document `<title>` or a test
 * fixture id rather than a runtime import (browser twins under
 * `public/assets/` cannot import `@scheduler/brand` — same constraint
 * `uiTwins.test.ts` documents for other constants).
 */
const ALLOWED_FILES = new Set<string>([
  // packages/brand is out of this scan's roots entirely — it IS the owner.
]);

describe('brand seam contract has something to scan', () => {
  it('enumerates the app trees from disk', () => {
    const files = SCAN_ROOTS.flatMap((root) => walk(path.join(REPO, root)));
    expect(files.length).toBeGreaterThan(200);
  });
});

describe('one owner for the brand string', () => {
  it('finds no hand-typed "ShuttleWorks"/"Yunavero" literal outside the brand package', () => {
    const violations = findings()
      .filter(({ file }) => !ALLOWED_FILES.has(file))
      .map(({ file, hits }) => `${file}: ${[...new Set(hits)].join(', ')}`);
    expect(violations).toEqual([]);
  });

  it('the design-system brand package is the sole export site', () => {
    const brandFile = path.join(REPO, 'packages/brand/generated.ts');
    const src = readFileSync(brandFile, 'utf8');
    expect(src).toContain('productName: "ShuttleWorks"');
    expect(src).toContain('companyName: "Yunavero"');
    expect(src).toContain('export const BRAND_SIGNATURE');
  });

  it('the entrant footer imports BRAND_SIGNATURE rather than assembling the line itself', () => {
    const footer = readFileSync(
      path.join(REPO, 'apps/entrant/app/components/PlayShell.tsx'),
      'utf8',
    );
    expect(footer).toMatch(/import \{[^}]*BRAND_SIGNATURE[^}]*\} from '@scheduler\/brand'/);
    expect(footer).toContain('{BRAND_SIGNATURE}');
  });

  it('the console mark component reads BRAND rather than a literal product name', () => {
    const mark = readFileSync(
      path.join(REPO, 'apps/console/src/components/ShuttleWorksMark.tsx'),
      'utf8',
    );
    expect(mark).toMatch(/import \{ BRAND \} from '@scheduler\/brand'/);
    expect(mark).not.toMatch(/['"`]ShuttleWorks['"`]/);
  });
});
