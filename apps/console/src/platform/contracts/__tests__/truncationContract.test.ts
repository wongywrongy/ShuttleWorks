/**
 * Truncation contract — no shipped surface may hide characters from the
 * operator.
 *
 * The owner's requirement is one sentence: "ensure that there is no em dashes
 * or truncation site wide. info clarity is paramount". Truncation is the half
 * of that a test can hold. A `truncate` class is invisible in review (it is one
 * word inside a 90-character className), invisible in jsdom (no stylesheet, no
 * layout engine), and invisible in a screenshot taken at a width where the text
 * happened to fit. It is only visible to the director at 22:40 who cannot tell
 * "Riverside Ba…" from "Riverside Ba…" — two different schools.
 *
 * So this is a file-level assertion, the same call `motionContract.test.ts` and
 * `shellLayoutContract.test.ts` make for the same reason.
 *
 * The replacement is never an ellipsis. In order of preference, all of which
 * are already house patterns here:
 *   1. wrap at word boundaries (`break-words`) and let the row grow;
 *   2. give the column a `@container/table` priority so a LOW-value column
 *      yields entirely rather than clipping a high-value one — see
 *      `components/control-plane/BandedList.tsx` and `modules/hub/
 *      WorkspaceRow.tsx`;
 *   3. shrink the type step, where a box genuinely cannot grow.
 *
 * Source files are enumerated from disk, so a file added tomorrow is covered
 * without touching this test.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

/**
 * Every shipped source file under `src/`, enumerated from disk.
 *
 * `__tests__` directories and `*.test.*` files are excluded: they ship to
 * nobody, and several of them legitimately name the banned classes in order to
 * assert their ABSENCE (`StandingsView.test.tsx` asserts
 * `not.toContain('truncate')`) — scanning those would make the contract fail on
 * the tests that enforce it.
 */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const FILES = sourceFiles();

/** Path relative to `src/`, POSIX-slashed so failures read the same on CI. */
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

/**
 * Source with comments stripped. These files DISCUSS truncation in prose —
 * this one included — and a doc comment explaining why a value wraps is not a
 * value being clipped.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Deliberate, reasoned exceptions. EMPTY on purpose: the sweep that installed
 * this contract resolved every one of the ~70 sites by layout instead, so
 * nothing currently earns a place here.
 *
 * An entry is `[relative path, reason]` and is only admissible if the value is
 * genuinely unreadable in full at some supported width AND is rendered in full
 * somewhere the user can reach without hovering (a touch device has no hover).
 * "The row got taller and I preferred it short" is not a reason.
 */
const ALLOWED: ReadonlyArray<readonly [string, string]> = [];

const allowed = new Set(ALLOWED.map(([file]) => file));

/** Files violating `pattern`, minus the allowlist. */
function offenders(pattern: RegExp): string[] {
  return FILES.filter((file) => {
    const name = rel(file);
    if (allowed.has(name)) return false;
    return pattern.test(code(readFileSync(file, 'utf8')));
  }).map(rel);
}

describe('the truncation contract has something to scan', () => {
  it('enumerates the shipped source tree from disk', () => {
    // A walker that silently returns [] would make every assertion below pass.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.some((f) => rel(f) === 'modules/hub/WorkspaceRow.tsx')).toBe(true);
  });
});

describe('no CSS-side ellipsis anywhere under src/', () => {
  it('uses no `truncate` utility', () => {
    // Tailwind's `truncate` is `overflow:hidden; text-overflow:ellipsis;
    // white-space:nowrap` in one word — the most common way this regresses.
    expect(offenders(/(?<![\w-])truncate(?![\w-])/)).toEqual([]);
  });

  it('uses no `text-ellipsis` / `overflow-ellipsis` utility', () => {
    expect(offenders(/(?<![\w-])(?:text|overflow)-ellipsis(?![\w-])/)).toEqual([]);
  });

  it('uses no `line-clamp-*` utility', () => {
    // A clamp hides whole LINES, which is strictly worse than hiding a tail.
    expect(offenders(/(?<![\w-])line-clamp-\d+(?![\w-])/)).toEqual([]);
  });

  it('declares no `text-overflow` in CSS or in a style object', () => {
    expect(offenders(/text-overflow\s*:|textOverflow\s*:/)).toEqual([]);
  });

  it('declares no `-webkit-line-clamp` in CSS', () => {
    expect(offenders(/-webkit-line-clamp\s*:|WebkitLineClamp\s*:/)).toEqual([]);
  });
});

describe('no element both refuses to wrap and hides its overflow', () => {
  it('pairs `whitespace-nowrap` with `overflow-hidden` nowhere', () => {
    // The pairing clips mid-glyph with no ellipsis to even hint at it — the
    // Live Gantt's match label did exactly this. `whitespace-nowrap` ALONE is
    // fine and stays: it is how a time, a score or a pill keeps its shape in a
    // container that scrolls or grows.
    const sameClassString =
      /className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})/g;
    const bad: string[] = [];
    for (const file of FILES) {
      if (allowed.has(rel(file))) continue;
      for (const m of code(readFileSync(file, 'utf8')).matchAll(sameClassString)) {
        if (/\bwhitespace-nowrap\b/.test(m[0]) && /\boverflow-hidden\b/.test(m[0])) {
          bad.push(rel(file));
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('no JS-side clipping of a display string', () => {
  it('never concatenates an ellipsis onto a sliced string', () => {
    // `id.slice(0, 8) + '…'` is a `truncate` that survives every CSS audit.
    // A bare `slice` is fine (an id prefix is a handle, a date key is a date
    // key); it is the ellipsis that claims characters are being withheld.
    const pattern =
      /\.(?:slice|substring|substr)\([^)]*\)\s*(?:\}?\s*(?:\+\s*)?)['"`\s]*(?:…|\.\.\.)/;
    expect(offenders(pattern)).toEqual([]);
  });
});
