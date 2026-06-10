# Bracket sibling parity map

**Date:** 2026-06-10
**Branch:** `feat/bracket-sibling-parity-spec`
**Reference spec:** `docs/superpowers/specs/2026-06-10-bracket-sibling-parity-design.md`

## Baseline verification

- Frontend focused bracket suite: PASS with `cd products/scheduler/frontend && npm test -- src/lib/__tests__/BracketTab.test.tsx src/lib/__tests__/EventsTab.test.tsx src/lib/__tests__/LiveView.test.tsx src/lib/__tests__/ScheduleView.test.tsx --run`. Result: 4 files passed, 42 tests passed. Existing React `act(...)` warnings appeared in `EventsTab.test.tsx` for participant picker and new event row interactions, but the suite exited 0.
- Backend focused bracket suite: PASS with `cd products/scheduler && pytest tests/unit/test_bracket_routes.py tests/unit/test_bracket_event_routes.py tests/unit/test_bracket_interactive_scheduling.py -q`. Result: 58 passed.
- Unrelated dirty files observed:
  - `packages/design-system/components/Toast.tsx`
  - `.superpowers/`
  - `products/scheduler/uv.lock`

## Meet patterns to reuse

- View headers use compact context, action clusters, and clear status language. `MatchesTab.tsx` uses a single border-bottom header with count, search, add, and export controls; `SchedulePage.tsx` pairs live metrics with export and schedule actions in the same operational strip.
- Empty states explain the next operator action without adding new workflow steps. `SchedulePage.tsx` distinguishes "Configure tournament first" from "No schedule generated" and puts schedule generation beside that state.
- Error states are inline and recoverable where possible. `SchedulePage.tsx` uses border-bottom warning/error banners for config, generation errors, and infeasible schedules, keeping the rest of the page shell stable.
- Primary actions sit near the state they affect. `MatchesTab.tsx` puts add/export controls in the matches header; `SchedulePage.tsx` keeps generate/export controls next to the schedule metrics they affect.
- Destructive or reset actions are visually quieter than creation/scheduling actions. Meet schedule regeneration uses a confirm-replace state rather than a disruptive browser confirm, and export/reset-like controls use secondary toolbar treatments.
- Dense data views rely on lines, spacing, and typography rather than nested cards. `MatchesTab.tsx`, `RosterTab.tsx`, and the schedule table sections use borders, sticky headers, compact text, and side rails instead of stacked card containers.

## Bracket differences to preserve

- Bracket remains event/draw-first, not a renamed meet schedule. `EventsTab.tsx` owns event creation, participant entry, and per-event draw generation.
- Events and Draw stay first-class workflow concepts. `DrawView.tsx` renders single-elimination brackets and round-robin rounds from bracket play units rather than flattening them into meet matches.
- Schedule and Live can borrow more heavily from meet because they are operational phases. `ScheduleView.tsx`, `BracketMatchesTable.tsx`, `BracketScheduleSidebar.tsx`, `LiveView.tsx`, and `MatchDetailPanel.tsx` already share Gantt/table/sidebar ideas with meet.
- Existing bracket API calls, route shapes, and user actions remain unchanged during the UI pass. Current frontend calls include `eventUpsert`, `eventGenerate`, `recordResult`, and `matchAction`; the parity pass should clarify those flows without adding a new workflow.

## Confirmed UI gaps

| Area | Current issue | Target pattern | Files |
| --- | --- | --- | --- |
| Events | Table starts cold and the add action sits after the table, so an empty event list has weak direction; generation uses a browser confirm for regeneration rather than the meet-style inline guard | Meet-like dense table with a composed empty state and a primary add action near the header; keep regenerate visually quieter than first generation | `EventsTab.tsx` |
| Draw | No-draw state is informational but not visually aligned with meet empty states; it correctly points back to Events but appears as a plain padded text block | Draw-aware empty state that explains the Events dependency without adding a new action path | `DrawView.tsx` |
| Schedule | Schedule view has useful pieces but weaker hierarchy between schedule controls, table, and side detail; the header only reports count/export links, while the table and sidebar carry most operational context | Operational schedule hierarchy with clear header, timeline/table relationship, and side detail weight | `ScheduleView.tsx`, `BracketScheduleHeader.tsx`, `BracketMatchesTable.tsx`, `BracketScheduleSidebar.tsx` |
| Live | No-scheduled-match state is plain text and does not match meet's live-operation confidence; selected match details are functional but sparse compared with meet's status/action panel hierarchy | Status-forward live empty state and clearer result/action panel hierarchy | `LiveView.tsx`, `MatchDetailPanel.tsx` |

## Confirmed backend gaps

| Route or behavior | Current issue | Expected meet-style guarantee | Test file |
| --- | --- | --- | --- |
| Result replay | Duplicate result submission needs explicit regression coverage. `services/bracket/advancement.py` rejects an in-memory duplicate result, while `repositories/local.py` can overwrite an existing persisted result row; the route tests cover first result and second result on a different match but not replay on the same play unit. | Same winner replay is safe or rejected without duplicate/corrupt state; different winner is rejected | `tests/unit/test_bracket_routes.py` |
| Match action transitions | Finish-before-start needs explicit regression coverage. `backend/api/brackets.py` currently lets `match_action` set `actual_end_slot` for `finish` without first checking `actual_start_slot`. | Illegal live-state transitions return conflict and do not mutate assignment state | `tests/unit/test_bracket_routes.py` |

## Out of scope for this pass

- New bracket capabilities.
- Meet redesign.
- Full frontend commandQueue migration.
- Cloud-scale or multi-worker redesign.
