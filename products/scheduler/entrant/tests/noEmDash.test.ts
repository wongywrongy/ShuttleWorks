/**
 * Nothing on this tier types an em dash.
 *
 * The owner's requirement is one sentence: "no em dashes or truncation site
 * wide, info clarity is paramount". `noTruncation.test.ts` (same directory)
 * holds the truncation half for a reason spelled out there - the property is
 * a rendering property, and every DOM assertion in this directory passes
 * either way - and an em dash is exactly as invisible to a snapshot as a
 * `truncate` class is: `—` sits in the JSX text or the template literal, and
 * `getByText` matches it whether or not a reviewer notices the glyph. So this
 * is a source-text scan too, sharing `renderingSourceFiles()` and
 * `stripComments()` with `noTruncation.test.ts` for the same enumeration and
 * the same reason a doc comment should not trip the rule it documents.
 *
 * En dash (U+2013) is legal for a genuine numeric range ("9:00-17:00") - it
 * is only illegal doing an em dash's job with the wrong glyph ("Entries open
 * - closes soon"). The two are told apart by what sits outside the
 * whitespace around the dash: a digit, brace or quote is a range; a letter is
 * prose. See `emDashContract.test.ts`
 * (`frontend/src/platform/contracts/__tests__/`) for the sibling scan over
 * the operator console, which documents the same heuristic and its one named
 * blind spot (a dash next to a closing `{expr}` brace instead of a letter).
 * A repo-wide check during the sweep that added both files found zero en
 * dashes anywhere under this tier's `app/`, so there is nothing here for that
 * heuristic to even exercise today - it is carried for the day one is added.
 */
import { describe, expect, it } from 'vitest';

import { readAppSource, renderingSourceFiles, stripComments } from './helpers/sourceGuards';

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

const RULES: readonly Rule[] = Object.freeze([
  {
    id: 'em-dash',
    pattern: /—/g,
    why: 'an em dash in rendered text - use a comma, colon, full stop, middot or restructure the sentence',
  },
  {
    id: 'bad-en-dash',
    // A letter immediately outside the whitespace on either side of the
    // dash. A digit, brace, quote or no whitespace at all (`5-8`) is a tight
    // numeric range and is legal - see the module docblock.
    pattern: /[A-Za-z]\s–|–\s[A-Za-z]/g,
    why: 'an en dash doing a comma/colon/full-stop job - only a tight numeric range may use en dash',
  },
]);

/**
 * Deliberate exceptions. EMPTY on purpose, same as `noTruncation.test.ts`'s
 * own allowlist pattern - kept here for shape parity should a genuine one
 * ever earn its place.
 */
const ALLOWED: readonly { file: string; rule: string; why: string }[] = Object.freeze([]);

function allowed(file: string, rule: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.rule === rule);
}

function findings(): { file: string; rule: Rule; hits: string[] }[] {
  return renderingSourceFiles().flatMap((file) => {
    const source = stripComments(readAppSource(file));
    return RULES.flatMap((rule) => {
      const hits = source.match(new RegExp(rule.pattern.source, 'g')) ?? [];
      return hits.length > 0 ? [{ file, rule, hits }] : [];
    });
  });
}

describe('no em dash reaches the entrant tier', () => {
  it('scans every rendering source file under app/, found on disk', () => {
    // Non-vacuity: an empty or mis-rooted enumeration would make every
    // assertion below pass by never reading anything.
    const files = renderingSourceFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('components/StatusChip.tsx');
    expect(files).toContain('routes/tournament.tsx');
  });

  it('finds no banned dash pattern outside the allowlist', () => {
    const violations = findings()
      .filter(({ file, rule }) => !allowed(file, rule.id))
      .map(({ file, rule, hits }) => `${file}: ${rule.id} (${hits.join(', ')}) - ${rule.why}`);

    expect(violations).toEqual([]);
  });

  it('keeps every allowlist entry earning its place', () => {
    const stale = ALLOWED.filter(
      (entry) =>
        !findings().some(({ file, rule }) => file === entry.file && rule.id === entry.rule),
    ).map((entry) => `${entry.file}: ${entry.rule}`);

    expect(stale).toEqual([]);
  });
});
