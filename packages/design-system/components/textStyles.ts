/**
 * textStyles — cross-app type-treatment strings (ADR 0020).
 *
 * This file must stay under `components/` (not `lib/`): both apps'
 * Tailwind content globs scan only `packages/design-system/components/**`,
 * so class literals defined elsewhere would silently emit nothing.
 */

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
 * In the console, prefer the `Eyebrow` component for a plain muted label —
 * it is this constant plus the tone. Reach for the constant directly when
 * the element has to be something other than a `<span>` (a `<th>`, an
 * `<h3>`, a `<td>` group row) or when the colour is state-derived.
 * (Console code keeps importing it from `lib/utils`, which re-exports this.)
 */
export const EYEBROW_CLASS = 'text-2xs font-semibold uppercase tracking-[0.08em]';
