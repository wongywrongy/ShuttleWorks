/**
 * V3-PE04.1: the console's copy of the approved event/discipline labels —
 * sentence case, with the possessive apostrophe ("Men's singles"), never
 * "Mens Singles" or the Title-Case "Men's Singles" already used elsewhere
 * for operator-facing chrome (`lib/disciplineNames.ts`, `lib/eventColors.ts`
 * stay as they are — this map exists where the console must match the
 * public tier's approved wording, e.g. the console half of the "Draw index
 * reached from Events" surface).
 *
 * The entrant tier keeps the canonical copy at
 * `apps/entrant/app/lib/eventLabels.ts` (its `EVENT_LABEL_MAP`).
 * `apps/console/src/platform/domain/__tests__/eventLabels.test.ts` reads
 * that file from disk and pins it equal to this one, so the two tiers
 * cannot drift apart.
 */
export const EVENT_LABEL_MAP: Readonly<Record<string, string>> = Object.freeze({
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: 'Mixed doubles',
});
