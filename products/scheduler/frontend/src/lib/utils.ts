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
export const INTERACTIVE_BASE =
  "transition-[background-color,color,box-shadow,transform,opacity] duration-fast ease-brand " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-auto " +
  "select-none"

/**
 * The micro-label treatment: 10px, semibold, uppercase, wide tracking.
 *
 * COLOUR IS NOT INCLUDED — append your own (`text-muted-foreground` for a
 * plain label, a status token for a state pill). That separation is what
 * lets one constant own every use of this type step without also deciding
 * what each one means.
 *
 * It exists because the string was hand-copied ~56 times. When the design
 * review reweighted section headings, the fix reached only the surfaces that
 * imported a component; Bracket and Display kept the old treatment and
 * looked untouched. A shared type step needs one definition, not a
 * convention.
 *
 * For a plain muted label, prefer the `Eyebrow` component — it is this
 * constant plus the tone. Reach for the constant directly when the element
 * has to be something other than a `<span>` (a `<th>`, an `<h3>`, a `<td>`
 * group row) or when the colour is state-derived.
 */
export const EYEBROW_CLASS =
  "text-2xs font-semibold uppercase tracking-[0.08em]"

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
