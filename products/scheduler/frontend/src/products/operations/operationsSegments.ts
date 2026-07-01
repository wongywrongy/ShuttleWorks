/**
 * The Operations IA segments, split by surface.
 *
 * These are the EXISTING per-engine Courts/Live segments — the same ones
 * `operationsContract.ownedSegments` declares. The unified (both-engines)
 * Operations surface reuses them rather than minting new ids, so the
 * sidebar nav model and the module-contract ownership invariant stay
 * exactly as shipped; only the rendered surface changes (single engine →
 * its own view; both engines → the unified hybrid view).
 */
import type { AppTab } from '../../store/uiStore';

/** "Courts" (schedule overview) segments, per engine. */
const COURTS_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'schedule',
  'bracket-schedule',
]);

/** "Live" (operator) segments, per engine. */
const LIVE_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'live',
  'bracket-live',
]);

/** Every Operations segment (Courts + Live, both engines). */
const OPERATIONS_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  ...COURTS_SEGMENTS,
  ...LIVE_SEGMENTS,
]);

export function isOperationsSegment(tab: AppTab): boolean {
  return OPERATIONS_SEGMENTS.has(tab);
}

export function isLiveSegment(tab: AppTab): boolean {
  return LIVE_SEGMENTS.has(tab);
}
