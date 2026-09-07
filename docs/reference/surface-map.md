# Surface map

How the product's surfaces are assembled from the design system: each
major route, its shell, and the reusable components that build it. For a
designer, each row is a candidate Figma page; the component columns are
the instances on it.

The route lists mirror the surface-book capture tool
(`tools/surface-capture.mjs` — 44 operator + 46 public baseline surfaces, plus
optional valid invite, Meet pagination (when `MEET_WS_ID` identifies a Meet
workspace), and partner-token captures. Player detail uses a resolved public
person when available and a labelled missing-fixture guard otherwise).
Visual
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
| Hub — workspace list · page 2 | `/?facet=all&page=2` | same list with bounded page navigation and preserved scope |
| Hub — completed workspaces | `/?facet=complete` | completed-workspace filter with searchable result scope |
| Hub — create workspace | `/new` | `PageBody form`, `TextField`, `Button` |
| Global settings | `/settings` | `SettingsControls` (`Section`, `FieldRow`, `Toggle`) |
| Global settings — Security / Sessions / Appearance | `/settings?section=security`, `/settings?section=sessions`, `/settings?section=appearance` | same settings shell with each registered section selected |
| Invite — missing fixture token | `/invite/missing-fixture-token` | explicit unavailable-token guard; no valid invite claim |
| Overview | `/tournaments/WS/overview` | `SetupChecklist`, `SectionCard`, `Eyebrow`, `StatusPill` |
| Setup (8 sections) | `/tournaments/WS/setup/*` | `SettingsControls` (`Section`, `SectionHeader`, `FieldRow`, `Seg`, `Toggle`, `NumberInput`, `SelectInput`), `SectionCard` |
| Participants — Roster | `/tournaments/WS/participants/people` | `DenseDataTable`, `DetailDock` + `DetailPanel`, `OverflowMenu`, `SchoolChip`, `EmptyState` |
| Participants — Roster · bracket page 2 / 100 rows | `/tournaments/WS/participants/people?bracket-roster.page=2&bracket-roster.pageSize=100` | `DenseDataPagination`, bracket roster table |
| Participants — Roster · bracket 25 rows | `/tournaments/WS/participants/people?bracket-roster.pageSize=25` | page-size selector state, bracket roster table |
| Participants — Entries | `/tournaments/WS/participants/entries` | entry review and status actions |
| Participants — Roster · Meet page 2 / 100 rows *(optional `MEET_WS_ID`)* | `/tournaments/MEET_WS/participants/people?meet-roster.page=2&meet-roster.pageSize=100` | `DenseDataPagination`, Meet roster table |
| Competition — Draws | `/tournaments/WS/competition/draws` | draw cards, `StatusPill`, `Eyebrow`, `BracketEmptyState` |
| Competition — Draw canvas *(conservative zone)* | `/tournaments/WS/competition/draw` | `PanZoomCanvas`, bracket nodes, `PickerPopover` |
| Competition — Matches | `/tournaments/WS/competition/matches` | `DenseDataTable` (`matchListColumns`), `MatchStatusFilter`, `StatusPill`, `MatchChip`, `DetailDock` |
| Competition — Matches · bracket page 2 / 100 rows | `/tournaments/WS/competition/matches?bracket-matches.page=2&bracket-matches.pageSize=100` | `DenseDataPagination`, grouped bracket match inventory |
| Competition — Matches · bracket 50 rows | `/tournaments/WS/competition/matches?bracket-matches.pageSize=50` | page-size selector state, grouped match inventory |
| Competition — Matches · Meet page 2 / 100 rows *(optional `MEET_WS_ID`)* | `/tournaments/MEET_WS/competition/matches?meet-matches.page=2&meet-matches.pageSize=100` | `DenseDataPagination`, Meet match inventory |
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
| Discovery — live & upcoming | `/e/` | `SeasonCalendar`, `SeasonControls`, `SeasonStatusCell`, `EmptyState` |
| Discovery — live & upcoming · requested page 2 | `/e/?page=2#calendar` | 10-item scope; the two-current-event demo correctly clamps this request to page one |
| Discovery — entries open | `/e/?view=open#calendar` | explicit entries-open status scope |
| Discovery — all results search | `/e/?view=all&q=Open#calendar` | search across all public tournaments with explicit all-results scope |
| Discovery — completed · page 2 | `/e/?view=completed&page=2#calendar` | `Pagination`, year/status filter, 20-item result scope |
| Tournament — overview | `/e/SLUG` | `HeroHeader`, `TabBar` (`SegmentedNav`), `SectionCard` + `SectionRow`, `NowStrip` |
| Tournament — draws / players | `/e/SLUG?tab=draws`, `?tab=players` (ADR 0028; `events`, `seeds`, `winners`, `entrants` are legacy ids that fold onto these) | `TabBar`, `EventRow` (+ `Button` Entrants / Draw), `PlayersList`, `EntrantsList`, `PersonRef`/`PersonGroup`, `StatusChip` |
| Schedule and live | `/e/SLUG/schedule` | `HeroHeader`, `SegmentedNav` (days, by time / by court), `MatchCard`, filter card (`FIELD_INPUT` controls) |
| Draws (full / round / path / list) | `/e/SLUG/draws/KEY` | `SegmentedNav` (view, segments), bracket grid (`.bracket-link-slot` CSS in `apps/entrant/app/app.css`), `MatchCard`, `PersonRef` |
| Regulations | `/e/SLUG/regulations` | `SectionCard`, prose |
| Entry wizard | `/e/SLUG/enter` | `TextField`, `Notice`, `Button` + `BUTTON_SECONDARY`, `StickyTotalBar`, `CARD`, `CHIP`, `StatusChip` |
| Account (login / signup / verify / reset / partner) | `/e/login`, `/e/signup`, `/e/verify`, `/e/reset`, `/e/partner` | `TextField`, `Notice`, `Button`, `CARD`, `MessagePage` |
| Doubles partner invitation · token *(optional `PARTNER_TOKEN`)* | `/e/partner/TOKEN` | token-backed partner invitation form or unavailable state |
| Partner invitation — missing fixture token | `/e/partner/missing-fixture-token` | explicit unavailable-token guard |
| Partner signup — missing fixture token | `/e/signup/partner/missing-fixture-token` | explicit unavailable-token signup guard |
| My entries | `/e/me/entries` | entry cards (`LIST_CARD` bands, built by `my-entries.js`), `CHIP` |
| Receipt | `/e/SLUG/receipt/REFERENCE` | `SectionCard variant="eyebrow"`, definition rows |
| Player page | `/e/SLUG/players/KEY` | hero band, `PersonRef`, `MatchCard` |

## Route reconciliation

The capture book covers the following registered route patterns. Dynamic
segments use the documented `WS`, `SLUG`, `KEY`, `REFERENCE`, or token fixture;
the capture script adds a missing-fixture guard when no valid token is supplied.

| Registry | Registered patterns and capture treatment |
| --- | --- |
| Console public | `/login`, `/display`, and `/invite/:token` (missing-fixture guard always; valid token only with `INVITE_TOKEN`) |
| Console authenticated | `/`, `/new`, `/settings`, and the concrete workspace paths listed in the Operator table; `/tournaments/:id` and `/tournaments/:id/bracket` and `/tournaments/:id/settings` are compatibility redirects |
| Entrant discovery/auth | `/`, `/health`, `/signup`, `/signup/:slug`, `/login` plus its three outcomes, `/verify` plus its three outcomes, `/forgot`, `/reset` plus its five outcomes |
| Entrant partner | `/partner`, `/partner/:token`, `/partner/accepted`, `/partner/failed`, `/signup/partner/:token`; missing-fixture guards are captured, valid token states require `PARTNER_TOKEN` |
| Entrant tournament | `:slug`, `:slug/receipt/:reference`, `:slug/schedule`, `:slug/enter`, `:slug/enter/signed-in`, `:slug/enter/created`, `:slug/regulations`, `:slug/players/:personKey`, `:slug/draws/:drawKey` |
| Entrant resources | `/sitemap.xml`, `/robots.txt` and `/health` are resource/health responses, documented for route completeness and excluded from visual surface counts |
| Compatibility/exclusions | Console `/tracking`, `/live-ops`, `/tournaments/:id`, `/tournaments/:id/bracket`, `/tournaments/:id/settings`, entrant logout/API endpoints, and auth POST targets are redirects or non-visual resources; they are not counted as page captures |

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
