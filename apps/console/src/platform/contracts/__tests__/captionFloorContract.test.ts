/**
 * Caption-floor contract (v3 consolidated plan, package 07, ruling R1):
 * `text-3xs` (10px) and the arbitrary `text-[10px]` / `text-[11px]` values
 * are banned from every rendering source file across the console, the
 * entrant tier and the shared design system. 12px (`text-xs`) is the
 * product's caption floor — nothing that carries words renders smaller.
 * `text-2xs` (11px) is not banned outright: it may remain for numeric
 * tabular data in a dense table/grid (documented per call site in
 * `packages/design-system/tokens.css`), so this scan does not touch it.
 *
 * Same shape as `inkContract.test.ts` (WP-06): a text scan with an
 * allowlist, plus a negative control so a mis-rooted read cannot pass
 * vacuously. Unlike `inkContract.test.ts` this one walks the tree instead
 * of enumerating owner files — the caption floor is a codebase-wide rule,
 * not a remediation of a fixed file list.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/console/src/platform/contracts/__tests__ -> repo root is six levels up.
const REPO_ROOT = path.resolve(HERE, '../../../../../..');

const ROOTS = [
  'apps/console/src',
  'apps/entrant/app',
  'apps/entrant/public',
  'packages/design-system',
] as const;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** The two files that legitimately spell `--text-3xs`/`text-3xs` as
 *  INFRASTRUCTURE — the CSS variable and the Tailwind theme step that
 *  define the (deprecated) token — not a call site that renders it. */
const TOKEN_DEFINITION_FILES = new Set([
  'packages/design-system/tokens.css',
  'packages/design-system/tailwind-preset.js',
]);

/** Strip block and line comments so prose (including this very test's own
 *  doc comments, and rationale comments landed alongside a fix) can mention
 *  the banned strings without tripping the scan. Good enough for TS/JS
 *  source; does not attempt to spare a comment marker inside a string
 *  literal, which none of these files have. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
}

/** Every rendering source file under the four roots, repo-root-relative,
 *  forward-slashed so the allowlist reads the same on every OS. */
function allSourceFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    walk(path.join(REPO_ROOT, root), out);
  }
  return out
    .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'))
    .sort();
}

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** `text-3xs`, `text-[10px]` or `text-[11px]`, word-bounded on the left so
 *  it never matches inside a longer utility (e.g. a hypothetical
 *  `xtext-3xs`). No trailing `\b`: the bracket variants end on `]`, a
 *  non-word character, so a boundary assertion there would require the
 *  following character to be a word character — false for the ordinary
 *  case of a closing quote or space right after. */
const BANNED = /\btext-(?:3xs\b|\[10px\]|\[11px\])/g;

/**
 * Deliberate exceptions, each with a reason. A file/pattern pair here must
 * still occur in the file (checked below) or it is stale.
 *
 *  - `modules/display/**`: owned by a concurrent v3-consolidated workstream
 *    mid-edit at the time of this pass (package 07's scope explicitly
 *    excludes it). Its remaining `text-3xs` calls are tracked as debt.
 *  - `ShuttleWorksMark.tsx`: the brand monogram tile is a single
 *    `aria-hidden` decorative glyph inside a 22px square, not a caption
 *    made of words — a logo's internal proportions are a brand decision,
 *    not typography this ruling addresses.
 */
const ALLOWED: readonly { file: string; pattern: string; why: string }[] = [
  {
    file: 'apps/console/src/modules/display/publicDisplay/LiveStatusPill.tsx',
    pattern: 'text-3xs',
    why: 'owned by a concurrent workstream outside package 07 scope; debt-log.md',
  },
  {
    file: 'apps/console/src/modules/display/publicDisplay/CourtsView.tsx',
    pattern: 'text-3xs',
    why: 'owned by a concurrent workstream outside package 07 scope; debt-log.md',
  },
  {
    file: 'apps/console/src/components/ShuttleWorksMark.tsx',
    pattern: 'text-[10px]',
    why: 'aria-hidden decorative brand-monogram glyph, not caption text',
  },
];

function isAllowed(file: string, hit: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.pattern === hit);
}

function findings(): { file: string; hits: string[] }[] {
  return allSourceFiles()
    .filter((file) => !TOKEN_DEFINITION_FILES.has(file) && !file.endsWith('captionFloorContract.test.ts'))
    .flatMap((file) => {
      const hits = stripComments(read(file)).match(BANNED) ?? [];
      return hits.length > 0 ? [{ file, hits }] : [];
    });
}

describe('caption floor contract (text-3xs / text-[10px] / text-[11px] ban)', () => {
  it('non-vacuity: scans a substantial number of real files', () => {
    const files = allSourceFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('apps/console/src/lib/utils.ts');
    expect(files).toContain('packages/design-system/components/StatusPill.tsx');
  });

  it('would catch a planted violation (negative control)', () => {
    const planted = 'className="text-3xs uppercase" style={{}} className2="text-[10px] text-[11px]"';
    expect(planted.match(BANNED)).toEqual(['text-3xs', 'text-[10px]', 'text-[11px]']);
  });

  it('finds no banned caption size outside the allowlist', () => {
    const violations = findings().flatMap(({ file, hits }) =>
      hits.filter((h) => !isAllowed(file, h)).map((h) => `${file}: ${h}`)
    );
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (every entry still occurs in its file)', () => {
    const stale = ALLOWED.filter((entry) => {
      const hits: string[] = read(entry.file).match(BANNED) ?? [];
      return !hits.includes(entry.pattern);
    }).map((entry) => `${entry.file}: ${entry.pattern}`);
    expect(stale).toEqual([]);
  });
});
