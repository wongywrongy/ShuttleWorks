/**
 * Discipline code → full display name (e.g. 'MS' → "Men's Singles").
 *
 * Shared, styling-free source of the five discipline names so surfaces
 * that only need the name (e.g. the bracket labels) don't have to reach
 * into meet's PositionGrid EVENT_LABEL, which also carries per-event
 * color styling. Unknown codes have no entry — callers fall back to the
 * raw code.
 *
 * Null-prototype map on purpose: a plain object literal would inherit
 * `Object.prototype` keys, so `DISCIPLINE_NAMES['toString']` would return
 * a function instead of `undefined`, and a `?? code` fallback at a call
 * site would then leak that function. With a null prototype, lookups of
 * any non-own key (including `toString`/`constructor`/etc.) yield
 * `undefined`, preserving the "unknown → raw code" contract for all input.
 */
export const DISCIPLINE_NAMES: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    MS: "Men's Singles",
    WS: "Women's Singles",
    MD: "Men's Doubles",
    WD: "Women's Doubles",
    XD: 'Mixed Doubles',
  },
);
