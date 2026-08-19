/**
 * selectableRowProps — the one definition of "a row you can click IS a row you
 * can operate from the keyboard".
 *
 * The interaction audit (G1) found the same defect on six surfaces: a `<li>` or
 * `<div>` carrying `cursor-pointer` + `onClick` and nothing else. That renders
 * as a control to a mouse and as inert text to everything else — a keyboard
 * user could not select a match on the live-day Run surface at all.
 *
 * `BandedTable` was fixed inline first (covering Matches + both rosters); this
 * lifts that fix out so RunQueue / UnifiedOpsList / LiveMatchList / the workflow
 * cards share it rather than growing a fourth and fifth copy that drift.
 *
 * The contract mirrors a native button: Enter and Space activate, the row is
 * tabbable, and `aria-pressed` announces selection. Keys are ignored when they
 * originate from a nested control (`e.target !== e.currentTarget`) so a row's
 * own delete ×, score input or select keeps its keys — pressing Space in a
 * nested input must type a space, not select the row.
 *
 * Spread it onto the row and add SELECTABLE_ROW_FOCUS to the row's className so
 * the focus ring is visible where the click target actually is.
 */
import type { KeyboardEvent } from 'react';

/** Inset ring — rows are flush with their container, so an outset ring clips. */
export const SELECTABLE_ROW_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

export interface SelectableRowProps {
  role: 'button';
  tabIndex: 0;
  'aria-pressed': boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

export function selectableRowProps(
  onSelect: () => void,
  selected = false,
): SelectableRowProps {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selected,
    onClick: onSelect,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // A nested control owns its own keys.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onSelect();
    },
  };
}
