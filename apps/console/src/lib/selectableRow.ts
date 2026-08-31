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
 * tabbable, and `aria-pressed` announces selection. Pointer and keyboard
 * events that originate in a nested control stay with that control, so a row's
 * own menu, delete button, score input, or select cannot also activate the row.
 *
 * Spread it onto the row and add SELECTABLE_ROW_FOCUS to the row's className so
 * the focus ring is visible where the click target actually is.
 */
import type { KeyboardEvent, MouseEvent } from "react";

/** Inset ring — rows are flush with their container, so an outset ring clips. */
export const SELECTABLE_ROW_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export interface SelectableRowProps {
  role: "button";
  tabIndex: 0;
  "aria-pressed": boolean;
  onClick: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

const NESTED_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
].join(",");

/** A row click belongs to the row unless it started inside a nested control.
 * Keeping this here means adding a link, checkbox, menu, or form field to any
 * shared row cannot silently turn one pointer action into two actions. */
function startedInNestedControl(event: MouseEvent): boolean {
  const target = event.target;
  const current = event.currentTarget;
  if (!(target instanceof Element) || !(current instanceof Element))
    return false;
  if (target === current) return false;
  const control = target.closest(NESTED_INTERACTIVE_SELECTOR);
  return control !== null && control !== current && current.contains(control);
}

export function selectableRowProps(
  onSelect: () => void,
  selected = false,
): SelectableRowProps {
  return {
    role: "button",
    tabIndex: 0,
    "aria-pressed": selected,
    onClick: (event: MouseEvent) => {
      if (startedInNestedControl(event)) return;
      onSelect();
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // A nested control owns its own keys.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onSelect();
    },
  };
}
