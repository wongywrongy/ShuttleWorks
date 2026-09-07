# Code map — packages 02 / 03 / 04 (contracts, conflict recovery, public projection)

Produced 2026-09-06 by an Explore subagent; orchestrator-reviewed. Paths relative to repo root.

## 1. Backend match state, command queue, court assignment

| Concern | Path | Lines |
|---|---|---|
| `VALID_TRANSITIONS`, `LOCKED_STATUSES`, `assert_valid_transition`, `is_locked` | `apps/api/src/operations/match_state.py` | 45–130 |
| `build_locked_assignments` (skips null court/slot) | same | 133–161 |
| Double-current invariant #1 — `assert_court_available` (playing only; `called` excluded) | same | 164–194 |
| `MatchStatus` enum, `Match` row (`court_id`, `time_slot`, `version`) | `apps/api/src/db/models.py` | ~300–320 |
| Command route (idempotency key, `seen_version`, 409 mapping) | `apps/api/src/operations/commands.py` | 40–89 |
| `ACTION_TO_TARGET_STATUS` | `apps/api/src/core/constants.py` | 24–60 |
| Double-current invariant #2 — duplicated inline in `process_command` | `apps/api/src/repositories/local.py` | 2469–2504 |
| Command pipeline | same | 2407–2600, helpers 2640–2880 |
| Legacy `match_states` routes; `_LEGACY_TO_CANONICAL` (`started`↔`playing`); If-Match | `apps/api/src/operations/match_state_routes.py` | 76–83, 189–315, 351–420 |
| `ConflictError` → 409 | `apps/api/src/core/exceptions.py` 20–70; `core/main.py` 297–310 |
| Conflict counter only (process-local) | `apps/api/src/operations/conflict_metrics.py` | 1–74 |

EXISTING conflicts are not represented: no persisted "disputed court" record. A conflict is a rejected write, or a derived observation recomputed independently in several places (D1). Nothing opens an assignment.

## 2. Console: Plan, Live day, runtime, counts

- Adapters `apps/console/src/modules/operations/opsBlock.ts` 25–48, 77–125, 183–205.
- `runtime/runModel.ts`: `CourtLane.conflict` 64–73; `deriveCourtLanes` conflict rule 101–147 (>1 playing, or >1 called with zero playing); `deriveQueue` 158–163; `busyPlayers` 174–182; `onDeck`/`nextEligible` 203–228; `deriveSummary` 267–296 — `courtsFree` excludes conflicted lanes (289) but `playing` counts matches (275).
- `runtime/runMachine.ts` 15–90 (`RUN_STATUS_LABEL`). `run/RunCourtGrid.tsx` 53–70, 154–208. `run/RunSummaryBand.tsx` 62–90. `run/RunSurface.tsx` conflict banners from command-rejection store 148–166, 296, 446–481, 570–585.
- `runtime/boardPlacements.ts`; `UnifiedOpsBoard.tsx` 107–130, 502; `UnifiedOpsList.tsx` 127, 151 (own vocabulary).
- Stores: `store/matchStateStore.ts` (`ConflictRecord` 30–36, 38–76); `lib/commandQueue.ts` (offline IndexedDB queue) + `hooks/useCommandQueue.ts`; `lib/bracketCommandQueue.ts`.
- `hooks/useTournamentState.ts` = blob save / If-Match loop only (409 handling 108–160, 219–240). `NextUpList.tsx` renders server `signals.nextUp`; `denseData.ts` irrelevant.
- Server counts for Hub/Overview: `apps/api/src/workspaces/workspace_signals.py` `MatchMetricsDTO` 75–103; meet 331–423 (`busy_courts` 353–357, `courtsFree` 370); bracket 428–559 (`courtsFree` 501); `_IN_PLAY`/`_TERMINAL` 563–570.

Today a disputed court: Run band → not free but both matches count as PLAYING; Hub/Overview → one busy court, second match silently vanishes, no conflict signal.

## 3. Public projection

- Entrant routes `apps/entrant/app/routes.ts` (`:slug/schedule` 146, players 158, draws 162). Live = `status === "live"` band inside `routes/schedule.tsx` (558–562, 638).
- `routes/schedule.tsx`: `matchCourt` "Court pending" 136–138; `scheduleToMatch` 153–184 sets `showAssignmentPlaceholders: true`; `formatScheduleUpdated` 202–219; `monthLabel` 221–230.
- `components/MatchCard.tsx` footer 76–82: `'Date to be confirmed'`, `'Time not assigned'`, `'Court information unavailable'`; line 90 `stateLabel = live ? 'Live' : decided ? 'Completed' : 'Scheduled'` (untimed, uncourted match still reads "Scheduled"; collapses called/delayed/walkover/retired/cancelled); line 85 slash-joined aria label.
- Entrant types `lib/schedule.types.ts` (8-state union 3–12, `scheduleStateLabel` 72–91, `scheduleDateLabel` 103–112 hardcodes UTC), `lib/player.types.ts` 14–15, `lib/draws.types.ts` 82.
- API `apps/api/src/entries/entries_site.py`: DTOs 550–562, 645–659, 668–695, 707–718; `_person_ref` 287–310 (`"TBD"`/`"Player not published"`); `_hhmm_plus` 420–426; `_round_label` 743–753; `_slot_time` 1012–1019; draw projection 1191–1300; player page 1687–1800 (4-state ladder 1765–1770); `_merge_live_bracket_courts` 2058–2095 (withhold rule: duplicate claims → court popped for both); `_schedule_runtime_snapshot` 2098–2270; `_bracket_schedule_matches` 2274–2356 (state default `scheduled` 2316–2323); `_meet_schedule_matches` 2359–2456 (state map 2402–2409: results-off turns `called` into `live`; unknown → `scheduled`); `GET /matches` 2462–2600.
- Twins: `entries_json.py` 296, 374, 574–600; `entries_me.py` 171–200.

Where a missing time/court becomes a lie: `MatchCard.tsx:76–82, 90`; `entries_site.py:2409, 2404–2408`; `schedule.tsx:136`.

## 4. Display board projection

- API raw passthrough `apps/api/src/display/display.py` (`DisplayStateDTO` 136–166, `/state` 176–226, `/match-states` legacy `started` 229–236, `/bracket` 239–266).
- Console owns rules: `modules/display/publicDisplay/courtLanes.ts` (`currentMatchesByCourt` 43–62, `assignLanes` 77–107); `MeetDisplayPage.tsx` (own conflict detector 151–169 using `actualCourtId`; lanes 198–210; clock 122; `lastSyncedAt` 530–535); `publicDisplay/CourtsView.tsx` (banner 129, band words 259–270, "Two current matches claim this court." 302–309, "Court free" 349); `bracketDisplay/BracketLiveView.tsx` 34, 48–55 (`Conflict|On court|Next|Court free`); `publicDisplay/helpers.ts` 30–43 `formatPlayers`, 46–70; `freshness.ts`; `LiveStatusPill.tsx` 29.

## 5. Pair-label builders

`" / "`: `workspace_signals.py:324–328 _side_names`; `bracket/io/export_schedule.py:219`; `entries/entries.py::team_name` (documented canonical mint); `console/modules/bracket/bracketLabels.ts:152–192`; `operations/opsBlock.ts:36–38`; `display/bracketDisplay/bracketDisplayData.ts:16–33` (`'–'` fallback); `meet/matches/MatchesSpreadsheet.tsx:220–231` (`'No players'`); `bracket/BracketRunControls.tsx:64–65`; entrant `MatchCard.tsx:85`.
`" & "`: `display/publicDisplay/helpers.ts:32–43 formatPlayers` (`'TBD'`); `operations/plan/MoveMatchDialog.tsx:205–208`; `plan/ScheduleDiffView.tsx:461`; `meet/exports/xlsxExports.ts:147,194–208`.
`console/lib/names.ts:21–57` splits `' / '`|`' & '` and always rejoins `' / '`. Entrant structured: `entries_site.py:_person_ref` → `PersonGroup.tsx:24–37` (rendered `/` element), `PersonRef.tsx` + `public/assets/person-ref.js`.

## 6. Time formatting

Console (operator-local, no tournament tz): `lib/time.ts` (`slotToTime` 51 …), `lib/timeFormatters.ts:12–16 formatIsoClock` (browser tz), `lib/timezoneLocal.ts:17–35` (only tz-aware pair, Setup only). Ad-hoc `toLocale*`: `hooks/useLiveOperations.ts:298` (`'00:00'` fallback), `settings/PeopleAccessTab.tsx:25–29`, `SyncBackupsTab.tsx:25–46`, `SharingTab.tsx:27`, `hub/WorkspaceRow.tsx:84`, `workspace/overview/railRows.ts:37`, `display/publicDisplay/helpers.ts:19–20` (forces UTC), `MeetDisplayPage.tsx:122,530–535`, `BracketDisplayPage.tsx:59,135–138`, `plan/SolverProgressLog.tsx:156`, `components/SyncHealthIndicator.tsx:22`. Server twins: `entries_site.py:420 _hhmm_plus`, `workspace_signals.py:238 _slot_time_label`.
Entrant: `lib/format.ts` (`formatDateLong` 36–40 UTC-only, `formatUtcInstant` 43–47, `formatMoment` 52–56, `formatMomentInZone` 58–72 tz-aware); `schedule.types.ts:103–112` hardcoded UTC; `schedule.tsx:202–230`; `scheduledTime` is a naive venue-local "HH:MM" printed verbatim. Raw ISO fallbacks: `format.ts:55,60`, `schedule.tsx:206`, `schedule.types.ts:105`.

## 7. Status vocabularies (17 sites)

Backend: `models.py MatchStatus` (5); `match_state_routes.py:108` (4, `started`); `entries_site.py:683–685` (8); `:1765` (4); `workspace_signals.py:563–570`, `:113 NextMatchDTO` (2). Console: `platform/domain/match.ts:27`; `runtime/runMachine.ts:11,35–40`; `lib/stateWords.ts:23–52` (declared canonical, 12 words incl. `'On court'`); `components/control-plane/matchStatus.tsx:15–22`; `plan/PlanCallList.tsx:22–27` (`'Playing'`); `UnifiedOpsList.tsx:127`; `BracketLiveView.tsx:48`; `CourtsView.tsx:259–270`; `LiveStatusPill.tsx:29`. Entrant: `schedule.types.ts:72–91`; `MatchCard.tsx:90,111,120`; `lib/phase.ts:59–69`.

## 8. Existing tests

Backend: `tests/backend/unit/test_match_state.py`, `test_match_state_transitions.py`, `test_match_state_application.py`, `test_commands.py`, `test_bracket_command_reason.py`, `test_concurrent_state_writes.py`, `test_commands_assign_postpone.py`, `test_find_conflicts_closures.py`, `test_public_schedule_api.py`, `test_entries_site_api.py`, `test_entrant_ssr_contract.py`, `test_display_public.py`, `test_derived_output_encoding.py`, `test_offline_operator_sessions.py`, `test_workspace_signals.py`, `test_dto_generated_freshness.py`.
Console: `operations/__tests__/runModel.test.ts` (conflict lane 91–102), `runMachine`, `runSummaryBand`, `runSurface`, `courtStatus`, `opsBlock` (double-booking 258), `unifiedOpsBoard`, `planCallList`; `display/publicDisplay/__tests__/courtLanes`, `helpers`, `freshness`, `LiveStatusPill`; `display/__tests__/MeetDisplayPage.*`; `store/__tests__/matchStateStore`; `lib/__tests__/commandQueue`, `bracketCommandQueue`, `updateMatchState`; `components/__tests__/conflictUI`; `api/__tests__/dtoParity`.
Entrant: `tests/schedule.test.ts`, `player.render`, `draw.render`, `personRef`, `publicUniversality`, `dtoParity`, `phase`, `noTruncation`, `uiTwins`.
Gaps: no test that a disputed court is excluded from both free and occupied; none that public schedule refuses "Scheduled" for an unassigned match; none for offline conflict recovery end to end.

## Divergences (input to package 02's contract)

- D1 Six independent double-current detectors, three rules: `match_state.py:164–194`, `local.py:2469–2504`, `runModel.ts:118–124`, `courtLanes.ts:43–62,92–101`, `MeetDisplayPage.tsx:151–169`, `entries_site.py:2058–2095`. No authority, no persisted record.
- D2 Two "courts free" definitions: `runModel.ts:289` (conflict-aware) vs `workspace_signals.py:370,501` (conflict-blind). Comment at `runModel.ts:280–286` claims unification; false.
- D3 Disputed court counted occupied twice: `runModel.ts:275` vs `:289`.
- D4 Five wire vocabularies; `_LEGACY_TO_CANONICAL` one-directional, drops `retired`.
- D5 Two console label maps both claiming canonical: `stateWords.ts` vs `matchStatus.tsx`, plus literals in `PlanCallList`, `UnifiedOpsList`, `BracketLiveView`, `CourtsView`.
- D6 Entrant `scheduleStateLabel` (8) vs `MatchCard.tsx:90` (3) — the latter renders.
- D7 Unknown state → "scheduled" server-side (`entries_site.py:2409`, `2316–2323`).
- D8 `called` published as `live` when results off (`entries_site.py:2408`).
- D9 View-layer placeholders: `MatchCard.tsx:76–82` (on unconditionally via `schedule.tsx:183`), `schedule.tsx:136`, `useLiveOperations.ts:298`.
- D10 Three slot→HH:MM implementations (+ `_slot_time`).
- D11 Timezone declared (`ScheduleMatchesDTO.timeZone`) but hardcoded UTC in `scheduleDateLabel`, `monthLabel`, `formatDateLong`; console applies tz only in Setup.
- D12 Raw ISO reaches prose on parse failure (`format.ts:55,60`, `schedule.tsx:206`, `schedule.types.ts:105`).
- D13 Two operator clock formatters + ~10 inline `toLocale*` sites.
- D14 Seven pair-label builders, two separators, four unresolved fallbacks (`'TBD'`/`'–'`/`'No players'`/`''`).
- D15 Lossy slash round-trip: `names.ts:45–57` rejoins `' / '`; `CourtsView.tsx:313` feeds `' & '`. `bracketMigration.ts:41–53` split-decodes.
- D16 Four round-label spellings: `workspace_signals.py:270–321`, `entries_site.py:743–766`, `platform/domain/matchIdentity.ts`, `bracketDisplayData.ts:97`.
- D17 Public names structured (`persons[]`) vs operator names pre-joined strings (`match.ts:52–53`).
- D18 Conflict surfacing disconnected from detection: `RunSurface.tsx` banners from rejected commands; `RunCourtGrid.tsx:176` from lane state; pre-existing double assignment produces no banner/task.
- D19 Public and operator "now" rules differ by design (`courtLanes.ts:9–29`) without a shared contract.
- D20 `called` inside court occupancy in some places, outside in others (`match_state.py:174–178`, `workspace_signals.py:568–570`, `runModel.ts:174–182,120`, `MeetDisplayPage.tsx:165–167`).
