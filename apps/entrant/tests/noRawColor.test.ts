/**
 * No raw colour literal reaches the entrant tier.
 *
 * Every colour on this tier resolves through `packages/design-system/tokens.css`
 * — the apps import it, the Tailwind preset maps it, and nothing under `app/`
 * declares a colour of its own (`app.css` names exactly two, `--border-control`
 * and `--action-primary`, both through `var()`). This scan keeps it that way.
 *
 * A hex literal is invisible to every other test in this directory: it renders,
 * it contrasts acceptably in light mode, and no DOM assertion can tell a token
 * from a hardcoded twin of it. It only surfaces the day the token moves and one
 * surface does not follow — which is exactly the day nobody is looking.
 *
 * Scoped to this tier deliberately. The operator console carries genuine hex
 * literals in the public-display presets and the school-accent map (venue-board
 * colours chosen per school, not per theme); ruling on those belongs to
 * SP-CONSOLE-6, and is logged as debt rather than pre-judged here. See ADR 0026.
 *
 * `hsl(var(--token))` is the legal shape and is not matched: the scan looks for
 * literal hex only, which is the form a copied mockup or a devtools sample
 * arrives in.
 */
import { describe, expect, it } from 'vitest';

import { readAppSource, renderingSourceFiles, stripComments } from './helpers/sourceGuards';

/**
 * A `#` followed by exactly 3, 4, 6 or 8 hex digits and nothing wordlike after.
 *
 * The lengths are enumerated rather than expressed as a range so that a
 * fragment-only href (`#calendar`, `#results`) cannot match a prefix of itself:
 * `#cal` fails the trailing boundary because `e` follows it.
 */
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

/**
 * Deliberate exceptions. EMPTY on purpose, the same shape
 * `noEmDash.test.ts` and `noTruncation.test.ts` carry — a place for a genuine
 * one to earn its place, not a place to park a violation.
 */
const ALLOWED: readonly { file: string; why: string }[] = Object.freeze([]);

function allowed(file: string): boolean {
  return ALLOWED.some((entry) => entry.file === file);
}

function findings(): { file: string; hits: string[] }[] {
  return renderingSourceFiles().flatMap((file) => {
    const hits = stripComments(readAppSource(file)).match(HEX) ?? [];
    return hits.length > 0 ? [{ file, hits }] : [];
  });
}

describe('no raw colour literal reaches the entrant tier', () => {
  it('scans every rendering source file under app/, found on disk', () => {
    // Non-vacuity: an empty or mis-rooted enumeration would make the assertion
    // below pass by never reading anything.
    const files = renderingSourceFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('app.css');
    expect(files).toContain('components/PersonRef.tsx');
  });

  it('finds no hex colour outside the allowlist', () => {
    const violations = findings()
      .filter(({ file }) => !allowed(file))
      .map(({ file, hits }) => `${file}: ${hits.join(', ')} - use a design-system token`);

    expect(violations).toEqual([]);
  });

  it('would catch one if it landed', () => {
    // The negative control. Without it, a pattern that matches nothing at all
    // passes the assertion above for the wrong reason, forever.
    const planted = "const brand = '#1d4ed8';\nconst short = '#abc';\n";
    expect(planted.match(HEX)).toEqual(['#1d4ed8', '#abc']);
  });

  it('does not mistake a URL fragment for a colour', () => {
    // `#calendar` is the season calendar's own anchor, on the live NowStrip.
    expect("href=\"#calendar\"\nhref=\"#results\"".match(HEX)).toBeNull();
  });

  it('keeps every allowlist entry earning its place', () => {
    const stale = ALLOWED.filter(
      (entry) => !findings().some(({ file }) => file === entry.file),
    ).map((entry) => entry.file);

    expect(stale).toEqual([]);
  });
});
