/**
 * V3-PE04.1: the canonical public event-discipline labels — ONE map, used by
 * every list, legend, filter and draw heading the public tier renders.
 *
 * Before this, "Mens Singles"/"Mens Doubles"/"Womens Singles"/"Womens
 * Doubles" (no apostrophe, inconsistent case) rode next to individual draw
 * titles that DID carry apostrophes — the same tournament naming its own
 * events two ways depending which panel a reader was on. This is now the
 * single source; a component picks a public name by CODE (`MS`/`WS`/`MD`/
 * `WD`/`XD`), never by re-deriving one from a freeform `discipline` string.
 *
 * Deliberately its own file rather than a `draws.types.ts` addition: that
 * module is a generated-shape mirror owned by a concurrent work package, and
 * this vocabulary is display-only. `draw.tsx`'s own heading should adopt
 * `eventLabel` here in a follow-up (see the v3-consolidated report for
 * package 21) so the two-letter code stops being the only shared key.
 */
import { eventCodeLabel } from './draws.types';

export const EVENT_LABEL_MAP: Readonly<Record<string, string>> = Object.freeze({
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: 'Mixed doubles',
});

/**
 * The canonical public label for an event code. Normalizes through
 * `eventCodeLabel` first (storage slugs like `T027-MS` or `mens_singles`
 * reduce to `MS`), so a known standard event reads identically everywhere
 * regardless of how the source data spelled it. An unrecognised code falls
 * back to its normalized form — never invented prose.
 */
export function eventLabel(code: string): string {
  const normalized = eventCodeLabel(code);
  return EVENT_LABEL_MAP[normalized] ?? normalized;
}

/** True when `code` names one of the five standard disciplines this map
 * covers — the signal a caller uses to prefer the canonical label over a
 * freeform, organizer-authored discipline string. */
export function isStandardEventCode(code: string): boolean {
  return eventCodeLabel(code) in EVENT_LABEL_MAP;
}
