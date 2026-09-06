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
 * The color math and token parsing live in `contrast.mjs` (importable, unit
 * tested in `__tests__/contrast.test.mjs`) — this file is the CLI gate that
 * consumes them and exits 1 on any failure.
 *
 * Run: node packages/design-system/scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTokens, contrastRatio, luminanceDelta } from './contrast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'tokens.css'), 'utf8');

const { light: lightVars, dark: darkVars, resolve } = parseTokens(css);

// ---- the gates --------------------------------------------------------------
const SURFACES = ['--surface-sunken', '--surface-base', '--surface-raised', '--surface-overlay'];
const TEXTS = ['--text-primary', '--text-secondary', '--text-muted'];
const STATUS = ['success', 'warning', 'danger', 'info'];

let failures = 0;
function check(theme, label, fg, bg, min) {
  const r = contrastRatio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  const flag = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${flag} ${label.padEnd(52)} ${r.toFixed(2)}:1 (min ${min})`);
  return ok;
}

function checkDelta(theme, label, a, b, min) {
  const delta = luminanceDelta(a, b);
  const ok = delta >= min;
  if (!ok) failures++;
  const flag = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${flag} ${label.padEnd(52)} ${delta.toFixed(3)} (min ${min})`);
  return ok;
}

for (const [theme, vars] of [['light', lightVars], ['dark', darkVars]]) {
  console.log(`\n=== ${theme} ===`);
  const v = (n) => resolve(vars, n);

  for (const t of TEXTS)
    for (const s of SURFACES)
      check(theme, `${t.slice(2)} on ${s.slice(2)}`, v(t), v(s), 4.5);

  check(theme, 'text-on-accent on action-primary', v('--text-on-accent'), v('--action-primary'), 4.5);
  // Tinted callouts still exist, but selection no longer uses this pair.
  check(
    theme,
    'action-selected-foreground on action-selected-bg',
    v('--action-selected-foreground'),
    v('--action-selected-bg'),
    4.5,
  );
  for (const surface of ['--surface-base', '--surface-raised', '--surface-hover']) {
    check(
      theme,
      `action-primary fill vs ${surface.slice(2)}`,
      v('--action-primary'),
      v(surface),
      3.0,
    );
    checkDelta(
      theme,
      `action-primary luminance vs ${surface.slice(2)}`,
      v('--action-primary'),
      v(surface),
      0.20,
    );
  }
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

  // Inverse band (entrant NOW strip): its own ink ramp on its own ground.
  // The band is NOT in SURFACES on purpose — the page text ramp is never
  // painted on it; these two are the only pairs it can produce.
  for (const t of ['--surface-inverse-ink', '--surface-inverse-muted'])
    check(theme, `${t.slice(2)} on surface-inverse`, v(t), v('--surface-inverse'), 4.5);

  // Interaction washes must keep text legible on them (Phase 0a).
  for (const t of ['--text-primary', '--text-muted'])
    for (const w of ['--surface-hover', '--surface-selected-wash'])
      check(theme, `${t.slice(2)} on ${w.slice(2)}`, v(t), v(w), 4.5);

  // Non-text UI ≥ 3:1
  check(theme, 'border-strong (inputs) on surface-raised', v('--border-strong'), v('--surface-raised'), 3.0);
  check(theme, 'border-focus on surface-base', v('--border-focus'), v('--surface-base'), 3.0);
  check(theme, 'border-focus on surface-raised', v('--border-focus'), v('--surface-raised'), 3.0);
}

// Permanent negative controls: these inputs are deliberately bad. If either
// helper starts accepting them, the gate itself fails instead of certifying a
// broken checker.
if (contrastRatio('213 94% 74%', '0 0% 100%') >= 4.5) {
  failures++;
  console.log('\nFAIL negative control: pale blue on white was accepted');
} else {
  console.log('\nok   negative control: pale blue on white rejected');
}
if (luminanceDelta('214 100% 97%', '0 0% 100%') >= 0.20) {
  failures++;
  console.log('FAIL negative control: pale selected tint passed grayscale floor');
} else {
  console.log('ok   negative control: pale selected tint rejected by grayscale floor');
}

console.log(failures === 0 ? '\nAll contrast gates pass.' : `\n${failures} contrast failure(s).`);
process.exit(failures === 0 ? 0 : 1);
