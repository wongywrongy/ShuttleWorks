/**
 * WorkflowPanel shared styles — button base + traffic-light → chrome
 * lookup tables. Constants only; no runtime logic.
 *
 * NOTE: LIGHT_STYLES + CALL_BTN_BG still use raw Tailwind palette
 * colors (border-l-green-500, bg-yellow-50, etc.) — BRAND.md §1.10
 * anti-pattern. A follow-up pass should route these through
 * --status-* tokens (live/warning/blocked) so dark mode tinting +
 * scheduler-tournament parity come for free.
 */
import { INTERACTIVE_BASE } from '../../../lib/utils';

// Shared button base used by every action pill on the match card:
// transition + focus-visible ring + active scale + disabled not-allowed.
// Kept terse so it composes cleanly with each action's colour classes.
export const ACTION_BTN = `${INTERACTIVE_BASE} inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium`;

// Traffic-light → row chrome lookup. Replaces three separate triple
// ternaries (border / background / dot) with one map per state.
export const LIGHT_STYLES = {
  green:  { border: 'border-l-green-500',  bg: 'bg-card',                            dot: 'bg-green-500'  },
  yellow: { border: 'border-l-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-500/10', dot: 'bg-yellow-500' },
  red:    { border: 'border-l-red-500',    bg: 'bg-red-50 dark:bg-red-500/10',       dot: 'bg-red-500'    },
} as const;

// Traffic-light → Call-button background. Disabled-look (red)
// keeps the same opacity treatment as the rest of the disabled state.
export const CALL_BTN_BG = {
  green:  'bg-primary text-primary-foreground hover:brightness-110',
  yellow: 'bg-amber-500 text-white hover:bg-amber-600',
  red:    'bg-muted text-muted-foreground opacity-60',
} as const;
