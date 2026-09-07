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

/** The small-caps group heading (draw rounds, schedule time groups, player sections). */
export const EYEBROW = 'text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground';

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

/** The secondary (outline) button for native-form wizards. */
export const BUTTON_SECONDARY =
  'inline-flex min-h-10 items-center justify-center rounded-md border border-rule-control px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-sunken';

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
