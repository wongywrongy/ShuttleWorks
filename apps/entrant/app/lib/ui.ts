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
 */

/** The raw card surface pair — border tint + raised background. */
export const CARD_SKIN = 'border-rule-soft bg-surface-raised';

/**
 * The standard entrant card: raised panel, rounded, padded, soft shadow.
 * `rounded-lg` is the DELIBERATE public-tier radius (ADR 0020): the
 * consumer register is soft, the operator console is sharp
 * (`rounded-sm`), and the shared DS `Card` stays square (BRAND.md §3).
 */
export const CARD = `rounded-lg border ${CARD_SKIN} p-6 shadow-sm`;

/**
 * The text-input / textarea skin (control border + elevated ground).
 * Radius and padding vary by call site today (rounded vs rounded-sm) —
 * a recorded inconsistency, deliberately not normalized in the
 * consolidation pass; compose them inline.
 */
export const INPUT_SKIN = 'border border-rule-control bg-bg-elev text-sm text-foreground';

/** The native-select filter control (schedule filter bar). */
export const SELECT_CONTROL =
  'min-h-10 rounded-md border border-rule-control bg-surface-raised px-3 text-sm font-normal';

/** The secondary (outline) button for native-form wizards. */
export const BUTTON_SECONDARY =
  'inline-flex min-h-10 items-center justify-center rounded-md border border-rule-control px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-sunken';
