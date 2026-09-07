# Route-to-code map - surface-book remediation

Date: 2026-09-06. Merges the two read-only exploration notes captured for this program
(console + entrant route maps) into one document, plus the design-system inventory and
docs-conventions sections from the baseline-diff review. Every file path below was checked
with `ls`/`find` against the working tree on `feat/surface-book-remediation`; anything that
did not resolve is marked "(verify)" rather than silently kept or dropped. All confirmed
paths below currently exist on disk. This folder is outside `docs:paths` (its token
validation) but inside the VitePress build, so no Markdown link points at a nonexistent file.

## Part 1 - Operator console (33 surfaces)

The authoritative surface ledger in `surfaces.json` records all 33 operator and 40 public
render records with their requested routes and current renderer paths. `PE05b` is the
runtime-injected player detail record and is intentionally retained as a separate row.

Console routes are data: `WORKFLOW_ROUTES` in
`apps/console/src/platform/product-shell/workspaceNav.ts` (L82-165;
`buildWorkflowNavigation` L258-340) maps path to the legacy `AppTab`. `apps/console/src/app/App.tsx`
mounts `/login`, `/invite/:token`, `/display`, `/`, `/new`, `/settings`, `/tournaments/:id/*`.
`apps/console/src/pages/TournamentPage.tsx` syncs path to `activeTab`;
`apps/console/src/app/AppShell.tsx` (`resolveActivePane` L67-100) dispatches to
`apps/console/src/modules/workspace/WorkspaceShellSurface.tsx` (shell segments, PublishProduct
L97-143), `apps/console/src/app/workspace/ModuleOutlet.tsx` (module products), or
`apps/console/src/app/workspace/ModuleUnavailablePanel.tsx` (guard).

### OC01-OC05

| # | Route | Top-level | Key children | Tests |
| --- | --- | --- | --- | --- |
| OC01 | /login | `apps/console/src/platform/auth/LoginPage.tsx` | `apps/console/src/platform/auth/passwordPolicy.ts`, `apps/console/src/context/AuthContext.tsx` | `apps/console/src/platform/auth/__tests__/LoginPage.test.tsx` |
| OC02 | / | `apps/console/src/modules/hub/HubPage.tsx` | `apps/console/src/modules/hub/WorkspaceRow.tsx`; `apps/console/src/components/control-plane/HealthDot.tsx` (HEALTH_LEGEND L33, HEALTH_WORD L27, healthColorClass L9); `apps/console/src/modules/hub/hubSignals.ts`; `apps/console/src/platform/domain/lifecycle.ts` | `apps/console/src/modules/hub/__tests__/HubPage.test.tsx`, `WorkspaceRow.test.tsx`, `hubSignals.test.ts` |
| OC03 | /new | `apps/console/src/modules/hub/NewWorkspacePage.tsx` | `apps/console/src/modules/hub/workspaceCreateFlow.ts`, `customModules.ts`, `apps/console/src/platform/engine-config/SettingsControls.tsx` | `apps/console/src/modules/hub/__tests__/NewWorkspacePage.test.tsx`, `workspaceCreateFlow.test.ts` |
| OC04 | /settings | `apps/console/src/modules/settings/GlobalSettingsPage.tsx` | local-profile gate copy L135, L232, L277; `AppearanceSettings.tsx`; `SettingsControls` FieldRow/Section | `apps/console/src/modules/settings/__tests__/GlobalSettingsPage.test.tsx` |
| OC05 | /tournaments/:id/overview | `apps/console/src/modules/workspace/WorkspaceOverview.tsx` | `overview/OverviewHeader.tsx`, `overview/PhasePanels.tsx` (playing metric L182-188 `{m.playing} on court`), `overview/railRows.ts`, `apps/console/src/components/control-plane/PhaseStepper.tsx` | `apps/console/src/modules/workspace/__tests__/WorkspaceOverview.test.tsx`, `apps/console/src/platform/domain/__tests__/overviewPhase.test.ts` |

### OC06-OC13 Setup (/tournaments/:id/setup/{general,dates,venue,events,rules,entries,people,public-info})

All eight render `apps/console/src/modules/setup/SetupProduct.tsx` (section switch
`SectionEditor` L163+; `SECTION_LABELS` L54; `STATUS_LABELS` L74 incl. "Ready"; timezone
options L92-96; timezone hint ~L199).

| Theme | File / line |
| --- | --- |
| Save rail alignment, page bound | `apps/console/src/components/control-plane/ActionsBar.tsx`; `PageBody.tsx` (form bound `max-w-[52rem]`); `PropertyPanel.tsx` |
| Repeated "Ready" | `SetupProduct.tsx` `STATUS_LABELS`/`SetupStatusLabel` L74-112; `apps/console/src/components/control-plane/SetupChecklist.tsx`; `apps/console/src/platform/domain/setupChecklist.ts` |
| IANA timezone help copy + DST | `SetupProduct.tsx` L92-96, `DateTimeRow` L127-170; `apps/console/src/lib/timezoneLocal.ts` (`zonedLocalInput`, `localInputToUtc`) |
| Session columns / repeating rows | `apps/console/src/modules/setup/SetupRowsEditor.tsx` |
| Court keys, Edit event wrapping, domain authority | `apps/console/src/modules/setup/DownstreamImpact.tsx` (authority: 'domain' read-only summaries) |
| Scoring vocabulary | `apps/console/src/platform/engine-config/ScoringFields.tsx`; ADR 0008 |
| Entry rules in sidebar | `workspaceNav.ts` L307-309 (`enabled.has('entries')` gate) |
| Staff role enum labels / registration method | `SetupProduct.tsx` `SectionEditor` cases `people`, `entries` |
| Public checkbox scope, logo/banner URL | `SetupProduct.tsx` case `public-info`; owner `apps/console/src/modules/settings/PublicationSettings.tsx` |

Tests: `apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx`;
`apps/console/src/lib/__tests__/timezoneLocal.test.ts`;
`apps/console/src/platform/contracts/__tests__/copyContract.test.ts`; backend
`tests/backend/test_tournament_setup.py` (`apps/api/src/workspaces/setup.py`).

### OC14-OC19

| # | Route | Top-level | Key children | Tests |
| --- | --- | --- | --- | --- |
| OC14 | /participants/people | Meet: `apps/console/src/modules/meet/roster/RosterTab.tsx` - Bracket: `apps/console/src/modules/bracket/BracketRosterTab.tsx` | Issues column: `BracketRosterTab.tsx` L61, L186, L295-297; `RosterTab.tsx` L231, L409-413; `apps/console/src/modules/meet/roster/PlayerDetailPanel.tsx`, `apps/console/src/modules/meet/roster/positionGrid/*` | `apps/console/src/modules/meet/roster/__tests__/RosterTab.cleanup.test.tsx`, `rosterDetailPanel.test.tsx`, `apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx` |
| OC15 | /competition/draws | `apps/console/src/modules/bracket/BracketDrawsTab.tsx` | counts w/o units: `partCount`/`targetSize` L167-169, L411-416; `DrawProgressCell` L422; `drawProgress.ts`; `DrawDetailPanel.tsx` (`matchCount` L474-479) | `BracketDrawsTab.test.tsx`, `bracketDrawsColumns.test.ts`, `DrawDetailPanel.test.tsx` |
| OC16 | /competition/draw?event= | `apps/console/src/modules/bracket/DrawView.tsx` | default zoom: `apps/console/src/modules/bracket/PanZoomCanvas.tsx` `readableView()` L104-118, `fitAll()` L120-140, controls L228-245; colored chrome: `DrawView.tsx` L512-517, L1509 | `DrawView.test.tsx` (+ `.centered`/`.segments`/`.swiss`), `PanZoomCanvas.test.tsx` |
| OC17 | /competition/matches | `apps/console/src/modules/bracket/BracketMatchesTab.tsx` (Meet: `apps/console/src/modules/meet/matches/MatchesTab.tsx`) | scores under Status: `BracketMatchesTab.tsx` L297-299 (`ScoreLane` replaces `MatchStatus` in status cell); `apps/console/src/components/control-plane/matchStatus.tsx`, `apps/console/src/components/control-plane/MatchCard.tsx` (`ScoreLane`), `apps/console/src/components/control-plane/matchListColumns.ts` | `BracketMatchesTab.test.tsx`, `apps/console/src/components/control-plane/__tests__/matchListParity.test.ts`, `MatchStatus.test.tsx` |
| OC18 | /operations/plan | `apps/console/src/modules/operations/OperationsProduct.tsx` | dots legend: `apps/console/src/modules/operations/UnifiedOpsBoard.tsx` L339-340, L372; `apps/console/src/modules/operations/opsBlock.ts`; `plan/PlanCallList.tsx`, `plan/PlanToolbar.tsx`; plan-ready scope `OperationsProduct.tsx` L161-181, L247-251 | `apps/console/src/modules/operations/__tests__/unifiedOpsBoard.test.tsx`, `planCallList.test.tsx`, `opsBlock.test.ts`, `planView.test.ts` |
| OC19 | /operations/live | `apps/console/src/modules/operations/run/RunSurface.tsx` | `run/RunCourtGrid.tsx` (`sideNameLines` L19, L75); `run/RunSummaryBand.tsx` (playing metric L62, L77-81); `run/RunQueue.tsx`; `runtime/runModel.ts` (`deriveCourtLanes`) | `runSurface.test.tsx`, `runQueue.test.tsx`, `runSummaryBand.test.tsx`, `runMeet.test.tsx`, `courtStatus.test.tsx` |

### OC20-OC23 Publish (WorkspaceShellSurface.tsx -> PublishProduct L143; paneFromPath L106-110; draws-results and links REDIRECT L122-126)

| # | Route | Renders |
| --- | --- | --- |
| OC20 | /publish/site | `apps/console/src/modules/settings/SharingTab.tsx` scope="site" -> `apps/console/src/modules/settings/PublicationSettings.tsx` (L218) |
| OC21 | /publish/draws-results | `<Navigate replace>` -> /publish/site |
| OC22 | /publish/displays | `apps/console/src/modules/workspace/DisplayConfig.tsx` (rotation guidance label L161) + `SharingTab` scope="links"; `apps/console/src/modules/workspace/displayConfig/DisplayLayoutEditor.tsx` |
| OC23 | /publish/links | `<Navigate replace>` -> /publish/displays |

Tests: `apps/console/src/modules/workspace/__tests__/PublishProduct.test.tsx`,
`DisplayConfig.test.tsx`,
`apps/console/src/modules/workspace/displayConfig/__tests__/DisplayLayoutEditor.test.tsx`,
`apps/console/src/modules/settings/__tests__/SharingTab.test.tsx`.

### OC24 Fullscreen venue board (/display?token=...)

| Layer | File |
| --- | --- |
| Route entry | `apps/console/src/modules/display/PublicDisplayPage.tsx` (meet vs bracket via `useDisplayKind.ts`) |
| Board / court selector | `apps/console/src/modules/display/MeetDisplayPage.tsx`: `matchesByCourt` (active/called) L150-162; `laneItems` L176-184; `nowIds` L186; `assignLanes` L191; `previewByCourt` L199-209; `courtMatches` (`CourtRow[]`) L212-279; `displayedCourtRows` L289-305 |
| Lane rule | `apps/console/src/modules/display/publicDisplay/courtLanes.ts` `assignLanes` L54-81 |
| Render | `publicDisplay/CourtsView.tsx`: `CourtRow` type L32-47 carries `match` AND `nextMatch`/`laterMatch`; `getMatchCode` L74-81; `helpers.ts` `formatPlayers`, `isCourtClosedNow`; `courtLayout.ts`, `tvSizing.ts`, `displayPresets.ts`, `LiveStatusPill.tsx`, `freshness.ts` |
| API | `apps/api/src/display/display.py` `GET /display/{token}/state` L~180-226 pass-through projection (`_MEET_PROJECTION_FIELDS` L172-174); `/match-states` L228-235. No server-side court derivation. |

Tests: `MeetDisplayPage.courtLayout`/`.lanes`/`.standings.test.tsx`, `hybridBoard.test.tsx`,
`apps/console/src/modules/display/__tests__/PublicDisplayPage.branch.test.tsx`,
`apps/console/src/modules/display/publicDisplay/__tests__/courtLanes.test.ts`,
`courtLayout.test.ts`, `helpers.test.ts`, `tvSizing.test.ts`. No `CourtsView.test.tsx` exists
(verify - flagged in source note as a gap, not a broken path).

### OC25-OC29 Administration (via WorkspaceShellSurface.tsx)

| # | Route | Component | Tests |
| --- | --- | --- | --- |
| OC25 | /administration/team | `apps/console/src/modules/settings/PeopleAccessTab.tsx` (+ `memberActions.ts`, `memberIdentity.ts`, `inviteStatus.ts`) | `PeopleAccessTab.test.tsx`, `inviteStatus.test.ts`, `memberIdentity.test.ts` |
| OC26 | /administration/modules | `ModulesSettingsTab.tsx` + `ModuleCatalogRow.tsx` + `moduleCatalog.ts` | `ModulesSettingsTab.test.tsx`, `ModuleCatalogRow.test.tsx`, `moduleCatalog.test.ts` |
| OC27 | /administration/backups | `SyncBackupsTab.tsx` + `SyncReconciliationPanel.tsx` | `SyncBackupsTab.test.tsx`, `SyncReconciliationPanel.test.tsx` |
| OC28 | /administration/activity | `ActivityTab.tsx` + `apps/console/src/hooks/useActivityLog.ts` (path-suffix fork `WorkspaceShellSurface.tsx` L74-78) | `ActivityTab.test.tsx` |
| OC29 | /administration/lifecycle | `GeneralSettingsTab.tsx` + `DangerZoneTab.tsx` (stacked L80-90) | `GeneralSettingsTab.test.tsx` |

### OC30-OC33 Module guards -> `apps/console/src/app/workspace/ModuleUnavailablePanel.tsx` via `AppShell.resolveActivePane` + `apps/console/src/platform/domain/moduleModel.ts`

| # | Path | Trigger |
| --- | --- | --- |
| OC30 | /tournaments/:id/entries | `ENTRIES_SEGMENTS`; Entries absent from local catalog |
| OC31 | /tournaments/:id/setup | bare setup tab, Meet not enabled |
| OC32 | /tournaments/:id/roster | roster tab, Meet not enabled |
| OC33 | /tournaments/:id/matches | matches tab, Meet not enabled |

`REASON_COPY` L23-29; primary-action label `AppShell.tsx` ~L86 ('Displays' / 'Entries' /
'Setup - General'). Tests: `ModuleUnavailablePanel.test.tsx`,
`apps/console/src/app/__tests__/AppShell.guard.test.tsx`, `ModuleOutlet.test.tsx`,
`moduleModel.test.ts`.

### Shared match identity / names

- `apps/console/src/platform/domain/matchIdentity.ts`: `formatMatchIdentity`,
  `meetMatchIdentity`, `meetMatchIdentityFromStored`, `decomposeMeetEventRank`, type
  `MatchIdentity` (ADR 0009). 29 consumers incl. `CourtsView`, `ScheduleView`,
  `MeetDisplayPage`, `RunCourtGrid`/`RunSurface`/`RunQueue`/`RunFinished`,
  `UnifiedOpsBoard`/List, `PlanCallList`, `MoveMatchDialog`, `ScheduleDiffView`,
  `DisruptionDialog`, `BracketMatchesTab`, `bracketLabels.ts`, `lib/matchUtils.ts`,
  `lib/constraintChecker.ts`, `MatchInspector`, `opsBlock.ts`, `boardPlacements.ts`,
  `MatchesSpreadsheet`, `xlsxExports.ts`, `positionGrid/helpers.ts`. Pinned by
  `apps/console/src/platform/contracts/__tests__/matchIdentityContract.test.ts`.
- `apps/console/src/lib/names.ts`: `formatPlayerName` (now identity fn), `formatSideName`,
  `sideNameLines`, `sideSurnameLine`. Consumers: `RunCourtGrid`, `CourtsView`,
  `BracketMatchesTab`, `MatchesSpreadsheet`, `ParticipantPicker`, `BracketPlayerFields`.
- No `formatMatchRef`/`matchLabel` exists.

### Shared status presentation

`packages/design-system/components/statusTone.ts` (one tone->class map),
`StatusPill.tsx` (no dot/pulse, `rounded-xs`, 22px), `StatusBar.tsx`, `Badge.tsx`,
`CourtMark.tsx`; `apps/console/src/components/StatusPill.tsx` re-export;
`apps/console/src/components/control-plane/matchStatus.tsx` (`MatchListStatus`,
`STATUS_LABEL`, `STATUS_PILL_TONE`, `STATUS_TREATMENT`, `statusTallyItems`);
`apps/console/src/components/control-plane/HealthDot.tsx` (Hub row dots + legend);
`apps/console/src/lib/stateWords.ts` `STATE_WORD`;
`apps/console/src/modules/display/publicDisplay/LiveStatusPill.tsx`;
`apps/console/src/components/status/AdvisoryBanner.tsx`, `LockRibbon.tsx`;
`apps/console/src/platform/domain/lifecycle.ts` `lifecycleChip`; entrant
`apps/entrant/app/components/StatusChip.tsx`. Dot literals outside `HealthDot`:
`UnifiedOpsBoard.tsx` L339-340/L372, console `MatchCard.tsx` `WinnerDot`.

### Capture pipeline

`tools/surface-capture.mjs`: `CONSOLE_SURFACES` L58-101 (33, same order as OC01-33),
`ENTRANT_SURFACES` L103-146; env `WS_ID`, `SLUG`, `DRAW_KEY`, `DOUBLES_DRAW_KEY`,
`DISPLAY_TOKEN`, `AUTH_ME_URL`, `PLAYER_KEY`, `CAPTURE_SETTLE_MS`; console auth stubbed by
`page.route('**/api/auth/me')`; `VIEWPORTS` L276-279 desktop 1440x900, mobile 390x844,
`deviceScaleFactor` 2, `reducedMotion` reduce; PDF via `page.pdf` L507.
`tools/surface-capture-status.mjs`. `Makefile` L193-211 `surface-books` (needs demo stack
:8090/:8091, `jq` on seed manifest). `tests/e2e/tests/console-browser-contracts.spec.ts`
(7 tests), `tests/e2e/playwright.config.ts` 1440x900 workers 1;
`tests/e2e/run-console-contracts.sh` (disposable SQLite, API :8600, preview :4173, frozen
clock 2026-07-31T05:15:00+00:00), `tests/e2e/prepare-console-fixture.py` (T029 Taipei / T030
Korea), `tests/e2e/check-console-fixture.py`.

**Discrepancy note:** `tools/surface-capture.mjs` declares `ENTRANT_SURFACES` with 39 static
entries (verified by count on 2026-09-05), not 38 as an earlier exploration pass logged; see
`surfaces.md` for the reconciled total of 40 (39 static + the runtime-injected `Player
detail` surface, spliced in immediately after "Tournament - Players" at
`tools/surface-capture.mjs` L266-279 whenever a public person key resolves).

## Part 2 - Public entrant tier (40 surfaces: 39 declared + 1 runtime-injected)

Surface list = `tools/surface-capture.mjs` `ENTRANT_SURFACES` (39, confirmed by count) +
runtime-injected "Player detail" (L266-279) = 40. Routes declared in
`apps/entrant/app/routes.ts` (heavily commented). Viewports desktop 1440x900, mobile 390x844.

### A. Discovery + tournament (PE01-PE08, PE05b)

| PE | Path | Route module | Components | API | Client JS | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| PE01 | /e/ | `routes/discovery.tsx` | `NowStrip`, `SeasonControls`, `SeasonCalendar`, `SeasonStatusCell`, `EmptyState`, `PlayShell` | `entries_json.py`:669 `entry_page_list` (GET /e/api/pages) | - | `tests/discovery.render.test.ts` |
| PE02 | /e/?view=completed#calendar | same | same | same | - | same |
| PE03 | /e/{slug} | `routes/tournament.tsx` | `HeroHeader`, `TabBar`, `SectionCard`, `PlayShell` | `entries_json.py`:419 `entry_page_projection` | - | `tests/tournament.render.test.ts`, `tournament.meta.test.ts` |
| PE04 | ?tab=events | `tournament.tsx` | `EventRow` | + `entries_site.py`:1126 `draws_index` | - | same |
| PE05 | ?tab=players | `tournament.tsx` | `EntrantsList`, `PlayersList`, `PersonRef` | + `entries_site.py`:1344 `players_index` | `public/assets/entrants-filter.js`, `person-ref.js` | `tests/entrantsFilter.script.test.ts`, `personRef.test.ts` |
| PE05b | /e/{slug}/players/{personKey} | `routes/player.tsx` | `MatchCard`, `PersonGroup` | `entries_site.py`:1564 `player_page` | `person-ref.js` | `tests/player.render.test.ts` |
| PE06 | ?tab=draws | `tournament.tsx` | `EventRow` | `entries_site.py`:1126 | - | same |
| PE07 | ?tab=seeds | ALIAS of draws | | | | |
| PE08 | ?tab=winners | ALIAS of draws | | | | |

Aliases: `lib/phase.ts`:35-39 `Tab='overview'|'draws'|'players'`; `LEGACY_TABS`
`phase.ts`:353-358 `{events:'draws', seeds:'draws', winners:'draws', entrants:'players'}`;
`activeTab()` :361-367. PE04/06/07/08 all render `DrawsPanel`
(`tournament.tsx`:281-334). `/seeds` `/winners` API reads gone (`tournament.tsx`:102-105,
debt-log D37, ADR 0028).

"Local Workspace" origin: `apps/api/src/identity/auth.py`:233 (bootstrap user org name);
also `alembic` `n7e1f5a9b3c4_orgs_and_workspace_ownership.py`:175,201. Travels as
`org.name`: `entries_json.py`:474-476,500 (`NamedDTO`), :689,718 (`SeasonRow.organizer`).
Rendered: `tournament.tsx`:383 -> `HeroHeader.tsx`:56 (`<p class="text-sm
text-muted-foreground">{orgName}</p>` above `h1`); `schedule.tsx`:574;
`regulations.tsx`:123,216-219,259-260; `tournament.tsx`:143-145 `og:site_name`;
`SeasonControls.tsx`:164.

PE03: timezone mixing `tournament.tsx`:151-163 `tournamentDateLine()` uses
`formatDateLong` (UTC-based, `lib/format.ts`:38-44) + literal "Tournament time -
{timeZone}"; deadlines use `formatMoment` -> `formatUtcInstant` (:47-53) appending " UTC".
Players entered: `tournament.tsx`:186 sums `page.events[].entryCount` (per-event; multi-event
player counted N times); source `entries_public.py`:420-437 `_entry_counts`, consumed
`entries_json.py`:558. Repeated facts: `timeZone` at :161 and :187; `regulationsUpdatedAt`
:190 and :272-274. Fee sentence: `tournament.tsx`:230-248 "Quoted on the entry form before
you submit" + Go to entry form gated on `entriesOpen`. Intro fallback :189.

PE02: `discovery.tsx`:118-124 renders `NowStrip` above `<main>` regardless of
`filters.view`; source `season.now`; `viewRows` `phase.ts`:472-490; `COMPLETED_STATUSES`
`phase.ts`:412.

### B. Schedule (PE09)

`routes/schedule.tsx`; `MatchCard`, `SegmentedNav`, `HeroHeader`, `SELECT_CONTROL`; API
`entries_site.py`:2423 `schedule_matches` (GET /e/api/page/{slug}/matches); tests
`apps/entrant/tests/schedule.test.ts`, `tests/backend/test_public_schedule_api.py`.

Sort `entries_site.py`:2511: `key=(scheduledDate is None, scheduledDate, scheduledTime is
None, scheduledTime, matchKey)`. Nothing hoists `status==live`; a live match without a time
sorts to the tail. Pagination in-memory slice :2524-2526, `page_size` default 25 max 100
(:2433). Facets from pre-filter source :2503-2509; filters are Python comprehensions
:2504-2510.

Court missing: `MatchCard.tsx`:79 `courtLabel ?? (court!==null ? \`Court ${court}\` :
showAssignmentPlaceholders ? 'Court not assigned' : null)`. Mobile controls:
`schedule.tsx`:341 filter grid stacks to 5 rows of `h-10` below `md`, + day rail :277 +
`SegmentedNav` :414-422. `parseFilters`/`matchesPath` :60-93.

### C. Draw views (PE10-PE14)

One module `routes/draw.tsx`; API `entries_site.py`:1192 `draw_detail`; JS
`bracket-path.js` (:676), `person-ref.js` (:44); tests `draw.render.test.ts`,
`bracket-path.script.test.ts`, `tests/e2e/tests/11-public-bracket-geometry.spec.ts`.

| PE | Path | Branch |
| --- | --- | --- |
| PE10 | /e/{slug}/draws/{key} | bracket (default) `draw.tsx`:630-675 |
| PE11 | ?view=round&round=1 | `draw.tsx`:603-629 `RoundPager` + `MatchList` |
| PE12 | ?view=list | `draw.tsx`:596-602 `MatchList` |
| PE13 | ?view=path&player= | ALIAS -> bracket (view whitelist `draw.tsx`:91-96 only `round`\|`list`); `?player=` filter (`playerQuery`/`pathRounds` :467-489) narrows `MatchList` in list/round only; in bracket becomes `data-pinned-person` (:639) + `data-person-ids` (:651) highlighted by `bracket-path.js` |
| PE14 | doubles key | bracket branch |

Geometry: `MatchCard.tsx`:99-106 variant `bracket-node` `h-[44px] w-64`, `Side` rows
`h-[22px]`, `PersonGroup` `'block min-w-0 truncate'` (:32-41); score cols
`repeat(3,1.8rem)`=86px -> ~156px for names. Layout `draw.tsx`:636-638 `flex w-max
min-w-full` in `div.overflow-x-auto` (:635) in `section[aria-label="... bracket"]`
(:631-634); rounds `w-64 shrink-0` (:644); `ConnectorColumn` `w-8` (:425); slots
`min-h-[50px]` (:655). View switch `draw.tsx`:280-308 `SegmentedNav` bracket/round/list.
Repeated headers: per-round `h2` :645-647 + `MatchCard` header band :110-118. Raw dates:
`MatchCard.tsx`:75-81 `playedOn` verbatim. "Final": `draws.types.ts`:214-218 `roundLabel`;
`MatchCard.tsx`:83; `EventRow.tsx`:32-39 `displayEventCode`; `eventCodeLabel`
`draws.types.ts`:177-179 strips only `-MS`|`WS`|`MD`|`WD`|`XD` suffix. Zero-round:
`draw.tsx`:375 guard in `MatchList` only.

Note: `surfaces.md` records PE12 (per this program's finding table) as the "Singles player
path" capture (`?view=path&player=Zhu`) and PE13 as "Singles match list" (`?view=list`) - the
opposite pairing from the labels this map's original exploration pass used above. Both
namings trace to the same underlying code; Phase 1 verification should settle which PE
number the actual reviewed PDFs used before dispositions are written against it.

### D. Regulations (PE15)

`routes/regulations.tsx`; JS `regulations.js` (:268); tests
`regulations.script/unit.test.ts`. `parseRegulationSections` :43-99; single section ->
'Full regulations' (:82), sticky aside "On this page" :226-238. Body `whitespace-pre-line`
(:253) no `break-words`, `md:sticky` two-column grid.

### E. Entry form (PE16-18)

`routes/enter.tsx`; paths `/e/{slug}/enter`, `/enter/signed-in`, `/enter/created`.
`StickyTotalBar`, `SectionCard`, `PlayShell`, `formField.ts`, `money.ts`, `echo.ts`. API
submit `entries_json.py`:1123 (`/e/api/submit/{slug}`, `enter.tsx`:574), quote :1044 (:679),
logout `entrants_routes.py`:774 (:698). JS `entry-wizard.js` (:718). Tests
`enter.render`/`loader`/`quote`, `entry-wizard.script`, `noClientFeeRules`. Closed heading
`enter.tsx`:408 (`h1` `PAGE_TITLE`), closed block :557 `data-entry-closed`.

### F. Account (PE19-34)

`login.tsx`: `/e/login`, `/login/created`, `/login/failed`, `/login/signed-in`.
`signup.tsx`: `/e/signup`, `/e/signup/{slug}`, `/e/signup/partner/:token`. `verify.tsx`:
`/e/verify`, `/verify/done`, `/verify/failed`, `/verify/sent`. `resetPassword.tsx`:
`/e/forgot`, `/e/reset`, `/reset/sent`, `/reset/done`, `/reset/failed`,
`/reset/password-failed`.

Forms POST to FastAPI `identity/entrants_routes.py`: login :676 (`login.tsx`:294), signup
:569 (`signup.tsx`:226), verify :810, resend-verification :863, request-password-reset :902,
reset-password :976, logout :774. Signup loader `entries_json.py`:617 `entrant_config`
(Turnstile), JS `turnstile.js`.

Safe return: `apps/entrant/app/lib/nextTarget.ts`:20 `SAFE_NEXT=/^\/e\/[A-Za-z0-9\/_.~-]*$/`,
`safeNext` :33 (rejects `..`); backend twin `entrants_routes.py`:231 `_SAFE_NEXT`,
`next_target` :293-308. Callers `login.tsx`:166, `resetPassword.tsx`:74, `signup.tsx`:171
(slug->`/e/{slug}/enter`), :175 (token->`/e/partner/{token}`). No query strings allowed
(`routes.ts`:40-56).

Signed-in detection: `lib/session.server.ts` `ENTRANT_SESSION_COOKIE` `'sw_play_session'`
(:56); `hasEntrantSession(request)` :66-74 boolean presence only; published via
`lib/sessionContext.ts` -> `PlayShell.tsx` (Sign in vs My entries). `viewer.signedIn` in
projection always false. Tests `headerSession`, `login`, `logout`, `signup`,
`recovery.render`, `routeConfig`.

### G. Partner / my entries / receipt (PE35-39)

| PE | Path | Module | API | JS | Tests |
| --- | --- | --- | --- | --- | --- |
| PE35 | /e/partner(?token=), /e/partner/{token} | `routes/partner.tsx` | `partner_routes.py`:217 preview (`partner.tsx`:83) | - | `partner.render.test.ts` |
| PE36 | /e/partner/accepted | same | :260 accept (form :199) | `partner-accepted.js` (:130) | `partner-accepted.script.test.ts` |
| PE37 | /e/partner/failed | same; reason `partner_routes.py`:121 `_failed_url` | | | |
| PE38 | /e/me/entries | `routes/myEntries.tsx` (anon SSR shell) | browser `entries_me.py`:297 `my_entries` | `my-entries.js` (:50) | `myEntries.render`/`script` |
| PE39 | /e/{slug}/receipt/{submissionId} | `routes/receipt.tsx` | browser `entries_me.py`:554 `submission_receipt` | `receipt.js` (:203) | `receipt.test.ts`, `receipt.script.test.ts` |

PE39 gate: `receipt.tsx`:180-193 `section#receipt-details-root` `aria-busy` "Loading
receipt details"; :163-165 header subcopy; :195-201 `noscript` "Sign in to view the full
receipt"; `receipt.js`:316-327 swaps to sign-in on 401 only; :329 404; :339 other. Loader
returns only `{tournamentName}` (:68-70). Reference: `receipt.tsx`:82 UUID regex; rendered
:173-176 `<code class="tabular-nums">` under "Reference"; no short reference exists.

### H. Styling

Tailwind + design-system tokens (`packages/design-system/tokens.css` +
`tailwind-preset.js` via `apps/entrant/tailwind.config.js`; `apps/entrant/app/app.css`
single stylesheet). Class vocabulary `apps/entrant/app/lib/ui.ts`: `CARD_SKIN`:23,
`CARD`:32, `LIST_CARD`:38, `LIST_CARD_ROW`:41, `PAGE_TITLE`:50, `SECTION_TITLE`:51,
`EYEBROW`:54, `CHIP`:61, `INPUT_SKIN`:68, `FIELD_INPUT`:71, `FIELD_LABEL`:75,
`SELECT_CONTROL`:78, `BUTTON_SECONDARY`:81. Public radius `rounded-lg` (ADR 0020).
`public/assets/*.js` cannot import `ui.ts`; inline twins pinned by
`apps/entrant/tests/uiTwins.test.ts`. Guards: `noRawColor`, `design-system`, `noEmDash`,
`noTruncation`, `pageSystem`, `publicUniversality`, `boundaries` tests.

### I. Formatters

`person-ref.js` `personRefModel` (SSR+browser), `PersonRef.tsx`, `PersonGroup.tsx`;
`MatchCard.tsx`:85-89 pairs `' / '`, sides `' versus '`. `lib/format.ts` `monthShort`:22,
`dateOfIso`:31, `formatDateLong`:38, `formatUtcInstant`:47, `formatMoment`:56 (no `Intl`,
all `getUTC*`). `lib/phase.ts` `parseMoment`, `parseIsoDate`, `monthLong`, `visibleTabs`:333,
`activeTab`:361, `rowMatches`:392, `viewRows`:472. `lib/draws.types.ts`
`eventCodeLabel`:177, `eventDisciplineLabel`:193-201, `roundLabel`:214, `kindLabel`,
`entryCountLabel`:233. Backend name key `entries_site.py`:412 `_alphabetic_name_key`;
grouping `EntrantsList.tsx`:35-58 `letterOf`.

### J. Browser suites + CSP

`tests/e2e/playwright.geometry.config.ts` + `tests/e2e/tests/11-public-bracket-geometry.spec.ts`
(no Docker; Vite in-process, fixture `apps/entrant/tests/helpers/entryPage.fixture.json`;
1440x900). `tests/e2e/tests/10-entrant-r11-evidence.spec.ts` (full stack, 390+1440, not a PR
gate). Vitest unit+SSR configs (51 files). CSP `infra/nginx/security-headers.conf`:82
`script-src 'self' $sw_turnstile_origin`, no `unsafe-inline` -> all JS external modules;
`form-action 'self'` -> `play.conf` terminates `/e/api/` + `/e/account/` (`play.conf`:58).
`apps/entrant/tests/helpers/nginxConf.ts` helper: `assertOneServerBlockPerTier`.
`sw_play_session` must match `settings.entrant_session_cookie_name` and
`http-shared.conf` Cookie allowlist.

## Part 3 - Design system inventory (`packages/design-system`)

**Files:** `tokens.css` (576 ln, primitives -> semantic per theme), `tailwind-preset.js`
(379), `DESIGN.md` (rewritten 2026-09-05, 343 -> 90 ln), `DESIGN_COLOR.md` (84), `MOTION.md`
(373, enforced by console `motionContract.test.ts`), `BRAND.md` (superseded stub),
`globals.css` (458; `.type-display`, `.eyebrow`), `figma-tokens.json` (generated by
`tools/export-figma-tokens.mjs`), `scripts/check-contrast.mjs` + `check-classes.mjs` (`npm
run test:contrast` / `test:classes`), `icons/index.tsx`, `lib/utils.ts` `cn()`. No package
README.

**Components:** `Avatar`, `Badge` (`rounded-xs`, `h-badge` 22), `Button`
(default/brand/ink/destructive/outline/secondary/toolbar/ghost/link x
xs/sm/default/lg/icon/icon-sm/icon-xs), `Card` (bare/frame/elevated), `CourtMark`,
`EmptyState` (centered/card/editorial), `GanttTimeline`, `Modal`, `Notice`, `Select`
(Radix), `Separator`, `StatusBar`, `StatusPill` (no dot, `rounded-xs`, 22px),
`statusTone.ts` (the tone map), `textStyles.ts` (`EYEBROW_CLASS`), `TextField`, `Toast`.

**Tokens:** spacing `--space-0..10` = 0/2/4/8/12/16/24/32/48/64/96 (`b-0..b-10`) + density
`cell`/`cell-y`/`section`/`gap`. Radii `xs` 4, `sm` 6, `DEFAULT` 8, `md` 9, `lg` 12, `xl` 14.
Type ladder `3xs` 10, `2xs` 11, `xs` 12, `2sm` 13, `sm` 14, `base` 16, `lg` 18, `2xl` 24 +
new role tokens `support` 12 / `console` 14 / `public` 16 / `section` 20 / `page` 28. Fonts:
`--font-sans` Geist Variable; `--font-display` Archivo Variable (stretch 84%, weight 650,
tracking -0.03em) via `.type-display`; `--font-mono` JetBrains Mono. Colours light:
`surface-sunken` #EDEFF2, `surface-base` #F6F7F9 (canvas), `surface-raised` #FFFFFF,
`text-primary` #111827, `text-secondary` #374151, `text-muted` #5C6470, `action-primary`
#2563EB, hover #1D4ED8, `selected-bg` #EFF6FF, `border-hairline` #E5E7EB, `border-strong`
#6B7280. Density: `--density-row-h` 32 (compact 28), `cell-py` 6/4, `cell-px` 12/8, `gap`
16/12, `section-gap` 24/16, `badge-h` 22/18 (`h-row`, `h-badge`, `p-cell`). Button/input
heights are literals (`h-8`/`9`/`10`/`11`; entrant `FIELD_INPUT` `h-10`). Shadows as of the
2026-09-05 baseline diff: light `shadow-hard` none (was `0 3px 0` rule), `shadow-card` none
(was `0 1px 2px`), sm/md/lg/frame kept; dark sm/hard/card none.

**House rules:** one accent (`DESIGN_COLOR.md` rule 1); status is colour+text, nothing is a
pill, no dots (ADR 0027 d4; ADR 0028 d4); chips reserved for exceptional states (old
`DESIGN.md` X6, deleted in the 2026-09-05 rewrite; `matchStatus` property test still enforces
it); sentence case (`DESIGN.md`); no em dashes (console `emDashContract.test.ts`, entrant
`noEmDash.test.ts`; exception R-PAIR-7 table empty mark); no raw hex; status colours never
brand colours; never pure `#000`/`#FFF`. ADR 0020: card radius per tier (console
`rounded-sm`, entrant `rounded-lg`), `statusTone` single source, `EmptyState` variants,
`Button` for ops dialog primaries. ADR 0027 partially supersedes ADR 0020(1): radius by
role.

Entrant consumes tokens (`app.css` imports `tokens.css` + `globals.css`; tailwind preset),
owns only class-string vocabulary in `lib/ui.ts`; twins in `public/assets` pinned by
`uiTwins.test.ts` (historical baseline note; runtime checks are recorded separately from the 74-finding register).

## Part 4 - Docs conventions

`docs/audits/`: dated program records, no frontmatter, format `# <PROGRAM> - <title>`, bold
metadata block (Date/Audit base/Scope/Status), baseline suite counts, findings table with
stable IDs, rulings, verification record. Outside the VitePress sidebar but inside
`docs:build` (dead internal links fail the build); outside `tools/docs-paths.mjs`
`DOC_ROOTS` (path tokens in this tree are not validated by `docs:paths`, which is why every
path above was checked by hand with `ls`/`find` instead).

`docs/reference/debt-log.md`: IDs `D<n>` (latest as of the baseline diff: D39); sections
Open - needs owner decision (`| # | What | decision owed | Size |`), Open - genuinely
large, Open - small and unscheduled (bullets), Recorded deliberately, Open incident, Closed
(newest first, bold `**YYYY-MM-DD - D<n> title.**`).

ADR: no frontmatter, `# 00NN - Title`, `**Status:** Accepted - date.`, `## Context` /
`## Decisions` (numbered, bold one-line ruling) / `## Consequences`; register in
`docs/explanation/decisions/index.md` Records table AND `docs/.vitepress/config.mts`
sidebar (sidebar stops at 0024 as of the baseline diff; ADRs 0025-0028 are missing from
it).

`docs:paths`: every path-shaped token (even in backticks) under `DOC_ROOTS` must exist;
escape with `<!-- docs-paths-ignore-next-line: reason -->`. `docs/reference/design-system.md`
and `docs/reference/surface-map.md` exist (`design-system.md` is stale re: shadows/Button/Card
per the baseline diff).

## Verification note

All file paths cited above were checked against the working tree with `ls`/`find` on
2026-09-05 while building this scaffold. Two path corrections from the original two
exploration notes: the console app entry is `apps/console/src/app/App.tsx` (not
`apps/console/src/App.tsx`), and `passwordPolicy.ts` lives at
`apps/console/src/platform/auth/passwordPolicy.ts` (not `apps/console/src/lib/`). Both are
corrected in Part 1 above rather than marked "(verify)", since the correct paths were
located. No path in this document required a "(verify)" marker after that correction.
