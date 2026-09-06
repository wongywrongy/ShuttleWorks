# Work package 07 — typography, spacing and visual states

Plan: `docs/audits/v3-consolidated/plan.md` §3 rows X3/X7 (12px caption floor),
X8 (row-minimum floors), X9 (selection fill / decorative-rule removal), "Dot +
aria-label alone for hub health", X16 (redundant reassurance); §4 "Status" row;
§7 cross-cutting routing (X3/X7/X9/X11/X13 → 07). Findings: no finding in
`findings.json` is tagged package `"07"`; the only package-`"12"` findings
routed here by the task brief are V3-OC02.1/V3-OC02.2 (Hub health-dot /
lifecycle-duplication reassurance).

## Scope actually touched

- `packages/design-system/`: `tokens.css`, `tailwind-preset.js`,
  `components/{textStyles.ts,StatusPill.tsx,StatusBar.tsx,Badge.tsx,
  Toast.tsx,GanttTimeline.tsx,index.ts}`.
- `apps/console/src/lib/utils.ts` (`TEXT_MUTED_2XS` deprecated alias).
- `apps/console/src/components/**` (all `control-plane/*` label sites named
  in the brief, plus every other `components/*` file carrying a banned size).
- `apps/console/src/modules/{hub,setup,settings,workspace,bracket,meet,
  operations}/**` — every `text-3xs` / `text-2xs` / `text-[10px]` /
  `text-[11px]` / `tracking-[0.08em]` site found in those six module trees,
  plus the Hub health-dot/lifecycle-duplication fix (R4, V3-OC02.1).
- New test: `apps/console/src/platform/contracts/__tests__/
  captionFloorContract.test.ts`.
- `docs/reference/debt-log.md` (new "Work package 07" section, 5 entries).

**Explicitly not touched** (per task scope): `apps/console/src/modules/
display/**`, `apps/api/src/display`, `apps/api/src/entries`, `tools/`,
`apps/console/src/modules/entries/**` (not in the six named modules),
`apps/console/src/app/**` and `apps/console/src/platform/product-shell/**`
(not under `modules/`), and the entrant tier beyond `apps/entrant/app/lib/
ui.ts` (which had zero violations, so its `public/assets/` twins needed no
change — `uiTwins.test.ts` still passes unmodified).

## R1 — 12px caption floor

`text-3xs` (10px) retired from every file in scope; `text-[10px]` /
`text-[11px]` arbitrary values retired; `text-2xs` (11px) narrowed to numeric
`tabular-nums`/`sw-num` cells in dense tables/grids, everything else moved to
`text-xs` (12px). `tracking-[0.08em]` loosened to `tracking-[0.06em]`
everywhere it survived on an uppercase label in scope.

Occurrence counts, whole frontend tree (`apps/console/src`, `apps/entrant/app`,
`packages/design-system`), before this package vs. after:

| Pattern | Before | After (real) | Notes |
| --- | --- | --- | --- |
| `text-3xs` | 77 | 2 | Both remaining hits are `modules/display/**` (out of package-07 scope, owned by a concurrent workstream) — `LiveStatusPill.tsx`, `CourtsView.tsx`. Logged as V3-07-1. |
| `text-2xs` | 181 | 51 | 42 are the documented numeric-tabular-data exception in in-scope files (`sw-num`/`tabular-nums`); 9 are in files outside this package's declared scope (`entries/EntriesDesk.tsx`, `app/AppSidebar.tsx`, `platform/product-shell/WorkspaceSidebar.tsx`) plus 6 entrant components (`NowStrip`, `DateBadge`, `SeasonCalendar`, `tournament.tsx`, `enter.tsx`, `regulations.tsx`) not covered by the entrant scope (`lib/ui.ts` only). Logged as V3-07-2/V3-07-3. |
| `text-[10px]` | 12 | 1 | The one survivor is `ShuttleWorksMark.tsx`'s `aria-hidden` brand-monogram glyph (allowlisted in the contract test — a logo's internal proportions, not caption text). |
| `text-[11px]` | 8 | 0 | Fully retired. |
| `tracking-[0.08em]` | 39 | 4 (+6 entrant) | The 4 are `modules/display/**` (out of scope); the 6 entrant occurrences are the same six out-of-scope entrant files above. |

`TEXT_MUTED_2XS` (`apps/console/src/lib/utils.ts`) is now a `@deprecated`
alias whose value equals `TEXT_MUTED_XS` — its three remaining importers
(`ModuleCatalogRow.tsx`, `SharingTab.tsx`, `DisplayPreview.tsx`) render
correctly at the new floor without a rename in this change (V3-07-4).

`--text-3xs`/the Tailwind `3xs` step are *not* deleted from `tokens.css` /
`tailwind-preset.js` — both are marked deprecated in comments and kept alive
only because `modules/display/**` still calls `text-3xs` and is being edited
by a concurrent workstream; deleting the theme step would have silently
dropped its styling. Tracked as V3-07-1.

## R2 — density-variant floors

The brief's row/roster-minimum tokens (operator match rows 40/48px, roster
36px, `min-h` not `h-`) are consumed by the MatchCard implementation itself,
which packages 10/11 own — `docs/reference/contracts/match-card.md` §3 is
explicit that package 07's job is only to make the design-system able to
express the floors, not to build MatchCard. No existing `h-<fixed>` on a
text-bearing row was found inside this package's file scope that needed
converting to `min-h`; `Badge`'s and `StatusPill`'s `h-badge` stayed
untouched — both are single-word chips, not the rows/roster the contract
addresses, and Badge/StatusPill already carry sufficient headroom above the
new 12px floor. No design-system token changes were needed beyond the type
floor itself.

## R3 — routine status decoration

Added a documented `tone="routine"` path to `StatusPill` (exported `ChipTone`
= `PillTone` minus `routine` for callers, like `StatusBar`, that only ever
chip). `routine` renders the same label/size/case with no ground and no
border — plain ink, not a container.

Switched call sites within scope:
- `apps/console/src/modules/hub/WorkspaceRow.tsx` — health-word text now
  only renders for the `attention` exception (see R4 below); lifecycle
  badge unaffected (routed through `lifecycleChip`, which already suppresses
  LIVE).
- `apps/console/src/modules/hub/WorkspaceInspector.tsx` — "Ready" and the
  lifecycle's Archived/Complete pill now render `routine`; "Needs setup"
  (the actual exception) keeps its amber chip.
- `apps/console/src/modules/settings/GeneralSettingsTab.tsx` — the lifecycle
  row (Live/Complete/Archived/resting phase) always renders `routine` now.
- `apps/console/src/components/control-plane/matchStatus.tsx` — already
  implemented the same idea pre-existing (`STATUS_TREATMENT`: only `live`
  chips, `done`/`ready`/`pending` are text) — this package only fixed its
  size (`text-2xs` → `text-xs`) and tracking (`0.08em` → `0.06em`).

**Survivors** (not converted — outside declared module scope, or genuinely
ambiguous and left for a domain-owner call): `WorkspaceIdentityBar.tsx`
(shell header pill — under `platform/product-shell/`, not `modules/`),
`EntriesDesk.tsx`'s `tone="green"` "Paid" and `ENTRY_STATE_TONE` map (entries
module out of scope), `SetupProduct.tsx`'s `tone="red"` (looks like a
genuine exception — unverified, left alone). All three logged as V3-07-5.

## R4 — Hub health dots (V3-OC02.1)

`apps/console/src/components/control-plane/HealthDot.tsx`: `HEALTH_LEGEND`
rewritten from a three-colour legend ("amber needs attention · green no
issues reported · grey not started or archived") to `'Dot: needs attention'`
— the only dot that still renders.

`apps/console/src/modules/hub/WorkspaceRow.tsx`: the dot + `HEALTH_WORD` text
("No issues reported" / "Not started yet" / "Archived") used to render on
*every* row regardless of state. Now only the `attention` state renders a dot
+ its word (in `text-status-warning`, matching the exception ink); the three
routine states render neither dot nor reassurance text, per R4 ("a coloured
dot alone never carries meaning" — and neither does routine reassurance).

Also fixed the finding's second half — "completed rows also contain both
'Completed' and 'Complete'": `phaseLabel`'s local `'complete' → 'Completed'`
branch was dropped (the lifecycle badge already says "Complete", or the
facet strip says it once when the badge is suppressed); `phaseLabel` now
only covers `'live'` and `'ready'`, which the badge never carries.

## R5 — X9 (selection fill / decorative rule)

Searched `components/` and `modules/hub` for a search-result-selection
component and a "decorative live-stat rule" per the plan row. No component
in this package's scope implements a search-result list with an unfilled
hairline-only selected state, and no decorative rule under a live-stat block
was found in the in-scope files. No change made; if the target component
lives in a module outside this package's declared scope (e.g. `operations`
Run's live board, already covered under other rulings here, or `display`,
out of scope), it needs a follow-up — not logged as new debt since the brief
did not point to a specific file and none was found by search.

## R6 — copy

No copy changes made beyond the two words R4 required to drop ("No issues
reported" / "Not started yet" / "Archived" per-row reassurance, and the
duplicate "Completed"). Nothing else observed worth logging to
`docs/audits/v3-consolidated/ledger/07-notes.md`.

## Tests / gates run

```
npm --prefix apps/console run test:run
  → Test Files 236 passed (236); Tests 2076 passed (2076)

npm run lint:scheduler
  → 134 problems (0 errors, 134 warnings) — all pre-existing warning categories
    (react-compiler/react-hooks rules, no-explicit-any, only-export-components),
    per CLAUDE.md's documented downgrades. No new errors.

npx tsc -b apps/console
  → clean (no output)

npm run -w apps/entrant test:run -- tests/uiTwins.test.ts
  → Test Files 1 passed (1); Tests 5 passed (5)

npm run -w apps/entrant test:run
  → Test Files 51 passed (51); Tests 897 passed (897)

npm run typecheck:entrant
  → clean

npm run depcruise
  → 16 dependency violations (0 errors, 16 warnings) — the pre-existing
    documented KNOWN_CROSS_MODULE warn list; no new violations.

npm run test:contrast
  → All contrast gates pass.

npm run test:classes
  → check-classes: no unknown token-shaped utilities.
```

One pre-existing test needed updating for the floor change (not a ruling
conflict — a literal class-string assertion tracking the old size):
`apps/console/src/components/control-plane/__tests__/DetailPanel.test.tsx`
— `expect(heading.className).toContain('text-2xs')` → `'text-xs'`, since
`EYEBROW_CLASS` moved to the 12px floor.

## Debt logged

`docs/reference/debt-log.md`, "Work package 07 — typography, spacing and
visual states": V3-07-1 (display module's remaining `text-3xs`, blocks
deleting the deprecated token), V3-07-2 (three out-of-module-scope
`text-2xs` files), V3-07-3 (six entrant components/routes need the same
sweep), V3-07-4 (`TEXT_MUTED_2XS` alias cleanup), V3-07-5 (un-converted
`StatusPill` routine-looking call sites outside scope).
