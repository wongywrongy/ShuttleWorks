#!/usr/bin/env node
/**
 * string-ledger-scan.mjs — read-only heuristic extractor for the v3
 * consolidated plan's "every-string ledger" (package 25, plan.md §4).
 *
 * Walks:
 *   - apps/console/src (excluding any __tests__ directory and *.test.[jt]sx? files)
 *   - apps/entrant/app (excluding any tests directory and *.test.[jt]s files)
 *   - apps/entrant/public/assets (the framework-free browser twins — plain
 *     .js, no JSX)
 *
 * and extracts candidate user-visible / accessible strings:
 *   - JSX text nodes (`<div>Hello</div>`)
 *   - JSX attribute string literals on a fixed allow-list of visible/
 *     accessible props: label, hint, title, aria-label, ariaLabel,
 *     placeholder, alt, helperText, description
 *   - `toast(...)` / `toast.success(...)` / `toast.error(...)` call-argument
 *     string literals
 *   - string constants exported from lib/ui.ts, stateWords.ts, or any file
 *     whose name matches /Labels?\.ts$/ or /label[Mm]ap/ (label maps)
 *
 * Method: AST-based for .ts/.tsx/.jsx files (via @babel/parser +
 * @babel/traverse, already vendored in the repo root node_modules — no new
 * dependency added). Plain .js files under public/assets have no JSX/TS to
 * parse, so those are extracted with the same *rule set* applied via regex
 * over recognizable literal-producing patterns (object literals whose key is
 * one of the allow-listed prop names, and bare string-literal arguments to a
 * small set of DOM-text-setting call patterns). This is a heuristic, not a
 * full JS parse, and is documented as a known gap below.
 *
 * Excluded on purpose (never emitted as a candidate string):
 *   - Any literal inside a *.test.ts(x)/*.spec.ts(x) file, or under a
 *     __tests__/ or tests/ directory.
 *   - className / style / data-testid / id / htmlFor / key / name / type /
 *     href / src / rel / target / role / aria-hidden / aria-describedby /
 *     aria-labelledby / autoComplete / inputMode / pattern attribute values
 *     (structural/CSS/wiring, not prose).
 *   - Route-shaped strings (leading "/", or matching /^[a-z0-9-]+\/[a-z0-9/:.-]+$/).
 *   - id/uuid/enum-code-shaped tokens: pure uppercase-with-underscore
 *     constants ("MODULE_HAS_DATA"), bare short codes (<=4 chars, no space,
 *     e.g. "MS", "R32"), template-literal-only strings with no static text
 *     (e.g. "${x}"), and strings that are entirely punctuation/whitespace.
 *   - Strings shorter than 2 visible characters after trimming.
 *   - Import specifiers, JSX element/member names, and any string literal
 *     that is itself a call/member expression's *property name* rather than
 *     an argument.
 *
 * This heuristic will both over- and under-collect: a "kind" field records
 * how a string was found so a reviewer can judge it, and the tool is meant
 * to feed a human ledger (docs/audits/v3-consolidated/ledger/LEDGER.md), not
 * to replace review.
 *
 * Output: docs/audits/v3-consolidated/ledger/scan.json
 *   { generatedAt, roots, exclusions, counts, entries: [{key, file, line, text, kind}] }
 * and a one-line-per-kind count summary on stdout.
 *
 * Run with the Zed-bundled node (no repo devDependency on this exact node
 * version is assumed): `node tools/string-ledger-scan.mjs`
 */
import { createRequire } from 'node:module';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverseMod = require('@babel/traverse');
const traverse = traverseMod.default || traverseMod;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

const ROOTS = [
  { dir: path.join(REPO, 'apps/console/src'), kindPrefix: 'console' },
  { dir: path.join(REPO, 'apps/entrant/app'), kindPrefix: 'entrant' },
  { dir: path.join(REPO, 'apps/entrant/public/assets'), kindPrefix: 'entrant-asset' },
];

const VISIBLE_PROP_NAMES = new Set([
  'label', 'hint', 'title', 'aria-label', 'ariaLabel', 'placeholder', 'alt',
  'helperText', 'description', 'summary', 'helpText', 'tooltip',
]);

const EXCLUDED_PROP_NAMES = new Set([
  'className', 'style', 'data-testid', 'testId', 'id', 'htmlFor', 'key',
  'name', 'type', 'href', 'src', 'rel', 'target', 'role', 'aria-hidden',
  'aria-describedby', 'aria-labelledby', 'autoComplete', 'inputMode',
  'pattern', 'to', 'as', 'variant', 'size', 'colSpan', 'rowSpan', 'min',
  'max', 'step', 'value', 'defaultValue',
]);

const TOAST_CALLEES = new Set(['toast', 'notify', 'showToast']);
const LABEL_FILE_RE = /(Labels?\.tsx?$|label[Mm]ap.*\.tsx?$|stateWords\.ts$|^ui\.ts$)/;

function shouldExcludeFile(filePath) {
  const base = path.basename(filePath);
  if (/\.test\.[jt]sx?$/.test(base) || /\.spec\.[jt]sx?$/.test(base)) return true;
  const norm = filePath.split(path.sep).join('/');
  if (norm.includes('/__tests__/') || norm.includes('/tests/')) return true;
  return false;
}

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'tests') continue;
      walk(full, exts, out);
      continue;
    }
    if (shouldExcludeFile(full)) continue;
    if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// ---- exclusion heuristics for candidate string VALUES (not props/files) ----

const ROUTE_RE = /^\/[a-z0-9][a-z0-9/:._-]*$/i;
const CODE_TOKEN_RE = /^[A-Z][A-Z0-9_]{1,30}$/; // SCREAMING_SNAKE constants / enum values
const SHORT_CODE_RE = /^[A-Za-z0-9]{1,4}$/; // "MS", "R32", "OK" — but allow real 2-4 letter words via a small allowlist
const SHORT_WORD_ALLOW = new Set([
  'Yes', 'No', 'On', 'Off', 'OK', 'Ok', 'Now', 'Add', 'Cut', 'Set',
]);
const CLASSNAME_LIKE_RE = /^[a-z0-9-]+(\s[a-z0-9-]+)*$/; // all-lowercase, hyphen/space only, no letters that read as prose punctuation
const TEMPLATE_ONLY_RE = /^\$\{[^}]*\}$/;
const PUNCT_ONLY_RE = /^[\s\-_.,:;/|•·»«›‹→←()[\]{}]*$/;

function looksLikeProse(text) {
  const t = text.trim();
  if (t.length < 2) return false;
  if (PUNCT_ONLY_RE.test(t)) return false;
  if (TEMPLATE_ONLY_RE.test(t)) return false;
  if (ROUTE_RE.test(t)) return false;
  if (CODE_TOKEN_RE.test(t)) return false;
  if (SHORT_CODE_RE.test(t) && !SHORT_WORD_ALLOW.has(t) && !/\s/.test(t)) {
    // bare 1-4 char alnum tokens with no space are almost always codes
    // (MS, WS, R32, id-ish) unless explicitly allow-listed above.
    if (!/^[A-Z][a-z]+$/.test(t)) return false; // allow a single capitalized short word e.g. "Add"
  }
  // A string of only lowercase words+hyphens and no uppercase/space-separated
  // sentence shape reads as a CSS/slug token, e.g. "text-status-live".
  if (t.includes('-') && CLASSNAME_LIKE_RE.test(t) && !/\s/.test(t)) return false;
  // File-path / id-shaped
  if (/^[a-z0-9_-]+\.[a-z0-9]{1,4}$/i.test(t)) return false;
  if (/^[0-9a-f-]{8,}$/i.test(t)) return false; // uuid-ish
  return true;
}

function keyFor(kindPrefix, filePath, line, extra) {
  return `${kindPrefix}:${rel(filePath)}:${line}${extra ? `:${extra}` : ''}`;
}

// ---- AST extraction for .ts/.tsx/.jsx files ----

function extractFromAst(filePath, src, kindPrefix, entries) {
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch (err) {
    entries.push({
      key: keyFor(kindPrefix, filePath, 0, 'parse-error'),
      file: rel(filePath),
      line: 0,
      text: `(parse error: ${err.message.split('\n')[0]})`,
      kind: 'parse-error',
    });
    return;
  }

  const base = path.basename(filePath);
  const isLabelFile = LABEL_FILE_RE.test(base);

  traverse(ast, {
    JSXText(p) {
      const raw = p.node.value.replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) return;
      const line = p.node.loc?.start.line ?? 0;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, raw.slice(0, 24)),
        file: rel(filePath),
        line,
        text: raw,
        kind: 'jsx-text',
      });
    },
    JSXAttribute(p) {
      const name = p.node.name && (p.node.name.name || (p.node.name.namespace && p.node.name.name));
      const attrName = typeof name === 'string' ? name : (p.node.name?.name ?? '');
      if (!VISIBLE_PROP_NAMES.has(attrName)) return;
      if (EXCLUDED_PROP_NAMES.has(attrName)) return;
      const val = p.node.value;
      let text = null;
      if (val && val.type === 'StringLiteral') text = val.value;
      else if (val && val.type === 'JSXExpressionContainer' && val.expression.type === 'StringLiteral') {
        text = val.expression.value;
      }
      if (text == null) return;
      const raw = text.replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) return;
      const line = p.node.loc?.start.line ?? 0;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, `${attrName}:${raw.slice(0, 24)}`),
        file: rel(filePath),
        line,
        text: raw,
        kind: `prop:${attrName}`,
      });
    },
    CallExpression(p) {
      const callee = p.node.callee;
      let calleeName = null;
      if (callee.type === 'Identifier') calleeName = callee.name;
      else if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
        calleeName = callee.object.name;
      }
      if (!calleeName || !TOAST_CALLEES.has(calleeName)) return;
      for (const arg of p.node.arguments) {
        if (arg.type !== 'StringLiteral') continue;
        const raw = arg.value.replace(/\s+/g, ' ').trim();
        if (!looksLikeProse(raw)) continue;
        const line = p.node.loc?.start.line ?? 0;
        entries.push({
          key: keyFor(kindPrefix, filePath, line, `${calleeName}:${raw.slice(0, 24)}`),
          file: rel(filePath),
          line,
          text: raw,
          kind: `toast:${calleeName}`,
        });
      }
    },
    ExportNamedDeclaration(p) {
      if (!isLabelFile) return;
      const decl = p.node.declaration;
      if (!decl || decl.type !== 'VariableDeclaration') return;
      for (const d of decl.declarations) {
        collectLabelMapStrings(d.init, filePath, kindPrefix, entries, base);
      }
    },
  });
}

function collectLabelMapStrings(node, filePath, kindPrefix, entries, base) {
  if (!node) return;
  if (node.type === 'StringLiteral') {
    const raw = node.value.replace(/\s+/g, ' ').trim();
    if (!looksLikeProse(raw)) return;
    const line = node.loc?.start.line ?? 0;
    entries.push({
      key: keyFor(kindPrefix, filePath, line, `labelmap:${raw.slice(0, 24)}`),
      file: rel(filePath),
      line,
      text: raw,
      kind: `label-map:${base}`,
    });
    return;
  }
  if (node.type === 'ObjectExpression') {
    for (const prop of node.properties) {
      if (prop.type === 'ObjectProperty') collectLabelMapStrings(prop.value, filePath, kindPrefix, entries, base);
    }
    return;
  }
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) collectLabelMapStrings(el, filePath, kindPrefix, entries, base);
    return;
  }
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
    collectLabelMapStrings(node.expression, filePath, kindPrefix, entries, base);
  }
}

// ---- regex extraction for plain .js browser twins (public/assets) ----

function extractFromPlainJs(filePath, src, kindPrefix, entries) {
  const lines = src.split('\n');
  const propRe = new RegExp(
    `\\b(${[...VISIBLE_PROP_NAMES].join('|')})\\s*:\\s*(['"])((?:\\\\.|(?!\\2).)*)\\2`,
    'g',
  );
  const toastRe = new RegExp(`\\b(${[...TOAST_CALLEES].join('|')})\\s*\\(\\s*(['"])((?:\\\\.|(?!\\2).)*)\\2`, 'g');
  // textContent = '...'  or  .innerText = "..."  or setAttribute('aria-label', '...')
  const domTextRe = /\b(?:textContent|innerText)\s*=\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const setAttrRe = /setAttribute\(\s*(['"])(aria-label|title|placeholder|alt)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3/g;

  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    let m;
    propRe.lastIndex = 0;
    while ((m = propRe.exec(lineText))) {
      const raw = m[3].replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) continue;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, `${m[1]}:${raw.slice(0, 24)}`),
        file: rel(filePath),
        line,
        text: raw,
        kind: `prop:${m[1]}`,
      });
    }
    toastRe.lastIndex = 0;
    while ((m = toastRe.exec(lineText))) {
      const raw = m[3].replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) continue;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, `${m[1]}:${raw.slice(0, 24)}`),
        file: rel(filePath),
        line,
        text: raw,
        kind: `toast:${m[1]}`,
      });
    }
    domTextRe.lastIndex = 0;
    while ((m = domTextRe.exec(lineText))) {
      const raw = m[2].replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) continue;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, `dom-text:${raw.slice(0, 24)}`),
        file: rel(filePath),
        line,
        text: raw,
        kind: 'dom-text',
      });
    }
    setAttrRe.lastIndex = 0;
    while ((m = setAttrRe.exec(lineText))) {
      const raw = m[4].replace(/\s+/g, ' ').trim();
      if (!looksLikeProse(raw)) continue;
      entries.push({
        key: keyFor(kindPrefix, filePath, line, `${m[2]}:${raw.slice(0, 24)}`),
        file: rel(filePath),
        line,
        text: raw,
        kind: `prop:${m[2]}`,
      });
    }
  });
}

// ---- dedupe shared chrome by identical text + component (file basename) ----

function dedupe(entries) {
  const seen = new Map();
  const out = [];
  for (const e of entries) {
    const component = path.basename(e.file);
    const dedupeKey = `${component}::${e.kind}::${e.text}`;
    if (seen.has(dedupeKey)) {
      seen.get(dedupeKey).usage.push(`${e.file}:${e.line}`);
      continue;
    }
    const withUsage = { ...e, usage: [`${e.file}:${e.line}`] };
    seen.set(dedupeKey, withUsage);
    out.push(withUsage);
  }
  return out;
}

function main() {
  const rawEntries = [];
  for (const { dir, kindPrefix } of ROOTS) {
    const isAssetsDir = dir.endsWith('public/assets');
    const files = isAssetsDir ? walk(dir, ['.js']) : walk(dir, ['.ts', '.tsx', '.jsx']);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (isAssetsDir) {
        extractFromPlainJs(file, src, kindPrefix, rawEntries);
      } else {
        extractFromAst(file, src, kindPrefix, rawEntries);
      }
    }
  }

  const entries = dedupe(rawEntries).sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

  const counts = {};
  for (const e of entries) counts[e.kind] = (counts[e.kind] || 0) + 1;

  const output = {
    generatedAt: new Date().toISOString(),
    roots: ROOTS.map((r) => rel(r.dir)),
    exclusions: [
      'test/spec files and __tests__/tests directories',
      'className/style/data-testid/id/htmlFor/key/name/type/href/src/rel/target/role/aria-hidden/aria-describedby/aria-labelledby/autoComplete/inputMode/pattern/to/as/variant/size attribute values',
      'route-shaped strings (leading "/")',
      'SCREAMING_SNAKE code tokens and bare <=4-char alnum codes (MS, R32, OK) unless allow-listed',
      'all-lowercase hyphenated class/slug-shaped tokens with no spaces (e.g. text-status-live)',
      'template-literal-only strings with no static text (${x})',
      'punctuation/whitespace-only strings and strings shorter than 2 chars',
      'file-name-shaped and uuid-shaped tokens',
    ],
    counts,
    totalKeys: entries.length,
    entries,
  };

  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) {
    throw new Error('Usage: string-ledger-scan.mjs [--output path]');
  }
  const outPath = args.length ? path.resolve(args[1]) : path.join(REPO, 'docs/audits/v3-consolidated/ledger/scan.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log(`string-ledger-scan: wrote ${entries.length} deduped candidate strings to ${rel(outPath)}`);
  console.log('By kind:');
  for (const [kind, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${n}`);
  }
}

main();
