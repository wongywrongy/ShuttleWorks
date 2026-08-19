/**
 * Ruling R14, enforced by scan: the total shown IS the total recorded.
 *
 * That promise survives exactly as long as there is one implementation of the
 * fee rules, and it lives in Python (`compute_fee_total`, called by BOTH the
 * quote path and the persist path — `api/entries_json.py:492` and `:610`).
 * This is the tripwire on the only way to break it from this side: someone
 * adding a client-side total because "it's just a sum". A director's money is
 * what a mismatch costs.
 *
 * The single sanctioned arithmetic is `money.ts`'s divide-by-100, which is a
 * *display* of cents, not a rule about them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_DIR = fileURLToPath(new URL('../app/', import.meta.url));
const MONEY = join('lib', 'money.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Accumulation or scaling of a cents value — a fee *rule*. A plain read is
 * not.
 *
 * **The `cents` mention gates the FILE; the arithmetic marker gates the
 * statement.** Both were statement-scoped, and that is escapable by aliasing
 * across a statement boundary — `const prices = events.map((e) => e.feeCents
 * ?? 0);` then `const total = prices.reduce((sum, p) => sum + p, 0);` sums a
 * basket of fees with the word "cents" nowhere near the arithmetic. Nothing
 * short of type-aware analysis follows that alias, so the scan stops trying:
 * any file that mentions cents at all and then accumulates or scales *anything*
 * is a finding. False positives are the intended trade — they are cheap to
 * rebut, and the thing on the other side is a director's money.
 *
 * Statements, not lines, for the arithmetic marker: a per-line scan is
 * escapable by wrapping the accumulator across a line break. Whitespace —
 * including newlines — is collapsed first, then the collapsed text is split on
 * statement-terminating `;`, so a multi-line call reassembles into one
 * candidate first.
 */
export function feeArithmeticLines(source: string): string[] {
  if (!/cents/i.test(source)) return [];

  return source
    .replace(/\s+/g, ' ')
    .split(/(?<=;)\s*/)
    .filter(Boolean)
    .filter((statement) =>
      /(\+=|\breduce\(|[Cc]ents\s*[*+/-]\s|[*+]\s*\w*[Cc]ents)/.test(statement),
    );
}

describe('no fee arithmetic exists client-side', () => {
  it('sums no cents anywhere outside money.ts', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      const rel = relative(APP_DIR, file);
      if (rel.split(sep).join('/') === MONEY.split(sep).join('/')) continue;
      for (const line of feeArithmeticLines(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}: ${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('confines the one display division to money.ts', () => {
    // A regex, not the literal `'/ 100'` string: an unspaced `/100` divides
    // cents exactly as much as `/ 100` does, and the literal-string match let
    // it through.
    const divisionPattern = /\/\s*100\b/;
    const money = readFileSync(join(APP_DIR, MONEY), 'utf8');
    expect(money).toMatch(divisionPattern);

    for (const file of sourceFiles(APP_DIR)) {
      if (relative(APP_DIR, file).split(sep).join('/') === MONEY.split(sep).join('/')) {
        continue;
      }
      expect(readFileSync(file, 'utf8')).not.toMatch(divisionPattern);
    }
  });

  it('is not vacuous: a client-side total goes red', () => {
    // Real fixture text of the exact defect, not a description of it.
    const offending = [
      'const totalCents = events.reduce((sum, e) => sum + (e.feeCents ?? 0), 0);',
      'const withLevy = event.feeCents * 1.05;',
      // The escape a line-local scan missed: the accumulator wrapped across
      // a line break, so "cents" and the `reduce(` marker never shared a
      // line.
      'const total = openEvents.reduce(\n  (sum, e) => sum + (e.feeCents ?? 0),\n  0,\n);',
      // The escape a statement-scoped `cents` filter missed: the fees are
      // aliased onto a plain-named local in one statement, and the sum happens
      // in the next, where the word "cents" never appears.
      'const prices = openEvents.map((e) => e.feeCents ?? 0);',
      'const total = prices.reduce((sum, p) => sum + p, 0);',
    ].join('\n');

    expect(feeArithmeticLines(offending)).toEqual([
      'const totalCents = events.reduce((sum, e) => sum + (e.feeCents ?? 0), 0);',
      'const withLevy = event.feeCents * 1.05;',
      'const total = openEvents.reduce( (sum, e) => sum + (e.feeCents ?? 0), 0, );',
      'const total = prices.reduce((sum, p) => sum + p, 0);',
    ]);
  });

  it('is not vacuous the other way: a file with no cents at all is ignored', () => {
    // The file-scoped gate must not turn every `reduce(` in the tier into a
    // money finding — the scan is about fee rules, not about arithmetic.
    expect(feeArithmeticLines('const n = rows.reduce((a, b) => a + b, 0);')).toEqual([]);
  });
});
