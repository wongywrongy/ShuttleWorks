/**
 * Ink contract (WP-06, plan §3 X1/X2): a regression guard over the exact
 * sites remediated for opacity/alpha text-fading (docs/audits/v3-consolidated
 * /maps/05-06-copy-contrast.md Part B1). It is deliberately scoped to those
 * owner files rather than a codebase-wide sweep — dozens of pre-existing
 * `opacity-`/`disabled:opacity-` uses on genuinely DISABLED CONTROLS live
 * outside this remediation (WCAG exempts inactive controls; plan §3 X1's
 * ruling only bans fading of TEXT) and are out of scope for this package;
 * ratcheting the ban wider is a later package's job, per CLAUDE.md's
 * lean-gate philosophy ("gates stay lean so they stay green").
 *
 * Two independent bans, run over each owner file's full source:
 *   1. `text-<token>/<N>` — an alpha-suffixed text-color utility. This is
 *      unambiguous: the slash-alpha form of a `text-*` utility can only ever
 *      fade TEXT (font-size utilities never take a slash argument), so this
 *      ban has no legitimate exception and needs no allowlist.
 *   2. `opacity-<N>` (with or without a `hover:`/`disabled:`/`focus-visible:`/
 *      `group-hover:` variant prefix) — allowed ONLY at the exact call sites
 *      in NON_TEXT_OPACITY below, each commented with why it is not a text
 *      fade (a disabled control's own WCAG-exempt dimming, or a decorative
 *      hover-reveal that is fully opaque in its interactive state).
 *
 * Background/border/ring/shadow alpha (`bg-x/10`, `border-x/40`, `ring-x/30`,
 * …) is NOT banned here — plan §3 X1 explicitly keeps non-text opacity
 * (overlays, scrims, decorative rules, tinted fills) intact.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/console/src/platform/contracts/__tests__ -> repo root is six levels up.
const REPO_ROOT = path.resolve(HERE, '../../../../../..');

/** Every file this package (WP-06) edited to remove text opacity/alpha
 * fading, per the code map's Part B1 table. Paths are repo-root-relative. */
const OWNER_FILES = [
  'apps/console/src/components/ActiveChoice.tsx',
  'apps/console/src/modules/hub/HubPage.tsx',
  'apps/console/src/components/control-plane/MatchStatusFilter.tsx',
  'apps/console/src/components/MatchChip.tsx',
  'apps/console/src/modules/bracket/DrawView.tsx',
  'apps/console/src/modules/operations/run/RunFinished.tsx',
  'apps/console/src/modules/meet/roster/positionGrid/PositionCell.tsx',
  'apps/console/src/modules/display/publicDisplay/CourtsView.tsx',
  'apps/console/src/modules/meet/roster/RosterTab.tsx',
  'apps/console/src/components/control-plane/OverflowMenu.tsx',
  'apps/console/src/modules/bracket/BracketInlineNotice.tsx',
  'apps/console/src/components/control-plane/MatchCard.tsx',
  'packages/design-system/components/Button.tsx',
  'packages/design-system/components/Toast.tsx',
  'apps/entrant/public/assets/person-ref.js',
  'apps/entrant/app/components/PersonRef.tsx',
] as const;

/** The exact `[variant:]opacity-N` utilities kept, and why each is not a
 * text fade. Every entry here must correspond to a real occurrence — the
 * "no stale entries" test below verifies that. */
const NON_TEXT_OPACITY: Record<string, string[]> = {
  // Real `disabled` buttons (not `aria-disabled`) — WCAG's contrast-minimum
  // exempts inactive user-interface components.
  'apps/console/src/modules/bracket/DrawView.tsx': [
    'hover:opacity-90', // bg-primary button fill dims on hover — a background, not text.
    'disabled:opacity-40', // real `disabled` attribute (used twice)
    'disabled:opacity-50', // real `disabled` attribute
  ],
  'apps/console/src/modules/operations/run/RunFinished.tsx': [
    'disabled:opacity-50', // Undo button carries a real `disabled` attribute while updating/locked
  ],
  'apps/console/src/modules/meet/roster/positionGrid/PositionCell.tsx': [
    // Reassign pencil: 0% at rest, 100% on hover/focus-visible — a
    // hover-reveal toggle, not a resting text fade (it is fully opaque
    // whenever it is interactive).
    'opacity-0',
    'focus-visible:opacity-100',
    'group-hover/cell:opacity-100',
  ],
  'apps/console/src/modules/meet/roster/RosterTab.tsx': [
    'disabled:opacity-50', // real `disabled` attribute (repeated across several buttons in this file)
  ],
};

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** Alpha-suffixed text-color utility: `text-<token>/<digits>`. Word-bounded
 * on the left so it never matches inside a longer identifier. */
const TEXT_ALPHA = /\btext-[\w.-]+\/\d+/g;

/** `opacity-<digits>`, optionally preceded by one or more `variant:` prefixes
 * (hover:, disabled:, focus-visible:, group-hover/cell:, …). */
const OPACITY_UTILITY = /(?:[\w-]+(?:\/[\w-]+)?:)*opacity-\d+/g;

describe('ink contract (opacity/alpha text-fading regression guard)', () => {
  it('negative control: the bans actually match seeded violations', () => {
    expect('text-muted-foreground/70'.match(TEXT_ALPHA)).toEqual(['text-muted-foreground/70']);
    expect('disabled:opacity-60'.match(OPACITY_UTILITY)).toEqual(['disabled:opacity-60']);
  });

  it('no owner file fades text with an alpha-suffixed text-color utility', () => {
    const violations = OWNER_FILES.flatMap((relative) => {
      const matches = read(relative).match(TEXT_ALPHA) ?? [];
      return matches.map((m) => `${relative}: ${m}`);
    });
    expect(violations).toEqual([]);
  });

  it('every remaining opacity utility in an owner file is on the allowlist', () => {
    const violations = OWNER_FILES.flatMap((relative) => {
      const found = read(relative).match(OPACITY_UTILITY) ?? [];
      const allowed = new Set(NON_TEXT_OPACITY[relative] ?? []);
      return found.filter((m) => !allowed.has(m)).map((m) => `${relative}: ${m}`);
    });
    expect(violations).toEqual([]);
  });

  it('the allowlist has no stale entries (every entry still occurs in its file)', () => {
    const stale = Object.entries(NON_TEXT_OPACITY).flatMap(([relative, entries]) => {
      const found = new Set(read(relative).match(OPACITY_UTILITY) ?? []);
      return entries.filter((e) => !found.has(e)).map((e) => `${relative}: ${e}`);
    });
    expect(stale).toEqual([]);
  });

  it('Button.tsx replaced disabled:saturate-0 with a token-based treatment', () => {
    const source = read('packages/design-system/components/Button.tsx');
    expect(source).not.toContain('saturate-0');
    expect(source).toContain('disabled:text-muted-foreground');
  });
});
