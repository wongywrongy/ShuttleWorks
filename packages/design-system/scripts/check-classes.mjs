/**
 * Unknown-token-utility check (Phase 0a).
 *
 * Catches the class of bug where a TOKEN-SHAPED Tailwind utility references
 * a color name that is not wired in tailwind-preset.js and therefore renders
 * silently transparent/inherited (the `bg-bg-subtle` / `text-fg` incident:
 * 38+ occurrences shipped invisible).
 *
 * Scope: utilities whose color segment starts with our token vocabulary
 * (bg-, fg-, ink-, surface-, status-, module-, action-, rule-, accent-, …).
 * Stock Tailwind palette classes (blue-500 …) are OUT of scope here — those
 * are governed by DESIGN_COLOR.md's exception list, not this check.
 *
 * Run: node packages/design-system/scripts/check-classes.mjs
 * Exits 1 on any unknown token-shaped utility.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const preset = readFileSync(join(here, '..', 'tailwind-preset.js'), 'utf8');

// ---- collect valid color names from the preset -----------------------------
// Flatten `key: 'hsl(...)'` entries plus nested `parent: { child: ... }`
// into the utility names Tailwind generates (parent-child / parent for DEFAULT).
const valid = new Set();
{
  const colorBlock = preset.slice(preset.indexOf('colors:'), preset.indexOf('spacing:'));
  const stack = [];
  for (const line of colorBlock.split('\n')) {
    const open = line.match(/^\s*(?:'([\w-]+)'|([\w-]+))\s*:\s*\{/);
    const leaf = line.match(/^\s*(?:'([\w-]+)'|([\w-]+))\s*:\s*'hsl/);
    const close = /^\s*\}/.test(line);
    if (open) stack.push(open[1] ?? open[2]);
    else if (leaf) {
      const name = leaf[1] ?? leaf[2];
      // stack[0] is the `colors:` block itself — drop it from the prefix.
      const prefix = stack.slice(1).join('-');
      valid.add(name === 'DEFAULT' ? prefix : prefix ? `${prefix}-${name}` : name);
    } else if (close && stack.length) stack.pop();
  }
}

// Token vocabulary roots — a utility color segment starting with one of these
// is "token-shaped" and must resolve against the preset.
const TOKEN_ROOTS =
  /^(bg|fg|ink|rule|surface|status|module|action|accent|brand|muted|card|popover|primary|secondary|destructive|foreground|background|input|ring|chip|hover|selected|border-hairline|border-strong|border-focus|focus|success|warning|info|text-primary|text-secondary|text-muted|text-on-accent)(-|$)/;

// Utility prefixes that take a color argument.
const UTIL = /(?:^|[\s'"`:{(])(?:hover:|focus:|focus-visible:|active:|disabled:|dark:|group-hover:|placeholder:)*((?:bg|text|border|ring|divide|outline|placeholder|fill|stroke|from|via|to|caret|shadow)-((?!\[)[a-z][\w-]*?))(?=\/\d+|[\s'"`}),]|$)/g;

// Non-color segments these utilities also accept (sizes, widths, styles…).
const NON_COLOR = new Set([
  // text sizes/styles
  '3xs','2xs','xs','sm','base','lg','xl','2xl','3xl','4xl','5xl','6xl','left','center','right','justify','ellipsis','clip','wrap','nowrap','balance','pretty',
  // border/ring/outline/divide structure
  'b','t','l','r','x','y','s','e','0','1','2','4','8','none','solid','dashed','dotted','double','hidden','inset','collapse','separate','offset-1','offset-2',
  // shadow scale
  'md','inner','glow','glow-lg','frame','card','hard','2xl',
  // gradients stops with numbers handled by NON_COLOR misses -> allow % forms via regex exclusion
]);

const offenders = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(name) && !/\.test\./.test(name)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(UTIL)) {
        const seg = m[2];
        if (NON_COLOR.has(seg)) continue;
        if (!TOKEN_ROOTS.test(seg)) continue;           // not token-shaped → out of scope
        if (valid.has(seg)) continue;                    // wired ✓
        // border-<width>/ring-<width> numerics already filtered by NON_COLOR
        offenders.push(`${p.replace(repoRoot, '').replace(/\\/g, '/')}: ${m[1]}`);
      }
    }
  }
}
walk(join(repoRoot, 'products', 'scheduler', 'frontend', 'src'));
walk(join(repoRoot, 'packages', 'design-system', 'components'));

if (offenders.length) {
  console.error(`Unknown token-shaped utilities (render silently transparent):`);
  for (const o of [...new Set(offenders)]) console.error('  ' + o);
  process.exit(1);
}
console.log('check-classes: no unknown token-shaped utilities.');
