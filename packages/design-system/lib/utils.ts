import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine Tailwind classes with deduplication.
 *
 * Wraps `clsx` (conditional joining) with `twMerge` (Tailwind-aware
 * deduplication — `px-2 px-4` collapses to `px-4`). Every component in
 * this package and in both products should use this to compose className
 * props. Direct string concatenation breaks the dedup pass and
 * accumulates dead classes over time.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Base classes applied to every interactive (clickable) element so press
 * feedback is consistent across the product.
 *
 * Use as the FIRST class on any custom button/link element that doesn't
 * already inherit from `<Button>`:
 *
 *   <button className={`${INTERACTIVE_BASE} ${myStyles}`}>
 *
 * - `transition-[background-color,color,box-shadow,transform,opacity]`
 *   keeps only the actually-animated properties; Tailwind's default
 *   `transition-all` animates layout too and flashes on initial load.
 * - `duration-150` lands in the "responsive" window — fast enough to
 *   feel immediate, slow enough for the eye to register the change.
 * - `focus-visible:ring-2 ring-ring` (NOT `ring-accent` — see DESIGN.md
 *   §1.11) gives a brand-orange focus ring on keyboard nav without
 *   polluting mouse clicks.
 * - `active:scale-[0.97]` is the most effective press-feedback cue.
 *   Tuned from 0.95 so chunky buttons don't wobble.
 * - `disabled:` set communicates "can't be clicked" identically.
 * - `select-none` prevents accidental text selection on double-click.
 */
export const INTERACTIVE_BASE =
  'transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-brand ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'active:scale-[0.97] ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-auto ' +
  'select-none';

/**
 * Variant: same as INTERACTIVE_BASE but omits `active:scale` for small
 * icon-only buttons where the scale feels too jumpy.
 */
export const INTERACTIVE_BASE_QUIET =
  'transition-[background-color,color,box-shadow,opacity] duration-150 ease-brand ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'active:opacity-80 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'select-none';

/**
 * Spreadsheet-cell input chrome: borderless until focus, then highlights
 * with the system ring token + card fill. Used by inline roster +
 * matches editors. Append cell-specific classes after this constant.
 */
export const INPUT_CELL_STYLE =
  'w-full rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-ring focus:bg-card';
