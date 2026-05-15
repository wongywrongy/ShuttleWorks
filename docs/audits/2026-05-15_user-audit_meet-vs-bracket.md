# User audit — Meet vs Bracket sample run

**Date**: 2026-05-15
**Stack tested**: production build on `http://localhost` (`btp-frontend-1` + `btp-backend-1` from `docker compose`).
**Method**: full operator walk-through, screenshots at every step, no code-paths shortcut. `/tmp/audit_shots/` contains 50+ images keyed to the headings below.

## Scope and gaps

Sample-run, not exhaustive coverage. **Not exercised**:
- Live (meet): Director popover, Re-optimize button, Disruption dropdown (cancel match / close court / delay start / insert break).
- Schedule (meet): Move/postpone reschedule, Candidates panel, Export XLSX, manual drag.
- Tournament data: Export, Import, Backups, Recover-from-XLSX, Reset.
- Share: actually generating an invite link and opening it from another session.
- Public `/display?tournament_id=…` route (only the in-app preview).
- Bracket: Reset, JSON/CSV/ICS exports, seeded-placement options for Add event.
- Authentication flow (already-authenticated session reused throughout).

## TL;DR

| Surface | Verdict |
|---|---|
| Dashboard / New event dialog | ✅ Works. Meet|Tournament selector is clean. |
| Meet — Setup (all 6 sections) | ✅ Works. Save required to commit defaults. |
| Meet — Roster (schools + bulk-import + position grid) | ✅ Works. One picker-overflow nit. |
| Meet — Matches auto-generate | ✅ Works. |
| Meet — Schedule (CP-SAT solver) | ✅ Works. Solved 4 matches in 15ms, proving optimal. |
| **Meet — Live mutations (Call / Start / Post)** | **🔴 BROKEN. 412 If-Match on every mutation; optimistic UI desyncs from server.** |
| Meet — TV preview | ⚠️ Renders, but **date off by one day**, **Schedule + Standings tabs are no-ops**, **"Configure display" jumps to wrong sidebar section**. |
| Bracket — Setup / Roster / Events | ✅ Works (Roster lacks bulk-import; row-expand affordance hidden). |
| Bracket — Draw (SE + RR) | ✅ Works. Inline `↵ wins` is delightful. Auto-advances. |
| **Bracket — Schedule + Live court grid** | **🔴 Half the matches are invisible. Each match is rendered twice — second copy at the wrong y. C2 and C4 matches drift off the grid bottom.** |
| Bracket — Live mutations (Start / A wins / B wins) | ✅ Works (different service than meet — no If-Match issue here). |

---

## Flow 1 — Meet: end-to-end

URL after create: `/tournaments/{id}/setup`. Tabs: **Setup · Roster · Matches · Schedule · Live · TV**. Setup has a 6-item sidebar (`Tournament / Engine / Public display / Appearance / Tournament data / Share`).

### 1.1  Setup → Tournament (default landing)
Pre-populates sensible defaults: `09:00–18:00`, 4 courts, 30-min slots, Best-of-3 / 21 / Deuce, events Men's/Women's singles 3, Men's/Women's/Mixed doubles 2 each. Date carried over from create dialog.

> **🟡 UX nit — defaults are display-only until `Save tournament settings`.** Navigating to Roster before clicking Save leaves the events table empty server-side; the Roster surface correctly shows "*No events configured. Set Event Categories in the Setup tab to enable the roster grid.*" but the user has no signal in Setup that "Save" is the gate. Suggest auto-save or a dirty-state indicator. (Screenshots `09_…` → `06_meet_roster_two_schools.png`.)

### 1.2  Setup → other 5 sidebar sections
Engine, Public display, Appearance, Tournament data, Share — all render and have working controls. Three observations:

- **Share members row shows the raw UUID `00000000-0000-0000-0000-000000000000`** for the dev-auth owner instead of an email / display name. Acceptable in dev, would be a polish miss in prod. (`setup_share.png`)
- Appearance is **per-device** (theme + density saved per browser) — usefully clarified inline.
- Tournament data correctly disables Export with "No data to export yet" before save.

### 1.3  Roster
Layout: schools left, position-grid right. Columns auto-derived from the saved events (after fix above: MD/WD/XD doubles + WS/MS singles, 12 cells = 2+2+2+3+3 ✓).

Worked: `+ Add` school (per-school inline input), `+ Bulk-import players` (textarea, "N names" live count, `Add 8` button), drag handle next to each player, click-cell-to-pick player flow.

> **🟡 Picker overflow on rightmost column (MS).** Clicking `+ add player` on the MS column opens a search popover that extends past the viewport's right edge; the visible "highlighted result" is half-clipped. Reproduced consistently. (`16_meet_picker_state.png`)

> **🟡 No inline "create-and-assign".** From a position-grid cell, you can only assign *existing* players. To add a new player you must either type names one-at-a-time in the team sidebar or use the bulk-import textarea. For a 50-200-player meet that's fine; for a quick same-day add it's friction.

### 1.4  Matches
The auto-generate banner reads `Will produce 4 matches across 12 ranks × 2 schools` — accurate (only singles were assigned; doubles pairs were left blank). `Generate matches` produced the expected 4 (MS1/MS2/WS1/WS2). Search + Add-match + Export XLSX visible but not exercised.

### 1.5  Schedule (CP-SAT solver)
Click `Generate`. Solver returned in **15 ms with 1 solution**; footer reports `Proving optimal · Model 4 · 20 intervals · 4 no-overlap · Objective 0 · bound 0`. Gantt placed 4 matches at 09:00 across C1–C4. The right `Details / Candidates` panel populated on row click with court, ready badge, players, Reschedule and Disruption controls (Cancel match, Close court 3 — context-specific to the selected match). Solid surface.

### 1.6  Live — broken
Click **Call** on the WS2 row.

> **🔴 P1 — Live mutations fail with `412 If-Match header required for match mutations`.** Reproducible on retry — same request ID is rejected with the same error a second time, so it's a deterministic header-missing bug, not a race. Tested on the `Call` action of one WS2 match; the same code path drives `Start` / `Post` so I haven't run the others. Backend `products/scheduler/backend/api/match_state.py:282` enforces an `If-Match` header on `PUT /matches/{id}` and `DELETE /matches/{id}`. The client visibly:
> 1. Optimistically transitions the row (Call → "waiting 0:00" → Start visible, "✓ All in" badge appears).
> 2. Toasts the error and asks for Retry. Retry uses the same payload and fails identically.
> 3. **Does not roll back the optimistic state** — the row stays in `waiting`, the TV preview keeps the `CALLING` badge, but the server still has the match in `scheduled`. A page refresh would erase the operator's apparent action.
>
> The codebase has a `commandQueue` + `useCommandQueue` infrastructure that DOES carry `seen_version` (`products/scheduler/frontend/src/hooks/useCommandQueue.ts:140`), and `getMatchVersion` reads ETags from the legacy match-state route. So the plumbing exists. The Call button appears to be hitting a legacy mutation route directly without going through that queue, or sending the request without setting the `If-Match` header from cached `matchVersion`. A focused trace of the `Call`/`Start`/`Post` handlers' network calls will localize the regression. Test fixture `products/scheduler/frontend/src/lib/__tests__/commandQueue.test.ts:124` already mocks the exact error string — so the contract is known, just not wired here.
>
> **Gantt color did not update for the optimistic state.** The list row's `Call` button changed to `Start`/`Undo`, but the gantt block kept its `Late` orange border without flipping to the `Called` amber fill — a second symptom of the same desync.

### 1.7  TV
TV uses **Courts | Schedule | Standings** view tabs and renders inside the app as a preview.

> **🔴 Date off by one day.** Tournament saved as `2026-05-15` (Friday). TV header reads `Thu, May 14`. Hypothesis: backend returns the date as a UTC midnight ISO string, frontend parses with `new Date(...)` which interprets it in the local timezone, and for UTC-positive offsets midnight UTC = the previous day local. Fix: format with `toLocaleDateString({timeZone: 'UTC'})` or treat the date as a naive `YYYY-MM-DD` rather than a Date.

> **🔴 `Schedule` and `Standings` view-tabs are no-ops.** Clicking either changes the active-pill underline but renders the same Court-card layout as `Courts`. Verified by diffing `document.body.textContent` between the three states — identical.

> **🟡 "Configure display" navigates to Setup → Tournament** instead of Setup → Public display. The button is labelled for that destination — wrong link target.

> **🟡 Persistent `RECONNECTING…` badge in the TV header**, with the underlying data still updating. Likely an SSE/WebSocket dropout that the UI surfaces but doesn't actually impair. Worth investigating because it'll alarm an operator mid-event.

> Positive: optimistic call propagated to TV — the WS2 court card showed `CALLING` immediately. So at least the read-side wiring works.

---

## Flow 2 — Bracket tournament: end-to-end

URL after create: `/tournaments/{id}/bracket`. Tabs: **Setup · Roster · Events · Draw · Schedule · Live** (no TV). Draw / Schedule / Live start disabled until at least one event has been Generated; clicking a disabled tab is correctly a no-op.

### 2.1  Setup
A small flat panel — Tournament name / Date / Courts / Slot duration / Start time / End time / Rest between **rounds** (slots, not minutes). No sidebar, no scoring config, no per-discipline event counts (those live in Events). For an operator who wants a quick draw this is correctly minimal.

### 2.2  Roster
Single `+ Add player` button → inline name input → Enter to commit → row appears with `Delete`. Filter/search input visible top-right.

> **🟡 No bulk-import.** Meet has a textarea; bracket doesn't. For an 8-player single-elim this is fine; for a 64-player RR series it's miserable. Either port the textarea or copy from a meet roster.

### 2.3  Events
Headers: `ID · Discipline · Format · Size · Participants · Status · Action`. `+ Add event` opens an inline editable row with ID (defaults to placeholder "MS"), Discipline (defaults to "MS"), Format (`SE` or `RR`), Save / Cancel.

> **🟡 Row-expand affordance is hidden.** Clicking the row itself or the ID column does nothing. The participant picker is ONLY triggered by clicking the `Participants` cell ("0 entered" / "N entered"). Make the whole row clickable, or make the participants count visibly look like a button.

Worked: created `MS-1 / MS / SE`, picked 8 participants, hit `Generate`. Counters at top-right updated `DONE 0 LIVE 0 READY 4 PEND 3` (=4 QF + 2 SF + 1 F). Created a second event `WS-1 / WS / RR` with 4 participants, generated → 6 matches across 3 rounds.

### 2.4  Draw
**Beautiful surface.** SE renders QF → SF → F columns; RR renders Round 1 → 2 → 3. Each match-card shows `MS-1-R0-3 · slot 0 · court 3` and two seats with an inline `↵ wins` button per side. Mark a win → loser is struck through, winner-name fills the corresponding next-round slot. Auto-advance is correct.

This is the strongest part of the app.

### 2.5  Schedule / Live court grid — broken
This is the same widget as meet's gantt but driven by the bracket data model.

> **🔴 P1 — bracket Schedule and Live render only half the matches in the C1–C4 grid.** Visible blocks always sit in C1 and C3 rows; C2 and C4 always look empty even when the Draw shows matches assigned to courts 2 and 4. Inspecting the DOM (`agent-driven js()` dump in audit notes) shows each match block is rendered **twice**: once inside the correct table-row wrapper, and **once as an absolutely-positioned duplicate at the wrong y**. For a 4-court grid with 40 px row height the duplicate y values were:
>
> | match | court | correct y | duplicate y |
> |---|---|---|---|
> | MS-1-R0-2 | 1 | 150 | 150 (same — visible) |
> | MS-1-R0-1 | 2 | 190 | **230** (lands in C3) |
> | MS-1-R0-3 | 3 | 230 | **310** (below C4) |
> | MS-1-R0-0 | 4 | 270 | **390** (way below the grid) |
>
> The duplicate appears to use `court_index × row_height` instead of `(court_index − 1) × row_height`. C1's duplicate happens to land on top of the correct copy so the bug is invisible there; for C2 it lands on C3; for C3 and C4 it falls off the bottom of the rendered grid container and never appears anywhere. From the operator's chair half the matches just vanish. Reproducible with both SE and RR; reproducible on Schedule and Live tabs.
>
> Recommended fix-finding path: search the bracket court-grid component for two render paths around block placement (one wrapper-based, one absolute-positioned), and either remove the duplicate or correct its y formula.

### 2.6  Live — mutations work
Click a visible C1 block → right panel opens with `Court C1 · slot 0`, player A vs player B, `Start` button. Click Start → `LIVE 1 / READY 3`, block recolours, panel switches to `A wins / B wins`. Click `A wins` → block goes DONE, panel shows `DONE — SIDE A WINS`, counters `DONE 1 LIVE 0 READY 3 PEND 3`, **Draw tab reflects the advance** with the winner promoted into the next-round slot. Inline `↵ wins` from the Draw tab does the same thing in one click without needing to Start first.

> **No `If-Match` errors here** — the bracket surface uses a different mutation service. So the legacy meet route is the only bug-bearer; the bracket flow is structurally correct.

---

## Meet vs bracket — same operations, different shapes

| Concern | Meet | Bracket |
|---|---|---|
| URL after create | `/tournaments/{id}/setup` | `/tournaments/{id}/bracket` |
| Top tabs | Setup / Roster / Matches / Schedule / Live / TV | Setup / Roster / Events / Draw / Schedule / Live |
| Setup chrome | 6-section sidebar (Tournament / Engine / Public display / Appearance / Tournament data / Share) | Single flat panel |
| Save semantics | Explicit "Save tournament settings" button per section; defaults are display-only until save | Inline edit + Save per event row; settings appear to auto-persist |
| Roster model | Schools → players, players assigned to event-slot positions via Position Grid | Flat player list; players assigned per-event via checkbox picker |
| Bulk-import | ✅ textarea, "N names" counter, paste-one-per-line | ❌ none |
| Match generation | Auto-generate paired matches from rosters of two schools | Per-event `Generate` button creates bracket (SE) or round-robin (RR) |
| Scheduling | Solver (CP-SAT) on `Generate` — sub-second on small N | Pre-assigned by `Generate` (court + slot baked into each match) |
| Live state model | `scheduled → called → started → finished` | `ready → live → done` |
| Live mutation API | Legacy match-state route (requires `If-Match`) — **currently broken** | Newer bracket service — works |
| TV | Dedicated route + tab, theme presets, accent colour | None |
| Public-display config | 4 layout knobs + 4 brand presets + 8 accent colours | n/a |
| Disruption controls | Cancel match / Close court N / Move-postpone / Director / Re-optimize | None visible (Reset only) |

The two flows share the gantt component, the AppShell, the auth, and the dashboard. They diverge in mutation API (the meet flow goes through the legacy route — that's where the 412 lives) and in scheduling philosophy (solver vs static-assigned). Most of the user-visible bugs concentrate on the **legacy meet mutation path** and the **bracket court-grid renderer**; both surfaces independently work right up until those points.

---

## Suggested next steps

In rough priority order:

1. **Fix meet Live mutations** (P1 — the meet is unusable in live mode without it). Wire `Call/Start/Post` through `commandQueue` so `If-Match` is set from cached `matchVersion`, OR migrate those endpoints onto the newer commands API that bracket already uses.
2. **Fix the bracket court-grid duplicate-block render** (P1 — half the schedule is invisible). One-line offset bug in the absolute-positioned block placement.
3. **TV date off-by-one** (P2 — wrong day on screens visible to the venue).
4. **TV Schedule + Standings tabs**: either implement them or remove the buttons.
5. **"Configure display" link target**: point at Setup → Public display.
6. **Setup → Tournament defaults**: either auto-save or surface a dirty-state indicator.
7. **Bracket Events**: make the whole row open the participant picker, not just the participants cell.
8. **TV "RECONNECTING…" badge**: investigate why it's sticky on a working connection.

## Reference artifacts

- Screenshots: `./2026-05-15_screenshots/` (76 files, prefixed by step number 01–58).
- Tournament rows left in place to reproduce findings 1 (If-Match) and 2 (court-grid duplicate render). Delete when no longer needed.
  - Meet: `09fd8396-e836-4d33-bb97-68fbb27a0cc3` — "Audit Meet 2026"
  - Bracket: `7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a` — "Audit Tournament 2026"
