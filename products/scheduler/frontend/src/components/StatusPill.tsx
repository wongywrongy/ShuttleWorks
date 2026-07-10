/**
 * StatusPill — re-export of the design-system pill.
 *
 * There is ONE pill component (2026-07 cleanup): the app-local copy had
 * drifted into a near-duplicate with its own tone tables, so "Complete"
 * rendered differently in the Hub inspector vs the workspace shell. All
 * tones are token-driven; pick by MEANING (green = success/live only,
 * idle/done = neutral) per DESIGN_COLOR.md.
 */
export { StatusPill, type PillTone } from '@scheduler/design-system/components';
