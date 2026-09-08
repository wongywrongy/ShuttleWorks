/**
 * Color-only-meaning contract (v3 consolidated plan, package 26a, WCAG 2.2
 * AA 1.4.1 "Use of Color"): a status color (`text-status-*`/`bg-status-*`)
 * must never be the ONLY carrier of a state's meaning. This is a source-scan
 * heuristic — not a full DOM audit — scoped to the two surfaces where
 * color-coded operational/match state matters most: the operations Run
 * desk (`modules/operations/run/`) and Display (`modules/display/`).
 *
 * Heuristic: for every `text-status-*`/`bg-status-*` occurrence, a text
 * equivalent must appear within a generous window of surrounding source —
 * a literal word (`word:`/`label:`/quoted text starting with a capital
 * letter followed by a JSX-closing `<`), an `sr-only` span, an
 * `aria-label`, or a reference to the shared `STATE_WORD` vocabulary
 * (`apps/console/src/lib/matchStateWords.ts` and friends) that every one of
 * these call sites in fact uses for its text equivalent. Same shape as
 * `focusVisibleContract.test.ts`: window-based, allowlisted, with a
 * non-vacuity and negative-control check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../../..');

const ROOTS = ['apps/console/src/modules/operations/run', 'apps/console/src/modules/display'] as const;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__tests__']);
const EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry))) out.push(full);
  }
}

function allSourceFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) walk(path.join(REPO_ROOT, root), out);
  return out.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/')).sort();
}

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** Blanks comment text while preserving every newline, so line numbers
 *  computed from the stripped source still match the original file (a
 *  multi-line block comment removed wholesale would shift every
 *  subsequent line number). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const STATUS_CLASS = /\b(text|bg)-status-[a-z-]+/g;
const WINDOW = 600;

/** Evidence a text equivalent sits near the color utility: a `word`/`label`
 *  binding (property key or local const), the shared STATE_WORD vocabulary,
 *  an sr-only span, an aria-label/aria-live/title/role="status" attribute,
 *  or ordinary rendered JSX text (a run of letters followed eventually by a
 *  `<` — good enough given the window is source text, not a parsed tree). */
const TEXT_EVIDENCE =
  /\bword\b|\blabel\b|STATE_WORD|sr-only|aria-label=|aria-live=|title=|role=["']status["']|role=["']alert["']|>\s*[A-Z][a-zA-Z ]+</;

interface Finding {
  file: string;
  line: number;
  snippet: string;
}

/**
 * Deliberate exceptions, each with a reason. A file/line pair here must
 * still occur in the file (checked below) or it is stale.
 */
const ALLOWED: readonly { file: string; line: number; why: string }[] = [
  {
    file: 'apps/console/src/modules/display/MeetDisplayPage.tsx',
    line: 726,
    why:
      'the operator-diagnostics "N active" row: the literal text "active" ' +
      '(rendered as a sibling text node right after the decorative dot) ' +
      'already names the state — color is reinforcement, not the only ' +
      'carrier of meaning.',
  },
  {
    file: 'apps/console/src/modules/display/MeetDisplayPage.tsx',
    line: 727,
    why: 'the decorative dot on the same "N active" row as line 726 — same text-names-it evidence.',
  },
  {
    file: 'apps/console/src/modules/display/MeetDisplayPage.tsx',
    line: 730,
    why: 'same pattern as line 726, the "N called" row (text "called" names the state).',
  },
  {
    file: 'apps/console/src/modules/display/MeetDisplayPage.tsx',
    line: 731,
    why: 'the decorative dot on the same "N called" row as line 730 — same text-names-it evidence.',
  },
  {
    file: 'apps/console/src/modules/display/publicDisplay/StandingsView.tsx',
    line: 57,
    why:
      'the wins/losses figures render their own literal unit suffix ("W"/"L" ' +
      'appended to the number in the same JSX expression), so the count is ' +
      'self-describing text — color is not the only carrier.',
  },
  {
    file: 'apps/console/src/modules/operations/run/AlertsActivityPanel.tsx',
    line: 65,
    why:
      'severity is doubly redundant already: the icon COMPONENT itself ' +
      'differs by severity (Warning triangle vs. Info circle, a shape ' +
      'channel independent of color) and entry.title switches ink weight — ' +
      'the status color on the icon is a third, reinforcing signal, not the ' +
      'only one.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunFinished.tsx',
    line: 111,
    why:
      'a finished match\'s score line ("21–15, 19–21") is meaningful text on ' +
      'its own inside a list already headed "Finished" — the status tint is ' +
      'decorative styling of already-self-describing content, not a second ' +
      'state encoded only in color.',
  },
];

function isAllowed(file: string, line: number): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.line === line);
}

function findViolations(): Finding[] {
  const violations: Finding[] = [];
  for (const file of allSourceFiles()) {
    const raw = read(file);
    const source = stripComments(raw);
    let match: RegExpExecArray | null;
    STATUS_CLASS.lastIndex = 0;
    while ((match = STATUS_CLASS.exec(source))) {
      const start = Math.max(0, match.index - WINDOW);
      const end = Math.min(source.length, match.index + match[0].length + WINDOW);
      const window = source.slice(start, end);
      if (!TEXT_EVIDENCE.test(window)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push({ file, line, snippet: match[0] });
      }
    }
  }
  return violations;
}

describe('color-only-meaning contract (status color needs a text equivalent nearby)', () => {
  it('non-vacuity: scans a substantial number of real files', () => {
    const files = allSourceFiles();
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('apps/console/src/modules/operations/run/RunCourtGrid.tsx');
  });

  it('would catch a planted violation (negative control)', () => {
    const planted = 'const cls = "bg-status-late-solid rounded px-2 py-1"; return <div className={cls} />;';
    expect(TEXT_EVIDENCE.test(planted)).toBe(false);
  });

  it('finds no color-only status usage outside the allowlist', () => {
    const violations = findViolations()
      .filter((v) => !isAllowed(v.file, v.line))
      .map((v) => `${v.file}:${v.line}: ${v.snippet}`);
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (every entry still names its line)', () => {
    const stale = ALLOWED.filter((entry) => {
      const lines = read(entry.file).split('\n');
      const lineText = lines[entry.line - 1] ?? '';
      return !/status-/.test(lineText);
    }).map((entry) => `${entry.file}:${entry.line}`);
    expect(stale).toEqual([]);
  });
});
