/**
 * Target-size contract (v3 consolidated plan, package 26a, WCAG 2.2 AA
 * 2.5.8 "Target Size (Minimum)"): every `<button`/`<a ` in `components/`
 * (shared across the whole console) and in the two surfaces named by the
 * plan's touch-target row (`modules/operations/run/`, `modules/hub/`) must
 * clear a 24×24 CSS px pointer target, with the AA exceptions (inline text
 * links, and controls whose *effective* target — not their visible paint —
 * clears 24px through hit-area padding) applied explicitly.
 *
 * Heuristic, not a layout engine: for each tag this estimates a box height
 * in px from whichever signal is present, in priority order:
 *   1. An explicit `h-N`/`min-h-N`/`size-N` utility (or `[Npx]` arbitrary
 *      value) on the SAME class string — authoritative when present.
 *   2. Otherwise, `py-N`/`p-N` padding (top+bottom, doubled) added to an
 *      estimated content line-height from a `text-*` size utility in the
 *      same string (default 16px, matching the product's `text-xs`
 *      caption floor — package 07 R1 — since compact controls are
 *      overwhelmingly `text-xs`).
 *   3. If NEITHER a size utility nor any padding utility is present, the
 *      scan cannot estimate a box at all and flags it for review rather
 *      than assuming a pass.
 *
 * This will under- and over-estimate real layout in edge cases (a shared
 * `className` constant, a `cn()` conditional, an ancestor's padding) — the
 * allowlist exists for exactly those, each with a reason, same shape as
 * `captionFloorContract.test.ts` / `focusVisibleContract.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../../..');

const ROOTS = [
  'apps/console/src/components',
  'apps/console/src/modules/operations/run',
  'apps/console/src/modules/hub',
] as const;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__tests__']);
const EXTENSIONS = new Set(['.tsx']);

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

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Tailwind's default spacing scale, token -> px. Values not in this table
 *  (arbitrary `[Npx]`) are parsed separately. */
const SPACING_PX: Record<string, number> = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '11': 44,
  '12': 48,
  '14': 56,
  '16': 64,
};

const TEXT_LINE_HEIGHT_PX: Record<string, number> = {
  'text-2xs': 15,
  'text-xs': 16,
  'text-2sm': 18,
  'text-sm': 20,
  'text-base': 24,
  'text-lg': 28,
};
const DEFAULT_LINE_HEIGHT_PX = 16; // text-xs — the product's compact-control default.

function tokenPx(token: string): number | null {
  if (token in SPACING_PX) return SPACING_PX[token];
  const arbitrary = token.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (arbitrary) return Number(arbitrary[1]);
  return null;
}

/** Returns an explicit box height in px if the class string sets one
 *  directly (h-/min-h-/size-), else null. */
function explicitHeightPx(cls: string): number | null {
  const patterns = [/\bmin-h-([\w.[\]]+)/, /\bh-([\w.[\]]+)/, /\bsize-([\w.[\]]+)/];
  for (const re of patterns) {
    const m = cls.match(re);
    if (m) {
      const px = tokenPx(m[1]);
      if (px != null) return px;
    }
  }
  return null;
}

/** Returns an estimated content-driven box height (padding + line-height),
 *  or null if there is no padding signal at all to estimate from. */
function estimatedHeightPx(cls: string): number | null {
  const py = cls.match(/\bpy-([\w.[\]]+)/);
  const p = cls.match(/(?:^|\s)p-([\w.[\]]+)/);
  const pt = cls.match(/\bpt-([\w.[\]]+)/);
  const pb = cls.match(/\bpb-([\w.[\]]+)/);
  let padPx: number | null = null;
  if (py) {
    padPx = tokenPx(py[1]);
    if (padPx != null) padPx *= 2;
  } else if (p) {
    padPx = tokenPx(p[1]);
    if (padPx != null) padPx *= 2;
  } else if (pt || pb) {
    const ptPx = pt ? tokenPx(pt[1]) ?? 0 : 0;
    const pbPx = pb ? tokenPx(pb[1]) ?? 0 : 0;
    padPx = ptPx + pbPx;
  }
  if (padPx == null) return null;
  let lineHeight = DEFAULT_LINE_HEIGHT_PX;
  for (const [cls2, px] of Object.entries(TEXT_LINE_HEIGHT_PX)) {
    if (cls.includes(cls2)) {
      lineHeight = px;
      break;
    }
  }
  return padPx + lineHeight;
}

const MIN_TARGET_PX = 24;

interface Finding {
  file: string;
  line: number;
  tag: string;
  reason: 'under-minimum' | 'unmeasurable';
}

/**
 * Deliberate exceptions, each with a reason. A file/line pair here must
 * still occur in the file (checked below) or it is stale.
 */
const ALLOWED: readonly { file: string; line: number; why: string }[] = [
  {
    file: 'apps/console/src/components/control-plane/AvailabilityControl.tsx',
    line: 122,
    why: 'inline text link ("+ Add unavailable period") — no padding box, WCAG 2.2 AA\'s inline-text-link exception.',
  },
  {
    file: 'apps/console/src/components/PublicationSettings.tsx',
    line: 77,
    why: 'inline text link inside a sentence ("Set up the entry page") — no padding box, WCAG 2.2 AA\'s inline-text-link exception.',
  },
  {
    file: 'apps/console/src/components/PublicationSettings.tsx',
    line: 121,
    why: 'inline text link beside the row it reviews — no padding box, WCAG 2.2 AA\'s inline-text-link exception.',
  },
  {
    file: 'apps/console/src/components/ConfirmDeleteButton.tsx',
    line: 44,
    why:
      'className is composed from a caller-supplied size prop the static scan ' +
      'cannot see on this line; ConfirmDeleteButton.test.tsx pins its default ' +
      'rendered size at >=24px.',
  },
  {
    file: 'apps/console/src/components/MatchChip.tsx',
    line: 113,
    why:
      'className is an array joined at runtime (`[...].join`), not a literal ' +
      'string the scan can read — MatchChip is a full match card, never a ' +
      'sub-24px target; covered by MatchChip.test.tsx.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunMatchControls.tsx',
    line: 45,
    why: 'className is the module-level `primaryBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunMatchControls.tsx',
    line: 71,
    why: 'className is the module-level `actionBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunMatchControls.tsx',
    line: 105,
    why: 'className is the module-level `primaryBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunMatchControls.tsx',
    line: 117,
    why: 'className is the module-level `primaryBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunMatchControls.tsx',
    line: 129,
    why: 'className is a ternary between the module-level `armedBtn`/`primaryBtn` constants (both py-1 + text-xs = 24px).',
  },
  {
    file: 'apps/console/src/modules/operations/run/RunCourtGrid.tsx',
    line: 211,
    why:
      'the court card is a multi-line `[...].join(" ")` className array — ' +
      'the card itself is always well over 24px (a bordered card containing ' +
      'a full match row), not a compact control.',
  },
  {
    file: 'apps/console/src/components/ActiveChoice.tsx',
    line: 98,
    why:
      'ActiveChoice is the console\'s single shared selection primitive — a ' +
      '"known-sized shared component" per the plan\'s explicit exception. Its ' +
      'own classes come from a `classes` variable built above the tag, not a ' +
      'literal the scan can read; every call site supplies its own sizing via ' +
      'the `className` prop (verified per call site, e.g. BracketDrawsTab\'s ' +
      '"px-4 py-2" tabs, WorkspaceSidebar\'s nav rows).',
  },
  {
    file: 'apps/console/src/components/control-plane/DenseDataTable.tsx',
    line: 801,
    why:
      'Previous-page button: className is `${CONTROL} ...` where `CONTROL` ' +
      '(module-level const, this file) is literally `"min-h-9 ..."` = 36px — ' +
      'the scan cannot see through the template-literal variable reference.',
  },
  {
    file: 'apps/console/src/components/control-plane/DenseDataTable.tsx',
    line: 816,
    why: 'Next-page button — same `${CONTROL}` (min-h-9 = 36px) indirection as the previous-page control.',
  },
  {
    file: 'apps/console/src/components/control-plane/DenseDataTable.tsx',
    line: 750,
    why: 'Refresh-results button uses the module-level CONTROL (min-h-9), which the static scan cannot resolve.',
  },
  {
    file: 'apps/console/src/components/control-plane/DenseDataTable.tsx',
    line: 814,
    why: 'Numbered page button uses the module-level CONTROL (min-h-9), which the static scan cannot resolve.',
  },
  {
    file: 'apps/console/src/modules/hub/WorkspaceInspector.tsx',
    line: 318,
    why: 'View-all link is an intentional inline text affordance with no literal size class.',
  },
  {
    file: 'apps/console/src/modules/operations/run/MeetMatchControls.tsx',
    line: 132,
    why: 'className is the module-level `primaryBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/MeetMatchControls.tsx',
    line: 150,
    why: 'className is the module-level `actionBtn` constant (py-1 + text-xs = 24px), not a literal on this line.',
  },
  {
    file: 'apps/console/src/modules/operations/run/MeetMatchControls.tsx',
    line: 170,
    why: 'className is `${primaryBtn} mb-2` (py-1 + text-xs = 24px), same constant as line 132.',
  },
];

function isAllowed(file: string, line: number): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.line === line);
}

/** Extracts a window of source starting at a `<button`/`<a ` tag through
 *  its opening tag's `>` (or a generous cap), used to find the className
 *  attribute belonging to THIS tag rather than a sibling's. */
function openingTagSpan(source: string, tagStart: number): string {
  const cap = Math.min(source.length, tagStart + 1200);
  // A bare `indexOf('>')` is fooled by an arrow function inside an inline
  // handler (`() => ...`) closing the span before the real tag end — skip
  // any `>` immediately preceded by `=`.
  let idx = source.indexOf('>', tagStart);
  while (idx !== -1 && idx < cap && source[idx - 1] === '=') {
    idx = source.indexOf('>', idx + 1);
  }
  const end = idx === -1 ? cap : Math.min(cap, idx + 1);
  return source.slice(tagStart, end);
}

const TAG_RE = /<(button|a)(\s|>)/g;

function findViolations(): Finding[] {
  const violations: Finding[] = [];
  for (const file of allSourceFiles()) {
    const raw = read(file);
    const source = stripComments(raw);
    let m: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(source))) {
      const tagStart = m.index;
      const span = openingTagSpan(source, tagStart);
      const classMatch = span.match(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
      let cls: string | null = classMatch
        ? classMatch[1] ?? classMatch[2] ?? classMatch[3] ?? ''
        : null;
      if (cls == null) {
        // `className={[ 'a', cond ? 'b' : 'c', ... ].join(' ')}` — collect
        // every quoted string literal inside the array literal and
        // concatenate them; good enough since only literal utility classes
        // (not the conditional branches' semantics) matter for sizing.
        const arrayStart = span.indexOf('className={[');
        if (arrayStart !== -1) {
          const arrayEnd = span.indexOf(']', arrayStart);
          const arraySpan = arrayEnd === -1 ? span.slice(arrayStart) : span.slice(arrayStart, arrayEnd);
          const literals = [...arraySpan.matchAll(/'([^']*)'|"([^"]*)"/g)].map((mm) => mm[1] ?? mm[2] ?? '');
          if (literals.length > 0) cls = literals.join(' ');
        }
      }
      const line = source.slice(0, tagStart).split('\n').length;
      if (cls == null) {
        // No literal className on the opening tag at all (e.g. a bare
        // `<button onClick=...>` with styling entirely from a wrapper, or a
        // `className={variable}` reference) — cannot estimate; flag for
        // review rather than silently pass.
        violations.push({ file, line, tag: m[1], reason: 'unmeasurable' });
        continue;
      }
      const explicit = explicitHeightPx(cls);
      const px = explicit ?? estimatedHeightPx(cls);
      if (px == null) {
        violations.push({ file, line, tag: m[1], reason: 'unmeasurable' });
      } else if (px < MIN_TARGET_PX) {
        violations.push({ file, line, tag: m[1], reason: 'under-minimum' });
      }
    }
  }
  return violations;
}

describe('target size contract (24x24 CSS px minimum, WCAG 2.2 AA 2.5.8)', () => {
  it('non-vacuity: scans a substantial number of real files', () => {
    const files = allSourceFiles();
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain('apps/console/src/components/control-plane/DenseDataTable.tsx');
  });

  it('would catch a planted under-24px violation (negative control)', () => {
    const planted = '<button className="p-0.5 text-xs">×</button>';
    expect(estimatedHeightPx('p-0.5 text-xs')).toBeLessThan(MIN_TARGET_PX);
    void planted;
  });

  it('a DenseDataTable pagination control (min-h-9) clears the minimum', () => {
    expect(explicitHeightPx('min-h-9 rounded-md border')).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it('finds no under-24px or unmeasurable button/link target outside the allowlist', () => {
    const violations = findViolations()
      .filter((v) => !isAllowed(v.file, v.line))
      .map((v) => `${v.file}:${v.line}: <${v.tag}> ${v.reason}`);
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (every entry still opens a button/link tag near its line)', () => {
    const stale = ALLOWED.filter((entry) => {
      const lines = read(entry.file).split('\n');
      const window = lines.slice(Math.max(0, entry.line - 3), entry.line + 2).join('\n');
      return !/<(button|a)(\s|>)/.test(window);
    }).map((entry) => `${entry.file}:${entry.line}`);
    expect(stale).toEqual([]);
  });
});
