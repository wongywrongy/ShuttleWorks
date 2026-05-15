# Bracket Entry Alignment + Court×Time Views — Design

**Status:** Approved design — ready for implementation planning. Written 2026-05-14.

This is the **comprehensive design** for finishing the bracket-side of the product, picking up where sub-projects #1 (bracket interactive-scheduling backend, `c6a722d`) and #2 (shared `GanttTimeline` scaffold, `fd3086e`) left off. Covers three remaining sub-projects in one unified design:

- **#5 — bracket entry pattern alignment** (NEW; the bulk of the work)
- **#4 — bracket Live Gantt** (operator surface)
- **#3 — bracket Schedule Gantt** (display-only court×time view)

The three are designed together because they share the same data shape, backend changes, and state machine. Execution is split into three phases (see the companion plan).

---

## Goal

Give the bracket surface the same **entry-flow shape** as the meet — Setup, Roster, (Events = bracket's analogue of Matches), Draw, Schedule, Live — so an operator running the venue reads the bracket the same way they read the meet. Make the bracket Schedule + Live views first-class court×time Gantts consuming the shared `GanttTimeline` scaffold. The unification is at the level of **design principle, UI/UX entry, and page composition** — *not* functional model (each product keeps its own backend tables and solver flow).

## Non-goals

- **Cross-tournament court sharing.** Meet ↔ bracket court awareness at the solver level (one venue hosting both) is explicitly deferred. Each tournament row keeps its own court pool.
- **Data-model unification.** Meets keep their JSON blob; brackets keep `bracket_events`/`bracket_participants`/`bracket_matches`. Players are *not* shared across meet and bracket — even if the same human plays both, they're separate records.
- **Interactive bracket Schedule.** The bracket Schedule tab is **display-only**. The drag/validate/pin affordances from sub-project #1 stay in the backend but are not consumed by the bracket-side frontend in this design (still useful for future redesigns or director-only manual overrides).
- **Rich match scoring on bracket Live.** The bracket Live tab gets a subset of the meet's state vocabulary (scheduled / called / started / finished / late). The full meet vocabulary (impacted / postponed / resting / traffic-light) doesn't yet apply to brackets and isn't added here.

## Current state

| Surface | Meet (`kind='meet'`) | Bracket (`kind='bracket'`) |
|---|---|---|
| Tabs | Setup · Roster · Matches · Schedule · Live · TV | Draw · Schedule · Live |
| Initial setup | First-class `Setup` tab | Bundled in `SetupForm` wizard inside Draw |
| Players | First-class `Roster` tab (school/position grid) | None — typed inline as textarea per event |
| Matches | First-class `Matches` tab (auto-generate from Roster + ranks) | None — generated together with the draw |
| Backend | `tournaments.data` JSON blob | `bracket_events`, `bracket_participants`, `bracket_matches`, `bracket_results` tables (plus legacy `tournaments.data.config`) |
| Schedule view | `DragGantt` (interactive court×time, drag/validate/pin) | Static `<table>` colspan grid — not a Gantt |
| Live view | `GanttChart` (rich state vocabulary, sub-lane packing) | Flat list table — not a Gantt |

Foundations already shipped this session: #1 (bracket interactive-scheduling backend — `/validate` + `/pin` + `repin_and_resolve`, ✅ `c6a722d`) and #2 (shared `GanttTimeline` scaffold in `@scheduler/design-system`, ✅ `fd3086e`).

## The six bracket tabs

After this change, the bracket-side `BRACKET_TAB_IDS` becomes:

```
'bracket-setup' · 'bracket-roster' · 'bracket-events' · 'bracket-draw' · 'bracket-schedule' · 'bracket-live'
```

Six tabs, same order as the meet's analogous flow. Soft gating throughout (meet parity): all six tabs are always clickable; tabs whose prerequisites aren't met render an empty-state CTA in-content (no disabled tabs in the TabBar).

### 1. Setup tab (`bracket-setup`) — NEW

Sectioned form, full-bleed, no panels. Auto-persists to `tournaments.data.config` on field blur (no save button — meet pattern).

```
TOURNAMENT > SETUP

  IDENTITY
    Tournament name   [ unification-test                  ]
    Tournament date   [ 05/15/2026 ]

  SCHEDULE & VENUE
    Courts            [ 4 ]      Slot duration   [ 30 ] min
    Start time        [09:00]    End time        [18:00]
    Rest between rounds [ 1 ] slots
```

**Component:** `<SectionedForm>` primitive (extracted from meet's `TournamentConfigForm.tsx` during this work if not already a design-system primitive).

**Persistence:** `tournaments.data.config = { courtCount, slotDurationMinutes, startTime, endTime, restBetweenRounds, tournamentName, tournamentDate }`. Schema-compatible with the legacy bracket config; existing brackets read and write the same shape.

### 2. Roster tab (`bracket-roster`) — NEW

Full-width flat list with a detail panel below. Bracket-specific (no schools/groups — slimmer than meet's school/position grid).

```
TOURNAMENT > ROSTER

  PLAYERS (12)
  Search: [                          ]   + Add player

   • Alex Tan          MS · MD · XD          notes: —
   • Ben Carter        MS · MD               notes: —
   • Cole Park         MS · MD · XD          rest: 1 slot
   • Dan Wallace       MS · MD
   · …

  PLAYER DETAIL · Alex Tan
    Notes [                                       ]
    Rest constraint [ 0 ] slots
    Events: MS, MD, XD  (read-only — managed in Events tab)
```

The `Events:` column per row is a derived display showing which bracket events this player participates in. The source of truth for event membership is the Events tab; Roster only shows the derived view.

**Persistence:** new `tournaments.data.players: BracketPlayerDTO[]` field. `BracketPlayerDTO = { id: string, name: string, notes?: string, restSlots?: number }`. `id` is a stable slug from `slugify(name)` — matches the existing `playerSlug()` helper that the legacy `SetupForm` already uses for inline-name participants. Same slugger produces the same id on migration, so existing `bracket_participants[].member_ids` (which are already slugs) naturally line up with the new `Roster[].id` after migration.

**State update path:** the existing `POST /tournaments/{id}/state` route takes the full `TournamentStateDTO`. To persist a Roster edit, the frontend does a read-modify-write: read current state, merge in the new `players` array, post back. No new endpoint required.

### 3. Events tab (`bracket-events`) — NEW

Full-width spreadsheet, no panels. Each row is one bracket event with inline-editable cells + per-event Status + per-event action.

```
TOURNAMENT > EVENTS

  ID  │ Discipline      │ Format │ Size │ Participants    │ Status      │ Action
  ────┼─────────────────┼────────┼──────┼─────────────────┼─────────────┼──────────────────
  MS  │ Men's Singles   │ SE ▾   │ 8 ▾  │ Alex T · Ben C… │ ● Generated │ [Re-generate]
  WS  │ Women's Singles │ SE ▾   │ 6 ▾  │ Eve K · Fay L   │ ○ Draft     │ [Generate]
  MD  │ Men's Doubles   │ RR ▾   │ 4 ▾  │ AT+BC · CP+DW…  │ ● Started   │ [—]  (locked)
  WD  │ Women's Doubles │ SE ▾   │ 4 ▾  │ EK+FL · GM+HN…  │ ○ Draft     │ [Generate dis.]
  + Add event
```

**Per-event lifecycle (state machine):**

```
Draft  ──[Generate]──▶  Generated  ──[first result recorded]──▶  Started
                            │                                         │
                            │                                         │ (locked: no edits, no re-generate)
                            ▼
                       [Re-generate] (Generated only; wipes + recomputes this event's draws)
```

**Per-row Action button:**
- `[Generate]` — visible when status = Draft and participants.length === size and all referenced players exist in Roster. Click → fires `POST /bracket/events/{id}/generate`.
- `[Re-generate]` — visible when status = Generated (no results yet). Click → confirm dialog "This will discard the existing draws for MS. Re-generate?" → fires same endpoint with `wipe=true`.
- `[—] (locked)` — visible when status = Started. Greyed; tooltip "Event is in progress; reset bracket to re-generate."
- `[Generate disabled]` — visible when status = Draft but validation fails. Tooltip explains (e.g., "6 participants, need 8").

**Participants column:** click → in-grid picker expands *below* the active row, in-flow (no popout, no panel). Picker is a list of Roster names with checkboxes; close to commit. For doubles events (MD/WD/XD), the picker pops a 2-step pairing UI: pick player A, then partner B; commits the pair as one team entry.

**Component reuse:** mirrors meet's `MatchesSpreadsheet.tsx` pattern (full-width table, add-row at bottom, inline editing).

**Persistence:** each row commit fires `POST /tournaments/{id}/bracket/events/{event_id}`. Backend upserts the `bracket_events` row + replaces the `bracket_participants` rows for that event.

### 4. Draw tab (`bracket-draw`) — simplified

Existing `DrawView.tsx`, minus the `SetupForm` wizard. Pure visualization. Per-event sections rendered top-to-bottom:

```
TOURNAMENT > DRAW

  MS · Men's Singles · SE · 8 entries        ● Generated
  ┌── R1 ──┐    ┌── R2 ──┐    ┌── R3 ──┐
  │ Alex T ├──┐ │ Alex T ├──┐ │ Alex T │
  │ Ben C  │  ├─┤ Cole P │  ├─┤ Eve K  │
  │ Cole P ├──┘ │ ...    │  └─┘ ...    │
  └────────┘    └────────┘    └────────┘

  WS · Women's Singles · SE · 6 entries      ○ Draft
  (no draws generated yet — go to Events tab and click Generate)

  MD · Men's Doubles · RR · 4 teams          ● Started
  (round-robin grid showing played + upcoming)
```

Draft events show a placeholder CTA pointing at the Events tab. Generated events render their full bracket (SE tree or RR grid). Started events render the same with played results inlined. Read-only across all states.

### 5. Schedule tab (`bracket-schedule`) — `GanttTimeline` consumer, display-only (#3)

Replaces the current static `<table>` grid with a `GanttTimeline` court×time display. **No interaction** — no drag, no validate, no pin, no `onCellClick`. Operator actions live on the Live tab.

```
TOURNAMENT > SCHEDULE             EVENTS: ☐ MS ☐ WS ☐ MD ☐ WD ☐ XD

  COURT  09:00      09:30      10:00      10:30      11:00
  C1   ▮▮ MS R1 ▮ ▮▮ WS R1 ▮ ▮▮ MS R2 ▮ ▮▮ MS QF ▮  …
  C2   ▮▮ MS R1 ▮ ▮▮ WS R1 ▮ ▮▮ WS R2 ▮ ▮▮ MS QF ▮  …
  C3   ▮▮ MD R1 ▮ ▮▮ MD R1 ▮ ▮▮ MD R2 ▮  …
  C4   ▮▮ XD R1 ▮ ▮▮ XD R1 ▮  …
```

**Mechanics:**
- `<GanttTimeline density="standard">` consumer (same scaffold as meet's `DragGantt`/`GanttChart` post-#2).
- Density: `standard` (80×40 from `GANTT_GEOMETRY.standard`).
- Placements come from `bracket_matches` rows aggregated across all `Generated`/`Started` events. Each match → one Placement keyed by `bracket_match_id`. Event color comes from the discipline (MS/WS/MD/WD/XD use the same `eventColors.ts` palette as the meet — shared palette is part of the design unification).
- **EVENTS filter strip** top-right: per-event toggle. Toggles dim non-selected events' chips (decision 2 from the original decomposition: "whole floor, all events; event selector is highlight/dim, not hard filter").
- `renderBlock` paints the chip; no `useDraggable`, no click handler beyond a hover tooltip showing match details.
- Empty state: "No draws generated yet — see Events tab" with a button that switches activeTab to `bracket-events`.

### 6. Live tab (`bracket-live`) — `GanttTimeline` + operator panel (#4)

The operator surface for running the bracket. Same scaffold as Schedule but with state vocabulary on chips + a right panel for match actions.

```
TOURNAMENT > LIVE     0% · 0 of 24 matches · 0 late      ┌─ MATCH DETAILS ─┐
                                                          │ MS-R1-M1        │
COURT  09:00     09:30     10:00     10:30               │ Court C1 · 09:00│
C1   ▮▮ MS-R1-M1 ▮ (●started)  ▮ WS-R1-M1 ▮  …          │ ALEX T          │
C2   ▮▮ MS-R1-M2 ▮ (○called)   ▮ WS-R1-M2 ▮  …          │   vs            │
C3   ▮▮ MD-R1-M1 ▮             ▮ MD-R1-M2 ▮  …          │ BEN C           │
C4   ▮▮ XD-R1-M1 ▮             ▮ XD-R1-M2 ▮  …          │                 │
                                                          │ [Call] [Start]  │
STATUS: ☐ Scheduled ☐ Called ☐ Started ☐ Finished        │ [Record result] │
                                                          │ [Postpone]      │
                                                          └─────────────────┘
```

**Mechanics:**
- `<GanttTimeline density="standard">` consumer.
- Chip state ring vocabulary (subset of meet's `GanttChart`): `scheduled` (no ring), `called` (called-ring), `started` (started-ring), `finished` (done-ring + greyed), `late` (yellow ring if current_slot past start AND status === scheduled or called). No `impacted`/`postponed`/`resting`/`traffic-light` rings yet — out of scope per non-goals.
- **Right panel** = match details + operator actions (Call / Start / Record result / Postpone). Same component pattern as meet's Live tab (acceptable per the meet's existing successful chrome).
- Click a chip → selects + populates the right panel. Click an empty cell → no-op.
- Operator actions fire existing endpoints: `POST /bracket/match-action` (call/start), `POST /bracket/results` (record).
- Empty state: "No draws generated yet — see Events tab" (same as Schedule).

---

## Backend changes

| File | Change |
|---|---|
| `products/scheduler/backend/database/models.py` | Add `status` enum column to `bracket_events`: `'draft' \| 'generated' \| 'started'`, default `'draft'`. Alembic-style migration: set `status = 'started'` for existing rows that already have any `bracket_matches`; otherwise `'generated'`. |
| `products/scheduler/backend/api/schemas.py` | Add `BracketPlayerDTO(id, name, notes?, restSlots?)` for the Roster persistence. Update `TournamentStateDTO` (or kind=bracket flavor) to include `players: List[BracketPlayerDTO]`. Update `BracketEventDTO` to include `status: Literal['draft','generated','started']`. |
| `products/scheduler/backend/api/brackets.py` | Add 3 routes: `POST /tournaments/{id}/bracket/events/{event_id}` (upsert event config + participants), `POST /tournaments/{id}/bracket/events/{event_id}/generate` (generate this event's draws — wipes if Re-generate), `DELETE /tournaments/{id}/bracket/events/{event_id}` (delete Draft event). |
| `products/scheduler/backend/services/bracket/scheduler.py` | Add `generate_event(event_id)` to `TournamentDriver` — narrow `schedule_next_round` scope to one event. Reads the event's `bracket_participants`, builds CP-SAT problem from this event only + `tournaments.data.config` (court grid + slot grid), solves, writes `bracket_matches` rows for this event. ACID via single SQLAlchemy transaction. If solver fails (infeasible), 409 with reason. |
| `products/scheduler/backend/services/bracket/state.py` | Add `is_event_started(event_id, results)` helper — returns `True` iff any `bracket_results` row exists for this event. Used to enforce the locked transition. |

The existing `POST /tournaments/{id}/bracket` (all-at-once create) stays for backward compatibility but is no longer called by the new tabs. The existing `POST /tournaments/{id}/bracket/schedule-next` becomes a convenience wrapper around `generate_event` for all currently-Draft events.

## Frontend changes

| File | Change |
|---|---|
| `products/scheduler/frontend/src/lib/bracketTabs.ts` | Extend `BRACKET_TAB_IDS` with `'bracket-setup'`, `'bracket-roster'`, `'bracket-events'`. Update `BRACKET_TABS` and view derivation accordingly. |
| `products/scheduler/frontend/src/features/bracket/BracketTab.tsx` | Add three new branches to the view dispatcher. |
| `products/scheduler/frontend/src/features/bracket/SetupTab.tsx` | NEW — sectioned form. |
| `products/scheduler/frontend/src/features/bracket/RosterTab.tsx` | NEW — flat list + detail panel. |
| `products/scheduler/frontend/src/features/bracket/EventsTab.tsx` | NEW — spreadsheet, replaces `SetupForm`. |
| `products/scheduler/frontend/src/features/bracket/SetupForm.tsx` | DELETE — content lives in Setup + Events tabs now. |
| `products/scheduler/frontend/src/features/bracket/DrawView.tsx` | SIMPLIFY — remove SetupForm fallback; pure per-event visualization. |
| `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx` | REWRITE as a `GanttTimeline` consumer (display-only, #3). |
| `products/scheduler/frontend/src/features/bracket/LiveView.tsx` | REWRITE as a `GanttTimeline` consumer with operator panel (#4). |
| `products/scheduler/frontend/src/api/bracketClient.tsx` + `bracketDto.ts` | Wire the 3 new endpoints + new DTOs. |
| `packages/design-system/components/` | Extract `<SectionedForm>` primitive (if not already there) for shared Setup-tab pattern. Same exit doors as `StatusBar.tsx` precedent (`b726b12`). |

## Migration (existing brackets)

Existing bracket tournaments like `unification-test` have data in `bracket_events`/`bracket_participants`/`bracket_matches` plus the legacy `SetupForm`-derived state in `tournaments.data.config`. They keep working without any DB migration script — the frontend opportunistically reconciles on first load:

```
1. GET /tournaments/{id}/bracket  →  the existing BracketTournamentDTO
2. GET /tournaments/{id}/state    →  current TournamentStateDTO (may have empty players[])
3. If tournaments.data.players is empty AND participants.length > 0:
     a. Extract unique players from all events' participants:
        - PLAYER type: take {id, name} directly (legacy SetupForm already slugged the id)
        - TEAM type:   pull each member_id, look up its name in the participant or rebuild
                       via the existing slug→name lookup (TEAM members are slugged ids too)
     b. Dedupe by id (slug); keep first-seen name as canonical
     c. POST /tournaments/{id}/state with state + the derived players[] merged in
     (No update needed to bracket_participants — their member_ids already align with the
      new Roster[].id because both come from the same slugify() helper.)
4. From this point on, the tournament behaves like a new-design bracket.
```

This runs once per bracket on first load; subsequent loads see `players` populated and skip. No backend migration script needed.

The `bracket_events.status` column needs the small Alembic migration described above (set `'started'` for rows with results, `'generated'` for rows with matches but no results, `'draft'` for empty rows — though no legacy bracket should have empty event rows).

## The validate↔pin contract (carry-over from #1)

Sub-project #1's `/bracket/validate` + `/bracket/pin` endpoints remain in the backend but are **not consumed** by this design's frontend. They stay available for:
- Future redesigns that re-introduce interactive Schedule on the bracket
- A director-only manual override modal (out of scope here)
- Cross-tournament court-sharing (the non-goal above; if introduced later, validate becomes useful again)

No code is removed; no UI references them. Tests for #1 stay green.

## Decisions log

- **Tab composition: 5 entry tabs + Draw + Schedule + Live** (Pattern A from the brainstorm). One tab one job; closest naming parity with the meet.
- **Events tab = full-width spreadsheet** with inline editing + in-grid participant picker. No left rail, no expand, no accordion — "no visual fragmentation."
- **Per-event Generate** (not all-at-once). Each event has its own Draft → Generated → Started lifecycle. Re-generate allowed in Generated; locked after Started.
- **Schedule = display-only.** Brackets are pre-scheduled at Generate time; no drag/validate/pin on the bracket side. #1's backend stays unused by this frontend.
- **Live tab keeps the right panel.** Matches the meet's Live tab pattern; the "no fragmentation" constraint applied to entry tabs, not the operator surface.
- **Migration is frontend-opportunistic.** No backend migration script for existing brackets' player data; the frontend reconciles on first load.
- **Design unification, not data unification.** Meet and bracket keep their own backend models, solvers, and DTOs. The UI patterns and design language unify; the functional models stay distinct.

## Testing

**Backend (`products/scheduler/tests/`):**
- `POST /bracket/events/{id}`: happy-path upsert; validation (event not found → 404, bad participant ref → 422).
- `POST /bracket/events/{id}/generate`: Draft → Generated transition; Generated → Generated transition (Re-generate); Started → 409; infeasible solver → 409.
- `DELETE /bracket/events/{id}`: Draft → OK; Generated → 409 (must Re-generate to wipe); Started → 409.
- Migration round-trip: existing legacy bracket → load → reconcile → verify `tournaments.data.players` is populated, `bracket_participants` reference player_ids.
- The existing #1 tests (`test_bracket_interactive_scheduling.py`) and #2 tests (`ganttTimeline.test.ts`) stay green.

**Frontend (`vitest`):**
- `bracketTabs.test.ts`: extend with the 3 new tab ids.
- `EventsTab.test.tsx`: per-event Status pill rendering; Action button gating (Draft → [Generate], Generated → [Re-generate], Started → [—]); in-grid participant picker open/close.
- `RosterTab.test.tsx`: add/edit/delete player; derived "Events:" badges.
- `SetupTab.test.tsx`: auto-persist on blur; defaults on first load.
- `ScheduleView.test.tsx`: empty state CTA; populated state — aggregates from generated events; event filter toggles dim.
- `LiveView.test.tsx`: state ring vocabulary; right panel populates on chip click; operator action callbacks.

**Visual sweep** (browser-harness): post-implementation, light + dark on each new tab, with both a fresh bracket and a migrated legacy bracket like `unification-test`.

## Out of scope (deliberate)

- Cross-tournament court sharing (meet ↔ bracket court awareness at the solver level).
- Data-model unification (one Players table across meet + bracket).
- Interactive bracket Schedule (drag/validate/pin on the bracket side).
- Rich state vocabulary on bracket Live (impacted/postponed/resting/traffic-light beyond the basic five).
- Bracket TV / public display.
- Bracket breaks / court closures (the adapter doesn't model them today).

## Companion plan

See `docs/superpowers/plans/2026-05-14-bracket-entry-and-courttime-views.md` for the bite-sized implementation plan. The plan has three phases:

- **Phase A — #5 entry pattern alignment**: backend (3 routes + status column + driver method), frontend Setup/Roster/Events tabs, SetupForm decomposition, migration.
- **Phase B — #4 Live Gantt**: `LiveView` rewrite as a `GanttTimeline` consumer with state vocabulary + operator panel.
- **Phase C — #3 Schedule Gantt**: `ScheduleView` rewrite as a display-only `GanttTimeline` consumer with event-color filter.

Build order: A → B → C. A is the prerequisite (Schedule + Live consume the data populated by Events tab's per-event Generate). B before C because Live is more code; landing it first surfaces any scaffold issues for the smaller C migration to inherit.
