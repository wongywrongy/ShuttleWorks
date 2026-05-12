/**
 * WorkflowPanel shared styles — button base + traffic-light → chrome
 * lookup tables. Constants only; no runtime logic.
 *
 * Traffic-light semantic mapping (per BRAND.md §1.10 — routed through
 * --status-* tokens so dark-mode tinting + scheduler-tournament parity
 * come for free):
 *   green  → status-live    (ready — match can be called)
 *   yellow → status-warning (resting — soft warning, still callable)
 *   red    → status-blocked (blocked — hard rule conflict)
 */
import { INTERACTIVE_BASE } from '../../../lib/utils';

// Shared button base used by every action pill on the match card:
// transition + focus-visible ring + active scale + disabled not-allowed.
// Kept terse so it composes cleanly with each action's colour classes.
export const ACTION_BTN = `${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium`;

// Traffic-light → row chrome lookup. Replaces three separate triple
// ternaries (border / background / dot) with one map per state. Routed
// through --status-* tokens — both saturated states use their tinted
// background variants at 40% so the row reads as a subtle wash rather
// than a loud fill.
export const LIGHT_STYLES = {
  green:  { border: 'border-l-status-live',    bg: 'bg-card',                  dot: 'bg-status-live'    },
  yellow: { border: 'border-l-status-warning', bg: 'bg-status-warning-bg/40',  dot: 'bg-status-warning' },
  red:    { border: 'border-l-status-blocked', bg: 'bg-status-blocked-bg/40',  dot: 'bg-status-blocked' },
} as const;

// Traffic-light → Call-button background.
// - green keeps the canonical "primary action" treatment (Call is the
//   #1 director action on a ready match).
// - yellow uses --status-warning saturated bg with substrate text so
//   the operator sees the soft warning before committing.
// - red is the disabled treatment (--muted + opacity).
export const CALL_BTN_BG = {
  green:  'bg-primary text-primary-foreground hover:brightness-110',
  yellow: 'bg-status-warning text-bg-elev hover:opacity-90',
  red:    'bg-muted text-muted-foreground opacity-60',
} as const;
