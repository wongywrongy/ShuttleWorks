/**
 * The ONE navigation-caret treatment (operator/public remediation P2).
 *
 * Eleven links and buttons across Setup, Hub, Overview, Bracket and the draw
 * canvas each carried a literal `→` / `←` inside their label. A text arrow is
 * part of the accessible NAME, so a screen reader read "View matches right
 * arrow"; it also sits on the text baseline at the font's own weight, so no two
 * of those eleven matched in size or gap. The console already ships Phosphor
 * (`ArrowLeft` in the identity bar, `CaretRight` in the meet match panel), so
 * this is a standardisation, not a new icon system.
 *
 * Standard: 14px, `bold` weight, `aria-hidden` (the label already says where
 * the link goes — the icon must not duplicate it), `shrink-0` so it never
 * compresses, and `NAV_LINK_ROW` for the `inline-flex` baseline + 4px gap.
 */
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

/** Wrapper for a link/button whose label is followed (or preceded) by a caret. */
export const NAV_LINK_ROW = 'inline-flex items-center gap-1';

/** Forward navigation ("View matches", "Open workspace", "Next"). */
export function NavCaret() {
  return <CaretRight size={14} weight="bold" aria-hidden="true" className="shrink-0" />;
}

/** Backward navigation ("Draws", "Previous"). */
export function BackCaret() {
  return <CaretLeft size={14} weight="bold" aria-hidden="true" className="shrink-0" />;
}
