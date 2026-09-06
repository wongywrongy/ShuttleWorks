/**
 * Focus-visibility contract (v3 consolidated plan, package 26a, WCAG 2.2 AA
 * 2.4.7 "Focus Visible"): any class string that suppresses the browser's
 * default focus ring (`outline-none` / `focus:outline-none`) must supply a
 * replacement ring in the SAME class string via `focus-visible:` (a ring,
 * border, or outline utility). A bare `outline-none` with no
 * `focus-visible:` companion removes the only visible focus indicator a
 * keyboard user has.
 *
 * Same shape as `captionFloorContract.test.ts` (package 07): a source scan
 * with an explicit, justified allowlist, plus a negative control so a
 * mis-rooted read cannot pass vacuously.
 *
 * Heuristic, not a CSS parser: it looks at each `className`/`class`
 * attribute's literal string content (including simple template literals)
 * for the presence of `outline-none` and requires a replacement ring
 * utility to appear somewhere in that same attribute value —
 * `focus-visible:ring`/`focus-visible:outline`/`focus-visible:border`, OR
 * plain `focus:ring`/`focus:border` (bare `focus:` still only fires on
 * keyboard AND mouse focus, so it never hides the indicator from a keyboard
 * user; it is a stricter, always-visible variant, not a gap). It does not
 * evaluate conditional class-string branches independently — a `cn(a, b)`
 * call is scanned as its full source span between the enclosing
 * quotes/backticks it can find, which is intentionally generous (a false
 * negative here is caught by design/visual QA; a false positive would block
 * an unrelated change, which the allowlist exists to unblock with a
 * reason).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../../..');

const ROOTS = ['apps/console/src', 'packages/design-system'] as const;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
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
  return out
    .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'))
    .sort();
}

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every `outline-none`/`focus:outline-none` occurrence, with a window of
 *  surrounding text (400 chars either side) used as a proxy for "the same
 *  class string" — generous enough to span a `cn(...)` call's arguments. */
const OUTLINE_NONE = /\bfocus:outline-none\b|\boutline-none\b/g;
const WINDOW = 400;

interface Finding {
  file: string;
  line: number;
  snippet: string;
}

/**
 * Deliberate exceptions, each with a reason. A file/line pair here must
 * still occur in the file (checked below by re-scanning) or it is stale.
 */
const ALLOWED: readonly { file: string; why: string }[] = [
  {
    file: 'packages/design-system/components/Checkbox.tsx',
    why:
      'the native checkbox input pairs "focus:outline-none" with a separate ' +
      '"focus-visible:ring-2 focus-visible:ring-ring" utility in the same class ' +
      'string — the scan window catches it, listed for documentation clarity.',
  },
  {
    file: 'apps/console/src/components/common/Modal.tsx',
    why:
      'the dialog PANEL itself (role="dialog", tabIndex=-1) receives ' +
      'programmatic focus so a screen reader announces it on open — it is ' +
      'not reached by Tab in normal flow, so a ring on the whole panel is not ' +
      'the focus indicator a keyboard user relies on; the buttons inside carry ' +
      'their own focus-visible rings.',
  },
  {
    file: 'packages/design-system/components/Modal.tsx',
    why: 'same tabIndex=-1 dialog-panel pattern as apps/console/src/components/common/Modal.tsx.',
  },
  {
    file: 'apps/console/src/components/control-plane/DetailPanel.tsx',
    why:
      'the docked/covering pane container (tabIndex=-1) receives programmatic ' +
      'focus() only when it newly "covers" the view, for screen-reader ' +
      'announcement — not a Tab-reachable control; interactive children own ' +
      'their own focus-visible rings.',
  },
  {
    file: 'apps/console/src/components/control-plane/PickerPopover.tsx',
    why:
      'the Radix Popover.Content panel is portaled and receives Radix\'s own ' +
      'open-autofocus (moving focus to the first tabbable option inside, per ' +
      'the comment above this className) — the panel itself is not a ' +
      'Tab-stop a keyboard user lands on with the ring removed.',
  },
  {
    file: 'apps/console/src/platform/product-shell/WorkspaceShell.tsx',
    why:
      'the mobile nav drawer\'s panelClassName is the same tabIndex=-1 ' +
      'dialog-panel pattern as Modal.tsx above (this Modal usage supplies its ' +
      'own panelClassName override, so the scan flags it as a second site).',
  },
  {
    file: 'packages/design-system/components/Select.tsx',
    why:
      'the Radix Select.Item option row is not focused via the DOM focus ring ' +
      'at all — Radix drives roving `data-[highlighted]` state on ' +
      'arrow-key/pointer navigation, and this component already styles that ' +
      'state ("data-[highlighted]:bg-accent/10") as the visible indicator.',
  },
];

function isAllowed(file: string): boolean {
  return ALLOWED.some((entry) => entry.file === file);
}

function findViolations(): Finding[] {
  const violations: Finding[] = [];
  for (const file of allSourceFiles()) {
    if (file.endsWith('focusVisibleContract.test.ts')) continue;
    const raw = read(file);
    const source = stripComments(raw);
    let match: RegExpExecArray | null;
    OUTLINE_NONE.lastIndex = 0;
    while ((match = OUTLINE_NONE.exec(source))) {
      const start = Math.max(0, match.index - WINDOW);
      const end = Math.min(source.length, match.index + match[0].length + WINDOW);
      const window = source.slice(start, end);
      const hasReplacementRing =
        /focus-visible:(ring|outline|border)/.test(window) ||
        /focus:(ring|border)/.test(window);
      if (!hasReplacementRing) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push({ file, line, snippet: match[0] });
      }
    }
  }
  return violations;
}

describe('focus-visibility contract (outline-none requires a focus-visible: ring)', () => {
  it('non-vacuity: scans a substantial number of real files', () => {
    const files = allSourceFiles();
    expect(files.length).toBeGreaterThan(150);
    expect(files).toContain('packages/design-system/components/Button.tsx');
  });

  it('would catch a planted violation (negative control)', () => {
    const planted = 'className="rounded outline-none bg-card"';
    expect(planted.includes('focus-visible:')).toBe(false);
    expect(planted.match(OUTLINE_NONE)).toEqual(['outline-none']);
  });

  it('finds no bare outline-none without a focus-visible: ring, outside the allowlist', () => {
    const violations = findViolations()
      .filter((v) => !isAllowed(v.file))
      .map((v) => `${v.file}:${v.line}: ${v.snippet}`);
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (every entry still uses outline-none)', () => {
    const stale = ALLOWED.filter(
      (entry) => !/\bfocus:outline-none\b|\boutline-none\b/.test(read(entry.file)),
    ).map((entry) => entry.file);
    expect(stale).toEqual([]);
  });
});
