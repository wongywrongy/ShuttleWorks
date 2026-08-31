/**
 * Accent contract (SP-CONSOLE-5 ACC-N1) — the accent means "act", not "this
 * is an identifier".
 *
 * Blue was carrying seven jobs at once: nav active state, hyperlinks, primary
 * buttons, event codes, draw codes, segmented-control selection and progress
 * bars. On `/bracket-matches` that rendered 110 blue event codes down one
 * column, which reads as 110 actions on a surface where the codes do nothing.
 * `/bracket-draws` had already made the opposite call for the same data under
 * DRW-2 ("the code is an identifier, and in accent it read as the row's link")
 * — so this was an inconsistency to close, not a new rule to invent.
 *
 * The rule the scan holds: **a code is never accent-inked.** Codes are
 * identified by `sw-num`, the tabular-numeral class every event / draw / match
 * code carries, so the assertion is precise rather than a blanket ban on the
 * token — which would be wrong, since accent legitimately marks primary
 * actions, active nav, real links, and selected state.
 *
 * File-level, for the reason `emDashContract.test.ts` gives: one word inside a
 * 90-character className is invisible to a DOM test and invisible to review.
 *
 * INTERACTION STATES ARE NOT INK. `hover:border-accent`, `focus:ring-accent`
 * and friends colour a control's *response to the pointer*, which is exactly
 * what the accent is for. Only the resting text colour is judged.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
const REPO = path.resolve(HERE, '../../../../../..');
const rel = (file: string) => path.relative(REPO, file).split(path.sep).join('/');

const ALLOWED: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function classNameValues(src: string): string[] {
  const out: string[] = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

/** Resting accent ink — `text-accent` NOT behind a `hover:` / `focus:` prefix. */
const RESTING_ACCENT_INK = /(^|\s)text-accent(\s|$|\/)/;

describe('ACC-N1 — codes are body ink, not accent', () => {
  it('no code slot is accent-inked at rest', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const key = rel(file);
      if (key in ALLOWED) continue;
      for (const value of classNameValues(code(readFileSync(file, 'utf8')))) {
        // `sw-num` marks a code / numeral slot. Everything else may be accent.
        if (!/(^|\s)sw-num(\s|$)/.test(value)) continue;
        if (RESTING_ACCENT_INK.test(value)) {
          offenders.push(`${key}: ${value.trim().slice(0, 90)}`);
        }
      }
    }
    expect(
      offenders,
      'an event / draw / match code is an identifier — render it in body ink (DRW-2)',
    ).toEqual([]);
  });

  it('the allowlist still describes reality', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      const values = classNameValues(code(readFileSync(path.join(REPO, file), 'utf8')));
      const stillAccent = values.some(
        (v) => /(^|\s)sw-num(\s|$)/.test(v) && RESTING_ACCENT_INK.test(v),
      );
      expect(stillAccent, `${file} no longer needs the exemption (${why})`).toBe(true);
    }
  });
});
