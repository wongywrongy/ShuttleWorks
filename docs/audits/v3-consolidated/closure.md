# v3 consolidated plan — closure record (work package 27a)

Per `plan.md` §7 "Coverage and closure rules" and "Closure record". This is slice 27a
only: the closure record itself, built from the 25 landed package reports
(`reports/01-fixture.md` … `reports/25-string-ledger.md`, plus `25b-console.md`),
`register.md`, `PROGRESS.md`, and `git log f5ccfcef..HEAD`. Per finding: original ID →
package → adopted treatment (or superseded / verified no defect) → implementation
reference → fixture + viewport → before/after evidence → acceptance result → remaining
limitation. The corresponding machine-readable `closure` object was added to every
entry in `findings.json`; this document is its human-readable twin.

**What this slice does not do.** It does not capture any screenshot. Every `afterEvidence`
field in `findings.json` is `null` and every "After" cell below reads "pending 27b" —
slice 27b runs the recapture (plan §7's fixture + `surface-books-fixture` pipeline) and
fills those in. It also does not touch product code, and does not close package 24 or
26, both of which were still in progress by concurrent agents when this record was
written (repo HEAD `1075647d` at task start; `766ab02d` landed mid-task extending package
25's string-ledger coverage — noted below, not re-litigated here).

**Fixture and viewport for every row below.** Unless a row's limitation says otherwise,
"before" evidence is the v3-reviewed surface book capture (frozen-clock demo tournament,
`docs/screenshots/ui-review/reviewed-v3/{operator,public}-all.md`) and acceptance is
proven by the automated test(s) listed, run against package 01's shared fixture
(`tools/fixture-up.sh`, T029 Taipei / T030 Korea tournaments) at the viewports named in
plan §6 (console 1024/1440 px; public 320/390/768/1440 px; board 1920 px) where the test
itself is viewport-sensitive; most string/state assertions here are viewport-independent
component/unit tests and do not re-state a viewport.

## Status legend

- **closed** — acceptance is "met" by a treatment that does not need the recapture to
  judge it (a copy, state, or data assertion already proven by an automated test).
- **closing** — acceptance is "met pending visual": the functional/copy fix is proven by
  tests, but a physical or rendered-viewport check remains before the finding is fully
  put to bed (currently: V3-OC24.2's signage size floors, pending on-hardware validation).
- **open** — acceptance is not yet met, or the finding is waiting on a package that has
  not landed (package 24) or is a genuine unresolved policy/content dependency (organizer
  confirmation, a demo-seed regeneration, a production-only widget capture).

## Findings tables

### Operator tier (V3-OC…)

| ID | Pkg | Treatment | Implementation | Tests | Before | After | Acceptance | Limitation |
|---|---|---|---|---|---|---|---|---|
| V3-OC02.1 | 12 | adopted | 854a885d; apps/console/src/components/control-plane/HealthDot.tsx; apps/console… | apps/console/src/modules/hub/__tests__/WorkspaceRow.test.tsx | operator-all.md p.5 | pending 27b | met | — |
| V3-OC02.2 | 12 | adopted | 854a885d; apps/console/src/modules/hub/nextAction.ts; apps/console/src/modules/… | apps/console/src/modules/hub/__tests__/nextAction.test.ts; apps/conso… | operator-all.md p.5 | pending 27b | met | — |
| V3-OC03.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/hub/NewWorkspacePage.tsx | apps/console/src/modules/hub/__tests__/NewWorkspacePage.test.tsx | operator-all.md p.7 | pending 27b | met | — |
| V3-OC04.1 | 18 | adopted | f1736964; apps/console/src/modules/settings/GlobalSettingsPage.tsx | apps/console/src/modules/settings/__tests__/GlobalSettingsPage.test.t… | operator-all.md p.9 | pending 27b | met | No separate live-capture browser evidence obtained beyond the automated test. |
| V3-OC05.1 | 03/12 | adopted | c33d9023+854a885d; apps/console/src/modules/operations/UnifiedOpsList.tsx; apps/api/src/… | apps/console/src/modules/operations/__tests__/unifiedOpsList.test.tsx… | operator-all.md p.11 | pending 27b | met | — |
| V3-OC06.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupProduct.tsx; apps/console/src/mod… | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.13 | pending 27b | met | — |
| V3-OC07.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/api/src/workspaces/setup.py | tests/backend/test_tournament_setup.py | operator-all.md p.15 | pending 27b | met | Renders as a page-level Notice, not literally inline per-row (debt V3-13-3); acceptance s… |
| V3-OC07.2 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupRowsEditor.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.15 | pending 27b | met | — |
| V3-OC07.3 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupProduct.tsx; apps/console/src/lib… | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.15 | pending 27b | met | — |
| V3-OC08.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupProduct.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.17 | pending 27b | met | — |
| V3-OC09.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupProduct.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.19 | pending 27b | met | — |
| V3-OC10.1 | 13 | adapted per plan §3 X10/Deuce row | 74969629+65e82a8d+284610b6; apps/console/src/platform/engine-config/ScoringFields.tsx; apps/api/s… | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx; apps/… | operator-all.md p.21 | pending 27b | met | pointCap lives only in Setup's rules section, not yet mirrored onto Meet/Bracket Engine C… |
| V3-OC11.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/console/src/modules/setup/SetupProduct.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.23 | pending 27b | met | Logged as debt V3-13-1 (partnerRules still has no reader/consumer anywhere). |
| V3-OC12.1 | 05/13/15 | adopted | a44ab5a2+74969629+65e82a8d+284610b6+cf996a6e; apps/console/src/modules/setup/SetupProduct.tsx; apps/api/src/workspa… | — | operator-all.md p.25 | pending 27b | met | The Contact.public DB column and public:bool wire field were deliberately kept, not migra… |
| V3-OC13.1 | 13/15 | adopted | 74969629+65e82a8d+284610b6+cf996a6e; apps/console/src/modules/setup/SetupProduct.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.27 | pending 27b | met | No design-system export added for the textarea (styled inline to TextField); out of packa… |
| V3-OC13.2 | 13/15 | adapted | 74969629+65e82a8d+284610b6+cf996a6e; apps/console/src/modules/setup/SetupProduct.tsx | apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx | operator-all.md p.27 | pending 27b | met | Distinct copy for field-invalid vs fetch-failed states not implemented — needs URL-syntax… |
| V3-OC14.1 | 14 | adopted | 91d4acfc; apps/console/src/modules/bracket/BracketRosterTab.tsx; apps/console/s… | apps/console/src/modules/bracket/__tests__/BracketRosterTab.test.tsx | operator-all.md p.29 | pending 27b | met | — |
| V3-OC15.1 | 14 | adopted | 91d4acfc; apps/console/src/modules/bracket/BracketDrawsTab.tsx | apps/console/src/modules/bracket/__tests__/BracketDrawsTab.test.tsx | operator-all.md p.31 | pending 27b | met | The finding's literal observation ("STATUS" header over "Open draw") no longer reproduced… |
| V3-OC16.1 | 10 | adopted | 97449c07+446b9c0a+30e7d75e; apps/console/src/modules/bracket/DrawView.tsx | apps/console/src/modules/bracket/__tests__/DrawView.test.tsx | operator-all.md p.33 | pending 27b | met | Only the draw-canvas caption was fixed here; the operator table-row renderer's slot text … |
| V3-OC16.2 | 10 | verified no defect | 97449c07+446b9c0a+30e7d75e; apps/console/src/components/control-plane/matchStatus.tsx | — | operator-all.md p.33 | pending 27b | met | The four differing vocabularies (draw summary done/live/ready/pending; Matches "Done"; Li… |
| V3-OC17.1 | 10 | adopted | 97449c07+446b9c0a+30e7d75e; apps/console/src/modules/bracket/BracketMatchesTab.tsx; apps/console/… | apps/console/src/modules/bracket/__tests__/BracketMatchesTab.test.tsx | operator-all.md p.35 | pending 27b | met | True one-participant-per-DOM-line stacking (§3.1) not implemented — blocked by DenseDataT… |
| V3-OC18.1 | 03/12 | adopted | c33d9023+854a885d; apps/console/src/modules/operations/UnifiedOpsBoard.tsx; apps/console… | apps/console/src/modules/operations/__tests__/unifiedOpsList.test.tsx | operator-all.md p.37 | pending 27b | met | — |
| V3-OC18.2 | 03/12 | adopted | c33d9023+854a885d; apps/console/src/modules/operations/plan/PlanToolbar.tsx; apps/consol… | apps/console/src/modules/operations/plan/__tests__/PlanToolbar.test.t… | operator-all.md p.37 | pending 27b | met | — |
| V3-OC19.1 | 03/12 | adopted | c33d9023+854a885d; apps/console/src/modules/operations/run/RunCourtGrid.tsx; apps/consol… | apps/console/src/modules/operations/__tests__/conflictAssignment.a11y… | operator-all.md p.39 | pending 27b | met | — |
| V3-OC19.2 | 03/12 | adopted | c33d9023+854a885d; apps/console/src/modules/operations/run/RunSummaryBand.tsx; apps/api/… | apps/console/src/modules/operations/__tests__/runSummaryBand.test.tsx… | operator-all.md p.39 | pending 27b | met | — |
| V3-OC20.1 | 15 | adopted | cf996a6e; apps/console/src/modules/settings/PublicationSettings.tsx | tests/backend/test_publication_matrix.py; apps/console/src/modules/se… | operator-all.md p.41 | pending 27b | met | — |
| V3-OC22.1 | 16 | superseded by plan §3 "Remove the tiny … | ae9a07d3; apps/console/src/modules/workspace/DisplayConfig.tsx; apps/console/sr… | apps/console/src/modules/workspace/__tests__/DisplayConfig.test.tsx | operator-all.md p.45 | pending 27b | met | — |
| V3-OC22.2 | 16 | adopted | ae9a07d3; apps/console/src/modules/settings/SharingTab.tsx | apps/console/src/modules/settings/__tests__/SharingTab.test.tsx | operator-all.md p.45 | pending 27b | met | — |
| V3-OC24.1 | 17 | verified no defect | 65a5084b; apps/console/src/modules/display/publicDisplay/CourtsView.tsx; apps/c… | apps/console/src/modules/display/__tests__/MeetDisplayPage.signage.te… | operator-all.md p.49 | pending 27b | met | — |
| V3-OC24.2 | 17 | adopted | 65a5084b; apps/console/src/modules/display/MeetDisplayPage.tsx; apps/console/sr… | apps/console/src/modules/display/__tests__/MeetDisplayPage.signage.te… | operator-all.md p.49 | pending 27b | met pending visual | Real venue timezone still doesn't reach the board's wire data — BOARD_TIME_ZONE='UTC' is … |
| V3-OC25.1 | 18 | adopted | f1736964; apps/console/src/modules/settings/SharingTab.tsx; apps/api/src/identi… | apps/console/src/modules/settings/__tests__/SharingTab.test.tsx; test… | operator-all.md p.53 | pending 27b | met | — |
| V3-OC26.1 | 05/18 | adopted | a44ab5a2+f1736964; apps/console/src/modules/settings/ModuleCatalogRow.tsx; apps/console/… | apps/console/src/modules/settings/__tests__/ModuleCatalogRow.test.tsx | operator-all.md p.55 | pending 27b | met | — |
| V3-OC27.1 | 19 | adopted | 3f84ef2d; apps/console/src/modules/settings/SyncReconciliationPanel.tsx; apps/c… | apps/console/src/modules/settings/__tests__/SyncReconciliationPanel.t… | operator-all.md p.57 | pending 27b | met | — |
| V3-OC27.2 | 19 | adopted | 3f84ef2d; apps/console/src/modules/settings/SyncBackupsTab.tsx; apps/api/src/wo… | apps/console/src/modules/settings/__tests__/SyncBackupsTab.test.tsx; … | operator-all.md p.57 | pending 27b | met | Recorded match/game results excluded from the change summary because match_states isn't c… |
| V3-OC28.1 | 20 | adopted | 74969629; apps/console/src/modules/settings/ActivityTab.tsx; apps/api/src/works… | apps/console/src/modules/settings/__tests__/ActivityTab.test.tsx; tes… | operator-all.md p.59 | pending 27b | met | Field-level diffs only recorded for setup.updated (debt V3-20-1); _field_label is a gener… |
| V3-OC29.1 | 18 | adopted | f1736964; apps/console/src/modules/settings/GeneralSettingsTab.tsx; apps/consol… | apps/console/src/modules/settings/__tests__/GeneralSettingsTab.test.t… | operator-all.md p.61 | pending 27b | met | — |
| V3-OC30.1 | 14/18 | adopted | 91d4acfc+f1736964; apps/console/src/app/workspace/ModuleUnavailablePanel.tsx | apps/console/src/app/workspace/__tests__/ModuleUnavailablePanel.test.… | operator-all.md p.63 | pending 27b | met | — |
| V3-OC31.1 | 13 | adopted | 74969629+65e82a8d+284610b6; apps/api/src/workspaces/setup.py; apps/console/src/modules/setup/Setu… | tests/backend/test_tournament_setup.py | operator-all.md p.65 | pending 27b | met | The separate Overview/Hub checklist's "completed items unreachable" gap (X16) is routed e… |
| V3-OC32.1 | 14 | adopted | 91d4acfc; apps/console/src/modules/meet/roster/RosterTab.tsx | apps/console/src/modules/meet/roster/__tests__/RosterTab.v3.test.tsx | operator-all.md p.67 | pending 27b | met | — |
| V3-OC33.1 | 14 | adopted | 91d4acfc; apps/console/src/modules/meet/matches/MatchesTab.tsx; apps/console/sr… | apps/console/src/modules/meet/matches/__tests__/MatchesTab.emptyState… | operator-all.md p.69 | pending 27b | met | — |

### Public tier (V3-PE…)

| ID | Pkg | Treatment | Implementation | Tests | Before | After | Acceptance | Limitation |
|---|---|---|---|---|---|---|---|---|
| V3-PE01.1 | 21 | adopted | 3dde74cf; apps/entrant/app/routes/discovery.tsx | apps/entrant/tests/discovery.render.test.ts | public-all.md p.3 | pending 27b | met | — |
| V3-PE01.2 | 21 | adopted | 3dde74cf; apps/entrant/app/components/SeasonStatusCell.tsx; apps/entrant/app/li… | apps/entrant/tests/discovery.render.test.ts; apps/entrant/tests/compo… | public-all.md p.3 | pending 27b | met | Falls back to the old relative-only chip when no exact instant parses (never omits the co… |
| V3-PE01.3 | 21 | adopted | 3dde74cf; apps/entrant/app/components/SeasonCalendar.tsx; apps/api/src/entries/… | apps/entrant/tests/discovery.render.test.ts; tests/backend/test_seaso… | public-all.md p.3 | pending 27b | met | — |
| V3-PE02.1 | 21 | adopted | 3dde74cf; apps/entrant/app/components/PlayShell.tsx | apps/entrant/tests/components.test.ts | public-all.md p.15 | pending 27b | met | — |
| V3-PE03.1 | 21 | deferred: debt (simulator seed script) | — | — | public-all.md p.21 | pending 27b | partial: the repetitive paragraph is organizer-authored dem… | Demo seed script (and the already-seeded demo DB) not regenerated; logged as debt rather … |
| V3-PE03.2 | 21 | adopted | 3dde74cf; apps/entrant/app/routes/tournament.tsx | apps/entrant/tests/tournament.render.test.ts | public-all.md p.21 | pending 27b | met | — |
| V3-PE03.3 | 21 | adopted | 3dde74cf; apps/entrant/app/routes/tournament.tsx; apps/entrant/app/components/H… | apps/entrant/tests/tournament.render.test.ts | public-all.md p.21 | pending 27b | met | — |
| V3-PE04.1 | 14/21 | adapted | 91d4acfc+3dde74cf; apps/console/src/platform/domain/eventLabels.ts; apps/entrant/app/lib… | apps/console/src/platform/domain/__tests__/eventLabels.test.ts | public-all.md p.24 | pending 27b | met | draw.tsx's own heading still uses eventDisciplineLabel (Title Case), a second inconsisten… |
| V3-PE04.2 | 14/21 | adopted | 91d4acfc+3dde74cf; apps/console/src/modules/bracket/BracketDrawsTab.tsx; apps/entrant/ap… | apps/entrant/tests/components.test.ts; apps/entrant/tests/draw.render… | public-all.md p.24 | pending 27b | met | — |
| V3-PE04.3 | 14/21 | adopted | 91d4acfc+3dde74cf; apps/entrant/app/components/EventRow.tsx | apps/entrant/tests/components.test.ts; apps/entrant/tests/draw.render… | public-all.md p.24 | pending 27b | met | Distinct "Draw published · rounds to be scheduled" fact-line for an unscheduled draw left… |
| V3-PE05.1 | 21 | adopted | 3dde74cf; apps/entrant/app/components/EntrantsList.tsx | apps/entrant/tests/components.test.ts | public-all.md p.27 | pending 27b | met | — |
| V3-PE05.2 | 21 | adopted | 3dde74cf; apps/entrant/app/components/EntrantsList.tsx; apps/entrant/public/ass… | apps/entrant/tests/components.test.ts; apps/entrant/tests/entrantsFil… | public-all.md p.27 | pending 27b | met | — |
| V3-PE09.1 | 04/11 | adopted | aae28dd3+e4092463+e729500a; apps/entrant/app/components/MatchCard.tsx; apps/entrant/app/routes/sc… | apps/entrant/tests/scheduleState.test.ts; tests/backend/test_entries_… | public-all.md p.57 | pending 27b | met | — |
| V3-PE09.2 | 04/11 | adopted | aae28dd3+e4092463+e729500a; apps/entrant/app/components/MatchCard.tsx; apps/entrant/app/lib/sched… | apps/entrant/tests/scheduleState.test.ts; tests/backend/test_entries_… | public-all.md p.58 | pending 27b | met | — |
| V3-PE09.3 | 04/11 | adopted | aae28dd3+e4092463+e729500a; apps/entrant/app/routes/schedule.tsx | apps/entrant/tests/scheduleState.test.ts; apps/entrant/tests/componen… | public-all.md p.57 | pending 27b | met | — |
| V3-PE09.4 | 04/11 | adopted | aae28dd3+e4092463+e729500a; apps/entrant/app/components/MatchCard.tsx | apps/entrant/tests/matchCard.contract.render.test.ts | public-all.md p.57 | pending 27b | met | — |
| V3-PE10.1 | 11 | adopted | e729500a; apps/entrant/app/components/MatchCard.tsx; apps/entrant/app/routes/dr… | apps/entrant/tests/matchCard.contract.render.test.ts; apps/entrant/te… | public-all.md p.67 | pending 27b | met | Not a byte-for-byte match to the backend's own short-round spelling ("Winner of R32 1") —… |
| V3-PE10.2 | 11 | adopted | e729500a; apps/entrant/app/routes/draw.tsx | apps/entrant/tests/draw.render.test.ts | public-all.md p.69 | pending 27b | met | — |
| V3-PE11.1 | 04/11 | adopted | aae28dd3+e4092463+e729500a; apps/entrant/app/components/MatchCard.tsx; apps/entrant/app/routes/dr… | apps/entrant/tests/components.test.ts; apps/entrant/tests/scheduleSta… | public-all.md p.71 | pending 27b | met | — |
| V3-PE12.1 | 11 | adopted | e729500a; apps/entrant/app/routes/draw.tsx; apps/entrant/public/assets/bracket-… | apps/entrant/tests/draw.render.test.ts | public-all.md p.76 | pending 27b | met | The bracket canvas is not literally filtered (still highlights the path rather than hidin… |
| V3-PE13.1 | 11 | adopted | e729500a; apps/entrant/app/routes/draw.tsx | apps/entrant/tests/draw.render.test.ts | public-all.md p.80 | pending 27b | met | — |
| V3-PE14.1 | 11 | adopted | e729500a; apps/entrant/app/components/PersonGroup.tsx; apps/entrant/public/asse… | apps/entrant/tests/matchCard.contract.render.test.ts; apps/entrant/te… | public-all.md p.91 | pending 27b | met | — |
| V3-PE15.1 | 22 | verified no defect (ruling R2) | — | — | public-all.md p.95 | pending 27b | partial: organizer policy content itself needs organizer co… | Logged as debt V3-22-1 routing a structured reporting-reference field to package 13, pend… |
| V3-PE15.2 | 22 | adopted | 5f25f761; apps/entrant/app/routes/regulations.tsx | apps/entrant/tests/regulations.render.test.ts | public-all.md p.95 | pending 27b | met | Organizer's own words/simulator seed.py text left untouched by design; only the rendering… |
| V3-PE16.1 | 22/24 | adopted | 5f25f761; apps/entrant/app/routes/enter.tsx | apps/entrant/tests/enter.render.test.ts | public-all.md p.98 | pending 27b | met | Package 24 (in progress at closure-record time) may extend the same surface for the invit… |
| V3-PE16.2 | 22/24 | adopted | 5f25f761; apps/entrant/app/routes/enter.tsx | apps/entrant/tests/enter.render.test.ts; apps/entrant/tests/logout.te… | public-all.md p.98 | pending 27b | met | Displaying the actual signed-in account's name/email was not built (would need a new cred… |
| V3-PE19.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/login.tsx | apps/entrant/tests/login.test.ts | public-all.md p.104 | pending 27b | met | — |
| V3-PE20.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/login.tsx | apps/entrant/tests/login.test.ts | public-all.md p.106 | pending 27b | met | — |
| V3-PE21.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/login.tsx | apps/entrant/tests/login.test.ts | public-all.md p.108 | pending 27b | met | — |
| V3-PE22.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/login.tsx | apps/entrant/tests/login.test.ts; tests/e2e/check-account-journeys.py | public-all.md p.110 | pending 27b | met | — |
| V3-PE23.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/signup.tsx | apps/entrant/tests/signup.test.ts | public-all.md p.112 | pending 27b | met | — |
| V3-PE23.2 | 23 | verified no defect fixable in scope | — | — | public-all.md p.112 | pending 27b | partial: production-mode widget copy not yet captured | Logged as debt V3-23-1; needs a release-environment capture to verify production Turnstil… |
| V3-PE24.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/signup.tsx | apps/entrant/tests/signup.test.ts | public-all.md p.116 | pending 27b | met | Fails closed to the old generic wording if the tournament lookup is unavailable. |
| V3-PE25.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/verify.tsx | apps/entrant/tests/recovery.render.test.ts | public-all.md p.120 | pending 27b | met | — |
| V3-PE26.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/verify.tsx | apps/entrant/tests/recovery.render.test.ts; tests/e2e/check-account-j… | public-all.md p.122 | pending 27b | met | — |
| V3-PE27.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/verify.tsx | apps/entrant/tests/recovery.render.test.ts | public-all.md p.124 | pending 27b | met | — |
| V3-PE28.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/verify.tsx | apps/entrant/tests/recovery.render.test.ts | public-all.md p.126 | pending 27b | met | — |
| V3-PE29.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/resetPassword.tsx | apps/entrant/tests/recovery.render.test.ts | public-all.md p.128 | pending 27b | met | — |
| V3-PE31.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/resetPassword.tsx | apps/entrant/tests/recovery.render.test.ts; tests/e2e/check-account-j… | public-all.md p.132 | pending 27b | met | — |
| V3-PE32.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/resetPassword.tsx | apps/entrant/tests/recovery.render.test.ts; tests/e2e/check-account-j… | public-all.md p.134 | pending 27b | met | — |
| V3-PE33.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/resetPassword.tsx | apps/entrant/tests/recovery.render.test.ts; tests/e2e/check-account-j… | public-all.md p.136 | pending 27b | met | — |
| V3-PE34.1 | 23 | adopted | c5a73f48; apps/entrant/app/routes/resetPassword.tsx | apps/entrant/tests/recovery.render.test.ts | public-all.md p.138 | pending 27b | met | — |
| V3-PE35.1 | 24 | pending package 24 | uncommitted | — | public-all.md p.140 | pending 27b | open | Awaiting package 24 (in progress by a concurrent agent). Recapture and closure deferred t… |
| V3-PE36.1 | 24 | pending package 24 | uncommitted | — | public-all.md p.142 | pending 27b | open | Awaiting package 24 (in progress by a concurrent agent). Recapture and closure deferred t… |
| V3-PE37.1 | 24 | pending package 24 | uncommitted | — | public-all.md p.144 | pending 27b | open | Awaiting package 24 (in progress by a concurrent agent). Recapture and closure deferred t… |
| V3-PE38.1 | 24 | pending package 24 | uncommitted | — | public-all.md p.146 | pending 27b | open | Awaiting package 24 (in progress by a concurrent agent). Recapture and closure deferred t… |
| V3-PE39.1 | 24 | pending package 24 | uncommitted | — | public-all.md p.148 | pending 27b | open | Awaiting package 24 (in progress by a concurrent agent). Recapture and closure deferred t… |

Full detail for each row (implementation file list, test list, quoted before/after
language) is machine-readable in `findings.json`'s per-finding `closure` object; this
table truncates long lists for print width — read `findings.json` for the complete
lists.

## (a) P0 packages — status and unresolved P0s

Plan §1 marks these packages P0 (block release of the affected flow): 01, 02, 03, 04,
05, 06, 09, 10, 11, 15, 19, 23, 24, 27.

| Pkg | Priority | Status at closure-record time | Unresolved P0 finding(s) |
|---|---|---|---|
| 01 fixture | P0 | Done — `b065ac72` + `21e4b49e` (01b). Four fixture states ((a)(b)(c)(e)) needed investigation; (a) and (e) reconstructed directly, (b) found to need no reconstruction, (c) confirmed structurally impossible (debt V3-01-2, not a defect in scope). | none (no directly-mapped finding; cross-cutting) |
| 02 contracts | P0 | Done — `871ee621`. State/formatting contract + ADR 0029. | none (no directly-mapped finding; cross-cutting) |
| 03 conflict recovery + counts | P0 | Done — `c33d9023`, finished by 12 (V3-OC18.1 sweep, V3-OC19.2 dispute split; debt V3-03-2/V3-03-3 both closed by package 12). | none |
| 04 public projection | P0 | Done — `aae28dd3` (04a) + `e4092463` (04b). | none |
| 05 false claims | P0 | Done — `a44ab5a2`. | none |
| 06 contrast + hierarchy | P0 | Done — `37168e03`. | none (no directly-mapped finding; cross-cutting) |
| 09 MatchCard spec | P0 | Done — `ce78d426` (documentation-only acceptance oracle for 10/11/17). | none (no directly-mapped finding; cross-cutting) |
| 10 operator match rows + bracket | P0 | Done — `97449c07` + `446b9c0a` + `30e7d75e` (10c). | none |
| 11 public match/round/bracket | P0 | Done — `e729500a`. | none |
| 15 publication + privacy | P0 | Done — `cf996a6e`. | none |
| 19 backup/restore/sync | P0 | Done — `3f84ef2d`. | none |
| 23 account/confirmation/reset journeys | P0 | Done — `c5a73f48`, 15 of 16 findings closed. | **V3-PE23.2** (minor) — open/partial. Not a flow blocker: every account journey (sign-up, sign-in, confirm, reset, resend) is verified end-to-end by `tests/e2e/check-account-journeys.py`; the residual gap is that the Cloudflare Turnstile widget's own displayed copy ("For testing only...") is provider-rendered test-mode text that this package could not capture in a release environment (debt V3-23-1). It does not block the journey shipping. |
| 24 invitations, My entries, receipts | P0 | **In progress**, uncommitted at closure-record time (concurrent agent). | **V3-PE35.1, V3-PE36.1 (major), V3-PE37.1, V3-PE38.1, V3-PE39.1** — all open, awaiting package 24. This is the one genuine unresolved-P0 gap this record reports; it is expected (24 was still landing when 27a ran) and is not treated as a regression. Slice 27b must re-run this closure section once 24 commits and re-check package 22's V3-PE16.1/V3-PE16.2 (both already closed by package 22, `5f25f761`) for any change 24 makes to the same `enter.tsx`/account-gate surface. |
| 27 close evidence gaps + recapture | P0 | This slice (27a) delivers the closure record only. The recapture itself is slice 27b, not yet run. | Recapture is the definition of "not yet done" for this package — see (c) below. |

**Net:** every committed P0 package has zero unresolved P0-severity findings of its own
(V3-PE23.2 is minor, not P0-blocking, and package 23 itself is otherwise fully closed).
The only outstanding P0 gap is package 24, which was mid-flight by design at the time
this closure record was compiled and is explicitly out of 27a's scope to finish.

## (b) Evidence that must still be obtained (plan §7) — who covers it now

Plan §7's list, and which package now makes each item capturable, plus the exact
route/state 27b must capture:

| Evidence gap (plan §7) | Now capturable via | Route / state 27b must capture |
|---|---|---|
| Operator sign-in | package 18 (`f1736964`, locked-form/account-chrome work) | `/` → sign-in form → successful sign-in → workspace hub, at console 1024/1440 px. |
| Remaining create-workspace steps and successful creation | package 13 (`74969629`) | `New workspace` wizard from step 1 (already captured, OC03) through every remaining step to the created-workspace redirect, at 1024/1440 px. |
| Account security/session actions | package 18 (`f1736964`) — Sharing/invites (V3-OC25.1), profile lock (V3-OC04.1), workspace status/archive (V3-OC29.1) all landed | Global settings → security/session panel; sign-out from an active session; the archive confirmation flow (states, not just the lifecycle label). |
| Actual tool/guard behaviour | package 18 (V3-OC26.1, V3-OC30.1) | Disable a module with data present → confirm the truthful state-dependent consequence copy now shown; `ModuleUnavailablePanel` → "View available tools" → lands on Administration · Modules. |
| Open entry form and submission | package 24 (**in progress**) | `/e/{slug}/enter` with entries genuinely open → filled form → submit → confirmation/receipt. Blocked until 24 lands. |
| Authenticated My entries and receipt | package 24 (**in progress**) | Signed-in `/e/account/entries` with at least one real entry; a receipt route with a real (non-placeholder) reference. Blocked until 24 lands. |
| Valid password-reset form | package 23 (`c5a73f48`) — proven by `tests/e2e/check-account-journeys.py` step 6 end-to-end with a real mailed token | `/e/account/reset-password?token=<real>` → the `set` (valid-token) view → successful password change → sign-in with new password, at public 320/390/768/1440 px. |
| Valid invitation acceptance | package 24 (**in progress**) | A real, unexpired partner invitation link → acceptance → confirmed-partner state on both accounts. Blocked until 24 lands. |
| Public seeded/winners routes resolving to the draw index (PE07/PE08) — routing/intent verification, not a new screen | package 21 (`3dde74cf`) draw-index work + package 14 draw-index parity | Confirm `/e/{slug}/draws?entryEventId=…&view=seeded` and `…&view=winners` resolve to the same draw index with the query intent honored (or documented as not a separate view), not a 404 or unrelated redirect. |

## (c) Recapture plan for slice 27b

**Fixture.** One run of `tools/fixture-up.sh` (or `make fixture-up` / `make
surface-books-fixture`), per package 01 (`b065ac72`, `21e4b49e`): frozen clock,
disposable SQLite, T029 (Taipei) + T030 (Korea) seeded through the HTTP API, the
post-seed defects pass (`tools/fixture-defects.py`) applied so states (a), (d), (e),
(f), (g) are present (state (c) is confirmed structurally impossible — debt V3-01-2 — and
must not be attempted again), `fixture.json` resolved for every id/URL the capture
script needs. `make surface-books-fixture` points the existing `surface-books` capture
pipeline at this local fixture instead of the Tailscale demo stack.

**Surfaces and new states.** All 72 declared original surfaces (register.md's OC01–OC33,
PE01–PE39) plus the successful-journey states plan §7 lists as still missing (section
(b) above) — operator sign-in through to the workspace hub, the full create-workspace
wizard to completion, account security/session actions exercised (not just viewed), the
open entry form and a real submission, an authenticated My entries page with a real
receipt, the valid-token password-reset form and its completion, and a real invitation
acceptance. Where package 24 has not landed by the time 27b runs, capture what it does
land and re-flag the remainder rather than block the whole recapture.

**Viewports.** Console 1024 px and 1440 px; public (entrant) 320, 390, 768 and 1440 px;
board/signage 1920 px, per plan §6's verification matrix. The MatchCard contract's Gate
B fixture matrix (`MC-01`…`MC-13`, `docs/reference/contracts/match-card.md` §5) should be
exercised at each of these where the surface renders a match card, since that is what
proves "no overlap … at the supported widths and 200% zoom" rather than a single
resolution.

**Physical signage procedure** (`reports/17-signage.md`, "Physical validation procedure
(pending — package 27)"): deploy the board (`/display?id=<tid>` or the public
`/display/<token>` link) on the actual signage hardware at the actual mounting
height/location the venue will use — not a laptop screen. Stand at the intended viewing
distance (the nearest seat/standing area a spectator would realistically read the board
from — measure it). With a real or seeded doubles match on court (the worst-case
four-line name stack), confirm from that distance, without stepping closer, that player
names, the court number (legible from a wider angle/further distance — it is the
"which court am I looking at" glance-check), the header clock, and the state-word/
"Court assignment unavailable." copy are all legible. Record the actual screen size,
resolution, and measured viewing distance alongside a pass/fail per element; adjust
`resolveSignageNameSize` / `courtNumSize` / the header clock's `text-5xl` (all in
`apps/console/src/modules/display/publicDisplay/tvSizing.ts` and the two display pages)
if anything fails. This is what closes V3-OC24.2's "closing" status to fully "closed".

**Linking "after" images back to IDs.** `findings.json`'s `closure.afterEvidence` field
(currently `null` on every finding) is the join key: 27b should populate it per finding
with a manifest-relative path, keyed the same way the capture pipeline already keys
outputs — surface id (`OCnn`/`PEnn`) plus viewport plus state label, e.g.
`operator/OC19-run-day-conflict@1440.png` or `public/PE38-my-entries-signed-in@390.png`
for a newly captured successful-journey state that has no original surface-book page
number to anchor to. Where a finding's fix changed a surface already in the original
book (the majority of this record), the manifest key should carry the same `OCnn`/`PEnn`
surface id as `findings.json`'s `surface` field so before/after can be paired
mechanically; where 27b captures a state the original book never reached at all (the
plan §7 evidence gaps in section (b) above), it should still register under the nearest
existing surface id with a `-successful`/`-authenticated` style suffix rather than
inventing an unrelated new surface id, per plan §7's "Recapture route outcomes rather
than manufacturing separate pages to match stale surface titles."

## Notes on packages 25 and 26 (not this slice's scope, recorded for context)

- **Package 25** (every-string ledger) is partial, not complete, as of this closure
  record: `bd2d6e58` built the scan tool and folded 15 package ledgers (220
  package-reviewed rows) plus a 1,318-string automated scan into `ledger/LEDGER.md`; of
  1,538 total keys only 220 had a real verdict at that point, with 1,206 left
  `unreviewed`. `766ab02d` (landed mid-task, after the extraction agents read
  `reports/25-string-ledger.md`) added `ledger/25b-console-verdicts.md`, 951 further rows
  reviewed on the console tier. Package 25 does not gate any individual finding's
  `status` in this record — plan §7 makes it and packages 26/27 apply to every finding
  uniformly rather than per-ID — but it is not complete, and the every-string ledger's
  own completion bar (plan §4: "zero unreviewed string keys in the audited scope") is not
  yet met.
- **Package 26** (accessibility/responsive) is in progress ("26a") as of this closure
  record: two new, uncommitted test files
  (`apps/console/src/platform/contracts/__tests__/accessibleNamesContract.test.tsx`,
  `focusVisibleContract.test.ts`) were present in the working tree but not yet landed.
  As with 25, package 26 applies to every finding uniformly per plan §7 and is not cited
  per-finding in `findings.json`'s `closure` objects.
