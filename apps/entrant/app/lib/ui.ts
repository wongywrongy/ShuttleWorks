/**
 * Shared class-string vocabulary for the entrant tier.
 *
 * The entrant tier renders complete native HTML with no hydration, so its
 * "primitives" are class constants, not interactive components. These are
 * the exact strings that were previously hand-copied across routes (the
 * card skin alone appeared 36 times in 18 files); one definition keeps the
 * skin editable in one place and maps 1:1 onto a Figma component.
 *
 * NOTE: this file is inside the Tailwind content glob (`./app/**`), so
 * classes that appear only here are still emitted. Keep the strings
 * byte-identical when refactoring call sites — several entrant tests
 * assert on the rendered tokens (`border-rule-soft bg-surface-raised`).
 *
 * The page-scoped scripts under `public/assets/` cannot import this module
 * (they are plain browser ES modules); the strings they need are inlined
 * there and `tests/uiTwins.test.ts` pins the copies equal.
 */

import { EYEBROW_CLASS } from '@scheduler/design-system/components';

/**
 * Re-exported so the tier reaches ONE eyebrow through the module it already
 * reaches every other shared string through. The literal itself stays in
 * `packages/design-system/components/textStyles.ts`, which both apps'
 * Tailwind content globs scan, so the classes are still emitted.
 */
export { EYEBROW_CLASS };

/** The raw card surface pair — border tint + raised background. */
export const CARD_SKIN = 'border-rule-soft bg-surface-raised';

/**
 * The standard entrant card: raised panel, rounded, padded.
 * `rounded-lg` is the DELIBERATE public-tier radius (ADR 0020): the
 * consumer register is soft, the operator console is sharp
 * (`rounded-sm`), and the shared DS `Card` stays square (BRAND.md §3).
 */
export const CARD = `rounded-lg border ${CARD_SKIN} p-4 md:p-6`;

/**
 * The same card with NO inset (ADR 0028): its children are padded rows or
 * bands, so a list, a table-like panel or a header/body/footer card sits
 * flush to the border. Pair with `LIST_CARD_ROW`.
 */
export const LIST_CARD = `rounded-lg border ${CARD_SKIN}`;

/** One label/value row inside a `LIST_CARD`; rows separate with their own top rule. */
export const LIST_CARD_ROW =
  'flex items-baseline justify-between gap-4 border-t border-rule-soft px-4 py-3 text-sm';

/**
 * Page and section display headings (ADR 0028). `type-display` (design-system
 * globals) sets Archivo, the 84% width axis and weight 650 together; the
 * tracking here is the public register's. Do NOT add `font-*` or
 * `tracking-tight` utilities beside it — they override the role.
 */
export const PAGE_TITLE = 'type-display text-page tracking-[-0.025em] text-foreground';
export const SECTION_TITLE = 'text-section tracking-[-0.015em] text-foreground';

/**
 * The small-caps group heading (draw rounds, schedule time groups, player
 * sections).
 *
 * `EYEBROW_CLASS` is THE eyebrow — 12px / 600 / 0.06em, one definition for
 * both tiers — and this is it plus the public register's ink. The old
 * spelling here said `font-bold` (700), so the same role rendered at two
 * weights depending on which file you were reading, and the string was hand
 * copied 17 more times across nine entrant files with three different
 * weights between them (A-4/A-5/A-6).
 */
export const EYEBROW = `${EYEBROW_CLASS} text-muted-foreground`;

/**
 * A rectangular chip (ADR 0027: nothing fully round, no dot). Tone is
 * composed at the call site from the design system's `STATUS_TONE`.
 */
export const CHIP =
  'inline-flex h-badge items-center rounded-xs border px-2.5 text-xs font-medium leading-none';

/**
 * The text-input / textarea skin (control border + elevated ground).
 * Radius and padding vary by call site today (rounded vs rounded-sm) —
 * a recorded inconsistency, deliberately not normalized in the
 * consolidation pass; compose them inline.
 */
export const INPUT_SKIN = 'border border-rule-control bg-bg-elev text-sm text-foreground';

/** The 40px form control of the entrant site (input or select). */
export const FIELD_INPUT =
  'h-10 w-full min-w-0 rounded-sm border border-rule-control bg-surface-raised px-3 text-sm text-foreground';

/** The label above a `FIELD_INPUT`; equals the design system `TextField` label. */
export const FIELD_LABEL = 'mb-2 block text-xs font-medium text-foreground';

/** The native-select filter control (schedule filter bar). */
export const SELECT_CONTROL = `${FIELD_INPUT} font-normal`;

/**
 * The two hand-rolled button strings, and the one construction they share
 * with the design system's `Button` (A-9, A-13).
 *
 * `Button` is a React component, so the page-scoped scripts under
 * `public/assets/` cannot be it and the SSR wizard's controls sit inside
 * markup that a component boundary would fragment. What they CAN be is the
 * same string: `buttonVariants`' base chrome, spelled here verbatim —
 * `transition-colors duration-fast ease-out-quick`, the focus ring on
 * `ring-focus` with its offset, `select-none`, and the disabled set. Before
 * this they carried a hover rule and nothing else, so a keyboard user got no
 * focus ring on the wizard's Continue and Back controls at all.
 *
 * Press is colour, not movement: `Button`'s own comment — "No routine
 * elevation or moving hit targets" — is the rule these follow, so there is
 * deliberately no transform here and none in `Button`.
 *
 * RADIUS BY HEIGHT (ADR 0027, `tokens.css`): both are `rounded` (8px)
 * because both are 40-44px controls. `rounded-md` (9px) belongs to the 44px
 * `lg` size alone, and these wore it by copy rather than by rule.
 *
 * ONE deliberate divergence from `Button`: no `whitespace-nowrap`. This
 * tier's no-truncation contract (`tests/noTruncation.test.ts`) forbids it
 * outright, because a long label on a 390px screen has to wrap rather than
 * run off the edge.
 *
 * Kept as FLAT single-quoted literals, not composed from a shared fragment:
 * `tests/a11yContracts.test.ts` reads `BUTTON_SECONDARY`'s literal out of
 * this file to measure its height, and `tests/uiTwins.test.ts` reads both to
 * pin the `public/assets/` copies byte-identical.
 */
export const BUTTON_PRIMARY =
  'inline-flex h-11 select-none items-center justify-center rounded border border-action-primary-hover bg-accent px-3.5 text-sm font-semibold leading-none tracking-[0.01em] text-accent-ink shadow transition-colors duration-fast ease-out-quick ring-offset-surface-base hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground';

/**
 * The destructive commit (B-18): `Button variant="destructive"` at the
 * default size, as a string the page-scoped scripts can carry.
 *
 * Withdrawing an entry is the most destructive thing a public visitor can
 * do on this product, and it was a 12px underlined link — the same shape as
 * "Keep it" beside it and as every navigation on the page. A destructive
 * commit is allowed to look like one.
 */
export const BUTTON_DESTRUCTIVE =
  'inline-flex h-10 select-none items-center justify-center rounded border border-destructive bg-destructive px-3.5 text-sm font-semibold leading-none tracking-[0.01em] text-destructive-foreground transition-colors duration-fast ease-out-quick ring-offset-surface-base hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground';

/** The secondary (outline) button for native-form wizards. */
export const BUTTON_SECONDARY =
  'inline-flex min-h-10 select-none items-center justify-center rounded border border-rule-control px-4 py-2 text-sm font-semibold tracking-[0.01em] text-foreground transition-colors duration-fast ease-out-quick ring-offset-surface-base hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground';

/**
 * The one separator per context (v3 consolidated plan, package 28): a middot
 * for inline metadata (event/round/court facts, "Updated · 5 min ago"),
 * never a slash, bullet, or em dash. Already the established convention
 * across the entrant tier (`EventRow.tsx`, `MatchCard.tsx`, `NowStrip.tsx`,
 * `SeasonCalendar.tsx`, `tournament.tsx`, `draw.tsx`, `schedule.tsx`,
 * `player.tsx`); named here so new call sites reach for the constant
 * instead of retyping the literal. A stacked doubles pair's "/" join is a
 * different concern owned by `lib/side.ts`, not this constant.
 */
export const INLINE_METADATA_SEPARATOR = ' · ';

/**
 * The three action registers (public-visual-fixes P7).
 *
 * Every public control resolves to exactly one of these, so a reader learns
 * the grammar once: a `Button` in the design system's `brand`/`lg` shape is
 * the ONE primary commit on a page (the hero's "Enter this tournament", the
 * entry form's submits); `ACTION_SECONDARY` is a bordered, non-committing
 * control (Print, Download); `ACTION_LINK` is a navigation link that reads
 * as one. Before P7 the tier had five bespoke copies of the middle two and
 * four spellings of the third, several of which grew a decorative trailing
 * arrow that said nothing the underline had not already said.
 *
 * `ACTION_SECONDARY` is `BUTTON_SECONDARY` under the name the register uses;
 * the old name stays because `tests/a11yContracts.test.ts` reads it out of
 * this file by name for the 24px target-size floor.
 */
export const ACTION_SECONDARY = BUTTON_SECONDARY;

/** The text action WITHOUT its ink, for the two call sites that carry a
 * status tone instead of the accent (a live tournament's "Follow live"). */
export const ACTION_LINK_BASE =
  'text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** The standard text action: accent ink, underlined on hover, visibly focused. */
export const ACTION_LINK = `${ACTION_LINK_BASE} text-accent`;

/** The same link one register down — a subordinate move (Clear, Previous). */
export const ACTION_LINK_MUTED =
  'text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * The compact search box's shell and its input (P7). A public search field
 * is an icon, a field and an invisible submit — never a visible "Find" or
 * "Apply" button beside it, and never a visible label repeating the
 * placeholder. The label itself is REAL and stays in the document
 * (`sr-only`), because a placeholder disappears the moment someone types.
 */
export const SEARCH_SHELL =
  'flex h-10 min-w-0 items-stretch rounded-sm border border-rule-control bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent';
export const SEARCH_INPUT =
  'h-full w-full min-w-0 border-0 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground';

/**
 * The four TEXT ROLES (operator/public remediation P2).
 *
 * The design system already owns the ink (`--text-primary` /
 * `--text-secondary` / `--text-muted`); what did not exist was a rule for
 * WHICH ink a given string gets. "It sits in a card footer" and "it is
 * furniture" had collapsed into one muted register, so the match reference,
 * the court and the start time — the three facts a spectator reads a card
 * FOR — rendered at the same weight as a caption.
 *
 *   TEXT_PRIMARY    the thing itself: names, headings, scores.
 *   TEXT_SECONDARY  information a reader ACTS ON that is not the thing
 *                   itself: match reference, court, time, round, event.
 *                   Subordinate in size and position, NOT in ink.
 *   TEXT_HELPER     furniture: captions, hints, counts, units, seeds.
 *   TEXT_DISABLED   an INOPERABLE CONTROL, and nothing else. A losing side,
 *                   a bye and an unresolved slot are settled facts, not dead
 *                   buttons — styling them this way is the defect P2 fixes.
 *
 * Every ink clears 4.5:1 on every public surface in both themes (measured
 * from `tokens.css`; muted is 5.28:1 at worst in light, 4.79:1 in dark), so
 * the defect is hierarchy rather than contrast and the fix is choosing the
 * right role, not darkening everything.
 */
export const TEXT_PRIMARY = 'text-foreground';
export const TEXT_SECONDARY = 'text-text-secondary';
export const TEXT_HELPER = 'text-muted-foreground';
export const TEXT_DISABLED = 'text-muted-foreground opacity-60';
