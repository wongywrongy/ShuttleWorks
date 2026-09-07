/**
 * Color math + token parsing shared by the contrast gate (check-contrast.mjs)
 * and its unit tests. Extracted from check-contrast.mjs (WP-06, X1) so the
 * WCAG math is importable rather than living only inside a script with a
 * `process.exit` at the bottom.
 *
 * Behavior is unchanged from the pre-extraction script — same regexes, same
 * balanced-brace block reader, same relative-luminance formula (WCAG 2.x).
 */

// ---- block / token parsing --------------------------------------------------

/** Find the given selector in `css` and return the contents of its balanced
 * `{ ... }` block (not including the braces). */
export function blockOf(css, selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`selector not found: ${selectorRe}`);
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

/** Parse `--token: value;` declarations out of one CSS block into a map. */
export function varsOf(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Parse `tokens.css` into its three blocks (primitives, light, dark) and
 * return a `resolve(themeVars, name)` helper that follows `var(--x)`
 * indirection, falling back to the primitives block — the same rule
 * tokens.css itself documents (semantic tokens may reference primitives).
 */
export function parseTokens(css) {
  const primitivesBlock = blockOf(css, /^\s{2}:root\s*\{/m);
  const lightBlock = blockOf(css, /^\s{2}:root,\s*\n\s*\[data-theme="light"\]\s*\{/m);
  const darkBlock = blockOf(css, /^\s{2}\.dark,\s*\n\s*\[data-theme="dark"\]\s*\{/m);

  const primitives = varsOf(primitivesBlock);
  const light = varsOf(lightBlock);
  const dark = varsOf(darkBlock);

  function resolve(vars, name, depth = 0) {
    if (depth > 10) throw new Error(`cycle at ${name}`);
    const raw = vars[name] ?? primitives[name];
    if (raw == null) throw new Error(`undefined token ${name}`);
    const ref = raw.match(/^var\((--[\w-]+)\)$/);
    if (ref) return resolve(vars, ref[1], depth + 1);
    return raw;
  }

  return { primitives, light, dark, resolve };
}

// ---- color math -------------------------------------------------------------

/** `"h s% l%"` (tokens.css's HSL-triplet spelling) → `[r, g, b]` in 0..1. */
export function hslToRgb(trip) {
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

/** WCAG relative luminance of an `[r, g, b]` triplet (0..1 components). */
export function relativeLuminance(rgb) {
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two HSL-triplet strings. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Absolute difference in WCAG relative luminance between two HSL triplets
 * — used for the "flat gray" negative control (a tint that reads as roughly
 * the same gray value as its surface, even if its hue passes contrast). */
export function luminanceDelta(a, b) {
  return Math.abs(relativeLuminance(hslToRgb(a)) - relativeLuminance(hslToRgb(b)));
}
