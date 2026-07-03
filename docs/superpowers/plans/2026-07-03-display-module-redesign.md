# Display Module Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Meet-courts public Display spectator-calm, director-configurable, and standings-capable — with standings sourced from a new authoritative Meet computation, and the board's time language aligned to Operations' relative lanes.

**Architecture:** Extend the existing `tv*` workspace-config family (already on the tournament `config` JSON blob, read by the board but never editable) with layout fields (`courtOrder`, `hiddenCourts`, `standingsMode`). Build the Configuration editor + live preview that finally *drives* those fields. Recast the board's connection surfacing from operator-voiced ("Reconnecting/Offline") to spectator-calm freshness (Live / Delayed / Out-of-date) and strip operator chrome that leaks onto both the board (a shared `AdvisoryBanner`) and the in-shell preview (AppShell toasts). Add a pure Meet **pool-standings computation** in the backend, expose it on `TournamentStateDTO`, and have the board render it (side panel vs. rotation by court count). Replace the board's drifting wall-clock labels with Now/Next/Later lanes via a **shared pure helper** also consumed by Operations.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic (backend), React + Vite + Zustand + Tailwind/CVA design-system (frontend), pytest + vitest.

**Grounding (from the audit — `docs/superpowers/specs/2026-07-03-display-module-redesign-audit-findings.md`):**
- `tv*` config lives in `frontend/src/api/dto.ts:70–90` + `backend/app/schemas.py:94–105`; extend there (JSON blob, no migration).
- Board: `products/display/MeetDisplayPage.tsx` (reads config + schedule + matchStates); `publicDisplay/{CourtsView,ScheduleView,StandingsView,LiveStatusPill,useDisplaySync}`.
- Advisory leak: `MeetDisplayPage.tsx:330` renders shared `components/status/AdvisoryBanner`.
- Preview: `products/display/DisplayProduct.tsx` wraps the board inside AppShell (whose `ToastStack` + advisory chrome then appear).
- Meet scores: `Match.score_side_a/score_side_b` (`backend/database/models.py:319–320`); groups exist; state served by `GET /tournaments/{id}/state` → `TournamentStateDTO`.
- Operations relative roles: `products/operations/run/RunSurface.tsx:290`, `RunInspector.tsx:59` (`now | next-later | queued`).

## Global Constraints (absolute rules — every task inherits these)

- **Meet-day operational functionality must not change or regress.** This touches Display + Display Configuration + a new *read-only* Meet standings computation only.
- **Display projects, never operates.** No operator alert may originate from or surface on the public board; no raw connection/fetch error text to spectators; never imply a consequential decision (defaults/walkovers/retirements stay Operations').
- **Standings source is the new authoritative Meet computation** (Task 2). The board must NOT compute standings client-side — the existing client computation (`MeetDisplayPage.tsx:190–206`) is DELETED and replaced by consuming the server field. On a workspace with no Meet module or no pool play, standings are not-applicable (option hidden), never an empty/broken panel.
- **Director-set layout persists** (workspace config): survives refresh + reconnect. Not session/component state.
- **Hiding a court is presentation-only.** It must never touch Operations scheduling or live match state; a hidden court that later gets a match does NOT auto-reappear on the board.
- **`coming_soon` is retired.** No placeholder/"coming soon" states.
- **Relative-lane derivation is a shared pure helper** used by both Operations and Display — do NOT re-implement now/next/later on the board (same "parallel computation" trap the standings rule guards against).

---

## File Structure

**Backend (create):**
- `backend/services/meet/standings.py` — pure `compute_meet_standings(matches, match_states, groups, players) -> list[StandingRow]`.
- `backend/tests/unit/test_meet_standings.py`

**Backend (modify):**
- `backend/app/schemas.py` — `TournamentConfig` gains `courtOrder`/`hiddenCourts`/`standingsMode`; `TournamentStateDTO` gains `standings`.
- `backend/api/tournaments.py` — attach computed standings to the state payload.

**Frontend (create):**
- `frontend/src/products/display/publicDisplay/courtLayout.ts` — pure helpers: `orderCourts`, `visibleCourts`, `defaultColumns`.
- `frontend/src/products/display/publicDisplay/freshness.ts` — pure `deriveFreshness(ageMs, pollMs) -> FreshnessState`.
- `frontend/src/lib/matchLanes.ts` — **shared** pure `assignLanes(...)` → `now | next | later` (consumed by Operations + Display).
- `frontend/src/products/workspace/displayConfig/` — the Configuration editor + `DisplayPreview` (extract from board render).
- `__tests__/` for each pure helper + the editor.

**Frontend (modify):**
- `products/display/MeetDisplayPage.tsx` — remove advisory; consume server standings; use `courtLayout` + `matchLanes` + `freshness`.
- `publicDisplay/{LiveStatusPill,useDisplaySync,CourtsView,StandingsView}.tsx`.
- `products/display/DisplayProduct.tsx` — preview chrome suppression.
- `products/workspace/DisplayConfig.tsx` — mount the new layout editor + preview.
- `api/dto.ts` — mirror the new config + standings fields.
- `products/operations/run/*` — swap Operations' inline role derivation to the shared `matchLanes` helper (behavior-preserving).

---

## Task 1: Config schema — layout fields

**Files:**
- Modify: `backend/app/schemas.py` (`TournamentConfig`)
- Modify: `frontend/src/api/dto.ts` (`TournamentConfigDTO`)
- Test: `backend/tests/unit/test_schemas_display_config.py` (create)

**Interfaces — Produces:** config fields `courtOrder?: int[]`, `hiddenCourts?: int[]`, `standingsMode?: 'off'|'side'|'rotate'` (all optional, default None → back-compat by omission).

- [ ] **Step 1: Failing test** — `test_schemas_display_config.py`:
```python
from app.schemas import TournamentConfig

def test_display_layout_fields_roundtrip():
    c = TournamentConfig(courtOrder=[3, 1, 2], hiddenCourts=[4], standingsMode="side")
    assert c.courtOrder == [3, 1, 2]
    assert c.hiddenCourts == [4]
    assert c.standingsMode == "side"

def test_display_layout_fields_default_none():
    c = TournamentConfig()
    assert c.courtOrder is None and c.hiddenCourts is None and c.standingsMode is None
```
- [ ] **Step 2: Run — FAIL** (`cd products/scheduler && pytest tests/unit/test_schemas_display_config.py -q`) — unexpected kwargs.
- [ ] **Step 3: Implement** — in `TournamentConfig` (next to the `tv*` block ~line 94–105):
```python
    courtOrder: Optional[list[int]] = None
    hiddenCourts: Optional[list[int]] = None
    standingsMode: Optional[Literal["off", "side", "rotate"]] = None
```
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Mirror the DTO** — `dto.ts` `TournamentConfigDTO` (next to `tvShowScores`):
```ts
  courtOrder?: number[] | null;
  hiddenCourts?: number[] | null;
  standingsMode?: 'off' | 'side' | 'rotate' | null;
```
- [ ] **Step 6: Gate + commit** — `pytest -q` (backend) + `tsc -b`; `git commit -m "feat(display): layout config fields (courtOrder/hiddenCourts/standingsMode)"`

---

## Task 2: Meet pool-standings computation (backend, authoritative)

**Files:**
- Create: `backend/services/meet/standings.py`, `backend/tests/unit/test_meet_standings.py`
- Modify: `backend/app/schemas.py` (`MeetStandingRowDTO`, `TournamentStateDTO.standings`), `backend/api/tournaments.py` (attach)

**Interfaces — Produces:** `compute_meet_standings(*, matches, match_states, groups, players) -> list[StandingRow]` where `StandingRow = {groupId, groupName, matchesPlayed, wins, losses}`; served on `TournamentStateDTO.standings: list[MeetStandingRowDTO]` (empty list when Meet not enabled / no pool play).

> **Rule anchor:** this REPLACES the board's client computation. Semantics mirror the current board (`MeetDisplayPage.tsx:190–206`): a finished match with `score_side_a/b` credits the winning side's group a win, the losing group a loss; ties/no-score ignored; groups with 0 played are dropped; sort by wins desc, then losses asc, then groupId (determinism). Confirm the group→side mapping with the product owner if pool semantics differ (flagged in the spec — meets are school-vs-school, "pool standings" = per-group W/L here).

- [ ] **Step 1: Failing test** — `test_meet_standings.py`:
```python
from services.meet.standings import compute_meet_standings, StandingRow

def test_basic_wins_losses():
    groups = [{"id": "g1", "name": "Riverside"}, {"id": "g2", "name": "Lakeside"}]
    players = [{"id": "p1", "groupId": "g1"}, {"id": "p2", "groupId": "g2"}]
    matches = [{"id": "m1", "sideA": ["p1"], "sideB": ["p2"]}]
    states = {"m1": {"status": "finished", "scoreSideA": 21, "scoreSideB": 15}}
    rows = compute_meet_standings(matches=matches, match_states=states, groups=groups, players=players)
    assert rows == [
        StandingRow(groupId="g1", groupName="Riverside", matchesPlayed=1, wins=1, losses=0),
        StandingRow(groupId="g2", groupName="Lakeside", matchesPlayed=1, wins=0, losses=1),
    ]

def test_unscored_and_zero_played_dropped():
    groups = [{"id": "g1", "name": "A"}, {"id": "g2", "name": "B"}]
    players = [{"id": "p1", "groupId": "g1"}, {"id": "p2", "groupId": "g2"}]
    matches = [{"id": "m1", "sideA": ["p1"], "sideB": ["p2"]}]
    states = {"m1": {"status": "scheduled"}}  # not finished
    assert compute_meet_standings(matches=matches, match_states=states, groups=groups, players=players) == []
```
- [ ] **Step 2: Run — FAIL** (module missing).
- [ ] **Step 3: Implement** `services/meet/standings.py` — a pure function (no DB/session): build `player→groupId` map, iterate finished-with-score matches, credit win/loss per side's group, drop 0-played, sort `(-wins, losses, groupId)`. `StandingRow` = frozen dataclass. Port the exact tie/side logic from `MeetDisplayPage.tsx:170–206`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: DTO + attach** — add `MeetStandingRowDTO` + `TournamentStateDTO.standings: list[MeetStandingRowDTO] = []` in `schemas.py`; in `api/tournaments.py` state assembly, compute from the already-loaded matches/states/groups/players (NO new query — same loaded data) **only when the Meet module is enabled**, else `[]`.
- [ ] **Step 6: State test** — extend a tournaments state test: a Meet workspace with finished scored matches returns non-empty `standings`; a bracket-only workspace returns `[]`.
- [ ] **Step 7: Mirror DTO** in `dto.ts` (`MeetStandingRowDTO`, `TournamentStateDTO.standings?`).
- [ ] **Step 8: Gate + commit** — `pytest -q`, `tsc -b`; `git commit -m "feat(meet): authoritative pool-standings computation on tournament state"`

---

## Task 3: Remove the operator advisory from the public board

**Files:** Modify `products/display/MeetDisplayPage.tsx`; Test `products/display/__tests__/MeetDisplayPage.advisory.test.tsx` (create)

- [ ] **Step 1: Failing test** — render `MeetDisplayPage` with an active critical advisory in the store; assert the board does NOT render it (`queryByText(/min over its expected/i)` is null; no `AdvisoryBanner` testid).
- [ ] **Step 2: Run — FAIL** (advisory currently renders).
- [ ] **Step 3: Implement** — delete the import (`:25`) and the block (`:328–331`) `<AdvisoryBanner readOnly />`. Leave the shared component untouched (Operations still uses it).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "fix(display): stop rendering operator advisory on the public board"`

---

## Task 4: Spectator-calm freshness states

**Files:** Create `publicDisplay/freshness.ts` + `__tests__/freshness.test.ts`; Modify `useDisplaySync.ts`, `LiveStatusPill.tsx`, `MeetDisplayPage.tsx`

**Interfaces — Produces:** `type FreshnessState = 'live' | 'delayed' | 'stale'`; `deriveFreshness(ageMs: number, pollMs: number): FreshnessState` (delayed ≥ ~2.5×poll, stale ≥ STALE_MS≈240_000). Board dims court tiles + shows a calm caption on `stale`.

- [ ] **Step 1: Failing test** — `freshness.test.ts`: `deriveFreshness(0,10000)==='live'`; `deriveFreshness(26000,10000)==='delayed'`; `deriveFreshness(300000,10000)==='stale'`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `freshness.ts` (pure, thresholds as named consts keyed to `pollMs`).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Wire** — `useDisplaySync` returns `FreshnessState` from `deriveFreshness(now-lastSyncMs, TOURNAMENT_POLL_MS)` (keep the last-good-data behavior). `LiveStatusPill` relabels: `live`→"Live" (green), `delayed`→"Delayed" (amber, quiet), `stale`→"Out of date" (muted, NO red-alarm, NO "server/backend" text; keep raw error out of visible text). On `stale`, `MeetDisplayPage` adds `opacity-60` to the court grid + a calm caption "Results may be out of date — reconnecting".
- [ ] **Step 6: Update the pill test** (rename states) + assert no "Reconnecting/Offline/server" strings render.
- [ ] **Step 7: Gate + commit** — `git commit -m "feat(display): calm Live/Delayed/Out-of-date freshness (spectator voice)"`

---

## Task 5: Preview mirrors the public board (suppress operator chrome)

**Files:** Modify `products/display/DisplayProduct.tsx`; Test `products/display/__tests__/DisplayProduct.preview.test.tsx`

> The `/tv` preview wraps the board inside AppShell, so AppShell's `ToastStack` + advisory chrome appear (the audit's problem-#1 source). The preview must faithfully mirror the public board.

- [ ] **Step 1: Failing test** — render the preview with an API-error toast + critical advisory present; assert the preview region shows neither (the board mirror is clean).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — scope operator chrome away from the preview. Options, choose per the AppShell structure: (a) render the preview through a small `<PublicBoardFrame>` that doesn't include AppShell's `ToastStack`/advisory, or (b) a `previewMode` context flag that AppShell's `ToastStack`/advisory read to suppress within the Display preview segment. Prefer (a) — the preview should be the exact standalone board, only embedded. Do NOT globally change AppShell toasts for other surfaces.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "fix(display): /tv preview mirrors the public board (no operator toasts/advisory)"`

---

## Task 6: Configuration editor + live preview

**Files:** Create `products/workspace/displayConfig/{DisplayLayoutEditor.tsx, DisplayPreview.tsx}` + tests; Modify `products/workspace/DisplayConfig.tsx` (mount below Feeds), and add a config PATCH path if none exists (reuse the tournament-config update the Meet/Bracket Config surfaces use).

**Interfaces — Consumes:** the `tv*` + Task-1 fields. **Produces:** an editor that writes them via the existing tournament-config update; a `DisplayPreview` that renders the board at a scaled-down size from the same config.

- [ ] **Step 1: Failing test** — `DisplayLayoutEditor.test.tsx`: renders controls for display mode (strip/grid/list), columns, card size, show-scores, standings mode; changing a control calls the update with the new config.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the editor using design-system primitives (`Select`, `Toggle`, `Seg` from `platform/settings/SettingsControls`) — no native controls. Persist via the tournament-config update endpoint (same one Config surfaces use). `DisplayPreview` = the board render at `transform: scale()` in a bordered frame reading the *draft* config (live preview).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Mount** in `DisplayConfig.tsx` (a new "Board layout" section + the preview) — leave the existing Feeds + public-link sections untouched.
- [ ] **Step 6: Gate + commit** — `git commit -m "feat(display): Configuration board-layout editor + live preview"`

---

## Task 7: Court order, hide-court, responsive column default

**Files:** Create `publicDisplay/courtLayout.ts` + `__tests__/courtLayout.test.ts`; Modify `MeetDisplayPage.tsx`/`CourtsView.tsx` (apply), `DisplayLayoutEditor.tsx` (drag-reorder + hide toggles).

**Interfaces — Produces:**
- `orderCourts(courtIds: number[], courtOrder: number[] | null | undefined): number[]` — manual order first (in given order), then unlisted courts appended in ascending number (with a `isNew` flag surfaced separately). Never drops a court.
- `visibleCourts(courtIds: number[], hidden: number[] | null | undefined): number[]` — presentation-only filter.
- `defaultColumns(courtCount: number, override: number | null | undefined): 1|2|3|4` — override wins; else derive (≤3→2, 4–6→3, ≥8→4; clamp).

- [ ] **Step 1: Failing tests** — cover: manual order `[3,1]` over courts `[1,2,3,4]` → `[3,1,2,4]` (unlisted appended by number, 4 flagged new); `visibleCourts([1,2,3],[2])===[1,3]`; `defaultColumns(2,null)===2`, `defaultColumns(10,null)===4`, `defaultColumns(10,2)===2`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `courtLayout.ts` (pure).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Apply** in the board: order → hide (presentation-only; a hidden court with a live match stays hidden on the board — Q9) → columns default. Add drag-reorder + per-court hide toggles to the editor; in the editor (operator context only) surface "Court N (hidden) has a live match — show it?" when a hidden court has an active assignment.
- [ ] **Step 6: Gate + commit** — `git commit -m "feat(display): court order, hide-court (presentation-only), responsive column default"`

---

## Task 8: Now/Next/Later lanes via a shared helper (retire drifting clock)

**Files:** Create `frontend/src/lib/matchLanes.ts` + `__tests__/matchLanes.test.ts`; Modify `CourtsView.tsx`/`MeetDisplayPage.tsx` (board), and `products/operations/run/*` (swap to the shared helper, behavior-preserving).

**Interfaces — Produces:** `assignLanes(items, nowState) -> Map<id, 'now'|'next'|'later'>` — a pure derivation of the relative role currently living inline in Operations (`RunSurface.tsx:290`, roles `now|next-later|queued`). Board consumes it; a de-emphasized *planned* clock shows only on `next`/`later`, never on `now`.

- [ ] **Step 1: Extract-with-parity test** — `matchLanes.test.ts` reproduces Operations' current role outputs for a fixture (assert `assignLanes` matches the existing `RunSurface`/`RunInspector` role derivation exactly).
- [ ] **Step 2: Run — FAIL** (helper missing).
- [ ] **Step 3: Implement** `matchLanes.ts` by lifting the pure logic from `RunSurface.tsx:290`/`RunInspector.tsx:59` verbatim (no behavior change).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Swap Operations** to import the shared helper; run the Operations test suite — **zero behavior change** (if any Operations test would need editing to pass, STOP and flag — the extraction must be behavior-preserving).
- [ ] **Step 6: Board** — `CourtsView` labels courts by lane (Now / Next / Later); planned clock de-emphasized on Next/Later only, dropped on Now.
- [ ] **Step 7: Gate + commit** — `git commit -m "refactor(ops+display): shared match-lane helper; board uses relative lanes"`

---

## Task 9: Standings on the board (server-sourced; panel vs. rotation)

**Files:** Modify `publicDisplay/StandingsView.tsx` (consume server `standings`, delete client computation in `MeetDisplayPage.tsx:170–206`), `MeetDisplayPage.tsx` (panel-vs-rotate by court count + `standingsMode`); Test `publicDisplay/__tests__/StandingsView.test.tsx` + a `standingsLayout` helper test.

**Interfaces — Produces:** `standingsPlacement(courtCount, mode): 'off'|'side'|'rotate'` — `mode==='off'`→off; explicit `side`/`rotate` honored; `mode` unset → default `side` when `courtCount<=6` else `rotate`.

- [ ] **Step 1: Failing tests** — `StandingsView` renders rows from the `standings` prop (no local computation); `standingsPlacement(4, undefined)==='side'`, `standingsPlacement(10, undefined)==='rotate'`, `standingsPlacement(10,'side')==='side'`, `standingsPlacement(n,'off')==='off'`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `StandingsView` takes `standings: MeetStandingRowDTO[]`; **delete** the `groupScores` computation in `MeetDisplayPage.tsx:170–206`; feed `state.standings`. Add `standingsPlacement`; render a persistent side panel (shrinks the grid) or timed rotation accordingly. Hide standings entirely when Meet not enabled / `standings` empty (never an empty panel).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(display): server-sourced standings; panel vs rotation by court count"`

---

## Task 10: Docs, full gates, live verification

- [ ] **Step 1** — Update the spec's status + link this plan; note the resolved conflicts (standings source = new backend computation; toast = preview chrome).
- [ ] **Step 2** — Full gates: `make check` (or: frontend `test:run` + `tsc -b` + `lint:scheduler`; backend `pytest` + `ruff check`). All green, zero unexplained existing-test edits.
- [ ] **Step 3** — Live Playwright pass (host backend :8600 + Vite `VITE_API_PROXY_TARGET=:8600`, Docker down — per the CLAUDE.md trap), both themes: the standalone board (calm freshness, no advisory, relative lanes, ordered/hidden courts, columns, standings) + the `/tv` preview (mirrors the board, no operator toasts) + the Configuration editor + live preview. Use `QA All Modules` (has schedule + finished scored matches for standings).
- [ ] **Step 4** — `FRONTEND_PROGRESS.md` entry + memory note.

---

## Verification (whole feature)
- Public board shows NO operator advisory, NO raw error text, NO "server/backend" wording; freshness reads Live/Delayed/Out-of-date; time reads Now/Next/Later.
- `/tv` preview is a faithful mirror (no operator toasts/advisory).
- Standings come from `TournamentStateDTO.standings` (backend); the client computation is deleted; standings hidden when Meet-absent.
- Court order/hide/columns persist across refresh + reconnect; hiding never affects Operations; a hidden court with a live match stays hidden on the board and is surfaced only in the editor.
- Operations behavior is unchanged after the shared-helper extraction (its test suite passes untouched).
- Meet-day operational flows untouched; `make check` green.

## Self-review notes
- **Spec coverage:** problems 1–5 → Tasks 3/5 (operator chrome), 4 (freshness), 6/7 (layout editor + court control), 2/9 (standings). Open questions Q1→T8, Q2/Q3→T4, Q4→T9, Q5→T6, Q6/Q7→T7, Q8→(court tiles already carry M/B via Operations; add source indicator in T7 if absent), Q9→T7.
- **Rule conflicts resolved:** standings via new backend computation (Task 2) + client computation deleted (Task 9); advisory removed (Task 3); hide presentation-only (Task 7).
- **Behavior-preserving guard:** Task 8's Operations extraction must not edit Operations tests — flagged as a STOP condition.
