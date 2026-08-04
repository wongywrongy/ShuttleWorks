# Interaction inventory — every interactive element, by view (Stage 1.2)

> Interaction-bug audit, Stage 1 deliverable. Statically enumerated from
> `products/scheduler/frontend/src` on 2026-07-10 (branch `dev/workspace-suite`).
> Format per line: `file:line | element | accessible name | handler | notes`.
> Flags: **⚠ NO ACCESSIBLE NAME** = interactive element a screen reader cannot
> name; **[MOUSE-ONLY]** = clickable non-button (`div`/`li`/`tr` with `onClick`,
> no `role`/`tabIndex`/key handler) — works by pointer only.
>
> Companion: the empirical press-everything results live in
> `INTERACTION_FINDINGS.md`; raw sweep JSON in
> `products/scheduler/e2e/interaction-sweep/results/`.

## Summary flags (the cross-cutting problems)

**Accessible-name gaps** — remarkably few; every icon-only `<button>` in the
app carries an `aria-label` and/or `title`. The genuine gaps:

| where | what |
|---|---|
| `components/common/Modal.tsx:92` (and DS `Modal.tsx:101`) | backdrop-close `<div onClick>` — no accessible name, and **no dialog in the app has a labeled Close button** (Escape/backdrop only) except where callers add Cancel |
| `products/hub/WorkspaceRow.tsx:124` | row-select `<div onClick>` — no role/name (embeds interactive children) |
| `meet/control-center/ScoreEditor.tsx:136,150,371,383` | score `<input type=number>`s — visible label is a sibling div, **no programmatic label** (no `htmlFor`/`aria-label`) |
| `ScoreEditor.tsx:342` | Deuce checkbox — same unassociated-label pattern |
| `bracket/BracketRosterTab.tsx:223` | add-player name `<input>` — placeholder only |
| `bracket/BracketMatchesTable.tsx:105` | schedule search `<input>` — placeholder only |
| several (DragGantt MatchBlock, GanttChart block, ScoreEditor Format toggle) | named via `title` only (weak name) |

**Mouse-only clickable rows** (systemic — no keyboard path to the row action):
`BandedTable.tsx:97` rows (Meet Matches + both rosters + bracket matches),
`MatchesTable.tsx:225/267` `<tr>`, `BracketMatchesTable.tsx:185` `<tr>`,
`ScheduleView.tsx:102` chips, `LiveMatchList.tsx:117` `<li>`,
`UnifiedOpsList.tsx:110` `<li>`, `RunQueue.tsx:55` `<li>`,
`RosterTab.tsx:682` `<li>`, workflow cards (`UpNextCard.tsx:144`,
`FinishedCard.tsx:53`, `InProgressCard.tsx:62`), `GanttChart.tsx:374` block
`<div>`. Keyboard-correct exceptions that prove the pattern exists in-repo:
`LiveView.tsx:152` chip and `MatchDetailsPanel.tsx:768` impacted row (both
`role="button"` + `tabIndex` + Enter/Space).

**`window.confirm` usage** (banned by the design canon; also blocks automation):
`BracketDrawsTab.tsx:468` Re-generate, `BracketDataSection.tsx:76` Reset
bracket, `LiveMatchList.tsx:158/167` + `bracket/MatchDetailPanel.tsx:174/190`
winner buttons.

**Unguarded destructive one-clicks:** delete player (`RosterTab.tsx:704`),
delete match (`MatchesSpreadsheet.tsx:407`) — irreversible, no confirm/undo.
Contrast: Generate-replace and Remove-player use the canon two-click arm.

---

## 1 · Hub (`/`)

### HubPage — `products/hub/HubPage.tsx`
- `221 | search input | "Search workspaces" (aria-label) + ⌘K | setQuery | Cmd/Ctrl+K focuses`
- `235 | Button New workspace | "＋ New workspace" | navigate('/new') |`
- `53/246 | FilterChip ×5 (All/Active/Draft/Shared/Needs attention) | label+count | setFacet | aria-pressed`
- `280 | Button Create workspace (empty state) | "Create workspace" | navigate('/new') | 0-workspace state only`
- `355 | Modal delete confirm | "Delete …?" | closeDeleteDialog |`
- `383 | Button Cancel (modal) | "Cancel" | closeDeleteDialog | disabled while deleting`
- `386 | Button Delete permanently | "Delete permanently"/"Deleting…" | handleDelete | MUTATES deleteTournament`

### SortControl — `products/hub/SortControl.tsx`
- `18 | select | "Sort workspaces" (aria-label) | onChange |`

### WorkspaceRow — `products/hub/WorkspaceRow.tsx`
- `124 | row div onClick | ⚠ NO ACCESSIBLE NAME (intentional container) | onSelect | populates inspector`
- `148 | next-action button | action.label ("Open workspace"/"Set date") | onSetDate/onOpen | stopPropagation`
- `167 | OverflowMenu trigger | "More actions" | opens menu | items: Settings→navigate; Delete→delete modal (owner only)`

### WorkspaceInspector — `products/hub/WorkspaceInspector.tsx`
- `123 | primary action Button | action.label | onSetDate/onOpen | navigates`
- `129 | settings Button (gear) | "Workspace settings" (aria-label) | onSettings |`

## 1b · New workspace (`/new`) — `products/hub/NewWorkspacePage.tsx`
- `98 | TemplateCard button ×N | template title | pick(id) | aria-pressed`
- `105 | Custom template button | "Custom" | pick('custom') | reveals CustomModulesBuilder`
- `133/144 | Name text input / Date input | via label wrapper | setName/setDate | disabled while creating`
- `156 | Button Cancel | "Cancel" | navigate('/') |`
- `159 | Button Create workspace | "Create workspace"/"Creating…" | handleCreate | MUTATES createTournament → navigate`
- `CustomModulesBuilder.tsx:36 | tri-state button ×9 (Enabled/Available/Off per module) | state label; group aria-label=module | onChange | aria-pressed, local`

## 2 · Global settings (`/settings`) — `products/settings/GlobalSettingsPage.tsx`
- `312 | section button ×6 (Profile/Security/Sessions/Modules/Appearance/Notifications) | label | setSearchParams | aria-pressed; URL sub-states`
- ProfilePage `100/113` | Change photo / Save changes | disabled (LOCAL_DEV)
- SecurityPage `128-134` | 3 password inputs + Update password | disabled (LOCAL_DEV)
- SessionsPage `184` | Button Sign out | "Sign out" | signOut() | MUTATES auth
- AppearanceSettings `41/51` | Theme radiogroup (Light/System/Dark), Density (Comfortable/Compact) | aria-labels | setTheme/setDensity | immediate persist
- Modules/Notifications pages: no interactive elements

## 3 · Workspace shell / sidebar / Overview / admin

### AppSidebar — `app/AppSidebar.tsx`
- `37/48/61 | Home / Global settings / Account links | aria-labels | navigate | aria-current`

### WorkspaceShell + IdentityBar — `platform/product-shell/`
- `WorkspaceShell.tsx:43 | admin gear button | "Workspace administration" | navigate ws-members | aria-pressed`
- `WorkspaceIdentityBar.tsx:51 | back button | "Back to workspaces" | navigate('/') |`

### WorkspaceSidebar — `platform/product-shell/WorkspaceSidebar.tsx`
- `71 | NavItem button (Overview + every segment + admin items) | label | go(segment) | aria-current`
- `111 | section trigger (chevron) | section label + role badge | toggle collapse | aria-expanded, no navigation`

### AppStatusPopover — `components/AppStatusPopover.tsx`
- `107 | status chip button | "Solving"/"Degraded"/"Idle" | toggle popover | aria-expanded, aria-haspopup`
- `132 | Refresh | "Refresh health" (aria-label) | refreshHealth |`
- `185 | Back up now | "Back up now"/"Backing up…" | handleBackupNow | MUTATES createBackup; aria-busy`
- `195 | Manage backups | "Manage backups" | setActiveTab('setup')+close |`

### WorkspaceOverview — `products/workspace/WorkspaceOverview.tsx`
- `140 | readiness step button (per incomplete step) | step label | navigate(target) |`

### ws-venue — `products/workspace/VenueScheduleTab.tsx`
- `62/74/92/100 | Courts NumberInput / Slot duration / Day start / Day end | aria-labels | set(...) | MUTATES (debounced PUT)`

### ws-members — `products/settings/PeopleAccessTab.tsx` — no interactive elements (read-only)

### ws-sharing — `products/settings/SharingTab.tsx`
- `124/127 | Copy / Open fullscreen | labels | clipboard / window.open |`
- `139 | invite role Select | "Invite role" | setRole |`
- `146 | Button Create invite | "Create invite"/"Creating…" | create() | MUTATES createInvite`
- `185/189 | per-invite Copy / Revoke | labels | copy / revoke(token) | Revoke MUTATES`

### ws-modules — `products/settings/ModuleCatalogRow.tsx`
- `47/51 | Disable / Enable per module | labels | disable(id)/enable(id) | MUTATES; 409→toast`

### ws-sync — `products/settings/SyncBackupsTab.tsx`
- `44 | Create backup | "Create backup"/"Creating…" | createBackup | MUTATES`
- `79 | Restore (per backup) | "Restore" | opens confirm modal |`
- `99/102 | modal Cancel / Restore workspace | labels | confirmRestore | MUTATES restoreBackup`

### ws-settings — `products/settings/GeneralSettingsTab.tsx` + `DangerZoneTab.tsx`
- `61/71/81 | Name / Date / Status Select | aria-labels | local state |`
- `89 | Save changes | "Save changes"/"Saving…" | save() | MUTATES updateTournament`
- `DangerZone 55 | Archive | "Archive"/"Archived" | archive() | MUTATES`
- `DangerZone 68→87 | Delete → modal → Delete permanently | labels | del() | MUTATES deleteTournament → navigate('/')`

## 4 · Display

### display-config — `products/workspace/DisplayConfig.tsx` + `displayConfig/DisplayLayoutEditor.tsx`
- `72-81 | public URL readonly input / Copy / Open | labels | copy / new tab |`
- `285/296/309/330 | Seg: Display mode / Grid columns / Card size / Standings mode | aria-labels | update({tv*}) | MUTATES debounced`
- `320 | Toggle Show scores | "Show scores" | update | role=switch`
- `347 | Reset button | "Reset court order & visibility" | resetCourtLayout | shown when customized`
- `CourtOrderRow 159 | drag handle span (dnd-kit) | "Court {id} — drag to reorder" (title) | sortable | not a button, no keyboard-drag affordance`
- `CourtOrderRow 174/196 | hide/show eye button; "Show" nudge | aria-labels | onToggleHidden |`

### tv preview — `products/display/DisplayProduct.tsx`
- `28 | Configure display | label | navigate |`
- `36 | Open fullscreen link | label | new tab |`

### Public display (`/display`) — `MeetDisplayPage.tsx` / `bracketDisplay/BracketDisplayPage.tsx`
- Meet `428/431 | Courts / Schedule tabs | labels | setView |`
- Meet `316/440 | FullscreenButton | "Fullscreen"/"Exit fullscreen" | toggleFullscreen | aria-pressed; F key`
- Bracket `83 | view tab role=tab ×N | labels | setParam('view') | sub-states`
- Bracket `97 | Event Select | "Event" | setParam('event') |`

## 5 · Auth — `platform/auth/LoginPage.tsx`, `InvitePage.tsx`
- Login `49 | Continue (local-dev banner) | "Continue" | navigate |`
- Login `98/110/125 | Email / Password / Sign in submit | labels | handleEmailLogin | MUTATES supabase`
- Login `139 | Continue with Google | label | OAuth redirect |`
- Invite `119/122 | Cancel / Accept invitation | labels | acceptInvite | MUTATES`

---

## 6 · Meet — Roster (`roster`)

### RosterTab — `products/meet/roster/RosterTab.tsx`
- `269 | Export XLSX | label | exportRosterXlsx | disabled without groups+players`
- `413 | school tab pill | name+count | onSelect | aria-current`
- `466→508 | ＋ Add school popover (input/Cancel/Add) | labels; input placeholder-only | addGroup | MUTATES store`
- `573→615 | ＋ Bulk import popover (textarea/Cancel/Add {n}) | labels; textarea placeholder-only | addPlayer×N | MUTATES`
- `682 | player row li | player name | togglePlayer | [MOUSE-ONLY]`
- `704 | delete player × | "Remove {name}" | deletePlayer | MUTATES, hover-revealed, **NO GUARD**`

### Position grid — `roster/positionGrid/*`
- `GridHeader 51 | column drag handle | title "{full} — drag to reorder" | dnd-kit sortable |`
- `GridHeader 61/89/101 | hide column / restore column / reset columns | aria-labels | toggleVisible/resetColumns |`
- `PositionCell 122 | filled cell | — | onDoubleClick → reassign picker | double-click affordance`
- `PositionCell 133/153 | ＋ add partner / ＋ add pair/player | labels | open picker |`
- `CellChips 31 | occupant chip | name (title hints) | onSelect |`
- `CellChips 39 | unassign × | "Unassign {name}" | unassignRank | role=button + keyboard ✓; MUTATES`
- `DraggablePlayerChip 28 | pool chip button | name | drag source |`
- `PlayerSearchPicker 85/118/148 | search input (placeholder-only) / candidate buttons / Done | | assignRank | MUTATES`

### PlayerDetailPanel (drawer)
- `106/126/154 | School Select / Min rest number / Notes textarea | labels | updatePlayer | MUTATES`
- `235 | rank chip (MS1/WD2…) | rank code (title) | assign/unassignRank | MUTATES; aria-pressed; blocked-disable`
- + shared `AvailabilityControl`, `EventsControl` (see §10)

## 7 · Meet — Matches (`matches`)

### MatchesTab / MatchesSpreadsheet — `products/meet/matches/*`
- `92 | search | "Search matches" | setSearchQuery (URL ?q=) |`
- `104/138 | ＋ Add match (+empty-state variant) | labels | addMatch | MUTATES; disabled <2 players`
- `114 | Export XLSX | label | exportMatchesXlsx |`
- `RegenerateMenu 149→177 | Regenerate popover → Regenerate | labels | importMatches | MUTATES (replaces lineup)`
- `211 | BandedTable rows | match label | setSelectedId | [MOUSE-ONLY]`
- `MatchRow 353/373 | event Select / free-text | "Event" | onUpdate | MUTATES`
- `MatchRow 407 | delete match × | "Delete match" | deleteMatch | MUTATES, hover-revealed, **NO GUARD**`
- `PlayerCellEditor 581/601/612/633/442 | add/edit/remove player buttons + picker rows | labels | onChange | MUTATES`

### MatchDetailPanel (drawer) — `products/meet/matches/MatchDetailPanel.tsx`
- `125 | player card collapse | name | toggle | aria-expanded`
- + shared availability/events fields

## 8 · Meet — Configuration (`setup`)
- `TournamentSetupPage 94 | Save (form submit) | "Save"/"Saving…"/"Saved" | confirmUnlock→updateConfig | MUTATES`
- `MeetStructureForm 113/138-152 | Meet type Seg; MS/WS/MD/WD/XD NumberWithSuffix ×5 | aria-labels | local form |`
- `EngineSettings 171-312 | Rest / Break start+end+Clear/None / Reproducible / Time limit / Freeze horizon / Court-util Toggle+RangeSlider / Game spacing / Compact / Overlap | aria-labels | local form → Save |`

## 9 · Meet — Plan (`schedule`) & Run (`live`)

### SchedulePage toolbar — `products/meet/SchedulePage.tsx`
- `311 | Export XLSX | label | exportScheduleXlsx |`
- `327/337/346 | Director / Re-plan / Disruption | titles | open dialogs |`
- `ScheduleActions 43 | Generate | "Generate"→"Click again to replace"/"Replace LIVE schedule?" | generateSchedule | MUTATES re-solve; two-click guard (4s), aria-busy`
- `StaleBanner 29/37 | Keep anyway / Re-solve | labels | setStale/generateSchedule |`
- `469 | generate matches Link | label | navigate |`

### DragGantt — `products/meet/schedule/DragGantt.tsx`
- `356 | closed-court label button | "Court N is closed…" | onRequestReopenCourt → Director |`
- `454 | DndContext drag-to-reschedule | — | validateMove → pinAndResolve | MUTATES re-solve`
- `648 | MatchBlock button (draggable) | matchLabel (title-only name) | onSelect + drag |`
- `TimelineKey 36 | "?" key | "Timeline key" | toggle popover |`

### MatchesTable (Plan) — `products/meet/schedule/MatchesTable.tsx`
- `168/178 | By Time / By Court | labels | onViewChange |`
- `225/267 | match tr | row text | onSelectMatch | [MOUSE-ONLY]`

### ScheduleSidebar — `products/meet/schedule/ScheduleSidebar.tsx`
- `121-135 | Log / Details / Candidates tabs | labels | setSidebarTab | aria-selected`
- `CandidatesPanel 66 | candidate button | "Candidate #N" | setActiveCandidateIndex | MUTATES assignments`

### MatchControlCenterPage (Run) — `products/meet/MatchControlCenterPage.tsx`
- `511/531/541 | Export XLSX / Director / Disruption | labels | dialogs |`
- `553 | Re-optimize | "Re-optimize"/"Optimizing…" | triggerReoptimize | MUTATES re-solve`
- `622/674 | collapse/show details | aria-labels | setDetailsOpen |`
- `716 | close director × | "Close director tools" | cancelProposal + close | MUTATES (discards proposal)`

### GanttChart (Run) — `products/meet/control-center/GanttChart.tsx`
- `291 | closed-court label button | aria-label | → Director |`
- `374 | match block div | title-only name | onMatchSelect | [MOUSE-ONLY]`

### AlertsActivityPanel / SuggestionsRail / AdvisoryBanner
- `AlertsActivityPanel 107 | collapse toggle | "Alerts & Activity" | setCollapsed | aria-expanded`
- `AlertsActivityPanel 75 | Review (per alert) | "Review" | onReview → dialog routing |`
- `SuggestionsRail 65 | + N more | label | setShowAll |`
- `SuggestionRow 60/72/81 | title expand / Apply / Dismiss × | labels | apply/dismiss | MUTATES`
- `AdvisoryBanner 52 | Review | "Review" | onReview | +N-more count`

### MatchDetailsPanel (Run rail + Plan sidebar) — `products/meet/control-center/MatchDetailsPanel.tsx`
- `386/396/408/417/430/439 | Call / Postpone-Restore / Start / Score ×2 / Undo start | titles | onUpdateStatus | MUTATES command queue; Call disabled on red light`
- `296 | Edit score | aria-label | setMode('score') |`
- `550 | check-in toggle | "Check in"/"Mark as not checked in" | handleConfirmPlayer | MUTATES`
- `581/599/643 | Sub / Remove (two-click, 4s) / sub candidate | aria-labels | substitute/remove | MUTATES`
- `768 | impacted row | title | onSelectMatch | role=button + keyboard ✓`
- `811/829/838/847 | Move-postpone… / Mark overrun / Cancel match / Close court | titles | dialog intents |`

### ScoreEditor (inline) — `products/meet/control-center/ScoreEditor.tsx`
- `124/297 | cancel × ×2 | "Cancel score entry" | onCancel |`
- `136/150/371/383 | score number inputs | ⚠ NO PROGRAMMATIC LABEL | setA/setB/updateScore |`
- `342 | Deuce checkbox | ⚠ unassociated label | setDeuceEnabled |`
- `312/327 | Sets to win / Pts per set Selects | aria-labels | |`
- `162/170/409/417 | Cancel / Save ×2 | labels | onUpdateStatus('finished') | MUTATES; disabled until complete`

### WorkflowPanel + cards — `products/meet/control-center/workflowPanel/*`
- `181/192 | Up Next / Finished tabs | labels+counts | setActiveTab |`
- `UpNextCard 144 | card | — | onSelect | [MOUSE-ONLY]`
- `UpNextCard 170/199/268/285/307/324 | check-in pills / All in / Call / Postpone / Start / Undo | aria-labels+titles | onUpdateStatus etc | MUTATES`
- `InProgressCard 62/90/103 | card [MOUSE-ONLY] / Score / Undo | | |`
- `FinishedCard 53/82 | card [MOUSE-ONLY] / Undo finish | | onUpdateStatus | MUTATES`

### Dialogs shared by Plan+Run
- **WarmRestartDialog** `127/144/151/97 | weight options ×3 / Cancel / Preview impact / Commit replan | labels | createWarmRestart→commit | MUTATES`
- **MoveMatchDialog** `222/234/252/269/279/301/308/150 | Postpone-MoveTo modes / delay-time-court inputs / Cancel / Preview / Commit move | labels | createManualEdit→commit | MUTATES`
- **DisruptionDialog** `152/171/191/207/221/253/271/282/289/129 | type chips ×4 / player-court-match Selects / temp-closure fields / Extra minutes / Cancel / Preview / Commit repair | labels | createRepair→commit | MUTATES`
- **DirectorToolsPanel** `125-150/189/251/275/308/315 | Reopen court / Delay Preview / Insert-break Preview / remove blackout × / Cancel / Commit | aria-labels | createDirectorAction→commit | MUTATES`
- **SolverHud** `212 | Cancel | "Cancel" | cancelGeneration | aborts solve`

---

## 10 · Bracket

### bracket-roster — `products/bracket/BracketRosterTab.tsx`
- `156/165/175 | search / Export XLSX / ＋ Add player | aria-labels | | Add opens inline row`
- `192 | BandedTable rows | name | setSelectedId | [MOUSE-ONLY]`
- `213 | OverflowMenu | "Actions for {name}" | Delete → deleteBracketPlayer | destructive, no confirm`
- `223 | add-name input | ⚠ placeholder-only | commitAdd (Enter/blur) | MUTATES store`
- `297/312 | Notes / Min rest inputs | labels | onUpdate | MUTATES`

### bracket-draws — `products/bracket/BracketDrawsTab.tsx`
- `121/137 | ＋ New draw ×2 | labels | NewDrawModal |`
- `164 | draw Card onClick | — (deliberate non-button) | openDraw when generated |`
- `202 | "{n} entered" | label | toggle ParticipantPicker |`
- `292/304/323 | Configure / Next round / Open draw → | labels | modal / eventNextRound / navigate | Next-round MUTATES, disabled until roundComplete`
- `461/468 | Generate / Re-generate | labels | eventGenerate | MUTATES; Re-generate uses **window.confirm** (banned)`
- **NewDrawModal** `740-805 | Close / Event ID / Discipline / format cards / field inputs / Cancel / Create draw | labels | eventUpsert | MUTATES`
- **DrawConfigModal** `843-878 | Close / fields / Cancel / Save | labels | eventPatch | MUTATES draft-only`
- **ParticipantPicker** `86-190 | checkboxes / pair buttons / Cancel / Commit | labels | onCommit | MUTATES`

### bracket-draw (DrawView) — `products/bracket/DrawView.tsx`
- `260 | Edit/Done seeding | labels | toggle | editable pre-results only`
- `965 | Enter score | label | BracketScoreEntry | Sets mode`
- `1004 | Side button | player label + "↵ wins" | seeding→swapSlots / play→onResult winner | MUTATES; dual-mode`
- `1335 | Generate round k of K | label | eventNextRound | MUTATES, disabled until allResulted`
- **BracketScoreEntry** `63/71/82/91 | set-score inputs (aria-labels ✓) / Record result / Cancel | | submit via result queue | MUTATES, seenVersion`
- **PanZoomCanvas** `158/172-186 | round-jump chips / Zoom out/in/Fit/Reset | aria-labels | | pan/zoom`

### bracket-matches — `products/bracket/BracketMatchesTab.tsx`
- `211/221 | search / Export CSV link | aria-labels | |`
- `242 | grouped rows | label | setSelectedId | [MOUSE-ONLY]`
- **BracketMatchDetailPanel** `203 | player card expand | name | toggle | aria-expanded`

### bracket-setup — `BracketEngineSection.tsx` / `BracketStructureSection.tsx` / `BracketDataSection.tsx`
- `Engine 92 | Rest between rounds | aria-label | update | LockedFieldset when in play`
- `Structure 87/100 | Manage draws / Manage participants | labels | navigate |`
- `Data 50-63 | Export JSON/CSV/ICS links | labels | download |`
- `Data 76 | Reset bracket | label | **window.confirm** → DELETE | MUTATES, banned pattern`

### BracketViewHeader (draw/schedule/live) — `products/bracket/BracketViewHeader.tsx`
- `119/126/149 | ← Draws / Event Select / Bracket layout Seg | labels | navigate/setEventId/layout |`
- `173 | Schedule next round (n) | label | BracketScheduleModal |`
- `196-210 | Export JSON/CSV/ICS | labels | |`
- **BracketScheduleModal** `153/224 | Cancel-Close / candidate buttons | labels | commitRound | MUTATES; SSE solve stream`

### bracket-schedule — `ScheduleView.tsx` / `BracketMatchesTable.tsx`
- `ScheduleView 102 | chip div | pu.id (title) | onSelect | [MOUSE-ONLY]`
- `Table 102/103/105/185 | By Time / By Court / search (⚠ placeholder-only) / tr rows [MOUSE-ONLY] | | |`
- `EventsFilterStrip 24 | event toggle | "☑/☐ {ev.id}" | setBracketScheduleEventFilter |`

### bracket-live — `LiveView.tsx` / `LiveMatchList.tsx` / `MatchDetailPanel.tsx`
- `LiveView 152 | chip | pu.id | select | role=button + keyboard ✓`
- `LiveMatchList 117 | li row | id/court/names | setSelectedId | [MOUSE-ONLY]`
- `LiveMatchList 147/158/167 | Start / {A} wins / {B} wins | labels | matchAction/recordWinner | MUTATES; winner buttons **window.confirm**`
- `MatchDetailPanel 132/146/161/174/190/208 | Start / BracketScoreEntry / Undo start / A wins / B wins / Undo | labels | matchAction/submitResult | MUTATES; winner **window.confirm**; seenVersion queue`

---

## 11 · Operations

### OperationsProduct — `products/operations/OperationsProduct.tsx`
- `207 | Generate/Re-solve meet | testid ops-generate-meet | generateSchedule | MUTATES`
- `217 | Schedule next round (n) | testid ops-schedule-next | BracketScheduleModal |`
- `226 | Plan-ready toggle | "Mark plan ready to run"/"Plan ready ✓" | setPlanFinalized optimistic + API, reverts on fail | MUTATES`
- `298 | Close details | aria-label | setSelectedKey(null) |`

### UnifiedOpsBoard (Plan board) — `products/operations/UnifiedOpsBoard.tsx`
- `350 | DndContext drag-to-reschedule | — | validateMove → pinAndResolve/pinMatch | MUTATES re-solve`
- `439 | MatchChip draggable (testid ops-block-*) | label | onSelect + drag | done chips inert-drag`
- `330-341 | Auto / less / more zoom | aria-labels | zoomBy |`

### UnifiedOpsList — `products/operations/UnifiedOpsList.tsx`
- `110 | li row (testid ops-row) | label/court/sides | onSelect | [MOUSE-ONLY]`
- `RowActions 45-84 | meet Call/Start/Finish; bracket Start/{A} wins/{B} wins | labels | onAction | MUTATES`

### OpsDetailRail — `products/operations/OpsDetailRail.tsx`
- `79/85/89 | Finish match / Call to court / Start match | labels | onAction | MUTATES`
- live+bracket delegates bracket MatchDetailPanel (see §10)

### Run surface — `products/operations/run/*`
- `RunSurface 417 | Close inspector | aria-label | setSelectedKey(null) |`
- `RunLiveBoard 176 | MatchChip (testid run-card-*) | label | onSelect |`
- `RunLiveBoard 326-344 | Auto / zoom ± | aria-labels | |`
- `RunQueue 55 | li row (testid run-queue-row-*) | position/label | onSelect | [MOUSE-ONLY]`
- `RunQueue 120 | ↵ send (testid queue-send-*) | "↵ send" | fireAssign → runAction assign | MUTATES`
- `RunInspector 115/216/228/243-261/273 | Send to C{n} / Call / Start / A-B wins-Record / Postpone (testids run-act-*) | labels | runAction (state machine `can()`-gated) | MUTATES`

---

## 12 · Shared primitives (interactive)
- **Modal** (`components/common/Modal.tsx` + DS) — Escape close, backdrop-div close (⚠ unnamed), focus trap; `locked` disables both; **no built-in Close button**
- **DetailPanel** (`components/control-plane/DetailPanel.tsx:89`) — Close × "Close detail" ✓; Esc + outside-click
- **OverflowMenu** (`components/control-plane/OverflowMenu.tsx`) — "More actions" trigger + item buttons
- **BandedTable/BandedList** — rows [MOUSE-ONLY]; group headers proper buttons ✓
- **AvailabilityControl** (`components/control-plane/AvailabilityControl.tsx:83-122`) — period time inputs / remove / add, all aria-labeled ✓, MUTATES
- **EventsControl** (`components/control-plane/EventsControl.tsx:97`) — category collapse buttons ✓
- **MatchChip** (`components/MatchChip.tsx:106`) — proper button, label name ✓
- **SolverHud Cancel** (`components/SolverHud.tsx:212`) ✓
- **TabSkeleton / SourceChip / ScheduleLockIndicator** — non-interactive
