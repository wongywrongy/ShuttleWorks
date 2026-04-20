import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Base classes applied to every clickable element so click feedback is
 * consistent across the product.
 *
 * - transition-[background-color,color,box-shadow,transform] keeps
 *   changes smooth (Tailwind's default transition-all would animate
 *   layout too and flash on load).
 * - duration-150 lands in the "responsive" window — fast enough to
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
  "transition-[background-color,color,box-shadow,transform,opacity] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-auto " +
  "select-none"

/**
 * Variant: same as INTERACTIVE_BASE but omits active:scale for small
 * icon-only buttons where the scale feels too jumpy.
 */
export const INTERACTIVE_BASE_QUIET =
  "transition-[background-color,color,box-shadow,opacity] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
  "active:opacity-80 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "select-none"
