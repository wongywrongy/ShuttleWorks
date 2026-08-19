# Hub Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the Phase-13 Hub to the `ShuttleWorks - Dashboard Redesign.dc.html` mockup — richer list rows (health dot, Modules column, sort, footer) and a deeper inspector (status pill, matches/scheduled/to-do metrics, readiness bar, Next up), fed by a backend summary extension.

**Architecture:** Extend the pure `build_signals` with per-workspace match metrics + next-up computed entirely from the already-loaded `row.data` blob (meet: `data["matches"]`/`data["schedule"]`; bracket: `data["bracket_session"]`) — **zero new per-row queries** (N+1 guardrail holds; no new grouped count needed). Frontend mirrors the DTO and rebuilds the Hub list rows + inspector against design-system tokens.

**Tech Stack:** FastAPI + Pydantic + SQLAlchemy (backend), React + Vite + Zustand + Tailwind/CVA design-system (frontend), pytest + vitest.

## Global Constraints

- **Zero Alembic migrations** — all new data rides existing JSON columns / computed fields.
- **No new backend route** — data rides the existing `listTournaments`/summary body.
- **List path gains no per-row query** — pinned by a query-count test.
- All new DTO fields **optional/additive** — a payload without them renders (tiles → `—`, Next up hidden).
- Frontend: **design-system tokens only**, no inline styles, both themes, reduced-motion safe.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` +
  `Claude-Session: https://claude.ai/code/session_01XWd3ZiQ4hdAedHWQh2sTjM`
- Backend gate: `cd products/scheduler && pytest -q` + `ruff check products/scheduler scheduler_core`.
  Frontend gate: `npm --prefix products/scheduler/frontend run test:run` + `tsc -b` + `npm run lint:scheduler`.

## Stage-0 resolution (verified)

Bracket play-unit assignments persist in `tournaments.data["bracket_session"]["assignments"]` (a list of `{play_unit_id, slot_id, court_id}`); the bracket session also holds `start_time` + `interval_minutes`. So bracket metrics/next-up are blob-derived, exactly like meet — **no added grouped count**.

## File structure

**Backend**
- Modify `products/scheduler/backend/api/workspace_signals.py` — add `MatchMetricsDTO`, `NextMatchDTO`; extend `WorkspaceSignalsDTO`; add `_meet_match_signals(data)` + `_bracket_match_signals(data, counts)` + `_slot_time_label(config_or_session, slot)`; call them in `build_signals`.
- Test `products/scheduler/tests/unit/test_workspace_signals.py` (new).

**Frontend**
- Modify `products/scheduler/frontend/src/api/dto.ts` — mirror `MatchMetricsDTO`/`NextMatchDTO` on `WorkspaceSignalsDTO`.
- Create `products/scheduler/frontend/src/products/hub/hubSort.ts` (+ test) — pure sort comparator.
- Create `products/scheduler/frontend/src/products/hub/moduleGlyphs.ts` (+ test) — modules[] → glyph descriptors.
- Create `products/scheduler/frontend/src/products/hub/SortControl.tsx` — sort dropdown.
- Create `products/scheduler/frontend/src/products/hub/NextUpList.tsx` — inspector Next-up list.
- Modify `WorkspaceRow.tsx` (Modules column + health dot + selected accent), `WorkspaceInspector.tsx` (status pill + metrics + readiness bar + Next up), `HubPage.tsx` (sort state + footer bar), and the three `__tests__` files.

---

## Task B1: Meet match metrics + next-up in `build_signals`

**Files:**
- Modify: `products/scheduler/backend/api/workspace_signals.py`
- Test: `products/scheduler/tests/unit/test_workspace_signals.py` (create)

**Interfaces:**
- Produces (backend Pydantic fields are **camelCase**, matching the existing
  `CollaborationDTO.memberCount` / `ModuleCountsDTO.comingSoon` convention — the
  summary DTOs are already camelCase on the wire, so there is NO snake→camel
  transform and the frontend mirror is 1:1, no mapping):
  - `MatchMetricsDTO(total:int, scheduled:int, toDo:int)`
  - `NextMatchDTO(code:str, timeLabel:str|None, courtLabel:str|None, status:str)`
  - `WorkspaceSignalsDTO.matches: MatchMetricsDTO`, `.nextUp: List[NextMatchDTO]`
  - `build_signals(row, modules, counts)` unchanged signature; richer return.

- [ ] **Step 1: Write the failing test** in `test_workspace_signals.py`:

```python
from types import SimpleNamespace
from api.workspace_signals import build_signals, RowCounts

def _row(kind="meet", status="active", data=None):
    return SimpleNamespace(kind=kind, status=status, data=data or {})

def _mods(*enabled):
    return [SimpleNamespace(moduleId=m, status=("enabled" if m in enabled else "available"))
            for m in ("meet", "bracket", "display")]

def test_meet_match_metrics_and_next_up_from_data_blob():
    data = {
        "config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "18:00",
                   "intervalMinutes": 30},
        "players": [{"id": "p1"}],
        "matches": [
            {"id": "m1", "eventCode": "MS1", "matchNumber": 1},
            {"id": "m2", "eventCode": "WD2", "matchNumber": 2},
            {"id": "m3", "eventCode": "XD1", "matchNumber": 3},
        ],
        "schedule": {"assignments": [
            {"matchId": "m1", "slot": 0, "court": 1},
            {"matchId": "m2", "slot": 0, "court": 2},
            {"matchId": "m3", "slot": 2, "court": 3},
        ]},
    }
    sig = build_signals(_row(data=data), _mods("meet", "display"), RowCounts())
    assert sig.matches.total == 3
    assert sig.matches.scheduled == 3
    assert sig.matches.toDo == len(sig.attention)
    codes = [n.code for n in sig.nextUp]
    assert codes == ["MS1", "WD2", "XD1"]           # sorted by slot, capped at 3
    first = sig.nextUp[0]
    assert first.timeLabel == "09:00"                # dayStart + slot0*30m
    assert first.courtLabel == "Court 1"
    assert sig.nextUp[2].timeLabel == "10:00"        # slot2 → +60m
    assert all(n.status == "scheduled" for n in sig.nextUp)
```

- [ ] **Step 2: Run to verify it fails** — `cd products/scheduler && pytest tests/unit/test_workspace_signals.py -q` → FAIL (`matches` attr missing).

- [ ] **Step 3: Implement** in `workspace_signals.py`:
  - Add DTOs `MatchMetricsDTO`, `NextMatchDTO`; add `matches`, `next_up` to `WorkspaceSignalsDTO` (default `MatchMetricsDTO()` / `[]`).
  - `_slot_time_label(day_start:str|None, interval:int, slot:int) -> str|None`: parse `"HH:MM"`, add `slot*interval` minutes, reformat `"HH:MM"`; `None` if `day_start` falsy. Cap at 23:59.
  - `_court_label(court) -> str|None`: `f"Court {court}"` when court set.
  - `_meet_match_signals(data, to_do:int) -> tuple[MatchMetricsDTO, list[NextMatchDTO]]`:
    - `matches = data.get("matches") or []`; by-id map for code/number lookup.
    - `assignments = ((data.get("schedule") or {}).get("assignments")) or []`.
    - `total=len(matches)`, `scheduled=len(assignments)`.
    - next-up: sort assignments by `slot`/`slot_id` asc, take 3; for each resolve `code` = match `eventCode`/`event_code` else `f"M{matchNumber}"` else `matchId[:6]`, `time_label` via config `dayStart`+`intervalMinutes` (default 30), `court_label`, `status="scheduled"`.
    - Handle both camelCase (`matchId`,`slot`,`court`) and snake_case (`match_id`,`slot_id`,`court_id`) keys defensively (data blobs vary).
  - In `build_signals`, after computing `attention`: `to_do=len(attention)`; if meet → `matches, next_up = _meet_match_signals(data, to_do)`; include in the return. (Bracket branch filled in B2 — for now `MatchMetricsDTO(to_do=to_do)`, `[]`.)

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git add api/workspace_signals.py tests/unit/test_workspace_signals.py` → `feat(hub): meet match metrics + next-up in workspace signals`.

---

## Task B2: Bracket match metrics + next-up

**Files:**
- Modify: `products/scheduler/backend/api/workspace_signals.py`
- Test: `products/scheduler/tests/unit/test_workspace_signals.py`

**Interfaces:**
- Consumes B1's DTOs + `_slot_time_label`/`_court_label`.
- Produces: `_bracket_match_signals(data, counts, to_do) -> tuple[MatchMetricsDTO, list[NextMatchDTO]]`.

- [ ] **Step 1: Failing test**:

```python
def test_bracket_match_metrics_and_next_up_from_session_blob():
    data = {"bracket_session": {
        "start_time": "2026-07-12T09:00:00", "interval_minutes": 30,
        "assignments": [
            {"play_unit_id": "MS-R1-1", "slot_id": 0, "court_id": 1},
            {"play_unit_id": "MS-R1-2", "slot_id": 1, "court_id": 1},
        ],
    }}
    counts = RowCounts(bracket_matches=8)
    sig = build_signals(_row(kind="bracket", data=data), _mods("bracket"), counts)
    assert sig.matches.total == 8               # from RowCounts
    assert sig.matches.scheduled == 2           # from session assignments
    assert [n.code for n in sig.nextUp] == ["MS-R1-1", "MS-R1-2"]
    assert sig.nextUp[0].courtLabel == "Court 1"
    assert sig.nextUp[0].timeLabel == "09:00"    # start_time time-of-day + slot0

def test_undated_workspace_has_empty_next_up():
    sig = build_signals(_row(kind="meet", status="draft", data={"matches": []}),
                        _mods(), RowCounts())
    assert sig.matches.total == 0
    assert sig.nextUp == []
```

- [ ] **Step 2: Run to verify fails** → FAIL (bracket branch returns empty).

- [ ] **Step 3: Implement** `_bracket_match_signals(data, counts, to_do)`:
  - `session = data.get("bracket_session") or {}`; `assignments = session.get("assignments") or []`.
  - `total = counts.bracket_matches`; `scheduled = len(assignments)`.
  - next-up: sort by `slot_id`, take 3; `code = a["play_unit_id"]`, `court_label` from `court_id`, `time_label` from `session["start_time"]` time-of-day (`datetime.fromisoformat(...).strftime("%H:%M")` as day_start) + `slot_id*interval_minutes` (default 30); `None` if no `start_time`; `status="scheduled"`.
  - Wire the bracket branch in `build_signals` to call it.

- [ ] **Step 4: Run to verify passes** → PASS.

- [ ] **Step 5: Commit** — `feat(hub): bracket match metrics + next-up in workspace signals`.

---

## Task B3: N+1 guardrail + list-route serialization

**Files:**
- Test: `products/scheduler/tests/unit/test_workspace_signals.py` (+ optionally assert via the existing tournaments-list route test)

**Interfaces:** none new — verifies B1/B2 don't add queries and the route serializes the fields.

- [ ] **Step 1: Failing/■ test** — a list-route test that seeds 3 meet tournaments with schedules, GETs `/tournaments`, and asserts each summary's `signals.matches.total`/`.next_up` is present AND the SQL query count does not scale with N (use a SQLAlchemy event counter or the existing count-assertion helper if present; otherwise assert the same query count for 1 vs 3 tournaments).

```python
def test_list_signals_include_match_metrics_without_extra_queries(client, seed):
    # seed 1 then 3 meet workspaces with a committed schedule
    q1 = count_queries(lambda: client.get("/tournaments"))   # with 1 ws
    seed_two_more()
    q3 = count_queries(lambda: client.get("/tournaments"))   # with 3 ws
    assert q3 == q1                                            # no per-row query growth
    body = client.get("/tournaments").json()
    assert all("matches" in t["signals"] for t in body)
```

- [ ] **Step 2–4:** Verify it passes as-is (B1/B2 are blob-derived → no query growth). If the count grows, the bug is a stray per-row query — fix by moving the read to the loaded blob. Confirm the route/Pydantic serializes `matches`/`next_up` (they're on `WorkspaceSignalsDTO`, already serialized).
- [ ] **Step 5: Commit** — `test(hub): pin no-per-row-query guardrail for match signals`.

---

## Task F1: Frontend DTO mirror

**Files:** Modify `products/scheduler/frontend/src/api/dto.ts`.

**Interfaces:** Produces frontend `MatchMetricsDTO`, `NextMatchDTO`, and `WorkspaceSignalsDTO.matches?`/`.nextUp?` (optional).

- [ ] **Step 1–2:** Add to `dto.ts` beside `WorkspaceSignalsDTO`:

```ts
export interface NextMatchDTO { code: string; timeLabel: string | null; courtLabel: string | null; status: string; }
interface MatchMetricsDTO { total: number; scheduled: number; toDo: number; }
```
Add `matches?: MatchMetricsDTO;` and `nextUp?: NextMatchDTO[];` to `WorkspaceSignalsDTO`. Backend Pydantic fields are already camelCase (`toDo`/`timeLabel`/`courtLabel`/`nextUp`, matching `memberCount`/`comingSoon`), so the mirror is 1:1 — no read-site mapping.

- [ ] **Step 3: Verify** `tsc -b` clean.
- [ ] **Step 4: Commit** — `feat(hub): mirror match-metrics + next-up DTO`.

---

## Task F2: Sort control (Recent / Event date / Name)

**Files:** Create `hubSort.ts` (+ `__tests__/hubSort.test.ts`), `SortControl.tsx`; modify `HubPage.tsx`.

**Interfaces:**
- Produces: `type HubSortId = 'recent'|'date'|'name'`; `HUB_SORTS: {id,label}[]`; `sortBy(list, sortId, todayKey): TournamentSummaryDTO[]`.

- [ ] **Step 1: Failing test** `hubSort.test.ts`: recent = `updatedAt` desc; name = locale name asc; date = reuses `sortWorkspaces` (upcoming→undated→past) order. Assert ids for a 3-workspace fixture per sort.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `hubSort.ts` (`date` delegates to `sortWorkspaces`); `SortControl.tsx` = a small `Menu`/native `<select>` styled per the doc (`↕ {label} ▾`, `bg-transparent border-border`), `onChange(id)`. Wire `const [sort, setSort] = useState<HubSortId>('recent')` in HubPage; apply `sortBy(nameFiltered.filter(matchesFacet…), sort, todayKey)` for `visible`.
- [ ] **Step 4: Run → pass**; `tsc -b`.
- [ ] **Step 5: Commit** — `feat(hub): functional sort control`.

---

## Task F3: List row — Modules column, health dot, selected accent

**Files:** Create `moduleGlyphs.ts` (+ test); modify `WorkspaceRow.tsx`, `__tests__/WorkspaceRow.test.tsx`, `__tests__/HubPage.test.tsx`.

**Interfaces:** Produces `moduleGlyphs(modules): {id,letter,enabled}[]` (M/D/B order Meet,Display,Bracket; `enabled` false → dashed).

- [ ] **Step 1: Failing tests**:
  - `moduleGlyphs.test.ts`: given `[{moduleId:'meet',status:'enabled'},{moduleId:'bracket',status:'available'}]` → `[{id:'meet',letter:'M',enabled:true},{id:'bracket',letter:'B',enabled:false}]` (display omitted when absent). Order = display order.
  - `WorkspaceRow.test.tsx`: renders a Modules cell with the enabled meet glyph (`data-testid="row-module-meet"`) and a dashed available one.
  - **Invert** the Phase-13 `HubPage.test.tsx` case `'rows carry NO module chips…'` → assert the Modules column IS present (this is a requested behavior change; note it in the commit).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `moduleGlyphs.ts`; add a `w-[108px]` Modules cell to `WorkspaceRow` between name and next-action rendering `moduleGlyphs(tournament.modules ?? modulesForWorkspace(kind))` as 18px `rounded bg-module-{id}/16 text-module-{id}` glyphs, dashed `border border-dashed border-border text-muted-foreground` when `!enabled`. Health dot already present — restyle to 7px `bg-status-live`(good)/`bg-status-called`(attention)/`bg-muted-foreground`(draft·archived); no pulse. Selected row already has an accent — align to `border-l-2 border-accent bg-surface-card`.
- [ ] **Step 4: Run → pass**; `tsc -b`.
- [ ] **Step 5: Commit** — `feat(hub): per-row Modules column + health dot (target doc)`.

---

## Task F4: Footer summary bar

**Files:** Modify `HubPage.tsx`, `__tests__/HubPage.test.tsx`.

- [ ] **Step 1: Failing test** — after load, a footer shows `"{N} workspaces"` and `"{K} need attention"` where K = count of `needsAttention`. (Use the seeded fixture; extend it with one `status:'archived'` to assert `"1 archived"`.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** a footer `<div>` under the list: `{total} workspaces · {attn} need attention · {archived} archived` (amber on the attention clause) + `Updated {relative}` from a `refreshedAt` timestamp set in `refresh()` (relative via a tiny `sinceLabel(ts, now)` helper, "just now"/"Nm ago"). Counts from the loaded `tournaments`.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(hub): footer summary bar`.

---

## Task F5: Inspector — status pill, metrics triplet, readiness bar

**Files:** Modify `WorkspaceInspector.tsx`, `__tests__/WorkspaceInspector.test.tsx`.

- [ ] **Step 1: Failing tests**:
  - metrics: given a workspace with `signals.matches={total:48,scheduled:36,toDo:2}`, the inspector shows `48`/`36`/`2` under `matches`/`scheduled`/`to do`. Absent `matches` → `—`.
  - status pill: readiness complete + health good → a `Ready` pill; else `Needs setup`.
  - readiness bar: `signals.setup` with 3/4 true → a progressbar at 75% (`role="progressbar"` `aria-valuenow=75`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement**:
  - Replace the current `ready/to-do/modules-on` triplet with `matches/scheduled/to do` reading `tournament.signals?.matches` (fallback `—`); keep the grid-lines tiles.
  - Add the header status pill via shared `StatusPill` (`tone="green"` Ready when `readiness.ready===readiness.total && health==='good'`, else `tone="amber"` "Needs setup").
  - Add a progress bar above the existing checklist: `role="progressbar"` `aria-valuenow={Math.round(ready/total*100)}`, fill `bg-status-live`.
  - Add the gear button beside "Open workspace →" (`onSettings`).
- [ ] **Step 4: Run → pass**; `tsc -b`.
- [ ] **Step 5: Commit** — `feat(hub): inspector status pill + match metrics + readiness bar`.

---

## Task F6: Inspector — Next up list

**Files:** Create `NextUpList.tsx` (+ `__tests__/NextUpList.test.tsx`); modify `WorkspaceInspector.tsx`.

**Interfaces:** `NextUpList({ items }: { items: NextMatchDTO[] })`.

- [ ] **Step 1: Failing test** — given 2 `NextMatchDTO`, renders both codes + `09:30 · Court 1`; empty list → renders nothing (component returns `null`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `NextUpList` (rows: module glyph `M` + `code` + `timeLabel · courtLabel` + `status` tag; skips time/court when null). Add a `Next up` section to the inspector rendering `<NextUpList items={tournament.signals?.nextUp ?? []} />`; the section header is hidden when empty (guard on length).
- [ ] **Step 4: Run → pass**; `tsc -b`.
- [ ] **Step 5: Commit** — `feat(hub): inspector Next-up list`.

---

## Task F7: Gates + live verify + ledger

**Files:** `FRONTEND_PROGRESS.md`, `docs/audits/debt-log.md` (if anything surfaces), memory.

- [ ] **Step 1:** Full gates — `npm --prefix products/scheduler/frontend run test:run`, `tsc -b`, `npm run lint:scheduler`; `cd products/scheduler && pytest -q` + `ruff check products/scheduler scheduler_core`.
- [ ] **Step 2:** Live Playwright pass (host backend :8600 + `VITE_API_PROXY_TARGET`, or the running Docker container backend :8000 for a frontend-only view — mind the stale-Vite trap): verify row grammar (dot + Modules glyphs + next action), sort control, footer, and the inspector (status pill, metrics, readiness bar, Next up) in both themes vs the doc. Screenshot to `.playwright-mcp/`.
- [ ] **Step 3:** Add a `FRONTEND_PROGRESS.md` Phase-14 entry (commit map, gate counts, live evidence); log any out-of-scope debt.
- [ ] **Step 4:** Update memory `frontend-design-migration.md` with the redesign landing.
- [ ] **Step 5: Commit** — `docs(hub): dashboard redesign close-out — Phase 14`.

## Self-review notes

- **Spec coverage:** metrics (F5/B1-2), next-up (F6/B1-2), readiness bar (F5), status pill (F5), Modules column (F3), health dot no-pulse (F3), sort (F2), footer (F4), rail-only avatar (unchanged — no task, by design), tokens (F3/F5/F6), zero-migration + no-per-row-query (B3). All covered.
- **Type consistency:** DTO field names are camelCase on BOTH sides (`matches`,`nextUp`,`toDo`,`timeLabel`,`courtLabel`) — matching the existing `memberCount`/`comingSoon` convention, so the mirror is 1:1 with no mapping. `moduleGlyphs`/`sortBy`/`HubSortId` consistent across F2/F3.
