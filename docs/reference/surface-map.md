# Surface map

How the product's surfaces are assembled from the design system: each
major route, its shell, and the reusable components that build it. For a
designer, each row is a candidate Figma page; the component columns are
the instances on it.

The route lists mirror the surface-book capture tool
(`tools/surface-capture.mjs` — 33 operator + 39 public surfaces). Visual
baselines: `make surface-books` renders every surface at 1440×900 and
390×844 into HTML/PDF books under `docs/screenshots/ui-review/`.

`WS` = a workspace id; `SLUG` = a public tournament slug. Conservative
zone marks the workflows the consolidation pass deliberately did not
touch (Draw canvas, Operations Plan/Live, scheduling, result entry).

## Operator console

Every workspace surface renders inside the product shell:
`AppShell` → `WorkspaceShell` (left nav from `buildWorkspaceNav`) →
`ActionsBar` → scroll region → `PageBody`.

| Surface | Route | Main components |
| --- | --- | --- |
| Sign in | `/login` | `TextField`, `Button` |
| Hub — workspace list | `/` | workspace rows, `EmptyState`, `InlineSearch`, `StatusPill` |
| Hub — create workspace | `/new` | `PageBody form`, `TextField`, `Button` |
| Global settings | `/settings` | `SettingsControls` (`Section`, `FieldRow`, `Toggle`) |
| Overview | `/tournaments/WS/overview` | `SetupChecklist`, `SectionCard`, `Eyebrow`, `StatusPill` |
| Setup (9 tabs) | `/tournaments/WS/setup/*` | `SettingsControls` (`Section`, `SectionHeader`, `FieldRow`, `Seg`, `Toggle`, `NumberInput`, `SelectInput`), `SectionCard` |
| Participants — Roster | `/tournaments/WS/participants/people` | `DenseDataTable`, `DetailDock` + `DetailPanel`, `OverflowMenu`, `SchoolChip`, `EmptyState` |
| Competition — Draws | `/tournaments/WS/competition/draws` | draw cards, `StatusPill`, `Eyebrow`, `BracketEmptyState` |
| Competition — Draw canvas *(conservative zone)* | `/tournaments/WS/competition/draw` | `PanZoomCanvas`, bracket nodes, `PickerPopover` |
| Competition — Matches | `/tournaments/WS/competition/matches` | `DenseDataTable` (`matchListColumns`), `MatchStatusFilter`, `StatusPill`, `MatchChip`, `DetailDock` |
| Operations — Plan *(conservative zone)* | `/tournaments/WS/operations/plan` | `GanttTimeline`, `CourtMark`, `PlanToolbar`, dialogs (`WarmRestartDialog`, `MoveMatchDialog`, `DisruptionDialog`) + `DialogFooter`, `SolverHud` |
| Operations — Live day *(conservative zone)* | `/tournaments/WS/operations/live` | `UnifiedOpsList`, `MatchCard`, `StatusBar`, `HealthDot`, `ScoreEditor`, `NextUpList` |
| Publish (4 tabs) | `/tournaments/WS/publish/*` | `SectionCard`, `Notice`, `Button`, `SourceChip` |
| Display — venue board | `/display?token=…` | `MeetDisplayPage` court grid, `LiveStatusPill` (dark-only) |
| Administration (5 tabs) | `/tournaments/WS/administration/*` | `SettingsControls`, `DenseDataTable`, `Modal` + `DialogFooter`, `ConfirmDeleteButton` |
| Module guards (4) | `/tournaments/WS/{entries,setup,roster,matches}` | `ModuleUnavailablePanel`, `EmptyState` |

## Public entrant site

Every page renders inside `PlayShell` (header, footer line, skip link).
All content is complete native HTML; interactivity is native elements
plus the page-scoped scripts in `apps/entrant/public/assets/`.

| Surface | Route | Main components |
| --- | --- | --- |
| Discovery — season | `/e/` | `SeasonCalendar`, `SeasonControls`, `SeasonStatusCell`, `EmptyState` |
| Tournament — overview | `/e/SLUG` | `HeroHeader`, `TabBar`, `SectionCard`, `DateBadge`, `NowStrip` |
| Tournament — events / players / draws / seeds / winners | `/e/SLUG?tab=…` | `TabBar`, `SectionCard`, `EventRow`, `PlayersList`, `EntrantsList`, `PersonRef`/`PersonGroup`, `StatusChip` |
| Schedule and live | `/e/SLUG/schedule` | `NowStrip`, `MatchCard`, `TimelineCard`, `StatusChip`, filter bar (`SELECT_CONTROL` selects) |
| Draws (full / round / path / list) | `/e/SLUG/draws/KEY` | bracket grid (`.bracket-link-slot` CSS in `apps/entrant/app/app.css`), `MatchCard`, `PersonRef`, `StatusChip` |
| Regulations | `/e/SLUG/regulations` | `SectionCard`, prose |
| Entry wizard | `/e/SLUG/enter` | `TextField`, `Notice`, `Button` + `BUTTON_SECONDARY`, `StickyTotalBar`, `CARD` |
| Account (login / signup / verify / reset / partner) | `/e/login`, `/e/signup`, `/e/verify`, `/e/reset`, `/e/partner` | `TextField`, `Notice`, `Button`, `CARD`, `MessagePage` |
| My entries | `/e/me/entries` | entry cards (`CARD`), `StatusChip` |
| Receipt | `/e/SLUG/receipt/ID` | `CARD`, definition rows |
| Player page | `/e/SLUG/players/KEY` | `PersonRef`, match history rows |

## What pins each surface

Styling on these surfaces is held by source-scan contract tests rather
than screenshots — useful to know before restyling anything:

- Console-wide: the contract scans in
  `apps/console/src/platform/contracts/__tests__/` (truncation, page
  container, accent, selected-state, motion, shell layout, copy).
- Entrant-wide: `apps/entrant/tests/noTruncation.test.ts`,
  `apps/entrant/tests/components.test.ts` (rendered class tokens),
  `apps/entrant/tests/publicUniversality.test.ts` (bracket CSS text),
  the page-weight gate.
- Public bracket geometry: `tests/e2e/tests/11-public-bracket-geometry.spec.ts`
  (44px nodes, two rows, draw height ceilings).
