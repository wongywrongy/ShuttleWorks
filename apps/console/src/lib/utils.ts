/**
 * Base classes applied to every clickable element so click feedback is
 * consistent across the product.
 *
 * - transition-[background-color,color,box-shadow,transform] keeps
 *   changes smooth (Tailwind's default transition-all would animate
 *   layout too and flash on load).
 * - duration-fast lands in the "responsive" window — fast enough to
 *   feel immediate, slow enough for the eye to register the change.
 * - focus-visible:ring-2 gives keyboard users a visible selection ring
 *   without polluting mouse clicks.
 * - active:scale-[0.97] is the single most effective press-feedback
 *   cue; tuned down from 0.95 so chunky primary buttons don't wobble.
 * - disabled:cursor-not-allowed + disabled:opacity-60 signal "can't be
 *   clicked" across every surface identically.
 * - select-none prevents accidental text selection on double-click.
 */
/**
 * The accent (primary) press chrome for hand-rolled buttons that cannot be
 * the shared `Button` yet: the curated one-construction treatment (ADR
 * 0027) — 1px border, the `--shadow-hard` offset, sinks 3px on press. Pair
 * with `bg-accent text-accent-ink`. Composes with INTERACTIVE_BASE.
 */
export const ACCENT_PRESS =
  "border border-action-primary-hover shadow " +
  "transition-[transform,box-shadow,background-color,color,opacity] duration-fast ease-out-quick " +
  "hover:bg-action-primary-hover active:translate-y-[3px] active:shadow-none disabled:shadow-none"

export const INTERACTIVE_BASE =
  "transition-[background-color,color,box-shadow,transform,opacity] duration-fast ease-brand " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-auto " +
  "select-none"

/**
 * The micro-label treatment. Definition moved to the design system
 * (`packages/design-system/components/textStyles.ts`, ADR 0020) so both
 * apps draw one type step; re-exported here so the ~30 console consumers
 * keep their import path. See the definition site for the full rationale.
 */
export { EYEBROW_CLASS } from "@scheduler/design-system/components"

/**
 * The shared text-style ladder — the console's most-repeated className
 * literals, named once so the type scale reads as a system (and maps
 * 1:1 onto Figma text styles). Same rationale as EYEBROW_CLASS: a type
 * step needs one definition, not a convention.
 *
 * TEXT_MUTED_* are the secondary/annotation ladder (xs → sm).
 * TEXT_TITLE / TEXT_TITLE_SM are panel and row headings.
 * TEXT_EMPHASIS is inline emphasis inside muted context.
 *
 * These are the exact strings that were previously hand-copied; adopt
 * them when touching a file, don't reflow whole surfaces for the swap.
 */
/**
 * @deprecated The 2xs (11px) rung was retired below the 12px caption floor
 * (v3 consolidated plan, package 07, ruling R1) — this now equals
 * `TEXT_MUTED_XS` so existing imports keep rendering correctly. Prefer
 * `TEXT_MUTED_XS` directly in new and touched code; this alias is kept only
 * so its remaining call sites (outside this package's scope) don't need a
 * mechanical rename in the same change.
 */
export const TEXT_MUTED_2XS = "text-xs text-muted-foreground"
export const TEXT_MUTED_XS = "text-xs text-muted-foreground"
export const TEXT_MUTED_SM = "text-sm text-muted-foreground"
export const TEXT_TITLE = "text-base font-semibold text-foreground"
export const TEXT_TITLE_SM = "text-sm font-semibold text-foreground"
export const TEXT_EMPHASIS = "font-medium text-foreground"

/**
 * The console panel radius (ADR 0020): the operator tier is SHARP —
 * `rounded-sm` on panels/cards/controls — while the public entrant tier
 * is soft (`rounded-lg`, see `apps/entrant/app/lib/ui.ts` CARD) and the
 * shared DS `Card` stays square (BRAND.md §3). Per-tier by decision, not
 * drift. Adopt opportunistically when touching a file; don't sweep.
 */
export const PANEL_RADIUS = "rounded-sm"

/**
 * The inline (unlabeled) input skin — for bare `<input>`s that live inside
 * a labelled container (a DetailPanel section, a table cell) and carry an
 * `aria-label` instead of a visible `<label>`. The design-system
 * `TextField` owns the labelled form field; it always renders a visible
 * label, so it is the wrong element here. Previously module-local to
 * bracket (`FIELD_INPUT_CLASSES`); promoted so the skin has one owner.
 */
export const INPUT_INLINE_CLASS =
  "w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

/**
 * Variant: same as INTERACTIVE_BASE but omits active:scale for small
 * icon-only buttons where the scale feels too jumpy.
 */
export const INTERACTIVE_BASE_QUIET =
  "transition-[background-color,color,box-shadow,opacity] duration-fast ease-brand " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
  "active:opacity-80 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "select-none"
