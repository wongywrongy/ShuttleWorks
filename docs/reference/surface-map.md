# Surface map

How the product's surfaces are assembled from the design system: each
major route, its shell, and the reusable components that build it. For a
designer, each row is a candidate Figma page; the component columns are
the instances on it.

The route lists mirror the surface-book capture tool
(`tools/surface-capture.mjs`). The reviewed v2 books retain their historical
39 operator and 46 public surface IDs; current capture sheets use canonical
destinations plus explicitly labelled state and continuation sheets. Optional
valid invite, Meet-workspace, partner-token, and player-detail states are added
only when their fixture data exists. Compatibility URLs and fabricated missing
capability/token/guard states are excluded from current visual inventories.
Visual
baselines: `make surface-books` renders every included surface at 1440×900 and
390×844 into HTML/PDF books under `docs/screenshots/ui-review/`.

The current canonical review, including inventory exclusions, fixture
provenance, and final visual ledger, is recorded in
[`docs/audits/surface-book-remediation/canonical-review.md`](../audits/surface-book-remediation/canonical-review.md).

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
| Hub — past workspaces | `/?view=past` | time view: past events, searchable across every workspace |
| Hub — live workspaces | `/?view=live` | time view: events running today |
| Hub — create workspace | `/new` | `PageBody form`, `TextField`, `Button` |
| Global settings | `/settings` | `SettingsControls` (`Section`, `FieldRow`, `Toggle`) |
| Global settings — Security / Sessions / Appearance | `/settings?section=security`, `/settings?section=sessions`, `/settings?section=appearance` | same settings shell with each registered section selected |
| Overview | `/tournaments/WS/overview` | `SetupChecklist`, `SectionCard`, `Eyebrow`, `StatusPill` |
| Setup (4 pages) | `/tournaments/WS/setup/{details,entries,scoring,public-site}` | `SettingsControls` (`Section`, `SectionHeader`, `FieldRow`, `Seg`, `Toggle`, `NumberInput`, `SelectInput`), `SectionCard` |
| Participants — Roster | `/tournaments/WS/participants/people` | `DenseDataTable`, `DetailDock` + `DetailPanel`, `OverflowMenu`, `SchoolChip`, `EmptyState` |
| Participants — Roster · bracket page 2 / 100 rows | `/tournaments/WS/participants/people?bracket-roster.page=2&bracket-roster.pageSize=100` | `DenseDataPagination`, bracket roster table |
| Participants — Roster · bracket 25 rows | `/tournaments/WS/participants/people?bracket-roster.pageSize=25` | page-size selector state, bracket roster table |
| Participants — Entries | `/tournaments/WS/participants/entries` | entry review and status actions |
| Participants — Roster · Meet page 2 / 100 rows *(optional `MEET_WS_ID`)* | `/tournaments/MEET_WS/participants/people?meet-roster.page=2&meet-roster.pageSize=100` | `DenseDataPagination`, Meet roster table |
| Bracket — Draws | `/tournaments/WS/bracket/draws` | draw cards, `StatusPill`, `Eyebrow`, `BracketEmptyState` |
| Bracket — Draw canvas *(conservative zone)* | `/tournaments/WS/bracket/draw` | `PanZoomCanvas`, bracket nodes, `PickerPopover` |
| Bracket — Matches | `/tournaments/WS/bracket/matches` | `DenseDataTable` (`matchListColumns`), `MatchStatusFilter`, `StatusPill`, `MatchChip`, `DetailDock` |
| Bracket — Matches · page 2 / 100 rows | `/tournaments/WS/bracket/matches?bracket-matches.page=2&bracket-matches.pageSize=100` | `DenseDataPagination`, grouped bracket match inventory |
| Bracket — Matches · 50 rows | `/tournaments/WS/bracket/matches?bracket-matches.pageSize=50` | page-size selector state, grouped match inventory |
| Meet — Matches · page 2 / 100 rows *(optional `MEET_WS_ID`)* | `/tournaments/MEET_WS/meet/matches?meet-matches.page=2&meet-matches.pageSize=100` | `DenseDataPagination`, Meet match inventory |
| Operations — Plan *(conservative zone)* | `/tournaments/WS/operations/plan` | `GanttTimeline`, `CourtMark`, `PlanToolbar`, dialogs (`WarmRestartDialog`, `MoveMatchDialog`, `DisruptionDialog`) + `DialogFooter`, `SolverHud` |
| Operations — Live day *(conservative zone)* | `/tournaments/WS/operations/live` | `UnifiedOpsList`, `MatchCard`, `StatusBar`, `HealthDot`, `ScoreEditor`, `NextUpList` |
| Bracket — Draw settings | `/tournaments/WS/bracket/settings` | `SettingsControls` (`Section`, `Row`), `EngineConfigForm`, `BracketDrawDefaults` |
| Display — Board settings | `/tournaments/WS/display/board` | `DisplayConfig`, `SharingTab` (links scope), `SectionCard`, `Button` |
| Display — Preview | `/tournaments/WS/display/preview` | `MeetDisplayPage` preview |
| Display — venue board | `/display?token=…` | `MeetDisplayPage` court grid, `LiveStatusPill` (dark-only) |
| Administration (3 rail items: Team, Modules, Workspace; Workspace holds the settings / backups / activity-log tabs, so 5 URLs) | `/tournaments/WS/administration/*` | `SettingsControls`, `DenseDataTable`, `Modal` + `DialogFooter`, `ConfirmDeleteButton` |
| Module guards (2) *(only when the selected workspace kind makes the guard reachable)* | `/tournaments/WS/meet/{matches,team-structure}` | `ModuleUnavailablePanel`, `EmptyState` |

### Historical route debt

The pre-consolidation URLs below belonged to the reviewed legacy books. They
are retained here only as historical mapping context; they are not registered
product destinations, linked from the UI, or captured as current surfaces.
Direct requests reach the standard not-found state.
`WORKFLOW_ROUTES` in `apps/console/src/platform/product-shell/workspaceNav.ts`
is the sole source of truth for current operator workspace URLs.

| Alias | Now | Note |
| --- | --- | --- |
| `/setup` | `/overview` | Overview owns the readiness checklist, once |
| `/setup/{general,dates,venue,people}` | `/setup/details` | |
| `/setup/rules` | `/setup/scoring` | |
| `/setup/public-info` | `/setup/public-site` | |
| `/setup/events` | `/bracket/draws` · `/participants/people` | resolved by workspace kind |
| `/participants/{pairs,teams}` | `/participants/people` | |
| `/participants/review` | `/participants/entries` | |
| `/competition`, `/competition/matches`, `/competition/results` | `/meet/matches` · `/bracket/matches` | resolved by workspace kind |
| `/competition/draws`, `/competition/draw` | `/bracket/draws`, `/bracket/draw` | |
| `/competition/team-structure` | `/meet/team-structure` | |
| `/publish`, `/publish/site`, `/publish/draws-results` | `/setup/public-site` | publication sits with the content it governs |
| `/publish/displays`, `/publish/links` | `/display/board` | |

## Public entrant site

Every page renders inside `PlayShell` (header, footer line, skip link).
All content is complete native HTML; interactivity is native elements
plus the page-scoped scripts in `apps/entrant/public/assets/`.

| Surface | Route | Main components |
| --- | --- | --- |
| Discovery — season calendar | `/e/` | `SeasonCalendar`, `SeasonControls`, `SeasonStatusCell`, `NowStrip`, `EmptyState` |
| Discovery — earlier this season | `/e/#past` | the same page at its past-section anchor; the selected season's finished tournaments, muted, Results only |
| Discovery — another season | `/e/?year=YYYY#calendar` | the season selector; one season is the content boundary |
| Discovery — search across seasons | `/e/?q=Open&year=all#calendar` | search widened past the selected season |

The retired lifecycle and pagination queries (`?view=season|open|completed|all`,
`?preset=`, `?from=`, `?to=`, `?page=`) are **compatibility URLs, not
surfaces**: the loader canonicalises them off the URL, and `?view=completed`
lands on `/e/#past`. They are covered by route tests and are not requested by
the surface book.

The retired tournament section names (`?tab=events`, `?tab=seeds`,
`?tab=winners`) are compatibility URLs on the same terms: all three were
panel names for the ONE Draws surface, and the loader redirects them onto
`?tab=draws`. They are covered by route tests and are not requested by the
surface book.

The retired draw views (`?view=round`, `?view=path`) join them: public P4
made ONE bracket the draw at every width, and both queries resolve onto it.
They are covered by route tests and are not requested by the surface book.

The book therefore counts three kinds of sheet (`routeCoverage` in
`tools/surface-capture.mjs`):

| Count | Means |
| --- | --- |
| `canonicalDestinations` | unique product surfaces — distinct paths, ignoring query and fragment |
| `stateSheets` | product sheets, including a surface captured in more than one state |
| `enhancedStateSheets` | a progressive-enhancement state of a surface already counted (`Results draw · Highlighted player path`) |
| `expectedErrorSheets` | a genuine refusal journey backed by a real fixture or valid revoked state, captured under `Expected refusal · …`; fabricated unknown tokens, missing IDs, and kind-mismatched guards are omitted |

`RESULTS_SLUG` names a second public tournament whose results are published.
`SLUG` is the entry-taking one the account and entry-form sheets need, and on
that tournament every draw is unplayed — so without the second slug no sheet
in the book carries a score, a resolved later round or a champion. The
content surfaces are captured against both under `Results tournament · …`
and `Results draw · …`.

| Surface | Route | Main components |
| --- | --- | --- |
| Tournament — overview | `/e/SLUG` | `HeroHeader`, `TabBar` (`SegmentedNav`), `SectionCard` (About, Key dates, Venue, Documents) + `SectionRow`/`SectionProse` |
| Tournament — draws / players | `/e/SLUG?tab=draws`, `?tab=players` (ADR 0028; these are the only public tournament index tabs) | `TabBar`, `EventRow` (one row-wide link: name · entrants · progress · Open), `PlayersList`, `EntrantsList`, `PersonRef`/`PersonGroup`, `StatusChip` |
| Schedule and live | `/e/SLUG/schedule` | `HeroHeader`, `SegmentedNav` (days, by time / by court), `MatchCard`, filter card (`FIELD_INPUT` controls) |
| Draws (one bracket; `?view=list`, `?player=ID`) | `/e/SLUG/draws/KEY` | scroll region `[data-bracket-scroll]` + sticky round headers (`.bracket-scroll`, `.bracket-round-header`, `.bracket-slot` in `apps/entrant/app/app.css`), `MatchCard`, `PersonRef`, `public/assets/bracket-path.js` |
| Regulations | `/e/SLUG/regulations` | document heading + version line, `Print`/`Download`, section outline, parsed prose/lists, `public/assets/regulations-print.css` (print) |
| Entry wizard | `/e/SLUG/enter` | `TextField`, `Notice`, `Button` + `BUTTON_SECONDARY`, `StickyTotalBar`, `CARD`, `CHIP`, `StatusChip` |
| Account (login / signup / verify / reset / partner) | `/e/login`, `/e/signup`, `/e/verify`, `/e/reset`, `/e/partner/:token` | `TextField`, `Notice`, `Button`, `CARD`, `MessagePage` |
| Doubles partner invitation · token *(optional `PARTNER_TOKEN`)* | `/e/partner/TOKEN` | token-backed partner invitation form or unavailable state |
| My entries | `/e/me/entries` | entry cards (`LIST_CARD` bands, built by `my-entries.js`), `CHIP` |
| Receipt | `/e/SLUG/receipt/REFERENCE` | `SectionCard variant="eyebrow"`, definition rows |
| Player page | `/e/SLUG/players/KEY` | hero band, `PersonRef`, `MatchCard` |

## Route reconciliation

The capture book covers the following registered route patterns. Dynamic
segments use the documented `WS`, `SLUG`, `KEY`, `REFERENCE`, or token fixture.
Token-backed pages are included only when a valid fixture token is available.

| Registry | Registered patterns and capture treatment |
| --- | --- |
| Console public | `/login`, `/display`, and `/invite/:token` (valid token/capability only when supplied by fixture data) |
| Console authenticated | `/`, `/new`, `/settings`, and the concrete workspace paths listed in the Operator table; retired compatibility paths are excluded and return the standard not-found state |
| Entrant discovery/auth | `/`, `/health`, `/signup` (with validated `next` context), `/login` plus its three outcomes, `/verify` plus its three outcomes, `/forgot`, `/reset` plus its five outcomes |
| Entrant partner | `/partner/:token`, `/partner/accepted`, `/partner/failed`; sign-up continuation uses canonical `/signup?next=…`; token-backed pages are captured only with a real `PARTNER_TOKEN` |
| Entrant tournament | `:slug`, `:slug/receipt/:reference`, `:slug/schedule`, `:slug/enter`, `:slug/enter/signed-in`, `:slug/enter/created`, `:slug/regulations`, `:slug/players/:personKey`, `:slug/draws/:drawKey` |
| Entrant resources | `/sitemap.xml`, `/robots.txt` and `/health` are resource/health responses, documented for route completeness and excluded from visual surface counts |
| Historical console aliases | The old redirect set above is retained for audit traceability only. Current capture books contain canonical screens and do not issue requests for these URLs. |
| Route boundaries and exclusions | Console `/tracking` and `/live-ops` return not-found; retired workspace paths such as `/tournaments/:id/bracket` and `/tournaments/:id/settings` return not-found; `/tournaments/:id` remains the root-to-Overview redirect. Entrant logout/API endpoints and auth POST targets are method-owned resources and are not visual page captures. Missing-token, missing-person, and fabricated capability URLs are not book pages. |

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
