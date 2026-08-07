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

/** Accumulation or scaling of a cents value — a fee *rule*. A plain read is not. */
export function feeArithmeticLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /cents/i.test(line))
    .filter((line) =>
      /(\+=|\breduce\(|[Cc]ents\s*[*+/-]\s|[*+]\s*\w*[Cc]ents)/.test(line),
    )
    .map((line) => line.trim());
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
    const money = readFileSync(join(APP_DIR, MONEY), 'utf8');
    expect(money).toContain('/ 100');

    for (const file of sourceFiles(APP_DIR)) {
      if (relative(APP_DIR, file).split(sep).join('/') === MONEY.split(sep).join('/')) {
        continue;
      }
      expect(readFileSync(file, 'utf8')).not.toContain('/ 100');
    }
  });

  it('is not vacuous: a client-side total goes red', () => {
    // Real fixture text of the exact defect, not a description of it.
    const offending = [
      'const totalCents = events.reduce((sum, e) => sum + (e.feeCents ?? 0), 0);',
      'const withLevy = event.feeCents * 1.05;',
    ].join('\n');

    expect(feeArithmeticLines(offending)).toEqual([
      'const totalCents = events.reduce((sum, e) => sum + (e.feeCents ?? 0), 0);',
      'const withLevy = event.feeCents * 1.05;',
    ]);
  });
});
