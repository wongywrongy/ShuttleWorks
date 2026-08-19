/**
 * Motion contract — holds `packages/design-system/MOTION.md` to the CSS and
 * call sites that actually ship.
 *
 * MOTION.md calls itself "the source of truth for motion". The 2026-08-11
 * design audit (theme T3) found it wasn't: a second duration vocabulary
 * (`--dur*`, `--ease`) grew alongside the canonical `--motion-*` scale and
 * nobody mapped one onto the other, so durations drifted 3x over budget and
 * the forbidden Material easing curve shipped under an alias.
 *
 * These are file-level assertions on purpose: the things that regressed are
 * CSS declarations and className strings, neither of which a rendering test
 * can see (jsdom applies no stylesheet).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Six levels: __tests__ -> contracts -> platform -> src -> console -> apps -> repo root.
// SP-REORG-1 shortened this by one (the old path had products/scheduler between
// the app and the root). Getting it wrong fails loudly at collect time, which is
// the good case - the test reads real files off disk and cannot silently pass.
const REPO = path.resolve(HERE, '../../../../../..');
const SRC = path.resolve(HERE, '../../..');

const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readSrc = (p: string) => readFileSync(path.join(SRC, p), 'utf8');

const tokens = read('packages/design-system/tokens.css');
const globals = read('packages/design-system/globals.css');
const preset = read('packages/design-system/tailwind-preset.js');

/** Every `--name: value;` in tokens.css, first declaration wins (`:root`). */
function tokenMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of tokens.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (!map.has(m[1])) map.set(m[1], m[2].trim());
  }
  return map;
}

/** Resolve a duration expression (`450ms`, `1.6s`, `var(--dur-slow)`) to ms. */
function resolveMs(expr: string, depth = 0): number | null {
  const value = expr.trim();
  if (depth > 5) return null;
  const varRef = value.match(/^var\((--[\w-]+)\)$/);
  if (varRef) {
    const next = tokenMap().get(varRef[1]);
    return next === undefined ? null : resolveMs(next.replace(/\s*\/\*.*$/, ''), depth + 1);
  }
  const ms = value.match(/^([\d.]+)ms$/);
  if (ms) return Number(ms[1]);
  const s = value.match(/^([\d.]+)s$/);
  if (s) return Number(s[1]) * 1000;
  return null;
}

describe('motion tokens are one vocabulary (MOTION.md §3, §4)', () => {
  it('aliases the handoff `--dur*` names onto the canonical --motion-* scale', () => {
    const map = tokenMap();
    const handoff = ['--dur-fast', '--dur', '--dur-slow'];
    const unaliased = handoff.filter((name) => {
      const raw = (map.get(name) ?? '').replace(/\s*\/\*.*$/, '').trim();
      return !/^var\(--motion-[\w-]+\)$/.test(raw);
    });
    expect(unaliased).toEqual([]);
  });

  it('has no duration token above the reserved --motion-slow tier', () => {
    // `--pulse-dur` / `--nudge-dur` are infinite-loop PERIODS, not one-shot
    // durations — they are deliberately off the 0–450ms scale.
    const map = tokenMap();
    const overBudget: string[] = [];
    for (const name of ['--dur-fast', '--dur', '--dur-slow', '--dur-xslow']) {
      const raw = map.get(name);
      if (raw === undefined) continue;
      const ms = resolveMs(raw.replace(/\s*\/\*.*$/, ''));
      if (ms !== null && ms > 450) overBudget.push(`${name}=${ms}ms`);
    }
    expect(overBudget).toEqual([]);
  });

  it('never defines the forbidden flat Material curve, under any token name', () => {
    // MOTION.md §4 forbids `cubic-bezier(0.4, 0, 0.2, 1)` BY NAME. Aliasing it
    // to `--ease` hid it from review; it is still the same curve.
    const material = /cubic-bezier\(\s*0?\.4\s*,\s*0\s*,\s*0?\.2\s*,\s*1\s*\)/;
    expect(tokens).not.toMatch(material);
    expect(globals).not.toMatch(material);
  });
});

describe('animation durations stay inside the MOTION.md §10.8 chrome cap', () => {
  /** Solver-theatre — MOTION.md §7 locks these; they carry state, not polish. */
  const SIGNAL_CARRYING = ['.sheen-overlay::after', '.scan-bar::after'];

  it('caps every one-shot keyframe animation at --motion-moderate (300ms)', () => {
    const overBudget: string[] = [];
    for (const m of globals.matchAll(/^(\.[\w-]+(?:::[\w-]+)?)\s*\{[^}]*?animation:\s*([^;]+);/gms)) {
      const [, selector, shorthand] = m;
      if (SIGNAL_CARRYING.includes(selector)) continue;
      if (/\binfinite\b/.test(shorthand)) continue; // §7 signal-carrying loops
      const duration = shorthand.trim().split(/\s+/)[1];
      const ms = resolveMs(duration ?? '');
      if (ms !== null && ms > 300) overBudget.push(`${selector} = ${ms}ms`);
    }
    expect(overBudget).toEqual([]);
  });
});

describe('tab switching stays a hard cut (MOTION.md §2 High, §6, §10.6)', () => {
  const CALL_SITES = [
    'modules/meet/MeetProduct.tsx',
    'modules/bracket/BracketProduct.tsx',
    'modules/bracket/BracketTab.tsx',
  ];

  it.each(CALL_SITES)('%s does not animate its tab-keyed content swap', (file) => {
    expect(readSrc(file)).not.toMatch(/\banimate-block-in\b/);
  });

  it('does not animate route-mounted operator chrome', () => {
    // A workspace overview mount and a sidebar section toggle are URL/keyboard
    // driven state — §10.5 says hard cut.
    expect(readSrc('modules/workspace/WorkspaceOverview.tsx')).not.toMatch(/\bsw-float-in\b/);
    expect(readSrc('platform/product-shell/WorkspaceSidebar.tsx')).not.toMatch(
      /className="[^"]*\bsw-rail-expand\b/,
    );
  });

  it('does not repurpose the locked `block-in` solver keyframe for card mounts', () => {
    // MOTION.md §7: `block-in` means "schedule re-flow". The Display board's
    // court cards are not a re-flow.
    expect(readSrc('modules/display/publicDisplay/CourtsView.tsx')).not.toMatch(
      /\banimate-block-in\b/,
    );
  });
});

describe('prefers-reduced-motion covers every animation the design system ships', () => {
  const reducedBlock =
    globals.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\n\}/)?.[0] ?? '';

  /**
   * A selector is covered if the reduced-motion block names it, or if the
   * block zeroes `animation-duration` on a universal selector (which covers
   * every present AND future animated class — the list rotting is the bug).
   */
  const universal = () =>
    /\*[^{]*\{[^}]*animation-duration:\s*0?\.?\d+m?s\s*!important/m.test(reducedBlock);

  const covers = (selector: string) =>
    universal() || reducedBlock.includes(`${selector},`) || reducedBlock.includes(`${selector} {`);

  it('has a reduced-motion block at all', () => {
    expect(reducedBlock).not.toBe('');
  });

  it('covers the four classes the 2026-08-11 audit found unguarded', () => {
    // These are `animation`-based keyframes. MOTION.md §7/§8 claimed they
    // "inherit the global override automatically" — animations inherit
    // nothing. `.motion-enter` in particular drives the Display board's
    // automatic 15-second standings rotation, for hours, unattended.
    const missing = [
      '.motion-enter',
      '.motion-enter-icon',
      '.animate-block-in',
      '.animate-slide-up',
    ].filter((selector) => !covers(selector));
    expect(missing).toEqual([]);
  });

  it('covers every animated class declared in globals.css', () => {
    const declared = [
      ...globals.matchAll(/^(\.[\w-]+(?:::[\w-]+)?)[^{]*\{[^}]*?animation:\s*[^;]+;/gms),
    ]
      .map((m) => m[1])
      .filter((selector) => !reducedBlock.includes(selector));
    const missing = declared.filter((selector) => !covers(selector));
    expect(missing).toEqual([]);
  });

  it('covers every `animate-*` utility the Tailwind preset generates', () => {
    const names = [
      ...(preset.match(/animation:\s*\{([\s\S]*?)\n {6}\},/)?.[1] ?? '').matchAll(
        /^\s*'?([\w-]+)'?:\s*'/gm,
      ),
    ].map((m) => `.animate-${m[1]}`);
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((selector) => !covers(selector))).toEqual([]);
  });
});
