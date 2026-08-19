/**
 * Em dash contract - no shipped surface may put U+2014 in front of a user.
 *
 * The owner's requirement is one sentence: "ensure that there is no em dashes
 * or truncation site wide. info clarity is paramount". This file holds the
 * em-dash half; `truncationContract.test.ts` (same directory) holds the
 * truncation half, for the same file-level-assertion reason documented
 * there: a punctuation mark in a JSX string or a template literal is
 * invisible to a behavioural test that only sees the DOM's textContent, and
 * it is exactly as invisible to code review as one word inside a long
 * className is. Enumerated from disk so a new file is covered without
 * touching this test - the same shape `motionContract.test.ts` and
 * `truncationContract.test.ts` use.
 *
 * Scope: `frontend/src/**` (the app) and `packages/design-system/**` minus
 * its markdown docs (component copy - Button labels, Notice/Toast text,
 * StatusPill strings - ships inside the app the same as anything under
 * `src/`, so a scan that stopped at the package boundary would miss it).
 *
 * En dash (U+2013) is legal - a numeric range ("9:00-17:00", "5-8", a score
 * "11-7") is correct typography, not a dash standing in for a comma or a
 * colon. What is NOT legal is an en dash doing an em dash's job with the
 * wrong glyph: a letter, a space, then the dash ("Entries open - closes
 * soon"). The two are told apart by what is adjacent to the dash once
 * surrounding whitespace is skipped: a digit, a brace, a quote or another
 * dash is a range; a letter is prose. Every real en-dash range in this
 * codebase today is written tight (`5-8`, `${a.start}-${a.end}`) or, in one
 * case, loosely (`${w.start} - ${w.end}` in `availabilityWindows.ts`) - both
 * forms are digit/brace-adjacent once the space is skipped, so both pass.
 *
 * **Known blind spot**, named rather than silently accepted: a bad en dash
 * sitting next to a closing JSX expression brace instead of a letter
 * (`{name} - closes soon`) is not caught - the character immediately outside
 * the whitespace is `}`, indistinguishable from a legitimate
 * `${w.start} - ${w.end}` range at the lexical level this test operates on.
 * Nothing in the codebase does this today (verified by hand across every
 * real en-dash hit during the sweep that added this file); a future
 * violation of exactly this shape would need eyes, not just this test.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
// Six levels: __tests__ -> contracts -> platform -> src -> console -> apps -> repo root.
// SP-REORG-1 shortened this by one (the old path had products/scheduler between
// the app and the root). Getting it wrong fails loudly at collect time, which is
// the good case - the test reads real files off disk and cannot silently pass.
const REPO = path.resolve(HERE, '../../../../../..');
const DESIGN_SYSTEM = path.join(REPO, 'packages/design-system');

/** Every shipped `.ts`/`.tsx`/`.css` file under `dir`, enumerated from disk. */
function walk(dir: string, opts: { skipDirs: Set<string> }, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (opts.skipDirs.has(entry.name) || entry.name === 'node_modules') continue;
      walk(full, opts, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/** `frontend/src/**`, same enumeration `truncationContract.test.ts` uses. */
function frontendFiles(): string[] {
  return walk(SRC, { skipDirs: new Set(['__tests__']) });
}

/**
 * `packages/design-system/**` minus markdown (`BRAND.md`, `DESIGN.md`, ...,
 * out of scope by the task's own words) and `scripts/` (build-time lint
 * tooling, never shipped to a browser).
 */
function designSystemFiles(): string[] {
  return walk(DESIGN_SYSTEM, { skipDirs: new Set(['__tests__', 'scripts']) });
}

const FRONTEND_FILES = frontendFiles();
const DESIGN_SYSTEM_FILES = designSystemFiles();
const FILES = [...FRONTEND_FILES, ...DESIGN_SYSTEM_FILES];

/** Path relative to the repo root, POSIX-slashed so failures read the same on CI. */
const rel = (file: string) => path.relative(REPO, file).split(path.sep).join('/');

/** Source with comments stripped - a doc comment explaining the rule is not a violation of it. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** An em dash, anywhere. There is no legitimate use of U+2014 in shipped copy. */
const EM_DASH = /—/g;

/**
 * An en dash standing in for a comma, colon or full stop: a letter
 * immediately outside the whitespace on either side. A digit, brace, quote
 * or another dash outside the whitespace (or no whitespace at all, as in
 * `5-8`) is a range and is legal - see the module docblock.
 */
const BAD_EN_DASH = /[A-Za-z]\s–|–\s[A-Za-z]/g;

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

const RULES: readonly Rule[] = Object.freeze([
  { id: 'em-dash', pattern: EM_DASH, why: 'an em dash in rendered text - use a comma, colon, full stop, middot or restructure the sentence' },
  { id: 'bad-en-dash', pattern: BAD_EN_DASH, why: 'an en dash doing a comma/colon/full-stop job - only a tight numeric range may use en dash' },
]);

/**
 * Deliberate, reasoned exceptions. EMPTY on purpose: every em dash found by
 * the sweep that added this test was repunctuated or restructured instead of
 * allowlisted, and no en dash in the codebase reads as prose rather than a
 * range.
 */
const ALLOWED: readonly { file: string; rule: string; why: string }[] = Object.freeze([]);

function isAllowed(file: string, rule: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.rule === rule);
}

interface Finding {
  file: string;
  rule: Rule;
  hits: string[];
}

function findings(): Finding[] {
  return FILES.flatMap((file) => {
    const name = rel(file);
    const source = code(readFileSync(file, 'utf8'));
    return RULES.flatMap((rule) => {
      const hits = source.match(new RegExp(rule.pattern.source, 'g')) ?? [];
      return hits.length > 0 ? [{ file: name, rule, hits }] : [];
    });
  });
}

describe('the em dash contract has something to scan', () => {
  it('enumerates frontend/src and packages/design-system from disk', () => {
    // A walker that silently returns [] would make every assertion below pass.
    expect(FRONTEND_FILES.length).toBeGreaterThan(200);
    expect(DESIGN_SYSTEM_FILES.length).toBeGreaterThan(5);
    expect(FILES.some((f) => rel(f) === 'apps/console/src/products/hub/WorkspaceRow.tsx')).toBe(true);
    expect(FILES.some((f) => rel(f) === 'packages/design-system/components/Button.tsx')).toBe(true);
    // Markdown is out of scope - proves the design-system walk excludes it
    // rather than just happening not to match the extension filter twice.
    expect(FILES.some((f) => f.endsWith('.md'))).toBe(false);
  });
});

describe('no em dash and no dash-shaped en dash under frontend/src or packages/design-system', () => {
  it('finds no banned dash pattern outside the allowlist', () => {
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
