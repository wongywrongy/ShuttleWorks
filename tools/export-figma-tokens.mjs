/**
 * Figma variables export — derives a design-tokens JSON file from
 * packages/design-system/tokens.css so a Figma library can be built by
 * import instead of by hand, and can never drift from the code.
 *
 * Output shape (W3C design-tokens style: $type/$value, nested groups):
 *   primitives      — the raw color ramps (one mode; alias targets)
 *   semantic/light  — the semantic layer resolved for the light theme
 *   semantic/dark   — the same names resolved for the dark theme
 *   scales          — spacing / radius / type sizes as dimension tokens
 *
 * Import with Tokens Studio (map light/dark sets to two modes of one
 * collection) or any $type/$value-aware variables importer.
 *
 * Colors are emitted as hex, resolved through var() alias chains. Values
 * that are not colors or dimensions (shadows, easings, font stacks,
 * durations) are emitted as plain string tokens under their group so the
 * inventory stays complete; Figma importers skip or string-ify them.
 *
 * Run: node tools/export-figma-tokens.mjs         (writes packages/design-system/figma-tokens.json)
 *      node tools/export-figma-tokens.mjs --check (fails when the tracked export is stale)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const cssPath = join(repoRoot, "packages", "design-system", "tokens.css");
const outPath = join(
  repoRoot,
  "packages",
  "design-system",
  "figma-tokens.json",
);
const css = readFileSync(cssPath, "utf8");

// ---- collect declarations per selector block --------------------------------
// The file has exactly three declaration blocks (a comment-anchored structure
// the contrast checker also relies on): primitives (:root), light semantic
// (:root, [data-theme="light"]), dark semantic (.dark, [data-theme="dark"]).
function blockAfter(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`selector not found: ${selectorRe}`);
  const start = css.indexOf("{", m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  const decls = {};
  for (const d of css
    .slice(start, i - 1)
    .matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    decls[d[1]] = d[2].trim();
  }
  return decls;
}

const primitives = blockAfter(/:root\s*\{/);
const light = blockAfter(/:root\s*,\s*\n?\s*\[data-theme="light"\]\s*\{/);
const dark = blockAfter(/\.dark\s*,\s*\n?\s*\[data-theme="dark"\]\s*\{/);

// ---- value resolution -------------------------------------------------------
function resolve(value, scope, seen = new Set()) {
  const m = value.match(/^var\(--([\w-]+)\)$/);
  if (!m) return value;
  if (seen.has(m[1])) throw new Error(`alias cycle at --${m[1]}`);
  seen.add(m[1]);
  const next = scope[m[1]];
  if (next == null) throw new Error(`unresolved alias --${m[1]}`);
  return resolve(next, scope, seen);
}

const HSL_TRIPLET = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

function tokenFor(rawValue, scope) {
  let v;
  try {
    v = resolve(rawValue, scope);
  } catch {
    return null; // alias into a name outside this scope — skip
  }
  const hsl = v.match(HSL_TRIPLET);
  if (hsl)
    return { $type: "color", $value: hslToHex(+hsl[1], +hsl[2], +hsl[3]) };
  if (/^-?\d+(?:\.\d+)?(px|rem)$/.test(v))
    return { $type: "dimension", $value: v };
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return { $type: "number", $value: +v };
  return { $type: "string", $value: v };
}

// ---- grouping: --status-live-bg → { status: { 'live-bg': … } } --------------
function grouped(decls, scope) {
  const out = {};
  for (const [name, raw] of Object.entries(decls)) {
    const token = tokenFor(raw, scope);
    if (!token) continue;
    const [head, ...rest] = name.split("-");
    const group = (out[head] ??= {});
    group[rest.length ? rest.join("-") : head] = token;
  }
  return out;
}

// Scales live in the primitives block (space/radius/text/z/…); colors there
// are the ramps. Split them so Figma gets clean collections.
const primitiveColors = {};
const scaleDecls = {};
for (const [name, raw] of Object.entries(primitives)) {
  (HSL_TRIPLET.test(raw) ? primitiveColors : scaleDecls)[name] = raw;
}

// In CSS the dark block only OVERRIDES; anything it doesn't name cascades
// from the light block. Figma modes need the same variable set per mode, so
// the dark mode is the light name set resolved with dark taking precedence.
const darkFull = Object.fromEntries(
  Object.keys(light).map((name) => [name, dark[name] ?? light[name]]),
);

const doc = {
  primitives: grouped(primitiveColors, primitives),
  semantic: {
    light: grouped(light, { ...primitives, ...light }),
    dark: grouped(darkFull, { ...primitives, ...light, ...dark }),
  },
  scales: grouped(scaleDecls, primitives),
};

const count = (o) =>
  Object.values(o).reduce((n, v) => n + (v && v.$type ? 1 : count(v)), 0);
const rendered = `${JSON.stringify(doc, null, 2)}\n`;
const summary =
  `${count(doc.primitives)} primitives, ` +
  `${count(doc.semantic.light)} light / ${count(doc.semantic.dark)} dark semantic, ` +
  `${count(doc.scales)} scale tokens`;

if (process.argv.includes("--check")) {
  const tracked = readFileSync(outPath, "utf8");
  if (tracked !== rendered) {
    console.error(
      "figma-tokens.json is stale; run `npm run figma:tokens` and commit the result",
    );
    process.exitCode = 1;
  } else {
    console.log(`figma-tokens.json is current: ${summary}`);
  }
} else {
  writeFileSync(outPath, rendered);
  console.log(`figma-tokens.json written: ${summary}`);
}
