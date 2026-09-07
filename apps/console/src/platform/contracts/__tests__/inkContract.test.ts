/**
 * Ink contract (WP-06, plan §3 X1/X2): a codebase-wide ban on text-fading
 * via opacity/alpha utilities (docs/audits/v3-consolidated/maps/05-06-copy
 * -contrast.md Part B1). V3-1/V3-2 tracked this as a curated owner-file
 * allowlist while the backlog of pre-existing `opacity-*` uses was swept
 * file-by-file; that sweep is now complete and this test scans every
 * non-test `.tsx` file under `apps/console/src` instead of a fixed list.
 *
 * Two independent bans, run over every file's full source:
 *   1. `text-<token>/<N>` — an alpha-suffixed text-color utility. This is
 *      unambiguous: the slash-alpha form of a `text-*` utility can only ever
 *      fade TEXT (font-size utilities never take a slash argument), so this
 *      ban has no legitimate exception and needs no allowlist.
 *   2. `opacity-<N>` (with or without a variant prefix) — a text fade UNLESS
 *      it dims something that is not text, or dims text that is genuinely
 *      inert. Two things are auto-exempt by pattern (no per-site listing
 *      needed): any occurrence carrying a `disabled:` or `active:` variant
 *      (a real `disabled` attribute is WCAG-exempt from the contrast
 *      minimum; `active:` is transient press feedback). Everything else that
 *      is legitimately non-text opacity is listed explicitly in
 *      NON_TEXT_OPACITY, each entry commented with which exception category
 *      it is and why (hover-reveal affordance fully opaque when interactive,
 *      drag-state feedback, decorative/solid-button hover feedback, or
 *      whole-subtree stale/inert-state dimming paired with `aria-disabled`).
 *
 * Test files are excluded from the scan (`__tests__` dirs, `*.test.tsx`):
 * the only two that contain literal `opacity-N` text are this file and
 * WorkspaceRow.test.tsx, both of which hold it as a regex/assertion fixture,
 * never as rendered className content.
 *
 * Background/border/ring/shadow alpha (`bg-x/10`, `border-x/40`, `ring-x/30`,
 * …) is NOT banned here — plan §3 X1 explicitly keeps non-text opacity
 * (overlays, scrims, decorative rules, tinted fills) intact.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/console/src/platform/contracts/__tests__ -> repo root is six levels up.
const REPO_ROOT = path.resolve(HERE, '../../../../../..');
const CONSOLE_SRC = path.join(REPO_ROOT, 'apps/console/src');

/** Every non-test `.tsx` file under apps/console/src, repo-root-relative and
 * forward-slashed. `__tests__` directories and `*.test.tsx` files are
 * excluded (see file header). */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Files outside apps/console/src that package 06 remediated and the
 * pre-ratchet allowlist already guarded; kept under the same ban. */
const EXTRA_FILES = [
  'packages/design-system/components/Toast.tsx',
  'apps/entrant/public/assets/person-ref.js',
  'apps/entrant/app/components/PersonRef.tsx',
];

const SOURCE_FILES = [...listSourceFiles(CONSOLE_SRC), ...EXTRA_FILES];

/** The exact `[variant:]opacity-N` utilities kept outside the `disabled:`/
 * `active:` auto-exemption, and why each is not a text fade. Every entry
 * here must correspond to a real occurrence — the "no stale entries" test
 * below verifies that. */
const NON_TEXT_OPACITY: Record<string, string[]> = {
  'apps/console/src/components/ConfirmDeleteButton.tsx': [
    // Exactly one of the blocked/armed/rest states owns the opacity at a
    // time (see the file's own comment on why). Rest is a hover-reveal,
    // fully opaque whenever interactive; armed/blocked are inert-state
    // signals on an icon glyph, not body text.
    'opacity-0',
    'group-hover:opacity-40',
    'opacity-100',
    'focus-visible:opacity-100',
    'group-hover:opacity-100',
  ],
  'apps/console/src/components/ErrorBoundary.tsx': [
    'hover:opacity-90', // solid bg-primary button fill dims on hover — a background, not text.
  ],
  'apps/console/src/modules/bracket/BracketDrawsTab.tsx': [
    'hover:opacity-90', // solid bg-primary button fill dims on hover — a background, not text.
    // Unimplemented-format card: real `disabled` + `aria-disabled` control,
    // whole-card inert dimming (roadmap "Planned" affordance), not a text fade.
    'opacity-40',
  ],
  'apps/console/src/modules/bracket/BracketScoreEntry.tsx': [
    'hover:opacity-90', // solid bg-primary button fill dims on hover — a background, not text.
  ],
  'apps/console/src/modules/bracket/DrawView.tsx': [
    'hover:opacity-90', // bg-primary button fill dims on hover — a background, not text.
  ],
  'apps/console/src/modules/display/bracketDisplay/BracketDisplayPage.tsx': [
    'opacity-60', // whole-subtree stale-data dimming when the poll freshness is 'stale'.
  ],
  'apps/console/src/modules/display/DisplayProduct.tsx': [
    'hover:opacity-90', // solid bg-primary button fill dims on hover — a background, not text.
  ],
  'apps/console/src/modules/display/MeetDisplayPage.tsx': [
    'opacity-60', // whole-subtree stale-data dimming when the poll freshness is 'stale'.
  ],
  'apps/console/src/modules/hub/WorkspaceRow.tsx': [
    // Next-action chevron: 0% at rest, 100% on hover — decorative hover
    // reveal, fully opaque whenever interactive, not a resting text fade.
    'opacity-0',
    'group-hover:opacity-100',
    // Overflow-menu wrapper: quiet (60%) at rest so the row's edit/delete
    // affordance doesn't compete with the name at a glance, full opacity on
    // hover/focus — the control stays in the tab order throughout (keyboard
    // and touch always reach it; only its resting paint dims). Not text.
    'opacity-60',
    'focus-within:opacity-100',
  ],
  'apps/console/src/modules/meet/roster/positionGrid/DraggablePlayerChip.tsx': [
    'opacity-40', // transient drag-state feedback (isDragging) on the chip being dragged, not text.
  ],
  'apps/console/src/modules/meet/roster/positionGrid/GridHeader.tsx': [
    // Rename pencil: 0% at rest, 100% on hover/focus — a hover-reveal toggle,
    // fully opaque whenever it is interactive.
    'opacity-0',
    'focus:opacity-100',
    'group-hover:opacity-100',
  ],
  'apps/console/src/modules/meet/roster/positionGrid/PositionCell.tsx': [
    // Reassign pencil: 0% at rest, 100% on hover/focus-visible — a
    // hover-reveal toggle, not a resting text fade (it is fully opaque
    // whenever it is interactive).
    'opacity-0',
    'focus-visible:opacity-100',
    'group-hover/cell:opacity-100',
  ],
  'apps/console/src/modules/operations/run/RunQueue.tsx': [
    // Row selection toggle: 0% at rest, 100% selected/hover/focus — a
    // hover-reveal affordance, fully opaque whenever interactive.
    'opacity-0',
    'opacity-100',
    'focus-visible:opacity-100',
    'group-hover:opacity-100',
    'group-focus-within:opacity-100',
  ],
  'apps/console/src/modules/operations/run/ScoreEditor.tsx': [
    // Whole-row dimming for a set beyond the already-decided match outcome;
    // both score inputs in the row carry a real `disabled` attribute. Not text.
    'opacity-40',
  ],
  'apps/console/src/modules/workspace/displayConfig/DisplayLayoutEditor.tsx': [
    'opacity-50', // aria-disabled dependent-control section dimming (grid-columns row), not text.
  ],
  'apps/console/src/platform/engine-config/EngineConfigForm.tsx': [
    'opacity-50', // aria-disabled dependent-control section dimming (utilization weight), not text.
  ],
  'apps/console/src/platform/engine-config/ScoringFields.tsx': [
    'opacity-50', // aria-disabled dependent-control section dimming (sets-only fields), not text.
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

/** A `disabled:` or `active:` variant anywhere in the chain auto-exempts the
 * match: a real `disabled` attribute is WCAG-exempt from the contrast
 * minimum, and `active:` is transient press feedback. Neither needs a
 * per-site listing. */
const AUTO_EXEMPT = /(^|:)(disabled|active):/;

describe('ink contract (opacity/alpha text-fading regression guard)', () => {
  it('negative control: the bans actually match seeded violations', () => {
    expect('text-muted-foreground/70'.match(TEXT_ALPHA)).toEqual(['text-muted-foreground/70']);
    expect('disabled:opacity-60'.match(OPACITY_UTILITY)).toEqual(['disabled:opacity-60']);
  });

  it('the source-file scan is non-trivial (sanity check on the walker)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(100);
  });

  it('no console source file fades text with an alpha-suffixed text-color utility', () => {
    const violations = SOURCE_FILES.flatMap((relative) => {
      const matches = read(relative).match(TEXT_ALPHA) ?? [];
      return matches.map((m) => `${relative}: ${m}`);
    });
    expect(violations).toEqual([]);
  });

  it('every remaining opacity utility is disabled/active, or on the allowlist', () => {
    const violations = SOURCE_FILES.flatMap((relative) => {
      const found = read(relative).match(OPACITY_UTILITY) ?? [];
      const allowed = new Set(NON_TEXT_OPACITY[relative] ?? []);
      return found
        .filter((m) => !AUTO_EXEMPT.test(m) && !allowed.has(m))
        .map((m) => `${relative}: ${m}`);
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

  it('the allowlist has no unknown files (every key is a real, scanned file)', () => {
    const known = new Set(SOURCE_FILES);
    const unknown = Object.keys(NON_TEXT_OPACITY).filter((f) => !known.has(f));
    expect(unknown).toEqual([]);
  });

  it('Button.tsx replaced disabled:saturate-0 with a token-based treatment', () => {
    const source = readFileSync(
      path.join(REPO_ROOT, 'packages/design-system/components/Button.tsx'),
      'utf8',
    );
    expect(source).not.toContain('saturate-0');
    expect(source).toContain('disabled:text-muted-foreground');
  });
});
