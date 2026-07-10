# SPEC AMENDMENT — Timeline encoding (Run view)

> Binding amendment to `DESIGN_SPEC_DRAFT.md`, implemented in RUN_VIEW_PROGRAM Phase P3.
> Scope: the Meet control-center `GanttChart` block encoding + its legend.

## Problem it fixes

The Gantt over-encodes: a **fill channel** (4 statuses) × an **outline channel** (6 ring hues:
selected / blocked / impacted / postponed / resting / late) → up to ~24 chip appearances, and a
10-item two-group legend to decode them. selected / late / impacted rings are indistinguishable in
practice, and three of the six "outline" meanings aren't match state at all (selected is
interaction; resting is a player constraint; impacted is a transient preview).

## 1. Single appearance channel — lifecycle by intensity

The block's own look encodes **only lifecycle**, read as intensity against the now-line (no
fill×outline combinatorics):

| lifecycle | treatment |
|---|---|
| `scheduled` | quiet neutral outline, minimal fill |
| `called` | subtle **warm** fill hint |
| `in progress` | **the one accent, filled** — the eye goes to what's happening now |
| `finished` | dimmed neutral |

No green on the timeline: `in progress` is the accent (not `status-live` green), `finished` is
dimmed neutral (not green) — honoring "green = success/complete only," which the timeline no longer
needs. **Flagged:** this changes the Gantt's in-progress block from the emerald `status-live` to
the accent; the queue's live pill (a separate surface) keeps its green tier until the Meet
migration reconciles them.

## 2. Exceptions are the only hues

Layered over the lifecycle fill, **color always paired with a glyph** (never color alone):

- `late` / `overrun` → **warning** treatment (warning border + a Warning glyph), the same
  `--status-warning` tokens as the queue's LATE badge.
- `blocked` / `cancelled` → **danger** (danger border + a WarningOctagon glyph), from
  `trafficLights` red.
- `postponed` → **ghost/dashed** (dashed border + reduced opacity), no hue.

## 3. Evictions (out of the block encoding)

- `selected` → the **canon focus ring** (a neutral `--ring` inset ring), because selection is
  interaction, not data — no longer a data hue competing with late/blocked.
- `resting` → **Match Details / block tooltip only** (a player-rest constraint, surfaced in the
  block `title` reason, not painted on the block).
- `impacted` → a **dashed accent overlay** that exists **only while a repair proposal is pending**,
  bound to the P2 banner's proposal (`uiStore.activeProposal`), cleared on apply/dismiss. **Source
  change:** the impacted set is derived by diffing `activeProposal.proposedSchedule` against the
  current schedule (matches whose slot/court moves), **not** from the selected match's shared
  players (the old selection-driven `analyzeImpact().directlyImpacted`, which is evicted from the
  timeline; `analyzeImpact` still feeds Match Details).

## 4. Legend removed → "?" key + rich tooltips

The two-group legend strip is deleted (reclaimed height returns to the timeline/queue). Replaced by:

- a small **"?" key popover** in the Gantt corner (intensity lifecycle + the three exceptions), and
- **rich block tooltips**: `label · C<court> · <status>[ · <n>m late]` on the block `title`.

The "?" key is a lightweight local disclosure, not a general `Popover` primitive — that primitive
(DESIGN_SPEC P10) is built when a second surface needs positioned floating content; here one
consumer needs a simple corner key.

## 5. Accessibility

Every exception pairs its hue with a **glyph** (Warning / WarningOctagon) or a **dash**
(postponed), so the encoding survives color-vision deficiency by construction — the discriminator
is never the hue alone.

CVD analysis of the risk pair the amendment calls out — **called-warm-hint vs late-warning** (both
amber-family, the hues most likely to converge under deuteranopia/protanopia): the two are
disambiguated by the **glyph**, not the color. `called` carries **no** glyph (it is a lifecycle
state, not an exception); `late` carries a filled **Warning** triangle. Under full red-green
deficiency the amber fills may read alike, but the presence/absence of the triangle keeps them
distinct. `in progress` (accent/azure) and `blocked` (danger + octagon glyph) are separable from
the amber family under all CVD types; `postponed` uses a dash, no hue. A live deuteranopia
screenshot pass on a seeded board is recommended as a manual QA step before release; the render
smoke test (`GanttChart.test.tsx`) asserts the glyph/tooltip channel exists independent of color.

## 6. Components changed / removed

- **CHANGED** `GanttChart.tsx` — `STATUS_STYLES` → intensity; `renderBlock` ring ladder → lifecycle
  fill + exception glyph + neutral selection ring + proposal-bound impacted overlay; enriched
  tooltip; hosts the "?" key.
- **REMOVED** `GanttLegend.tsx` + its strip in `MatchControlCenterPage`.
- **CHANGED** `MatchControlCenterPage` — `impactedMatchIds` source switched to the pending
  proposal's moved matches.
