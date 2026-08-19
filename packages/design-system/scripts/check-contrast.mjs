/**
 * WCAG contrast gate for the two-layer token system (DESIGN_COLOR.md).
 *
 * Parses tokens.css, resolves the semantic layer per theme (light block =
 * `:root, [data-theme="light"]`, dark = `.dark, [data-theme="dark"]`), and
 * checks, PER THEME, PER SURFACE STEP:
 *
 *   text  — text-primary/secondary/muted vs sunken/base/raised/overlay ≥ 4.5
 *           text-on-accent vs action-primary                            ≥ 4.5
 *           each status fg vs its bg tint AND vs raised                 ≥ 4.5
 *           action-primary as link text vs base/raised                  ≥ 4.5
 *   ui    — border-strong (inputs) vs raised                            ≥ 3.0
 *           border-focus vs base and raised                             ≥ 3.0
 *
 * Exits 1 on any failure. Run: node packages/design-system/scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'tokens.css'), 'utf8');

// ---- parse the three blocks (primitives+light live together in :root) ----
function blockOf(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`selector not found: ${selectorRe}`);
  // from match start, find the balanced closing brace
  let i = css.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') {
      depth--;
      if (depth === 0) return css.slice(i + 1, j);
    }
  }
  throw new Error('unbalanced');
}

const primitivesBlock = blockOf(/^\s{2}:root\s*\{/m);
const lightBlock = blockOf(/^\s{2}:root,\s*\n\s*\[data-theme="light"\]\s*\{/m);
const darkBlock = blockOf(/^\s{2}\.dark,\s*\n\s*\[data-theme="dark"\]\s*\{/m);

function varsOf(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const primitives = varsOf(primitivesBlock);

function resolve(vars, name, depth = 0) {
  if (depth > 10) throw new Error(`cycle at ${name}`);
  const raw = vars[name] ?? primitives[name];
  if (raw == null) throw new Error(`undefined token ${name}`);
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(vars, ref[1], depth + 1);
  return raw;
}

// ---- color math -----------------------------------------------------------
function hslToRgb(trip) {
  const m = trip.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`not an HSL triplet: "${trip}"`);
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

function luminance(rgb) {
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a, b) {
  const la = luminance(hslToRgb(a));
  const lb = luminance(hslToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- the gates --------------------------------------------------------------
const SURFACES = ['--surface-sunken', '--surface-base', '--surface-raised', '--surface-overlay'];
const TEXTS = ['--text-primary', '--text-secondary', '--text-muted'];
const STATUS = ['success', 'warning', 'danger', 'info'];

let failures = 0;
function check(theme, label, fg, bg, min) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  const flag = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${flag} ${label.padEnd(52)} ${r.toFixed(2)}:1 (min ${min})`);
  return ok;
}

for (const [theme, vars] of [['light', varsOf(lightBlock)], ['dark', varsOf(darkBlock)]]) {
  console.log(`\n=== ${theme} ===`);
  const v = (n) => resolve(vars, n);

  for (const t of TEXTS)
    for (const s of SURFACES)
      check(theme, `${t.slice(2)} on ${s.slice(2)}`, v(t), v(s), 4.5);

  check(theme, 'text-on-accent on action-primary', v('--text-on-accent'), v('--action-primary'), 4.5);
  for (const s of ['--surface-base', '--surface-raised'])
    check(theme, `action-primary (link text) on ${s.slice(2)}`, v('--action-primary'), v(s), 4.5);

  for (const st of STATUS) {
    check(theme, `status-${st}-fg on status-${st}-bg`, v(`--status-${st}-fg`), v(`--status-${st}-bg`), 4.5);
    check(theme, `status-${st}-fg on surface-raised`, v(`--status-${st}-fg`), v('--surface-raised'), 4.5);
  }

  // Muted-solid board chips: ink on solid fill. Every role family that can
  // render as a filled band belongs here — a family added to tokens.css but
  // not to this list is silently unchecked, and the gate still reports green.
  for (const fam of ['live', 'called', 'late', 'overdue'])
    check(theme, `status-${fam}-ink on status-${fam}-solid`, v(`--status-${fam}-ink`), v(`--status-${fam}-solid`), 4.5);

  // Interaction washes must keep text legible on them (Phase 0a).
  for (const t of ['--text-primary', '--text-muted'])
    for (const w of ['--surface-hover', '--surface-selected-wash'])
      check(theme, `${t.slice(2)} on ${w.slice(2)}`, v(t), v(w), 4.5);

  // Non-text UI ≥ 3:1
  check(theme, 'border-strong (inputs) on surface-raised', v('--border-strong'), v('--surface-raised'), 3.0);
  check(theme, 'border-focus on surface-base', v('--border-focus'), v('--surface-base'), 3.0);
  check(theme, 'border-focus on surface-raised', v('--border-focus'), v('--surface-raised'), 3.0);
}

console.log(failures === 0 ? '\nAll contrast gates pass.' : `\n${failures} contrast failure(s).`);
process.exit(failures === 0 ? 0 : 1);
