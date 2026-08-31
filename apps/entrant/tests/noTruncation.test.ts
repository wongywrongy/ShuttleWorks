/**
 * Nothing on this tier hides text.
 *
 * The owner's requirement is one sentence — "no truncation site wide, info
 * clarity is paramount" — and it is a *rendering* property, so it cannot be
 * asserted by rendering: a truncated string is present in the markup and
 * identical to an untruncated one. `…` is painted by CSS, in a browser, at a
 * width. Every DOM assertion in this directory passes either way. So the
 * property is asserted against the source text, at the shape level, the same
 * way `apiFetch.server.test.ts` and `enter.loader.test.ts` assert the
 * credential-relay property they equally cannot observe.
 *
 * Why this tier needs it written down: entrants are one-off users who learn
 * nothing and get one pass at the page. A clipped venue, a clipped event name
 * or a clipped fee row is not a smaller answer, it is a wrong one, and there
 * is no hover, no tooltip and no second visit to recover it — this tier ships
 * zero client JavaScript by commitment (`PRODUCT.md`), so `title=` on a
 * clipped span is the *only* recovery mechanism available and it does not
 * exist on a phone. The reachable fixes are all layout: wrap at word
 * boundaries, let the container grow, or step the type down.
 *
 * Enumerated from disk (`renderingSourceFiles`), recursively, so a new
 * component or a new subdirectory is covered on the day it lands rather than
 * on the day someone remembers to add a line here.
 *
 * **What this suite does NOT cover**, deliberately, in both directions:
 *
 *  - `@scheduler/design-system`. `Button` and `Notice` render on these pages
 *    from outside `app/`, and this scan cannot see them. That tree is shared
 *    with the operator console, which has its own layout budget and its own
 *    agents, so imposing this tier's rules on it from this test would be a
 *    cross-product policy smuggled in as a unit test. It is a real gap: a
 *    `truncate` added to `Button`'s base class would truncate these pages and
 *    this file would stay green.
 *  - Rendered *width*. A file can pass every rule here and still put a long
 *    name in a box too narrow for it — the failure mode a verification found
 *    on the operator console's standings, where `break-words` in a pinched
 *    column degenerated into mid-word breaking ("Badminto / n"). Wrapping is
 *    necessary, not sufficient; the box still has to have room, and only
 *    looking at the page proves that.
 */
import { describe, expect, it } from 'vitest';

import { readAppSource, renderingSourceFiles, stripComments } from './helpers/sourceGuards';

interface Rule {
  /** Stable id — what an allowlist entry names. */
  id: string;
  /** Matched against comment-stripped source; global so every hit reports. */
  pattern: RegExp;
  /** Printed on failure: what the pattern hides, and what to do instead. */
  why: string;
}

const RULES: readonly Rule[] = Object.freeze([
  {
    id: 'truncate',
    // Tailwind's `truncate` is the three clipping declarations at once
    // (overflow-hidden + text-overflow: ellipsis + white-space: nowrap), and
    // the word-boundary spelling also catches a `truncate(...)` helper.
    pattern: /\btruncate\b/g,
    why: 'clips to one line and ends it in an ellipsis — wrap instead (`break-words`), or let the container grow',
  },
  {
    id: 'ellipsis',
    pattern: /\b(text|overflow)-ellipsis\b|text-overflow\s*:|textOverflow/g,
    why: 'paints a `…` over the part of the value the reader needed',
  },
  {
    id: 'line-clamp',
    pattern: /\bline-clamp-\d|-webkit-line-clamp/g,
    why: 'cuts a paragraph off at N lines — on this tier the paragraph is the answer; use a native `<details>` if it is genuinely long (see the Regulations card)',
  },
  {
    id: 'nowrap',
    // Banned bare, not only paired with `overflow-hidden`. On a tier whose
    // whole layout budget is 390px, `nowrap` is the class that turns a long
    // value into an overflow, and an overflow is one ancestor's
    // `overflow-hidden` away from being a silent truncation. The one place
    // it is right is a fixed-vocabulary pill — allowlisted below.
    pattern: /\bwhitespace-nowrap\b|white-space\s*:\s*nowrap/g,
    why: 'forbids the wrap that makes a long value readable at 390px',
  },
  {
    id: 'overflow-hidden',
    pattern: /\boverflow-hidden\b|overflow\s*:\s*hidden/g,
    why: 'the declaration whose entire job is to cut off what does not fit',
  },
  {
    id: 'shortener',
    // The JS-side spelling: `name.slice(0, 24)`, with or without a trailing
    // ellipsis. A numeric second argument is what separates a display
    // shortener from ordinary parsing — `echo.ts` slices at an `indexOf(':')`
    // to split a form key, which is not a truncation and does not match.
    pattern: /\.(slice|substring)\s*\(\s*\d+\s*,\s*\d|\.substr\s*\(/g,
    why: 'cuts a display string to a fixed length in JavaScript, where no CSS fix can recover it',
  },
  {
    id: 'ellipsis-literal',
    // A `…` anywhere in code, or `...` inside a string literal — the tell of
    // a hand-rolled shortener whatever shape it takes. (Bare `...` is not
    // matched: it is spread syntax on nearly every line of TSX.)
    pattern: /…|(['"])[^'"\n]*\.\.\.[^'"\n]*\1/g,
    why: 'an ellipsis in a rendered string is a value someone already cut',
  },
]);

/**
 * Deliberate exceptions. Each names one file, one rule and the reason the
 * information is still fully readable despite the match — not "this was
 * inconvenient to fix".
 *
 * Every entry is asserted to still match (below), so an exception cannot
 * outlive the line it was written for.
 */
const ALLOWED: readonly { file: string; rule: string; why: string }[] = Object.freeze([
  {
    file: 'components/MatchCard.tsx',
    rule: 'truncate',
    why:
      'SP-P9 M4 explicitly requires bracket-node names to stay on one line and ' +
      'truncate with an ellipsis because wrapping changes the fixed 44px node ' +
      'height and breaks every connector anchor. The full name remains available ' +
      'through the linked person page and in the adjacent List mode.',
  },
  {
    file: 'components/MatchCard.tsx',
    rule: 'overflow-hidden',
    why:
      'SP-P9 M4 fixes bracket nodes at exactly two 22px rows. This clipping is ' +
      'limited to the bracket-node variant so a third line cannot silently change ' +
      'tree geometry; Round and List modes carry the same match without clipping.',
  },
  {
    file: 'components/StatusChip.tsx',
    rule: 'nowrap',
    why:
      'The chip renders `chipLabel` and nothing else, and that function has a ' +
      'closed vocabulary: "Entries closed", "Entries open", "Entries open — ' +
      'closes today", "Entries open — closes in Nd". The longest of those is ' +
      '~29 characters at `text-xs`, about 210px with the pill padding and the ' +
      'dot, inside a column that is never narrower than ~256px at 390px (the ' +
      'discovery card, past the 56px date badge). It cannot reach its own ' +
      'container, so it never clips and never overflows — and the chip carries ' +
      'no `overflow-hidden` either way, so the failure mode if that ever ' +
      'changed is visible text, not hidden text. `nowrap` is here because a ' +
      'pill that wraps mid-phrase reads as broken chrome; it is holding a ' +
      'shape, not a size.',
  },
]);

function allowed(file: string, rule: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && entry.rule === rule);
}

/** Every `{file, rule}` hit, comment-stripped, allowlist not yet applied. */
function findings(): { file: string; rule: Rule; hits: string[] }[] {
  return renderingSourceFiles().flatMap((file) => {
    const source = stripComments(readAppSource(file));
    return RULES.flatMap((rule) => {
      const hits = source.match(new RegExp(rule.pattern.source, 'g')) ?? [];
      return hits.length > 0 ? [{ file, rule, hits }] : [];
    });
  });
}

describe('no truncation reaches the entrant tier', () => {
  it('scans every rendering source file under app/, found on disk', () => {
    // Non-vacuity: an empty or mis-rooted enumeration would make every
    // assertion below pass by never reading anything.
    const files = renderingSourceFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('root.tsx');
    expect(files).toContain('app.css');
    expect(files).toContain('components/StatusChip.tsx');
    expect(files).toContain('routes/tournament.tsx');
    // Recursive, not one level: the two nested directories prove the walk
    // descends, which is what makes a NEW subdirectory covered by default.
    expect(files.some((f) => f.startsWith('lib/'))).toBe(true);
    expect(files.some((f) => f.startsWith('components/'))).toBe(true);
  });

  it('finds no banned truncation pattern outside the allowlist', () => {
    const violations = findings()
      .filter(({ file, rule }) => !allowed(file, rule.id))
      .map(({ file, rule, hits }) => `${file}: ${rule.id} (${hits.join(', ')}) — ${rule.why}`);

    expect(violations).toEqual([]);
  });

  it('keeps every allowlist entry earning its place', () => {
    // An exception for a line that no longer exists is a licence nobody is
    // using, and the next reader would take it as precedent.
    const stale = ALLOWED.filter(
      (entry) =>
        !findings().some(({ file, rule }) => file === entry.file && rule.id === entry.rule),
    ).map((entry) => `${entry.file}: ${entry.rule}`);

    expect(stale).toEqual([]);
  });

  it('states a reason for every allowlist entry', () => {
    for (const entry of ALLOWED) {
      expect(entry.why.length).toBeGreaterThan(80);
      expect(RULES.map((rule) => rule.id)).toContain(entry.rule);
    }
  });
});
