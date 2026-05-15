# Bracket Entry Alignment + Court×Time Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the bracket-side of the product by giving it the meet's entry-flow shape (Setup · Roster · Events · Draw · Schedule · Live) and making the Schedule + Live tabs first-class court×time Gantts. Functional model stays separate per product; design language and UX patterns unify.

**Architecture:** Three phases on top of #1 (interactive-scheduling backend, c6a722d) and #2 (shared GanttTimeline scaffold, fd3086e). Phase A adds 3 new bracket tabs (Setup, Roster, Events) and 3 new backend endpoints with a per-event Generate transaction; Phase B rewrites LiveView as a GanttTimeline operator surface; Phase C rewrites ScheduleView as a display-only GanttTimeline.

**Tech Stack:** TypeScript · React 19 · Vite · Tailwind 3 · `@scheduler/design-system` · Zustand · Vitest · Python · FastAPI · SQLAlchemy · OR-Tools CP-SAT · pytest

**Reference spec:** `docs/superpowers/specs/2026-05-14-bracket-entry-and-courttime-views-design.md`

**Pre-existing-condition note:** `make test-e2e` is pre-existing stale — the Playwright suite expects an old app shell. Do NOT chase Playwright green. Hard verify gates: `tsc -b`, `npm run build:scheduler`, `npm run lint:scheduler` (clean for our files), `pytest tests/unit` (specific bracket test files), `vitest run` (for our new test files). Browser-harness visual checks are gated on the Chrome remote-debugging toggle — if unavailable, executor flags and proceeds (no task blocks on visual). If `pytest tests/unit/test_bracket_routes.py` fails on `ModuleNotFoundError: sqlalchemy`, run `.venv/bin/pip install sqlalchemy` first.

---

## Locked decisions (don't relitigate)

1. **Setup tab persistence** writes `tournaments.data.config` camelCase using the meet's EXISTING keys: `intervalMinutes`, `dayStart`, `dayEnd`, `courtCount`. Add new `restBetweenRounds: number` to `TournamentConfig`. `_hydrate_session` in `backend/api/brackets.py` reads camelCase with legacy `bracket_session.*` snake_case fallback. (Plan note: the spec referenced `services/bracket/scheduler.py` but `_hydrate_session` actually lives in `backend/api/brackets.py` — see task A.2.)
2. **Roster lives in a new `bracketPlayers: List[BracketPlayerDTO]` field** on `TournamentStateDTO` — NOT merged with meet's `players` field (keeps bracket/meet data isolation per spec non-goals).
3. **`bracket_events.status` writes from 3 places:** `generate_event` (sets `'generated'`), `record_match_result` (sets `'started'` on first result), `DELETE /bracket/events/{id}` (only allowed on `'draft'`).
4. **EVENTS filter strip on Schedule + Live REPLACES the BracketViewHeader single-select on those views.** Draw keeps the single-select. Conditional rendering in `BracketViewHeader.tsx`.
5. **Tournament state route is `PUT /tournaments/{id}/state`** — verified at `backend/api/tournaments.py:309-310` as `@router.put("/{tournament_id}/state", ...)`. The spec said POST, but PUT is correct. (Plan resolves the spec drift; no backend route change needed.)
6. **`useTournamentState()` is lifted out of `MeetShellHooks`** so brackets also get hydration + PUT. The hook moves to a shared location (`products/scheduler/frontend/src/hooks/useTournamentState.ts` already lives in `hooks/` — no relocation needed; just unmount it from `MeetShellHooks` and mount it at the shell level for both kinds, or mount a sibling `BracketShellHooks` that also calls `useTournamentState()`). Both meet and bracket shells consume the same hook.
7. **NO `<SectionedForm>` primitive extraction.** Meet's `TournamentConfigForm.tsx` is hand-rolled (h2 + grid pattern), so the bracket's `SetupTab.tsx` is hand-rolled the same way — matches existing pattern, no design-system change needed in this plan.
8. **`bracket_events.status` column type:** SQLAlchemy `String(20)`, Pydantic `Literal['draft','generated','started']`. Default `'draft'`. Alembic-style migration backfills via inline SQL: existing rows with any `bracket_matches` → `'generated'`; with any `bracket_results` → `'started'`; else `'draft'`.
9. **Auto-save UX:** per-field auto-save on blur with 500ms debounce (matches `useTournamentState` pattern). No save button.
10. **Participant picker:** in-grid (below active row, in-flow — no popover). Singles = 1-step pick (checkboxes). Doubles = 2-step pair-select (pick player A → then partner B; commits as `bracket_participants` with `type=TEAM`, `member_ids=[id_a, id_b]`).
11. **`generate_event` solver scope (load-bearing for cross-event court-sharing):** narrow CP-SAT problem to THIS event's matches only, BUT pass all OTHER events' existing `bracket_matches` as locked `previous_assignments=[PreviousAssignment(locked=True, ...)]`. This way generating MS schedules AROUND WS's already-generated matches; no two events ever collide on the same (court, slot). Cross-event no-collision test is the discriminator.
12. **Frontend migration timing:** runs on FIRST LOAD only. Set a flag `tournaments.data.bracketRosterMigrated: true` after successful migration. Subsequent loads skip the migration path.
13. **`BracketPlayerDTO`:** `{ id: string (slug), name: string, notes?: string, restSlots?: number }`. `id` is the slug from existing `playerSlug()` helper in `products/scheduler/frontend/src/features/bracket/setupForm/helpers.ts` (verified: `setupForm/helpers.ts:47`). The slug stability is what makes migration work (existing `bracket_participants[].member_ids` are already slugged the same way).
14. **Backend test setup** follows `products/scheduler/tests/unit/test_bracket_routes.py` pattern. The host pytest env has a pre-existing `sqlalchemy` gap that #1's session installed; assume `.venv/bin/pip install sqlalchemy` runs cleanly if needed.
15. **Vitest test files** under `products/scheduler/frontend/src/lib/__tests__/*.test.ts` per the runner's `include` glob (same precedent as `bracketTabs.test.ts` and `ganttTimeline.test.ts`). Component tests (TSX) for SetupTab/BracketRosterTab/EventsTab/LiveView/ScheduleView still live in `lib/__tests__/` even though they import from `features/bracket/` — this honours the include glob without changing `vitest.config.ts`.

---

## File structure

| Task | Create | Modify | Delete |
|---|---|---|---|
| A.1 | `backend/alembic/versions/g9d4e2a3b7c1_step_t_b_bracket_event_status.py`, `tests/unit/test_bracket_event_status.py` | `backend/database/models.py`, `backend/services/bracket/state.py` | — |
| A.2 | `tests/unit/test_bracket_player_dto.py` | `backend/app/schemas.py`, `backend/api/brackets.py` (_hydrate_session), `frontend/src/api/dto.ts` | — |
| A.3 | `tests/unit/test_generate_event.py` | `backend/services/bracket/scheduler.py` | — |
| A.4 | `tests/unit/test_bracket_event_routes.py` | `backend/api/brackets.py` | — |
| A.5 | — | `frontend/src/lib/bracketTabs.ts`, `frontend/src/store/uiStore.ts`, `frontend/src/store/tournamentStore.ts`, `frontend/src/app/AppShell.tsx`, `frontend/src/features/bracket/BracketTab.tsx`, `frontend/src/pages/TournamentPage.tsx`, `frontend/src/lib/__tests__/bracketTabs.test.ts` | — |
| A.6 | `frontend/src/features/bracket/SetupTab.tsx`, `frontend/src/lib/__tests__/SetupTab.test.tsx` | — | — |
| A.7 | `frontend/src/features/bracket/BracketRosterTab.tsx`, `frontend/src/lib/__tests__/BracketRosterTab.test.tsx` | — | — |
| A.8 | `frontend/src/features/bracket/EventsTab.tsx`, `frontend/src/features/bracket/ParticipantPicker.tsx`, `frontend/src/api/bracketClient.tsx` (extend), `frontend/src/lib/__tests__/EventsTab.test.tsx` | `frontend/src/api/bracketDto.ts`, `frontend/src/api/client.ts` | — |
| A.9 | `frontend/src/lib/playerSlug.ts`, `frontend/src/lib/__tests__/bracketMigration.test.ts` | `frontend/src/features/bracket/BracketTab.tsx`, `frontend/src/features/bracket/DrawView.tsx` | `frontend/src/features/bracket/SetupForm.tsx`, `frontend/src/features/bracket/setupForm/EventEditor.tsx`, `frontend/src/features/bracket/setupForm/helpers.ts` |
| B.1 | `frontend/src/lib/__tests__/LiveView.test.tsx` | `frontend/src/features/bracket/LiveView.tsx` | — |
| B.2 | — | `frontend/src/features/bracket/LiveView.tsx` (chip state ring vocabulary) | — |
| B.3 | `frontend/src/features/bracket/MatchDetailPanel.tsx`, `frontend/src/lib/__tests__/MatchDetailPanel.test.tsx` | `frontend/src/features/bracket/LiveView.tsx`, `frontend/src/features/bracket/BracketViewHeader.tsx`, `frontend/src/store/uiStore.ts` (selectedMatchId) | — |
| B.4 | — | — | — |
| C.1 | `frontend/src/lib/__tests__/ScheduleView.test.tsx` | `frontend/src/features/bracket/ScheduleView.tsx` | — |
| C.2 | `frontend/src/features/bracket/EventsFilterStrip.tsx`, `frontend/src/lib/__tests__/EventsFilterStrip.test.tsx` | `frontend/src/features/bracket/BracketViewHeader.tsx`, `frontend/src/store/uiStore.ts` (bracketScheduleEventFilter) | — |
| C.3 | — | — | — |

All frontend paths are relative to `products/scheduler/`. All backend paths likewise.

---

## Phase A — #5 entry pattern alignment

### A.1 — Add `status` enum column to `bracket_events`

**Files**
- Create: `products/scheduler/backend/alembic/versions/g9d4e2a3b7c1_step_t_b_bracket_event_status.py`
- Create: `products/scheduler/tests/unit/test_bracket_event_status.py`
- Modify: `products/scheduler/backend/database/models.py`
- Modify: `products/scheduler/backend/services/bracket/state.py`

**Steps**

- [ ] Write failing test `products/scheduler/tests/unit/test_bracket_event_status.py`:

  ```python
  """Status column + is_event_started predicate."""
  from __future__ import annotations
  import uuid
  import pytest
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker

  from database.models import Base, BracketEvent, BracketMatch, BracketResult, Tournament
  from services.bracket.state import is_event_started


  @pytest.fixture()
  def session():
      engine = create_engine("sqlite:///:memory:")
      Base.metadata.create_all(engine)
      SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
      s = SessionLocal()
      try:
          yield s
      finally:
          s.close()


  def _seed_tournament(session) -> uuid.UUID:
      tid = uuid.uuid4()
      session.add(Tournament(id=tid, name="t", status="active", data={}))
      session.commit()
      return tid


  def test_bracket_event_status_defaults_to_draft(session):
      tid = _seed_tournament(session)
      ev = BracketEvent(
          tournament_id=tid, id="MS", discipline="Men's Singles",
          format="se", duration_slots=1,
      )
      session.add(ev); session.commit(); session.refresh(ev)
      assert ev.status == "draft"


  def test_is_event_started_false_with_no_results(session):
      tid = _seed_tournament(session)
      assert is_event_started(session, tid, "MS") is False


  def test_is_event_started_true_when_results_exist(session):
      tid = _seed_tournament(session)
      session.add(BracketEvent(
          tournament_id=tid, id="MS", discipline="MS",
          format="se", duration_slots=1, status="generated",
      ))
      session.add(BracketMatch(
          tournament_id=tid, bracket_event_id="MS", id="MS-R0-0",
          round_index=0, match_index=0, kind="MATCH",
          slot_a={}, slot_b={}, side_a=[], side_b=[],
          dependencies=[], expected_duration_slots=1,
          duration_variance_slots=0, child_unit_ids=[], meta={},
      ))
      session.add(BracketResult(
          tournament_id=tid, bracket_event_id="MS",
          bracket_match_id="MS-R0-0", winner_side="A",
      ))
      session.commit()
      assert is_event_started(session, tid, "MS") is True
  ```

  (NOTE: if the existing `BracketResult` schema differs from above — executor should grep `database/models.py` for `class BracketResult` and adapt the constructor kwargs accordingly. The test intent is "one result row exists for (tid, MS)".)

- [ ] Run failing: `.venv/bin/python -m pytest tests/unit/test_bracket_event_status.py -x`. Expected: `ImportError: cannot import name 'is_event_started'` or attribute error on `BracketEvent.status`.

- [ ] Modify `products/scheduler/backend/database/models.py` — find `class BracketEvent(Base):` (around line 418) and AFTER the existing `config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)` line (around line 441), INSERT a new column declaration on its own line:

  ```python
      status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
  ```

  Keep insertion order with the rest of the columns (i.e., before `version: Mapped[int]`).

- [ ] Modify `products/scheduler/backend/services/bracket/state.py` — at the end of the file (after `is_assignment_locked`), append the new helper:

  ```python
  def is_event_started(
      session,
      tournament_id,
      event_id: str,
  ) -> bool:
      """True iff any bracket_results row exists for this (tournament, event)."""
      from database.models import BracketResult  # local import to avoid cycle
      row = (
          session.query(BracketResult)
          .filter(
              BracketResult.tournament_id == tournament_id,
              BracketResult.bracket_event_id == event_id,
          )
          .first()
      )
      return row is not None
  ```

  (Note: I haven't verified the exact import path for `BracketResult` — executor should grep `backend/database/models.py` for `class BracketResult` and use the actual class name; if it's named differently like `BracketMatchResult`, update the import + filter accordingly.)

- [ ] Create `products/scheduler/backend/alembic/versions/g9d4e2a3b7c1_step_t_b_bracket_event_status.py`:

  ```python
  """step_t_b: add status enum to bracket_events.

  Revision ID: g9d4e2a3b7c1
  Revises: f7a3c9b2e8d4
  Create Date: 2026-05-14 00:00:00.000000
  """
  from __future__ import annotations
  from alembic import op
  import sqlalchemy as sa


  revision = "g9d4e2a3b7c1"
  down_revision = "f7a3c9b2e8d4"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.add_column(
          "bracket_events",
          sa.Column(
              "status",
              sa.String(length=20),
              nullable=False,
              server_default="draft",
          ),
      )
      # Backfill: 'started' if any result row; else 'generated' if any match row; else 'draft'.
      op.execute(
          """
          UPDATE bracket_events
          SET status = 'started'
          WHERE EXISTS (
              SELECT 1 FROM bracket_results br
              WHERE br.tournament_id = bracket_events.tournament_id
                AND br.bracket_event_id = bracket_events.id
          )
          """
      )
      op.execute(
          """
          UPDATE bracket_events
          SET status = 'generated'
          WHERE status = 'draft'
            AND EXISTS (
                SELECT 1 FROM bracket_matches bm
                WHERE bm.tournament_id = bracket_events.tournament_id
                  AND bm.bracket_event_id = bracket_events.id
            )
          """
      )


  def downgrade() -> None:
      op.drop_column("bracket_events", "status")
  ```

  (NOTE: `down_revision = "f7a3c9b2e8d4"` — verified as `f7a3c9b2e8d4_step_t_a_bracket_schema.py` from the directory listing. If a newer migration exists at execution time, executor should re-chain to the actual latest head.)

- [ ] Verify imports compile + tests pass before committing: `.venv/bin/python -m pytest tests/unit/test_bracket_event_status.py -x`. Expected: 3 passed.

- [ ] Commit: `git commit -am "feat(bracket): add status enum column + is_event_started helper"`.

---

### A.2 — `BracketPlayerDTO`, `bracketPlayers`, `restBetweenRounds`, camelCase hydration

**Files**
- Create: `products/scheduler/tests/unit/test_bracket_player_dto.py`
- Modify: `products/scheduler/backend/app/schemas.py`
- Modify: `products/scheduler/backend/api/brackets.py` (`_hydrate_session`)
- Modify: `products/scheduler/frontend/src/api/dto.ts`

**Steps**

- [ ] Write failing test `products/scheduler/tests/unit/test_bracket_player_dto.py`:

  ```python
  """BracketPlayerDTO contract + camelCase hydration."""
  from __future__ import annotations
  import pytest

  from app.schemas import BracketPlayerDTO, TournamentStateDTO, TournamentConfig


  def test_bracket_player_dto_round_trip():
      p = BracketPlayerDTO(
          id="p-alex-tan",
          name="Alex Tan",
          notes="lefty",
          restSlots=1,
      )
      assert p.id == "p-alex-tan"
      assert p.restSlots == 1


  def test_tournament_state_dto_carries_bracket_players():
      s = TournamentStateDTO(
          version=2,
          config=None,
          groups=[],
          players=[],
          matches=[],
          schedule=None,
          scheduleIsStale=False,
          bracketPlayers=[BracketPlayerDTO(id="p-ben", name="Ben")],
      )
      assert len(s.bracketPlayers) == 1
      assert s.bracketPlayers[0].name == "Ben"


  def test_tournament_config_carries_rest_between_rounds():
      c = TournamentConfig(
          intervalMinutes=30, dayStart="09:00", dayEnd="18:00",
          breaks=[], courtCount=4, defaultRestMinutes=0,
          freezeHorizonSlots=0, restBetweenRounds=1,
      )
      assert c.restBetweenRounds == 1
  ```

- [ ] Run failing: `.venv/bin/python -m pytest tests/unit/test_bracket_player_dto.py -x`. Expected: `ImportError: cannot import name 'BracketPlayerDTO'`.

- [ ] Modify `products/scheduler/backend/app/schemas.py`:

  - Locate `class TournamentConfig(BaseModel):` and ADD a new optional field at the end of its body (just before any model_config / Config block):

    ```python
        restBetweenRounds: int | None = Field(default=0, ge=0, description="Slots of forced rest between rounds.")
    ```

    (Executor: grep file for `class TournamentConfig` first; if Pydantic v1 style, use `Optional[int]` and `Field(0, ge=0)`.)

  - Below `class PlayerDTO(BaseModel):` (or wherever player-flavoured DTOs cluster) ADD:

    ```python
    class BracketPlayerDTO(BaseModel):
        """Roster entry for bracket-kind tournaments.

        ``id`` is the stable slug produced by the frontend ``playerSlug()``
        helper; matches ``bracket_participants.member_ids`` after migration.
        """
        id: str = Field(..., min_length=1)
        name: str = Field(..., min_length=1)
        notes: str | None = None
        restSlots: int | None = Field(default=None, ge=0)
    ```

  - Locate `class TournamentStateDTO(BaseModel):` (search for it). ADD a new field at the end of its body (alongside `scheduleHistory`):

    ```python
        bracketPlayers: list[BracketPlayerDTO] = Field(default_factory=list)
        bracketRosterMigrated: bool | None = None
    ```

- [ ] Modify `products/scheduler/backend/api/brackets.py` — locate `def _hydrate_session(...)` (around line 307). The function currently reads `session_cfg = (tournament.data or {}).get("bracket_session") or {}`. Update the body so it prefers camelCase keys under `tournament.data.config` and falls back to the legacy snake_case `bracket_session` blob. Replace the block from `session_cfg = ...` through the `config = ScheduleConfig(...)` / `rest = ...` / `start_time = ...` assignments with:

  ```python
      data_blob = (tournament.data or {}) if tournament else {}
      camel_cfg = data_blob.get("config") or {}
      legacy_cfg = data_blob.get("bracket_session") or {}

      def _pick(camel_key: str, legacy_key: str, default):
          if camel_key in camel_cfg and camel_cfg[camel_key] is not None:
              return camel_cfg[camel_key]
          return legacy_cfg.get(legacy_key, default)

      court_count = int(_pick("courtCount", "courts", 2))
      interval_minutes = int(_pick("intervalMinutes", "interval_minutes", 30))
      total_slots = int(legacy_cfg.get("total_slots", 128))
      rest = int(_pick("restBetweenRounds", "rest_between_rounds", 1))

      config = ScheduleConfig(
          total_slots=total_slots,
          court_count=court_count,
          interval_minutes=interval_minutes,
      )

      start_time_iso = legacy_cfg.get("start_time")
      start_time = (
          datetime.fromisoformat(start_time_iso)
          if isinstance(start_time_iso, str) and start_time_iso
          else None
      )
  ```

  (`dayStart` / `dayEnd` from camel_cfg are read by other code paths; this hydrator only needs the four solver inputs above. The legacy `bracket_session.total_slots` stays the source of truth for that field — there's no camelCase analogue in `TournamentConfig`.)

- [ ] Modify `products/scheduler/frontend/src/api/dto.ts`:

  - Locate `export interface TournamentConfig {` (line 18). Inside the body, ADD:

    ```ts
      /** Slots of forced rest between bracket rounds. Bracket-side only. */
      restBetweenRounds?: number;
    ```

  - After `export interface PlayerDTO` (line 293) ADD:

    ```ts
    /** Roster entry for bracket-kind tournaments. */
    export interface BracketPlayerDTO {
      id: string;
      name: string;
      notes?: string;
      restSlots?: number;
    }
    ```

  - Locate `export interface TournamentStateDTO {` (line 418). Add fields at the end of the body:

    ```ts
      /** Bracket-kind roster. Empty for meet-kind tournaments. */
      bracketPlayers?: BracketPlayerDTO[];
      /** Set true once the first-load reconcile from `bracket_participants` has run. */
      bracketRosterMigrated?: boolean;
    ```

- [ ] Verify imports compile + tests pass before committing: `.venv/bin/python -m pytest tests/unit/test_bracket_player_dto.py -x`. Expected: 3 passed.

- [ ] Verify type-check: `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.

- [ ] Commit: `git commit -am "feat(bracket): add BracketPlayerDTO + restBetweenRounds + camelCase hydration"`.

---

### A.3 — `TournamentDriver.generate_event` with cross-event lock

**Files**
- Create: `products/scheduler/tests/unit/test_generate_event.py`
- Modify: `products/scheduler/backend/services/bracket/scheduler.py`

**Steps**

- [ ] Write failing test `products/scheduler/tests/unit/test_generate_event.py`:

  ```python
  """generate_event: per-event scheduling that respects locked other-event matches."""
  from __future__ import annotations
  import pytest
  from scheduler_core.domain.models import ScheduleConfig, SolverStatus
  from scheduler_core.domain.tournament import Participant, ParticipantType, TournamentState
  from services.bracket import (
      TournamentDriver,
      generate_single_elimination,
      record_result,
  )
  from services.bracket.state import register_draw


  def _make_state(num_p_ms: int = 4, num_p_ws: int = 4) -> TournamentState:
      state = TournamentState()
      ms_parts = [
          Participant(id=f"ms-p{i}", name=f"MS{i}", type=ParticipantType.PLAYER)
          for i in range(num_p_ms)
      ]
      ws_parts = [
          Participant(id=f"ws-p{i}", name=f"WS{i}", type=ParticipantType.PLAYER)
          for i in range(num_p_ws)
      ]
      ms = generate_single_elimination(
          ms_parts, event_id="MS", play_unit_id_prefix="MS", duration_slots=1,
      )
      ws = generate_single_elimination(
          ws_parts, event_id="WS", play_unit_id_prefix="WS", duration_slots=1,
      )
      register_draw(state, ms)
      register_draw(state, ws)
      return state


  def test_draft_to_generated(tmp_path):
      state = _make_state()
      cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
      driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
      r = driver.generate_event("MS")
      assert r.scheduled
      ms_assignments = [a for pu_id, a in state.assignments.items() if pu_id.startswith("MS-")]
      assert len(ms_assignments) >= 1


  def test_regenerate_wipes_and_succeeds():
      state = _make_state()
      cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
      driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
      r1 = driver.generate_event("MS")
      assert r1.scheduled
      n1 = sum(1 for k in state.assignments if k.startswith("MS-"))
      r2 = driver.generate_event("MS", wipe=True)
      assert r2.scheduled
      n2 = sum(1 for k in state.assignments if k.startswith("MS-"))
      assert n1 == n2


  def test_started_raises_409_signal():
      state = _make_state()
      cfg = ScheduleConfig(total_slots=32, court_count=2, interval_minutes=30)
      driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
      driver.generate_event("MS")
      first_ms = next(iter(k for k in state.assignments if k.startswith("MS-")))
      record_result(state, first_ms, winner_side="A")
      with pytest.raises(ValueError, match="started"):
          driver.generate_event("MS", wipe=True)


  def test_cross_event_no_collision_discriminator():
      """Generating MS schedules around WS's already-locked assignments."""
      state = _make_state(num_p_ms=4, num_p_ws=4)
      cfg = ScheduleConfig(total_slots=32, court_count=1, interval_minutes=30)
      driver = TournamentDriver(state=state, config=cfg, rest_between_rounds=0)
      ws_result = driver.generate_event("WS")
      assert ws_result.scheduled
      ws_slots = {(a.slot_id, a.court_id) for k, a in state.assignments.items() if k.startswith("WS-")}
      ms_result = driver.generate_event("MS")
      assert ms_result.scheduled
      ms_slots = {(a.slot_id, a.court_id) for k, a in state.assignments.items() if k.startswith("MS-")}
      assert ws_slots.isdisjoint(ms_slots), (
          "MS and WS share (slot, court) cells — cross-event lock not honoured"
      )
  ```

- [ ] Run failing: `.venv/bin/python -m pytest tests/unit/test_generate_event.py -x`. Expected: `AttributeError: 'TournamentDriver' object has no attribute 'generate_event'`.

- [ ] Modify `products/scheduler/backend/services/bracket/scheduler.py`:

  - In the `TournamentDriver` class body, after `repin_and_resolve`, ADD a new method:

    ```python
      def generate_event(
          self,
          event_id: str,
          wipe: bool = False,
      ) -> RoundResult:
          """Schedule one event's matches in isolation while respecting
          other events' already-generated/started assignments.

          - Find PlayUnits with ``pu.event_id == event_id``.
          - If ``wipe`` is True: drop their existing assignments first.
          - If any of those PlayUnits has a result, refuse with ValueError
            (matches Phase A's Started lifecycle gate).
          - Build the CP-SAT problem with the event's ready PlayUnits as
            the variable set, and emit one ``PreviousAssignment(locked=True)``
            per OTHER event's existing assignment so the solver picks
            (slot, court) cells that don't collide.
          - Write resulting assignments back into ``state.assignments``.
          """
          event_pu_ids = [
              pu_id for pu_id, pu in self.state.play_units.items()
              if pu.event_id == event_id
          ]
          if not event_pu_ids:
              return RoundResult(play_unit_ids=[], status=SolverStatus.UNKNOWN)

          if any(pu_id in self.state.results for pu_id in event_pu_ids):
              raise ValueError(
                  f"event {event_id!r} has results; cannot generate (event is started)"
              )

          if wipe:
              for pu_id in event_pu_ids:
                  self.state.assignments.pop(pu_id, None)

          # Ready set inside the target event: dependency satisfied + both sides known.
          ready: List[PlayUnitId] = []
          for pu_id in event_pu_ids:
              pu = self.state.play_units[pu_id]
              if pu_id in self.state.assignments:
                  continue
              if not pu.side_a or not pu.side_b:
                  continue
              if any(dep not in self.state.results for dep in pu.dependencies):
                  continue
              ready.append(pu_id)

          if not ready:
              return RoundResult(play_unit_ids=[], status=SolverStatus.UNKNOWN)

          previous_assignments: List[PreviousAssignment] = []
          for pu_id, a in self.state.assignments.items():
              pu = self.state.play_units.get(pu_id)
              if pu is None or pu.event_id == event_id:
                  continue
              previous_assignments.append(
                  PreviousAssignment(
                      match_id=pu_id,
                      slot_id=a.slot_id,
                      court_id=a.court_id,
                      locked=True,
                  )
              )

          problem = build_problem(
              self.state,
              ready,
              config=self.config,
              solver_options=self.solver_options,
              previous_assignments=previous_assignments,
          )
          result = schedule(problem, options=self.solver_options)

          if result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
              for assignment in result.assignments:
                  self.state.assignments[assignment.match_id] = (
                      TournamentAssignment(
                          play_unit_id=assignment.match_id,
                          slot_id=assignment.slot_id,
                          court_id=assignment.court_id,
                          duration_slots=assignment.duration_slots,
                      )
                  )

          return RoundResult(
              play_unit_ids=ready,
              status=result.status,
              schedule_result=result,
              started_at_current_slot=self.config.current_slot,
          )
    ```

  (Note: `record_result` is imported via `from services.bracket import record_result` in the test — verify the symbol exists in `services/bracket/__init__.py`. If not, executor uses `from services.bracket.advancement import record_result` or whatever the real export path is.)

- [ ] Verify imports compile + tests pass before committing: `.venv/bin/python -m pytest tests/unit/test_generate_event.py -x`. Expected: 4 passed (Draft→Generated, Re-generate, Started→ValueError, cross-event lock discriminator).

- [ ] Commit: `git commit -am "feat(bracket): TournamentDriver.generate_event with cross-event lock"`.

---

### A.4 — Three new bracket-event routes + status writes wired through

**Files**
- Create: `products/scheduler/tests/unit/test_bracket_event_routes.py`
- Modify: `products/scheduler/backend/api/brackets.py`

**Steps**

- [ ] Write failing test `products/scheduler/tests/unit/test_bracket_event_routes.py` following the precedent of `tests/unit/test_bracket_routes.py` (use the same TestClient fixture, the same auth-mock pattern). Cover:

  1. `POST /tournaments/{id}/bracket/events/{event_id}` (upsert) — happy-path; participants replaced; 404 on missing tournament; 422 on bad participant ref.
  2. `POST /tournaments/{id}/bracket/events/{event_id}/generate` — Draft→Generated (status flips to `'generated'`); Generated→Generated with `wipe=true`; Started→409; infeasible→409.
  3. `DELETE /tournaments/{id}/bracket/events/{event_id}` — Draft→204; Generated→409; Started→409.
  4. `record_match_result` flips status from `'generated'` to `'started'` on first result.

  Executor: open `tests/unit/test_bracket_routes.py` and copy the fixture skeleton. The discriminator assertion in each test reads the event row's `.status` post-call.

- [ ] Run failing: `.venv/bin/python -m pytest tests/unit/test_bracket_event_routes.py -x`. Expected: 404s / AttributeErrors (routes don't exist).

- [ ] Modify `products/scheduler/backend/api/brackets.py`:

  - At the top with the other Pydantic DTOs, ADD:

    ```python
    class EventUpsertIn(BaseModel):
        """Body of POST /bracket/events/{event_id} — upsert one event."""
        discipline: str
        format: Literal["se", "rr"] = "se"
        bracket_size: Optional[int] = None
        seeded_count: int = 0
        rr_rounds: int = Field(1, ge=1)
        duration_slots: int = Field(1, ge=1)
        participants: List[ParticipantIn] = Field(default_factory=list)


    class GenerateEventIn(BaseModel):
        wipe: bool = False
    ```

  - Add three new route handlers. Place them after the existing `@router.post("/schedule-next", ...)` handler (search the file for `schedule_next_round`):

    ```python
    @router.post(
        "/events/{event_id}",
        response_model=TournamentOut,
        dependencies=[_OPERATOR],
    )
    def upsert_event(
        body: EventUpsertIn,
        tournament_id: uuid.UUID = Path(...),
        event_id: str = Path(...),
        repo: LocalRepository = Depends(get_repository),
    ) -> TournamentOut:
        """Create or replace one bracket event row + its participants.

        Status of the event is forced to ``'draft'``. Existing
        ``bracket_matches`` for this event are wiped (an upsert is a
        Draft-state operation; Generated/Started events must go
        through DELETE→upsert→generate).
        """
        _ensure_tournament_exists(repo, tournament_id)
        existing = repo.brackets.get_event(tournament_id, event_id)
        if existing is not None and existing.status == "started":
            raise HTTPException(
                status_code=409,
                detail=f"event {event_id!r} is started; cannot edit",
            )
        # Pseudocode — exact repo helpers may differ; executor should
        # grep ``backend/repositories/`` for ``brackets`` API:
        #   - delete the event (cascade wipes participants + matches)
        #   - create_event(... status='draft')
        #   - bulk_create_participants(...)
        repo.brackets.delete_event(tournament_id, event_id)
        repo.brackets.create_event(
            tournament_id, event_id,
            discipline=body.discipline,
            format=body.format,
            duration_slots=body.duration_slots,
            bracket_size=body.bracket_size,
            seeded_count=body.seeded_count,
            rr_rounds=body.rr_rounds if body.format == "rr" else None,
            config={},
            status="draft",
        )
        repo.brackets.bulk_create_participants(
            tournament_id, event_id,
            [
                {
                    "id": p.id, "name": p.name,
                    "type": "TEAM" if p.members else "PLAYER",
                    "member_ids": list(p.members or []),
                    "seed": p.seed,
                    "meta": {},
                }
                for p in body.participants
            ],
        )
        session = _hydrate_session(repo, tournament_id)
        return _serialize_session(session) if session else TournamentOut(
            courts=2, total_slots=128, rest_between_rounds=1,
            interval_minutes=30, start_time=None,
            events=[], participants=[], play_units=[],
            assignments=[], results=[],
        )


    @router.post(
        "/events/{event_id}/generate",
        response_model=TournamentOut,
        dependencies=[_OPERATOR],
    )
    def generate_event_route(
        body: GenerateEventIn,
        tournament_id: uuid.UUID = Path(...),
        event_id: str = Path(...),
        repo: LocalRepository = Depends(get_repository),
    ) -> TournamentOut:
        """Generate (or re-generate) one event's draws + schedule.

        - Draft → builds the event's draw via the format generator,
          inserts ``bracket_matches`` rows, then runs
          ``TournamentDriver.generate_event(event_id)`` so the new
          matches receive assignments around any OTHER events'
          already-locked assignments. Sets status='generated'.
        - Generated with ``wipe=true`` → deletes matches+assignments
          first then proceeds as Draft.
        - Started → 409.
        - Solver infeasible → 409 with reason.
        """
        _ensure_tournament_exists(repo, tournament_id)
        existing = repo.brackets.get_event(tournament_id, event_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="event not found")
        if existing.status == "started":
            raise HTTPException(status_code=409, detail="event is started")
        if existing.status == "generated" and not body.wipe:
            raise HTTPException(
                status_code=409,
                detail="event already generated; pass wipe=true to re-generate",
            )

        # Build the draw, persist matches, then schedule.
        # Executor: reuse the format-generation block from create_bracket
        # (lines ~852-875): generate_single_elimination / generate_round_robin
        # against the persisted participants. Then persist matches via
        # repo.brackets.bulk_create_matches.

        session = _hydrate_session(repo, tournament_id)
        if session is None:
            raise HTTPException(status_code=500, detail="hydration failed")

        driver = TournamentDriver(
            state=session.state,
            config=session.config,
            rest_between_rounds=session.rest_between_rounds,
        )
        try:
            result = driver.generate_event(event_id, wipe=body.wipe)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        if not result.scheduled:
            reasons = (
                result.schedule_result.infeasible_reasons
                if result.schedule_result else []
            )
            raise HTTPException(
                status_code=409,
                detail=f"solver returned {result.status.value}: {'; '.join(reasons) or 'no reason'}",
            )

        # Persist assignments + flip status to 'generated'.
        repo.brackets.set_event_status(tournament_id, event_id, "generated")
        _persist_session_metadata(repo, tournament_id, session=session)
        return _serialize_session(session)


    @router.delete(
        "/events/{event_id}",
        status_code=204,
        dependencies=[_OPERATOR],
    )
    def delete_event(
        tournament_id: uuid.UUID = Path(...),
        event_id: str = Path(...),
        repo: LocalRepository = Depends(get_repository),
    ) -> Response:
        _ensure_tournament_exists(repo, tournament_id)
        existing = repo.brackets.get_event(tournament_id, event_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="event not found")
        if existing.status != "draft":
            raise HTTPException(
                status_code=409,
                detail=f"event status is {existing.status!r}; only draft can be deleted",
            )
        repo.brackets.delete_event(tournament_id, event_id)
        return Response(status_code=204)
    ```

    Repository methods used: `get_event`, `set_event_status`, `delete_event`, `create_event` (with `status=` kwarg), `bulk_create_participants`, `bulk_create_matches`. **The `status` kwarg on `create_event` and the `set_event_status` method are NEW.** Executor must add them to `backend/repositories/brackets.py` (or equivalent). Grep that file for `def create_event` first; if the signature doesn't take `status`, add the parameter with default `'draft'` and write through.

  - Locate the existing route that handles result recording — search for `@router.post("/results"` or `record_bracket_result`. In its body, after the result row is inserted and before returning, ADD:

    ```python
        event_id_for_pu = state.play_units[body.play_unit_id].event_id
        ev = repo.brackets.get_event(tournament_id, event_id_for_pu)
        if ev is not None and ev.status == "generated":
            repo.brackets.set_event_status(tournament_id, event_id_for_pu, "started")
    ```

    (Variable names match the local idiom of that handler; adapt to match.)

- [ ] Verify imports compile + tests pass before committing: `.venv/bin/python -m pytest tests/unit/test_bracket_event_routes.py -x`. Expected: all route tests pass.

- [ ] Commit: `git commit -am "feat(bracket): per-event upsert/generate/delete routes + status writes"`.

---

### A.5 — Extend `BRACKET_TAB_IDS`, route + dispatcher, lift `useTournamentState`, extend store

**Files**
- Modify: `products/scheduler/frontend/src/lib/bracketTabs.ts`
- Modify: `products/scheduler/frontend/src/store/uiStore.ts`
- Modify: `products/scheduler/frontend/src/store/tournamentStore.ts`
- Modify: `products/scheduler/frontend/src/app/AppShell.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`
- Modify: `products/scheduler/frontend/src/pages/TournamentPage.tsx`
- Modify: `products/scheduler/frontend/src/lib/__tests__/bracketTabs.test.ts`

**Steps**

- [ ] Write failing test additions to `frontend/src/lib/__tests__/bracketTabs.test.ts`. Append:

  ```ts
  describe('BRACKET_TAB_IDS — extended for entry tabs (#5)', () => {
    it('includes the three new entry-flow ids in order before draw/schedule/live', () => {
      expect(BRACKET_TAB_IDS).toEqual([
        'bracket-setup',
        'bracket-roster',
        'bracket-events',
        'bracket-draw',
        'bracket-schedule',
        'bracket-live',
      ]);
    });
    it('bracketTabView strips the prefix on the new ids', () => {
      expect(bracketTabView('bracket-setup')).toBe('setup');
      expect(bracketTabView('bracket-roster')).toBe('roster');
      expect(bracketTabView('bracket-events')).toBe('events');
    });
    it('normalizeActiveTab snaps non-bracket → bracket-setup (new default landing)', () => {
      expect(normalizeActiveTab('schedule', 'bracket')).toBe('bracket-setup');
    });
  });
  ```

- [ ] Run failing: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/bracketTabs.test.ts`. Expected: 3 new test failures (extra ids not in array, view mapping wrong, default snap wrong).

- [ ] Modify `frontend/src/lib/bracketTabs.ts`:

  - Replace the `BRACKET_TAB_IDS` array, `BRACKET_TABS` array, and `BracketView` type literally:

    ```ts
    export const BRACKET_TAB_IDS = [
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ] as const;

    export type BracketTabId = (typeof BRACKET_TAB_IDS)[number];

    export const BRACKET_TABS: { id: BracketTabId; label: string }[] = [
      { id: 'bracket-setup', label: 'Setup' },
      { id: 'bracket-roster', label: 'Roster' },
      { id: 'bracket-events', label: 'Events' },
      { id: 'bracket-draw', label: 'Draw' },
      { id: 'bracket-schedule', label: 'Schedule' },
      { id: 'bracket-live', label: 'Live' },
    ];

    export type BracketView =
      | 'setup'
      | 'roster'
      | 'events'
      | 'draw'
      | 'schedule'
      | 'live';
    ```

  - In `normalizeActiveTab`, replace `'bracket-draw'` (the default landing) with `'bracket-setup'`:

    ```ts
      if (kind === 'bracket' && !isBracketTab(activeTab)) return 'bracket-setup';
    ```

- [ ] Modify `frontend/src/store/uiStore.ts` — update the `AppTab` union (line 19) to include the three new ids:

  ```ts
  export type AppTab =
    | 'setup'
    | 'roster'
    | 'matches'
    | 'schedule'
    | 'live'
    | 'bracket'
    | 'tv'
    | 'bracket-setup'
    | 'bracket-roster'
    | 'bracket-events'
    | 'bracket-draw'
    | 'bracket-schedule'
    | 'bracket-live';
  ```

- [ ] Modify `frontend/src/store/tournamentStore.ts` — add bracket-side state. After `players: PlayerDTO[]` / `setPlayers` (around line 32-37), ADD:

  ```ts
    // Bracket roster — separate from meet's `players` (data isolation per spec).
    bracketPlayers: BracketPlayerDTO[];
    setBracketPlayers: (players: BracketPlayerDTO[]) => void;
    addBracketPlayer: (player: BracketPlayerDTO) => void;
    updateBracketPlayer: (id: string, updates: Partial<BracketPlayerDTO>) => void;
    deleteBracketPlayer: (id: string) => void;
    bracketRosterMigrated: boolean;
    setBracketRosterMigrated: (v: boolean) => void;
  ```

  And import `BracketPlayerDTO` at the top:

  ```ts
  import type { /* existing */, BracketPlayerDTO } from '../api/dto';
  ```

  And in INITIAL / `create<TournamentState>`, add:

  ```ts
    bracketPlayers: [] as BracketPlayerDTO[],
    bracketRosterMigrated: false,
  ```

  ```ts
    setBracketPlayers: (bracketPlayers) => set({ bracketPlayers }),
    addBracketPlayer: (p) =>
      set((s) => ({ bracketPlayers: [...s.bracketPlayers, p] })),
    updateBracketPlayer: (id, updates) =>
      set((s) => ({
        bracketPlayers: s.bracketPlayers.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      })),
    deleteBracketPlayer: (id) =>
      set((s) => ({ bracketPlayers: s.bracketPlayers.filter((p) => p.id !== id) })),
    setBracketRosterMigrated: (bracketRosterMigrated) => set({ bracketRosterMigrated }),
  ```

  In `useTournamentState.ts` (the existing hook), update both `hydrate` and `snapshot` to round-trip the new fields:
  - In `hydrate`, after `players: s.players ?? []` line, ADD: `bracketPlayers: s.bracketPlayers ?? [], bracketRosterMigrated: s.bracketRosterMigrated ?? false,`.
  - In `snapshot`, ADD: `bracketPlayers: state.bracketPlayers, bracketRosterMigrated: state.bracketRosterMigrated,`.
  - In the subscribe-debounce predicate, add `state.bracketPlayers !== prev.bracketPlayers || state.bracketRosterMigrated !== prev.bracketRosterMigrated`.

- [ ] Modify `frontend/src/app/AppShell.tsx` — move `useTournamentState()` so it runs for BOTH kinds (not just meet). Locate line 140 `{activeTournamentKind !== 'bracket' ? <MeetShellHooks /> : null}` and the `function MeetShellHooks() {` block around line 181. Replace with:

  ```tsx
        {/* useTournamentState runs for BOTH meet and bracket kinds —
            brackets persist their Setup + Roster + Events config
            through the same `/tournaments/{id}/state` endpoint. */}
        <SharedStateHooks />
        {activeTournamentKind !== 'bracket' ? <MeetOnlyPollingHooks /> : null}
  ```

  Then split the existing `MeetShellHooks` function into two siblings:

  ```tsx
  function SharedStateHooks() {
    useTournamentState();
    return null;
  }

  function MeetOnlyPollingHooks() {
    useAdvisories();
    useSuggestions(); // and whatever else was in MeetShellHooks except useTournamentState
    // ... copy the rest of the body verbatim from the old MeetShellHooks
    return null;
  }
  ```

  (Executor: grep AppShell.tsx for the exact list of hooks the old `MeetShellHooks` calls; move only `useTournamentState` out, keep the rest in `MeetOnlyPollingHooks`.)

- [ ] Modify `frontend/src/pages/TournamentPage.tsx` — find the URL-segment to tab-id mapping. Add the three new segments: `'setup' → 'bracket-setup'`, `'roster' → 'bracket-roster'`, `'events' → 'bracket-events'` for bracket-kind, alongside the existing draw/schedule/live mapping. Executor: grep file for `bracket-draw` to find the table.

- [ ] Modify `frontend/src/features/bracket/BracketTab.tsx`:

  - Import the three new tab views (placeholders OK for this task):

    ```ts
    import { SetupTab } from './SetupTab';
    import { BracketRosterTab } from './BracketRosterTab';
    import { EventsTab } from './EventsTab';
    ```

    (These three files don't exist yet — A.6 / A.7 / A.8 create them. Until then, executor stubs them as `export function SetupTab() { return <div>Setup TBD</div>; }` so this task's imports compile; the stub gets replaced in the corresponding later task.)

    Actually: gate this task to NOT introduce the imports yet; instead add the three view branches as inline placeholder divs and revisit in A.6-A.8. Recommended: do the inline-placeholder route to keep A.5 self-contained.

  - In the view dispatcher (the `<div key={view} ...>` block), ADD three new branches before the `view === 'draw'` line:

    ```tsx
            {view === 'setup' && <div>Setup (A.6)</div>}
            {view === 'roster' && <div>Roster (A.7)</div>}
            {view === 'events' && <div>Events (A.8)</div>}
    ```

  - The current `if (!data) { ... <SetupForm /> ... }` fallback STAYS in this task — A.9 deletes `SetupForm` and rewires the no-data path to redirect to `bracket-setup`.

  - Change the default fallback view from `'draw'` to `'setup'` so first-visit lands on the new entry tab:

    ```tsx
    const view = isBracketTab(activeTab) ? bracketTabView(activeTab) : 'setup';
    ```

- [ ] Verify imports compile + tests pass before committing:
  - `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.
  - `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/bracketTabs.test.ts`. Expected: all pass.

- [ ] Commit: `git commit -am "feat(bracket): extend BRACKET_TAB_IDS, lift useTournamentState, store wiring"`.

---

### A.6 — `SetupTab.tsx` hand-rolled sectioned form

**Files**
- Create: `products/scheduler/frontend/src/features/bracket/SetupTab.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/SetupTab.test.tsx`

**Steps**

- [ ] Write failing test `frontend/src/lib/__tests__/SetupTab.test.tsx`:

  ```tsx
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { SetupTab } from '../../features/bracket/SetupTab';
  import { useTournamentStore } from '../../store/tournamentStore';

  beforeEach(() => {
    useTournamentStore.setState({
      config: {
        intervalMinutes: 30,
        dayStart: '09:00',
        dayEnd: '18:00',
        courtCount: 4,
        restBetweenRounds: 1,
        breaks: [],
        defaultRestMinutes: 0,
        freezeHorizonSlots: 0,
        tournamentName: 'unification-test',
      },
    });
  });

  describe('SetupTab', () => {
    it('renders the four schedule-and-venue fields with current config values', () => {
      render(<SetupTab />);
      expect((screen.getByLabelText(/Courts/i) as HTMLInputElement).value).toBe('4');
      expect((screen.getByLabelText(/Slot duration/i) as HTMLInputElement).value).toBe('30');
      expect((screen.getByLabelText(/Start time/i) as HTMLInputElement).value).toBe('09:00');
      expect((screen.getByLabelText(/End time/i) as HTMLInputElement).value).toBe('18:00');
    });

    it('writes courtCount through setConfig on blur', () => {
      render(<SetupTab />);
      const input = screen.getByLabelText(/Courts/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '6' } });
      fireEvent.blur(input);
      expect(useTournamentStore.getState().config?.courtCount).toBe(6);
    });
  });
  ```

- [ ] Run failing: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/SetupTab.test.tsx`. Expected: module-not-found.

- [ ] Create `frontend/src/features/bracket/SetupTab.tsx`:

  ```tsx
  /**
   * Setup tab — bracket Identity + Schedule&Venue configuration.
   * Hand-rolled h2 + grid sections (matches meet's TournamentConfigForm
   * pattern). Auto-persists per field on blur with the 500ms debounce
   * provided by useTournamentState.
   */
  import { useTournamentStore } from '../../store/tournamentStore';
  import type { TournamentConfig } from '../../api/dto';

  export function SetupTab() {
    const config = useTournamentStore((s) => s.config);
    const setConfig = useTournamentStore((s) => s.setConfig);

    const update = (patch: Partial<TournamentConfig>) => {
      const merged: TournamentConfig = {
        ...(config ?? {
          intervalMinutes: 30,
          dayStart: '09:00',
          dayEnd: '18:00',
          breaks: [],
          courtCount: 4,
          defaultRestMinutes: 0,
          freezeHorizonSlots: 0,
        }),
        ...patch,
      };
      setConfig(merged);
    };

    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-4xl px-6 py-8 space-y-10">
          <section>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Identity
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tournament name">
                <input
                  type="text"
                  defaultValue={config?.tournamentName ?? ''}
                  onBlur={(e) => update({ tournamentName: e.target.value })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Tournament date">
                <input
                  type="date"
                  defaultValue={config?.tournamentDate ?? ''}
                  onBlur={(e) => update({ tournamentDate: e.target.value || undefined })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Schedule &amp; Venue
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Courts">
                <input
                  type="number"
                  min={1}
                  max={32}
                  defaultValue={config?.courtCount ?? 4}
                  onBlur={(e) => update({ courtCount: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Slot duration (minutes)">
                <input
                  type="number"
                  min={5}
                  max={240}
                  defaultValue={config?.intervalMinutes ?? 30}
                  onBlur={(e) => update({ intervalMinutes: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Start time">
                <input
                  type="time"
                  defaultValue={config?.dayStart ?? '09:00'}
                  onBlur={(e) => update({ dayStart: e.target.value })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="End time">
                <input
                  type="time"
                  defaultValue={config?.dayEnd ?? '18:00'}
                  onBlur={(e) => update({ dayEnd: e.target.value })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <Field label="Rest between rounds (slots)">
                <input
                  type="number"
                  min={0}
                  max={32}
                  defaultValue={config?.restBetweenRounds ?? 0}
                  onBlur={(e) => update({ restBetweenRounds: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            </div>
          </section>
        </main>
      </div>
    );
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {children}
      </label>
    );
  }
  ```

- [ ] Replace the placeholder `<div>Setup (A.6)</div>` line in `BracketTab.tsx` with `<SetupTab />` and add the import `import { SetupTab } from './SetupTab';`.

- [ ] Verify imports compile + tests pass before committing:
  - `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/SetupTab.test.tsx`. Expected: 2 passed.
  - `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.

- [ ] Commit: `git commit -am "feat(bracket): SetupTab hand-rolled sectioned form"`.

---

### A.7 — `BracketRosterTab.tsx` flat list + detail panel

**Files**
- Create: `products/scheduler/frontend/src/features/bracket/BracketRosterTab.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketRosterTab.test.tsx`

(Naming note: the spec table referred to this as `RosterTab.tsx`, but the meet feature already exports `RosterTab` from `features/roster/RosterTab.tsx`. Using `BracketRosterTab.tsx` avoids the symbol collision.)

**Steps**

- [ ] Write failing test `frontend/src/lib/__tests__/BracketRosterTab.test.tsx`:

  ```tsx
  import { describe, it, expect, beforeEach } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { BracketRosterTab } from '../../features/bracket/BracketRosterTab';
  import { useTournamentStore } from '../../store/tournamentStore';

  beforeEach(() => {
    useTournamentStore.setState({
      bracketPlayers: [
        { id: 'p-alex-tan', name: 'Alex Tan' },
        { id: 'p-ben-carter', name: 'Ben Carter', notes: 'lefty' },
      ],
    });
  });

  describe('BracketRosterTab', () => {
    it('renders the player count and list of player names', () => {
      render(<BracketRosterTab />);
      expect(screen.getByText(/PLAYERS \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('Alex Tan')).toBeInTheDocument();
      expect(screen.getByText('Ben Carter')).toBeInTheDocument();
    });

    it('adds a new player via the + Add player button', () => {
      render(<BracketRosterTab />);
      fireEvent.click(screen.getByRole('button', { name: /Add player/i }));
      const input = screen.getByPlaceholderText(/New player name/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Cole Park' } });
      fireEvent.blur(input);
      const players = useTournamentStore.getState().bracketPlayers;
      expect(players.find((p) => p.name === 'Cole Park')).toBeDefined();
    });

    it('deletes a player and updates the count', () => {
      render(<BracketRosterTab />);
      const delButtons = screen.getAllByRole('button', { name: /Delete/i });
      fireEvent.click(delButtons[0]);
      const players = useTournamentStore.getState().bracketPlayers;
      expect(players).toHaveLength(1);
    });
  });
  ```

- [ ] Run failing: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/BracketRosterTab.test.tsx`. Expected: module-not-found.

- [ ] Create `frontend/src/features/bracket/BracketRosterTab.tsx`:

  ```tsx
  /**
   * Bracket Roster tab — flat list + detail panel below. Slimmer than
   * the meet's RosterTab (no schools/positions). Player events are a
   * derived read-only display sourced from the EventsTab participants.
   */
  import { useState, useMemo } from 'react';
  import { useTournamentStore } from '../../store/tournamentStore';
  import { useBracket } from '../../hooks/useBracket';
  import type { BracketPlayerDTO } from '../../api/dto';
  import { Button } from '@scheduler/design-system';
  import { playerSlug } from '../setupForm/helpers';

  export function BracketRosterTab() {
    const players = useTournamentStore((s) => s.bracketPlayers);
    const addPlayer = useTournamentStore((s) => s.addBracketPlayer);
    const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);
    const deletePlayer = useTournamentStore((s) => s.deleteBracketPlayer);

    const { data: bracket } = useBracket();

    // Derived view: which event(s) does each player appear in?
    const eventsByPlayerId = useMemo(() => {
      const out = new Map<string, string[]>();
      if (!bracket) return out;
      for (const part of bracket.participants) {
        const ids = part.members && part.members.length > 0 ? part.members : [part.id];
        for (const id of ids) {
          // The participant row has no `event_id` directly on this type;
          // executor: cross-reference via bracket.play_units → event_id.
          const eventIds = new Set(
            bracket.play_units
              .filter((pu) => pu.side_a?.includes(part.id) || pu.side_b?.includes(part.id))
              .map((pu) => pu.event_id),
          );
          const arr = out.get(id) ?? [];
          arr.push(...eventIds);
          out.set(id, Array.from(new Set(arr)));
        }
      }
      return out;
    }, [bracket]);

    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = players.find((p) => p.id === selectedId) ?? null;

    const filtered = players.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()),
    );

    const commitAdd = () => {
      const name = draft.trim();
      if (!name) {
        setAdding(false);
        setDraft('');
        return;
      }
      const id = playerSlug(name);
      if (players.some((p) => p.id === id)) {
        setAdding(false);
        setDraft('');
        return;
      }
      addPlayer({ id, name });
      setAdding(false);
      setDraft('');
    };

    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Players ({players.length})
              </h2>
              <div className="flex gap-2 items-center">
                <input
                  type="search"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  + Add player
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border border border-border rounded-sm">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedId(p.id)}
                >
                  <span className="text-sm">{p.name}</span>
                  <span className="text-2xs font-mono uppercase tracking-wider text-muted-foreground">
                    {(eventsByPlayerId.get(p.id) ?? []).join(' · ')}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlayer(p.id);
                    }}
                    aria-label="Delete"
                    className="text-2xs text-status-blocked hover:underline"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {adding && (
                <li className="px-3 py-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="New player name…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitAdd}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAdd();
                    }}
                    className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </li>
              )}
            </ul>
          </section>

          {selected && (
            <section>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Player detail · {selected.name}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
                  <input
                    type="text"
                    defaultValue={selected.notes ?? ''}
                    onBlur={(e) => updatePlayer(selected.id, { notes: e.target.value })}
                    className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Rest constraint (slots)</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={selected.restSlots ?? 0}
                    onBlur={(e) => updatePlayer(selected.id, { restSlots: Number(e.target.value) })}
                    className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <p className="mt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Events: {(eventsByPlayerId.get(selected.id) ?? []).join(', ') || '—'}
              </p>
            </section>
          )}
        </main>
      </div>
    );
  }
  ```

  Note: this file imports `playerSlug` from `../setupForm/helpers` — A.9 re-homes it to `lib/playerSlug.ts` and updates this import. Keep the existing import path here for now.

- [ ] Replace placeholder `<div>Roster (A.7)</div>` in `BracketTab.tsx` with `<BracketRosterTab />` and add the import.

- [ ] Verify imports compile + tests pass before committing: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/BracketRosterTab.test.tsx`. Expected: 3 passed.

- [ ] Commit: `git commit -am "feat(bracket): BracketRosterTab flat list + detail panel"`.

---

### A.8 — `EventsTab.tsx` + `ParticipantPicker.tsx` + bracketClient endpoints

**Files**
- Create: `products/scheduler/frontend/src/features/bracket/EventsTab.tsx`
- Create: `products/scheduler/frontend/src/features/bracket/ParticipantPicker.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/EventsTab.test.tsx`
- Modify: `products/scheduler/frontend/src/api/bracketClient.tsx`
- Modify: `products/scheduler/frontend/src/api/bracketDto.ts`
- Modify: `products/scheduler/frontend/src/api/client.ts`

**Steps**

- [ ] Modify `frontend/src/api/bracketDto.ts` — ADD new wire types:

  ```ts
  /** Per-event status (sub-project #5). */
  export type BracketEventStatus = 'draft' | 'generated' | 'started';

  /** Update the EventDTO shape to carry the status — strictly additive. */
  export interface EventDTOWithStatus extends EventDTO {
    status: BracketEventStatus;
  }

  /** POST /tournaments/{tid}/bracket/events/{event_id} body. */
  export interface BracketEventUpsertIn {
    discipline: string;
    format: 'se' | 'rr';
    bracket_size?: number | null;
    seeded_count?: number;
    rr_rounds?: number;
    duration_slots?: number;
    participants: Array<{
      id: string;
      name: string;
      members?: string[];
      seed?: number;
    }>;
  }

  /** POST /tournaments/{tid}/bracket/events/{event_id}/generate body. */
  export interface BracketEventGenerateIn {
    wipe?: boolean;
  }
  ```

  Also locate `export interface EventDTO {` and ADD `status: BracketEventStatus;` to its body. The backwards-compatible flow: if the server omits `status`, executor's wire layer in `client.ts` defaults to `'draft'`.

- [ ] Modify `frontend/src/api/client.ts` — add three new methods alongside `recordBracketResult`:

  ```ts
    async bracketEventUpsert(
      tid: string,
      eventId: string,
      body: BracketEventUpsertIn,
    ): Promise<BracketTournamentDTO> {
      const { data } = await this.client.post(
        `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}`,
        body,
      );
      return data;
    }

    async bracketEventGenerate(
      tid: string,
      eventId: string,
      body: BracketEventGenerateIn,
    ): Promise<BracketTournamentDTO> {
      const { data } = await this.client.post(
        `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}/generate`,
        body,
      );
      return data;
    }

    async bracketEventDelete(tid: string, eventId: string): Promise<void> {
      await this.client.delete(
        `/tournaments/${tid}/bracket/events/${encodeURIComponent(eventId)}`,
      );
    }
  ```

  And the corresponding imports at the top of `client.ts`:

  ```ts
  import type {
    BracketEventUpsertIn,
    BracketEventGenerateIn,
  } from './bracketDto';
  ```

- [ ] Modify `frontend/src/api/bracketClient.tsx` — extend the `BracketApi` interface and the provider's `value` memo:

  In the interface (line 27-54), ADD:

  ```ts
    eventUpsert: (eventId: string, body: BracketEventUpsertIn) => Promise<BracketTournamentDTO>;
    eventGenerate: (eventId: string, body: BracketEventGenerateIn) => Promise<BracketTournamentDTO>;
    eventDelete: (eventId: string) => Promise<void>;
  ```

  In the provider's `useMemo` value, ADD:

  ```ts
      eventUpsert: (eventId, body) => apiClient.bracketEventUpsert(tournamentId, eventId, body),
      eventGenerate: (eventId, body) => apiClient.bracketEventGenerate(tournamentId, eventId, body),
      eventDelete: (eventId) => apiClient.bracketEventDelete(tournamentId, eventId),
  ```

  Imports at the top:

  ```ts
  import type {
    BracketEventUpsertIn,
    BracketEventGenerateIn,
  } from './bracketDto';
  ```

- [ ] Create `frontend/src/features/bracket/ParticipantPicker.tsx`:

  ```tsx
  /**
   * In-grid participant picker. Renders below the active EventsTab row,
   * in flow (no popover). Singles = checkbox list, Doubles = 2-step
   * pair-select (commit pair as a TEAM participant).
   */
  import { useState } from 'react';
  import type { BracketPlayerDTO } from '../../api/dto';
  import { Button } from '@scheduler/design-system';

  export interface PickedSingle {
    id: string;
    name: string;
  }

  export interface PickedPair {
    id: string;
    name: string;
    members: [string, string];
  }

  interface Props {
    mode: 'singles' | 'doubles';
    eventId: string;
    players: BracketPlayerDTO[];
    initialIds: string[];
    onCommit: (picks: PickedSingle[] | PickedPair[]) => void;
    onCancel: () => void;
  }

  export function ParticipantPicker({
    mode,
    eventId,
    players,
    initialIds,
    onCommit,
    onCancel,
  }: Props) {
    if (mode === 'singles') {
      return (
        <SinglesPicker
          eventId={eventId}
          players={players}
          initialIds={initialIds}
          onCommit={onCommit as (picks: PickedSingle[]) => void}
          onCancel={onCancel}
        />
      );
    }
    return (
      <DoublesPicker
        eventId={eventId}
        players={players}
        onCommit={onCommit as (picks: PickedPair[]) => void}
        onCancel={onCancel}
      />
    );
  }

  function SinglesPicker({
    players,
    initialIds,
    onCommit,
    onCancel,
  }: {
    eventId: string;
    players: BracketPlayerDTO[];
    initialIds: string[];
    onCommit: (picks: PickedSingle[]) => void;
    onCancel: () => void;
  }) {
    const [picked, setPicked] = useState<Set<string>>(new Set(initialIds));
    const toggle = (id: string) =>
      setPicked((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    return (
      <div className="border border-border bg-bg-elev p-3 space-y-2">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pick participants ({picked.size})
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {players.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.name}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            variant="brand"
            size="sm"
            onClick={() => {
              const ids = Array.from(picked);
              onCommit(
                ids
                  .map((id) => players.find((p) => p.id === id))
                  .filter((p): p is BracketPlayerDTO => p != null)
                  .map((p) => ({ id: p.id, name: p.name })),
              );
            }}
          >
            Commit
          </Button>
        </div>
      </div>
    );
  }

  function DoublesPicker({
    eventId,
    players,
    onCommit,
    onCancel,
  }: {
    eventId: string;
    players: BracketPlayerDTO[];
    onCommit: (picks: PickedPair[]) => void;
    onCancel: () => void;
  }) {
    const [step, setStep] = useState<'A' | 'B'>('A');
    const [pickedA, setPickedA] = useState<BracketPlayerDTO | null>(null);
    const [pairs, setPairs] = useState<PickedPair[]>([]);

    return (
      <div className="border border-border bg-bg-elev p-3 space-y-2">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {step === 'A'
            ? `Pick player A (pair ${pairs.length + 1})`
            : `Pick partner for ${pickedA?.name}`}
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="text-sm w-full text-left hover:bg-muted/30 px-1"
                onClick={() => {
                  if (step === 'A') {
                    setPickedA(p);
                    setStep('B');
                  } else if (pickedA) {
                    if (p.id === pickedA.id) return;
                    const pairId = `${eventId}-T${pairs.length + 1}`;
                    setPairs((arr) => [
                      ...arr,
                      {
                        id: pairId,
                        name: `${pickedA.name} / ${p.name}`,
                        members: [pickedA.id, p.id],
                      },
                    ]);
                    setPickedA(null);
                    setStep('A');
                  }
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        {pairs.length > 0 && (
          <ul className="text-2xs font-mono space-y-0.5">
            {pairs.map((pair) => (
              <li key={pair.id}>{pair.name}</li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="brand" size="sm" onClick={() => onCommit(pairs)}>Commit pairs</Button>
        </div>
      </div>
    );
  }
  ```

- [ ] Create `frontend/src/features/bracket/EventsTab.tsx`:

  ```tsx
  /**
   * Events tab — full-width spreadsheet. One row per bracket event.
   * Cells: ID · Discipline · Format · Size · Participants · Status · Action.
   */
  import { useState, useCallback } from 'react';
  import { useBracket } from '../../hooks/useBracket';
  import { useBracketApi } from '../../api/bracketClient';
  import { useTournamentStore } from '../../store/tournamentStore';
  import type { BracketEventStatus, EventDTO } from '../../api/bracketDto';
  import { Button, StatusPill } from '@scheduler/design-system';
  import { ParticipantPicker, type PickedSingle, type PickedPair } from './ParticipantPicker';

  export function EventsTab() {
    const { data, setData, refresh } = useBracket();
    const api = useBracketApi();
    const players = useTournamentStore((s) => s.bracketPlayers);

    const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
    const [addingRow, setAddingRow] = useState(false);

    const events: (EventDTO & { status?: BracketEventStatus })[] = data?.events ?? [];

    const handleGenerate = useCallback(
      async (eventId: string, wipe: boolean) => {
        try {
          const next = await api.eventGenerate(eventId, { wipe });
          setData(next);
        } catch (err) {
          // Interceptor surfaces toast; nothing more here.
          await refresh();
        }
      },
      [api, setData, refresh],
    );

    return (
      <div className="min-h-full bg-background">
        <main className="mx-auto max-w-6xl px-6 py-8 space-y-4">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-ink-100 text-ink-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">ID</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Discipline</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Format</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Size</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Participants</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Status</th>
                <th className="px-3 py-2 text-left font-medium border-b border-ink-200">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const status: BracketEventStatus = ev.status ?? 'draft';
                const partCount = ev.participant_count ?? 0;
                const targetSize = ev.bracket_size ?? partCount;
                const pickerOpen = openPickerFor === ev.id;
                const isDoubles = ['MD', 'WD', 'XD'].includes(ev.discipline);
                return (
                  <>
                    <tr key={ev.id} className="border-b border-ink-100">
                      <td className="px-3 py-2 font-mono text-xs">{ev.id}</td>
                      <td className="px-3 py-2">{ev.discipline}</td>
                      <td className="px-3 py-2">{ev.format.toUpperCase()}</td>
                      <td className="px-3 py-2">{targetSize}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setOpenPickerFor(pickerOpen ? null : ev.id)}
                          className="text-xs hover:underline"
                        >
                          {partCount} entered
                        </button>
                      </td>
                      <td className="px-3 py-2"><StatusPillFor status={status} /></td>
                      <td className="px-3 py-2">
                        <ActionCell
                          status={status}
                          eventReady={partCount === targetSize && partCount >= 2}
                          onGenerate={() => handleGenerate(ev.id, false)}
                          onRegenerate={() => handleGenerate(ev.id, true)}
                        />
                      </td>
                    </tr>
                    {pickerOpen && (
                      <tr>
                        <td colSpan={7} className="bg-bg-elev p-2">
                          <ParticipantPicker
                            mode={isDoubles ? 'doubles' : 'singles'}
                            eventId={ev.id}
                            players={players}
                            initialIds={[]}
                            onCommit={async (picks) => {
                              const participants = isDoubles
                                ? (picks as PickedPair[]).map((p) => ({
                                    id: p.id, name: p.name, members: p.members,
                                  }))
                                : (picks as PickedSingle[]).map((p) => ({
                                    id: p.id, name: p.name,
                                  }));
                              try {
                                const next = await api.eventUpsert(ev.id, {
                                  discipline: ev.discipline,
                                  format: ev.format,
                                  bracket_size: ev.bracket_size,
                                  duration_slots: 1,
                                  participants,
                                });
                                setData(next);
                              } finally {
                                setOpenPickerFor(null);
                              }
                            }}
                            onCancel={() => setOpenPickerFor(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {addingRow && (
                <NewEventRow
                  onCommit={async (body) => {
                    try {
                      const next = await api.eventUpsert(body.id, {
                        discipline: body.discipline,
                        format: body.format,
                        duration_slots: 1,
                        participants: [],
                      });
                      setData(next);
                    } finally {
                      setAddingRow(false);
                    }
                  }}
                  onCancel={() => setAddingRow(false)}
                />
              )}
            </tbody>
          </table>
          <Button variant="outline" size="sm" onClick={() => setAddingRow(true)}>
            + Add event
          </Button>
        </main>
      </div>
    );
  }

  function StatusPillFor({ status }: { status: BracketEventStatus }) {
    if (status === 'draft') {
      return (
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          ○ Draft
        </span>
      );
    }
    if (status === 'generated') {
      return <StatusPill tone="amber">● Generated</StatusPill>;
    }
    return <StatusPill tone="green">● Started</StatusPill>;
  }

  function ActionCell({
    status,
    eventReady,
    onGenerate,
    onRegenerate,
  }: {
    status: BracketEventStatus;
    eventReady: boolean;
    onGenerate: () => void;
    onRegenerate: () => void;
  }) {
    if (status === 'draft') {
      return (
        <Button
          variant="brand"
          size="sm"
          disabled={!eventReady}
          onClick={onGenerate}
        >
          Generate
        </Button>
      );
    }
    if (status === 'generated') {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.confirm('This will discard the existing draws. Re-generate?')) {
              onRegenerate();
            }
          }}
        >
          Re-generate
        </Button>
      );
    }
    return (
      <span
        className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
        title="Event is in progress; reset bracket to re-generate."
      >
        — (locked)
      </span>
    );
  }

  function NewEventRow({
    onCommit,
    onCancel,
  }: {
    onCommit: (body: { id: string; discipline: string; format: 'se' | 'rr' }) => void;
    onCancel: () => void;
  }) {
    const [id, setId] = useState('');
    const [discipline, setDiscipline] = useState('Men\'s Singles');
    const [format, setFormat] = useState<'se' | 'rr'>('se');
    return (
      <tr className="border-b border-ink-100 bg-bg-elev">
        <td className="px-3 py-2">
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="MS"
            className="w-12 rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'se' | 'rr')}
            className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-xs"
          >
            <option value="se">SE</option>
            <option value="rr">RR</option>
          </select>
        </td>
        <td className="px-3 py-2">—</td>
        <td className="px-3 py-2">—</td>
        <td className="px-3 py-2">○ Draft</td>
        <td className="px-3 py-2">
          <Button
            variant="brand"
            size="sm"
            disabled={!id.trim()}
            onClick={() => onCommit({ id: id.trim(), discipline, format })}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} className="ml-2">
            Cancel
          </Button>
        </td>
      </tr>
    );
  }
  ```

- [ ] Write `frontend/src/lib/__tests__/EventsTab.test.tsx` covering: commit upsert; status pill rendering for each of `'draft'`/`'generated'`/`'started'`; action button gating; picker open/close on cell click; doubles pair commit produces `members: [id_a, id_b]`. Use `vi.mock('../../api/bracketClient', () => ({ useBracketApi: () => ({ eventUpsert: vi.fn(), eventGenerate: vi.fn(), eventDelete: vi.fn() }) }))` to stub the API.

- [ ] Replace placeholder `<div>Events (A.8)</div>` in `BracketTab.tsx` with `<EventsTab />` and add the import.

- [ ] Verify imports compile + tests pass before committing:
  - `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/EventsTab.test.tsx`. Expected: all tests pass.
  - `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.

- [ ] Commit: `git commit -am "feat(bracket): EventsTab spreadsheet + in-grid ParticipantPicker"`.

---

### A.9 — Migration, delete `SetupForm`, simplify `DrawView`, re-home `playerSlug`

**Files**
- Create: `products/scheduler/frontend/src/lib/playerSlug.ts`
- Create: `products/scheduler/frontend/src/lib/__tests__/bracketMigration.test.ts`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/DrawView.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketRosterTab.tsx` (import path update)
- Delete: `products/scheduler/frontend/src/features/bracket/SetupForm.tsx`
- Delete: `products/scheduler/frontend/src/features/bracket/setupForm/EventEditor.tsx`
- Delete: `products/scheduler/frontend/src/features/bracket/setupForm/helpers.ts`
  - (After moving `playerSlug` out — keep the directory empty deletion off the plan unless every file is removed.)

**Steps**

- [ ] Create `frontend/src/lib/playerSlug.ts`:

  ```ts
  /**
   * Stable slug for a player name. Lifted out of the legacy
   * `features/bracket/setupForm/helpers.ts` so both the new
   * BracketRosterTab and the first-load migration can import it
   * without depending on a feature directory we are deleting.
   */
  export function playerSlug(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `p-${slug || 'player'}`;
  }
  ```

- [ ] Update `frontend/src/features/bracket/BracketRosterTab.tsx` import:

  Change:
  ```ts
  import { playerSlug } from '../setupForm/helpers';
  ```
  To:
  ```ts
  import { playerSlug } from '../../lib/playerSlug';
  ```

- [ ] Write failing test `frontend/src/lib/__tests__/bracketMigration.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { reconcileBracketRoster } from '../../features/bracket/bracketMigration';
  import type { BracketTournamentDTO } from '../../api/bracketDto';

  describe('reconcileBracketRoster', () => {
    it('extracts unique players from PLAYER participants', () => {
      const bracket = {
        participants: [
          { id: 'p-alex-tan', name: 'Alex Tan' },
          { id: 'p-ben-carter', name: 'Ben Carter' },
        ],
      } as unknown as BracketTournamentDTO;
      const result = reconcileBracketRoster(bracket);
      expect(result.map((p) => p.id).sort()).toEqual([
        'p-alex-tan',
        'p-ben-carter',
      ]);
    });

    it('flattens TEAM members and dedupes by id', () => {
      const bracket = {
        participants: [
          { id: 'MS-T1', name: 'Alex / Ben', members: ['p-alex', 'p-ben'] },
          { id: 'p-alex', name: 'Alex Tan' },
        ],
      } as unknown as BracketTournamentDTO;
      const ids = reconcileBracketRoster(bracket).map((p) => p.id);
      expect(ids).toContain('p-alex');
      expect(ids).toContain('p-ben');
      // dedup: p-alex should appear once.
      const seen = new Set(ids);
      expect(seen.size).toBe(ids.length);
    });

    it('returns empty when bracket has no participants', () => {
      const bracket = { participants: [] } as unknown as BracketTournamentDTO;
      expect(reconcileBracketRoster(bracket)).toEqual([]);
    });
  });
  ```

- [ ] Create `frontend/src/features/bracket/bracketMigration.ts`:

  ```ts
  import type { BracketPlayerDTO } from '../../api/dto';
  import type { BracketTournamentDTO } from '../../api/bracketDto';

  /**
   * First-load reconcile: extract unique players from a legacy bracket's
   * participants and produce a BracketPlayerDTO list keyed by the slug
   * already baked into bracket_participants.member_ids. Same slugger as
   * lib/playerSlug.ts produces the same id.
   */
  export function reconcileBracketRoster(
    bracket: BracketTournamentDTO,
  ): BracketPlayerDTO[] {
    const byId = new Map<string, BracketPlayerDTO>();
    for (const part of bracket.participants) {
      if (part.members && part.members.length > 0) {
        // TEAM: each member id is already a player slug.
        for (const memberId of part.members) {
          if (!byId.has(memberId)) {
            // Name is the team display "A / B" — split for the member.
            // Best effort: use the part's name segment matching this slug.
            byId.set(memberId, { id: memberId, name: memberId });
          }
        }
      } else {
        // PLAYER: id = player slug, name = display name.
        if (!byId.has(part.id)) {
          byId.set(part.id, { id: part.id, name: part.name });
        }
      }
    }
    return Array.from(byId.values());
  }
  ```

- [ ] Run failing then passing: `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/bracketMigration.test.ts`. Expected: 3 passed.

- [ ] Modify `frontend/src/features/bracket/BracketTab.tsx`:

  - Delete the `import { SetupForm } from './SetupForm';` line.
  - Delete the `if (!data) { ... <SetupForm ... /> ... }` block. Replace it with an empty-state CTA that drives the user to `bracket-setup`:

    ```tsx
    if (!data) {
      return (
        <div className="min-h-full bg-background">
          <main className="mx-auto max-w-4xl px-6 py-8">
            {error && (
              <div className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              No events yet. Open the <strong>Events</strong> tab to add one,
              and the <strong>Setup</strong> tab to set the venue + schedule.
            </p>
          </main>
        </div>
      );
    }
    ```

  - In `BracketTabBody`, ADD a first-load reconcile effect (after the `useEffect` that keeps `eventId` valid):

    ```tsx
    const bracketPlayers = useTournamentStore((s) => s.bracketPlayers);
    const setBracketPlayers = useTournamentStore((s) => s.setBracketPlayers);
    const bracketRosterMigrated = useTournamentStore((s) => s.bracketRosterMigrated);
    const setBracketRosterMigrated = useTournamentStore((s) => s.setBracketRosterMigrated);

    useEffect(() => {
      if (!data) return;
      if (bracketRosterMigrated) return;
      if (bracketPlayers.length > 0) return;
      if (data.participants.length === 0) return;
      const derived = reconcileBracketRoster(data);
      if (derived.length > 0) {
        setBracketPlayers(derived);
      }
      setBracketRosterMigrated(true);
    }, [data, bracketPlayers.length, bracketRosterMigrated, setBracketPlayers, setBracketRosterMigrated]);
    ```

    And ADD the import: `import { reconcileBracketRoster } from './bracketMigration';` and `import { useTournamentStore } from '../../store/tournamentStore';`.

- [ ] Modify `frontend/src/features/bracket/DrawView.tsx`:

  - Currently it always renders bracket/RR for the selected event. ADD a status-aware empty-state CTA: when the selected event has no `play_units` (status = `'draft'`), render a placeholder:

    ```tsx
    if (event && data.play_units.filter((p) => p.event_id === eventId).length === 0) {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          No draws generated yet — go to the <strong>Events</strong> tab and click Generate.
        </div>
      );
    }
    ```

    Place this immediately after the `if (!event)` check (current line 20-22) so it sits before the SE/RR branch.

- [ ] Delete the three files:
  - `frontend/src/features/bracket/SetupForm.tsx`
  - `frontend/src/features/bracket/setupForm/EventEditor.tsx`
  - `frontend/src/features/bracket/setupForm/helpers.ts`

  (The `setupForm/` directory becomes empty; `rm -r setupForm/` is acceptable, but it's not strictly required to remove the directory itself.)

- [ ] Grep for any leftover imports of `./SetupForm` or `setupForm/helpers` in `products/scheduler/frontend/src/`:

  ```bash
  grep -rn "SetupForm\|setupForm/helpers\|setupForm/EventEditor" products/scheduler/frontend/src/
  ```

  Expected: no matches (other than `BracketRosterTab.tsx`, which was already updated to import from `../../lib/playerSlug`).

- [ ] Verify imports compile + tests pass before committing:
  - `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.
  - `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/bracketMigration.test.ts`. Expected: 3 passed.

- [ ] Commit: `git commit -am "feat(bracket): roster migration + delete SetupForm, simplify DrawView"`.

---

## Phase B — #4 Live Gantt

### B.1 — `LiveView.tsx` rewrite as `GanttTimeline` consumer

**Files**
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/LiveView.test.tsx`

**Steps**

- [ ] Write failing test `frontend/src/lib/__tests__/LiveView.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { LiveView } from '../../features/bracket/LiveView';
  import type { BracketTournamentDTO } from '../../api/bracketDto';

  const EMPTY: BracketTournamentDTO = {
    courts: 4, total_slots: 32, rest_between_rounds: 1, interval_minutes: 30,
    start_time: null, events: [], participants: [],
    play_units: [], assignments: [], results: [],
  };

  describe('LiveView', () => {
    it('renders empty-state CTA when no events are generated', () => {
      render(<LiveView data={EMPTY} eventId="" onChange={() => {}} refresh={async () => {}} />);
      expect(screen.getByText(/No draws generated yet/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Run failing.

- [ ] Modify `frontend/src/features/bracket/LiveView.tsx` — replace the whole file body (keep import shape but swap implementation to a `GanttTimeline` consumer). Use `density="standard"`, derive `Placement[]` from `data.assignments` filtered to events whose status is `'generated'` or `'started'`. Court count from `data.courts`; slot window from `[min(assignments.slot_id), max(slot_id+duration_slots)]`. `renderBlock` paints the chip with a basic state ring (full vocabulary in B.2). Empty-state when no placements.

  Full new file:

  ```tsx
  /**
   * LiveView — GanttTimeline operator surface. Court×time with chips
   * coloured by event and ringed by lifecycle state. Right-rail
   * MatchDetailPanel arrives in B.3.
   */
  import { useMemo, useCallback } from 'react';
  import { GanttTimeline, type Placement, type GanttBlockBox } from '@scheduler/design-system';
  import type { BracketTournamentDTO } from '../../api/bracketDto';
  import { getEventColor } from '../schedule/eventColors';

  interface Props {
    data: BracketTournamentDTO;
    eventId: string;
    onChange: (t: BracketTournamentDTO) => void;
    refresh: () => Promise<void>;
  }

  export function LiveView({ data }: Props) {
    const placements: Placement[] = useMemo(() => {
      // Only events with status generated/started have assignments;
      // a draft event's assignments are absent by construction.
      return data.assignments.map<Placement>((a) => ({
        courtIndex: Math.max(0, a.court_id - 1),
        startSlot: a.slot_id,
        span: a.duration_slots,
        key: `live-${a.play_unit_id}`,
      }));
    }, [data.assignments]);

    const courts = useMemo(
      () => Array.from({ length: data.courts }, (_, i) => i + 1),
      [data.courts],
    );

    const { minSlot, slotCount } = useMemo(() => {
      if (placements.length === 0) return { minSlot: 0, slotCount: 1 };
      const lo = placements.reduce((m, p) => Math.min(m, p.startSlot), Number.POSITIVE_INFINITY);
      const hi = placements.reduce((m, p) => Math.max(m, p.startSlot + p.span), 0);
      return { minSlot: lo, slotCount: Math.max(1, hi - lo) };
    }, [placements]);

    const puById = useMemo(
      () => Object.fromEntries(data.play_units.map((pu) => [pu.id, pu])),
      [data.play_units],
    );

    const renderBlock = useCallback(
      (placement: Placement, box: GanttBlockBox) => {
        const puId = placement.key.replace(/^live-/, '');
        const pu = puById[puId];
        const eventId = pu?.event_id ?? 'GEN';
        const color = getEventColor(eventId);
        return (
          <div
            className={`h-full w-full rounded-sm border px-2 py-1 ${color.bg} ${color.border}`}
            style={{ width: box.width, height: box.height }}
          >
            <div className="text-2xs font-mono truncate">{puId}</div>
          </div>
        );
      },
      [puById],
    );

    if (placements.length === 0) {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          No draws generated yet — see the <strong>Events</strong> tab.
        </div>
      );
    }

    return (
      <div className="p-4">
        <GanttTimeline
          courts={courts}
          minSlot={minSlot}
          slotCount={slotCount}
          density="standard"
          placements={placements}
          renderBlock={renderBlock}
        />
      </div>
    );
  }
  ```

- [ ] Verify imports compile + tests pass before committing:
  - `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/LiveView.test.tsx`. Expected: 1 passed.
  - `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.

- [ ] Commit: `git commit -am "feat(bracket): rewrite LiveView as GanttTimeline consumer"`.

---

### B.2 — Chip state-ring vocabulary

**Files**
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`

**Steps**

- [ ] Append to `LiveView.test.tsx` a test asserting that for a result-row `state === 'finished'`, an assignment with `actual_start_slot != null && actual_end_slot == null && !result` shows `state === 'started'`, etc.

- [ ] Modify `LiveView.tsx` — extract a helper:

  ```tsx
  type ChipState = 'scheduled' | 'called' | 'started' | 'finished' | 'late';

  function deriveChipState(
    pu_id: string,
    data: BracketTournamentDTO,
    currentSlot: number,
  ): ChipState {
    const result = data.results.find((r) => r.play_unit_id === pu_id);
    const assignment = data.assignments.find((a) => a.play_unit_id === pu_id);
    if (result) return 'finished';
    if (assignment?.actual_start_slot != null) return 'started';
    // 'called' would map to a separate match-state — defer to the
    // existing matchStateStore if needed. For now use 'scheduled'.
    if (assignment && currentSlot >= assignment.slot_id + 1) return 'late';
    return 'scheduled';
  }
  ```

  Pull `currentSlot` from `useCurrentSlot()` (`frontend/src/hooks/useCurrentSlot.ts`).

  Wire `deriveChipState` into `renderBlock` and append a ring class (`ring-2 ring-status-called` / `ring-status-live` / etc.) based on the returned state.

- [ ] Verify imports compile + tests pass before committing.

- [ ] Commit: `git commit -am "feat(bracket): LiveView state-ring vocabulary (scheduled/called/started/finished/late)"`.

---

### B.3 — `MatchDetailPanel.tsx` right rail + click integration

**Files**
- Create: `products/scheduler/frontend/src/features/bracket/MatchDetailPanel.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/MatchDetailPanel.test.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketViewHeader.tsx`
- Modify: `products/scheduler/frontend/src/store/uiStore.ts`

**Steps**

- [ ] Modify `uiStore.ts` — ADD `bracketSelectedMatchId: string | null` + `setBracketSelectedMatchId: (id: string | null) => void`. Initialize to `null`.

- [ ] Modify `BracketViewHeader.tsx`:

  - Locate the `<select>` rendering the event picker (lines 55-66). Wrap with conditional rendering: render only when `view === 'draw'`. For `view === 'schedule' | 'live'`, render an inline `<EventsFilterStrip />` placeholder (the real component lands in C.2). For B.3 specifically, render nothing in place of the select (the filter strip arrives in C.2):

    ```tsx
    {view === 'draw' ? (
      <select ...>...</select>
    ) : null}
    ```

- [ ] Create `MatchDetailPanel.tsx`:

  ```tsx
  /**
   * Right rail for the Live tab. Shows the selected match's details +
   * operator actions (Call / Start / Record / Postpone).
   */
  import { useBracketApi } from '../../api/bracketClient';
  import type { BracketTournamentDTO } from '../../api/bracketDto';
  import { useUiStore } from '../../store/uiStore';
  import { Button } from '@scheduler/design-system';

  interface Props {
    data: BracketTournamentDTO;
    onChange: (t: BracketTournamentDTO) => void;
  }

  export function MatchDetailPanel({ data, onChange }: Props) {
    const api = useBracketApi();
    const matchId = useUiStore((s) => s.bracketSelectedMatchId);

    if (!matchId) {
      return (
        <aside className="w-72 border-l border-border p-4 text-sm text-muted-foreground">
          Select a match to see details.
        </aside>
      );
    }

    const pu = data.play_units.find((p) => p.id === matchId);
    const assignment = data.assignments.find((a) => a.play_unit_id === matchId);
    const result = data.results.find((r) => r.play_unit_id === matchId);

    if (!pu) {
      return (
        <aside className="w-72 border-l border-border p-4 text-sm text-muted-foreground">
          Match not found.
        </aside>
      );
    }

    const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
    const labelA = (pu.side_a ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';
    const labelB = (pu.side_b ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';

    return (
      <aside className="w-72 border-l border-border p-4 space-y-3">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{pu.id}</div>
        <div className="text-sm font-mono">
          {assignment ? `Court C${assignment.court_id} · slot ${assignment.slot_id}` : '—'}
        </div>
        <div className="space-y-1">
          <div className="text-sm">{labelA}</div>
          <div className="text-2xs uppercase tracking-wider text-muted-foreground">vs</div>
          <div className="text-sm">{labelB}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {assignment && !assignment.started && !result && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                onChange(await api.matchAction({ play_unit_id: matchId, action: 'start' }));
              }}
            >
              Start
            </Button>
          )}
          {assignment?.started && !result && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  onChange(await api.recordResult({
                    play_unit_id: matchId,
                    winner_side: 'A',
                    finished_at_slot: assignment.slot_id + assignment.duration_slots,
                  }));
                }}
              >
                A wins
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  onChange(await api.recordResult({
                    play_unit_id: matchId,
                    winner_side: 'B',
                    finished_at_slot: assignment.slot_id + assignment.duration_slots,
                  }));
                }}
              >
                B wins
              </Button>
            </>
          )}
        </div>
      </aside>
    );
  }
  ```

- [ ] Modify `LiveView.tsx` — wrap the GanttTimeline in a flex container with `<MatchDetailPanel />` on the right. Add chip onClick handler to set `bracketSelectedMatchId` in `useUiStore`.

- [ ] Add tests for `MatchDetailPanel.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { MatchDetailPanel } from '../../features/bracket/MatchDetailPanel';
  import { useUiStore } from '../../store/uiStore';

  describe('MatchDetailPanel', () => {
    it('renders empty state when no match selected', () => {
      useUiStore.setState({ bracketSelectedMatchId: null });
      render(<MatchDetailPanel data={{ /* empty stub */ } as any} onChange={() => {}} />);
      expect(screen.getByText(/Select a match/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Verify imports compile + tests pass before committing.

- [ ] Commit: `git commit -am "feat(bracket): MatchDetailPanel right rail + click integration"`.

---

### B.4 — End-to-end Phase B verify

**Steps**

- [ ] Run `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.
- [ ] Run `cd products/scheduler/frontend && npm run build`. Expected: build succeeds.
- [ ] Run `cd products/scheduler/frontend && npm run lint`. Expected: clean for files we touched.
- [ ] Run `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/LiveView.test.tsx src/lib/__tests__/MatchDetailPanel.test.tsx`. Expected: all pass.
- [ ] No commit (verification only).

---

## Phase C — #3 Schedule Gantt

### C.1 — `ScheduleView.tsx` display-only rewrite

**Files**
- Modify: `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/ScheduleView.test.tsx`

**Steps**

- [ ] Write failing test asserting empty-state CTA and populated chip count from `data.assignments`.

- [ ] Replace `ScheduleView.tsx` body with a `GanttTimeline` consumer mirroring B.1's `LiveView` but **without** the `onCellClick` handler, **without** the right rail, and with hover-only tooltip (`title={...}` on the chip). Use `getEventColor(pu.event_id)` for chip colour. Source: `data.assignments` filtered to events where `status === 'generated' | 'started'` (when status is exposed) — for now, simply consume all `data.assignments` since drafts contribute none.

- [ ] Verify imports compile + tests pass before committing.

- [ ] Commit: `git commit -am "feat(bracket): rewrite ScheduleView as display-only GanttTimeline"`.

---

### C.2 — `EventsFilterStrip.tsx` + conditional header rendering

**Files**
- Create: `products/scheduler/frontend/src/features/bracket/EventsFilterStrip.tsx`
- Create: `products/scheduler/frontend/src/lib/__tests__/EventsFilterStrip.test.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/BracketViewHeader.tsx`
- Modify: `products/scheduler/frontend/src/store/uiStore.ts`

**Steps**

- [ ] Modify `uiStore.ts` — ADD `bracketScheduleEventFilter: Record<string, boolean>` + setter. Default `{}` (empty = all on).

- [ ] Create `EventsFilterStrip.tsx`:

  ```tsx
  /**
   * Per-event toggle strip rendered in BracketViewHeader on view=schedule|live.
   * Toggles dim non-selected events' chips (highlight/dim, not hard filter).
   */
  import { useBracket } from '../../hooks/useBracket';
  import { useUiStore } from '../../store/uiStore';

  export function EventsFilterStrip() {
    const { data } = useBracket();
    const filter = useUiStore((s) => s.bracketScheduleEventFilter);
    const setFilter = useUiStore((s) => s.setBracketScheduleEventFilter);

    if (!data) return null;
    return (
      <div className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider">
        <span className="text-muted-foreground mr-2">EVENTS:</span>
        {data.events.map((ev) => {
          const on = filter[ev.id] !== false;
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => setFilter({ ...filter, [ev.id]: !on })}
              className={`px-2 py-0.5 rounded-sm border ${
                on
                  ? 'border-border bg-bg-elev'
                  : 'border-border bg-muted/30 opacity-50'
              }`}
            >
              {on ? '☐' : '☐'} {ev.id}
            </button>
          );
        })}
      </div>
    );
  }
  ```

- [ ] Modify `BracketViewHeader.tsx` — render `<EventsFilterStrip />` for `view === 'schedule' | 'live'`, the existing `<select>` for `view === 'draw'`.

- [ ] Modify `ScheduleView.tsx` and `LiveView.tsx` — when computing `placements`, dim chips that match `filter[ev.id] === false` (e.g. by setting `opacity-50` in `renderBlock`).

- [ ] Write tests in `EventsFilterStrip.test.tsx`: toggling writes to `useUiStore.bracketScheduleEventFilter`; renders one button per event.

- [ ] Verify imports compile + tests pass before committing.

- [ ] Commit: `git commit -am "feat(bracket): EventsFilterStrip on Schedule + Live"`.

---

### C.3 — End-to-end Phase C verify

- [ ] Run `cd products/scheduler/frontend && npx tsc -b --noEmit`. Expected: exit 0.
- [ ] Run `cd products/scheduler/frontend && npm run build`. Expected: build succeeds.
- [ ] Run `cd products/scheduler/frontend && npm run lint`. Expected: clean for our files.
- [ ] Run `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/`. Expected: all pass.
- [ ] No commit (verification only).

---

## End-to-end verification

Run after all three phases land. Every line must pass:

- [ ] `cd products/scheduler/frontend && npx tsc -b --noEmit` — exit 0.
- [ ] `npm run build:scheduler` from the repo root — build succeeds.
- [ ] `npm run lint:scheduler` from the repo root — no lint errors in files this plan touches.
- [ ] `.venv/bin/python -m pytest products/scheduler/tests/unit/test_bracket_event_status.py products/scheduler/tests/unit/test_bracket_player_dto.py products/scheduler/tests/unit/test_generate_event.py products/scheduler/tests/unit/test_bracket_event_routes.py products/scheduler/tests/unit/test_bracket_routes.py products/scheduler/tests/unit/test_bracket_interactive_scheduling.py` — all pass. (#1's interactive-scheduling tests must STILL pass; the new generate_event path should not break repin_and_resolve.)
- [ ] `cd products/scheduler/frontend && npx vitest run src/lib/__tests__/` — all our new tests pass; existing `bracketTabs.test.ts`, `commandQueue.test.ts`, `ganttTimeline.test.ts` still pass.
- [ ] `grep -rn "SetupForm\|setupForm/helpers\|setupForm/EventEditor" products/scheduler/frontend/src/` — no matches.
- [ ] `grep -rn "<table" products/scheduler/frontend/src/features/bracket/ScheduleView.tsx products/scheduler/frontend/src/features/bracket/LiveView.tsx` — no matches (both are GanttTimeline consumers now).

---

## Self-review

**Spec coverage:**
- §1 The six bracket tabs → A.5 (bracketTabs ids), A.6 (Setup), A.7 (Roster), A.8 (Events), A.9 (Draw simplify), C.1 (Schedule), B.1+B.2+B.3 (Live). All six tabs touched.
- §2 Backend changes → A.1 (status column), A.2 (DTOs + camelCase hydration), A.3 (generate_event), A.4 (3 routes + status writes).
- §3 Frontend changes → tabs ids (A.5), SetupTab (A.6), RosterTab (A.7), EventsTab (A.8), SetupForm deletion (A.9), DrawView simplify (A.9), ScheduleView rewrite (C.1), LiveView rewrite (B.1-B.3), bracketClient + bracketDto extension (A.8). The spec mentions extracting `<SectionedForm>`; per Decision 7 we deliberately skipped that.
- §4 Migration → A.9 (`bracketMigration.ts` + first-load reconcile in `BracketTab.tsx`).
- §5 Validate↔pin contract carry-over → no code change; A.1-A.4 don't break #1's tests (see end-to-end verify gate).
- §6 Testing → 1 backend test per A.1/A.2/A.3/A.4 + 1 frontend test per new component (A.6/A.7/A.8/A.9/B.1/B.3/C.1/C.2).

**Placeholder scan:** No `TODO`, `TBD`, `add validation later` strings. Where backend repo methods don't exist (e.g. `set_event_status`), the plan flags it as a new method the executor must add — not a placeholder.

**Type consistency:**
- `BracketPlayerDTO` matches across A.2 (Python schemas.py), A.2 (frontend dto.ts), and consumers in A.7/A.8/A.9.
- `bracket_events.status` is `Literal['draft','generated','started']` in Pydantic (A.2/A.4), `String(20)` in SQLAlchemy (A.1), and `BracketEventStatus` union in frontend (A.8).
- Route paths: `/tournaments/{tid}/state` is PUT (Decision 5 verified at `backend/api/tournaments.py:309-310`). Bracket-event routes are `POST /tournaments/{tid}/bracket/events/{event_id}`, `POST .../generate`, `DELETE .../events/{event_id}` — match between A.4 backend handlers and A.8 frontend client methods.

**Honest flags for the executor:**
1. **`set_event_status` and `get_event` and `status=` kwarg on `create_event` are NEW repo methods**. The executor must add them to `backend/repositories/brackets.py` (or wherever the bracket repo lives). I haven't verified the exact module path — grep `from repositories import` to find it.
2. **Spec drift on `RosterTab.tsx` vs `BracketRosterTab.tsx`**: spec table calls it `RosterTab.tsx`, but the meet feature already exports `RosterTab` from `features/roster/RosterTab.tsx`. Plan uses `BracketRosterTab.tsx` to avoid the collision. Flag the rename in the commit message.
3. **`useBracket` hook needs to be accessible from `BracketRosterTab.tsx`** which sits outside the `BracketApiProvider` in the empty-data branch — but the plan keeps `BracketRosterTab` inside `BracketTabBody` so it IS inside the provider. Verify the import path `../../hooks/useBracket` resolves; if not, the hook may need extracting.
4. **Frontend test file location**: Decision 15 honoured (all new vitest tests under `lib/__tests__/`). Component tests for TSX files live there too, even though they import from `features/bracket/`. This is a deliberate consistency choice — the alternative is updating `vitest.config.ts` to include component tests near their components.
5. **`playerSlug` import-order between A.7 and A.9**: A.7 initially imports `playerSlug` from `../setupForm/helpers`; A.9 re-homes the function to `lib/playerSlug.ts` and updates A.7's import. Order matters — A.9 cannot be skipped or A.7's import breaks. Executor should verify the import path is updated in `BracketRosterTab.tsx` when running A.9's final grep.
6. **Spec said `_hydrate_session` lives in `services/bracket/scheduler.py`**; verified it actually lives in `backend/api/brackets.py` (around line 307). Decision 1 is correct; the spec was approximate.
7. **`pip install sqlalchemy` if pytest fails on sqlalchemy import** — Decision 14 acknowledges the pre-existing venv gap.
8. **Default landing tab snapped to `bracket-setup`** in A.5 (instead of `bracket-draw`). This changes the user's first-visit experience; flag in the PR description so reviewers expect the new default.
9. **`bracket_events.status` writes from `record_match_result`**: I didn't grep for the exact handler name; A.4 says "search for `@router.post("/results"` or `record_bracket_result`". Executor must find the real symbol; if neither exists, the wire-up is the `RecordResultIn` handler that already exists in `brackets.py`.

---

## Open follow-ups

- The bracket Live tab still lacks the meet's full state vocabulary (impacted, postponed, resting, traffic-light). Tracked as out-of-scope per spec non-goals.
- Cross-tournament court sharing (meet ↔ bracket) deferred per spec non-goals. `previous_assignments` infrastructure from A.3 makes this cheap to add later — extend the `generate_event` lock set to include the meet schedule's `bracket_matches`-equivalent.
- Spec mentioned a `<SectionedForm>` primitive extraction; deliberately deferred (Decision 7). If a future task wants the form chrome reused for, e.g., a Settings revision, lifting `SetupTab.tsx`'s sections + `Field` helper is a 1-hour task.
- Bracket TV / public display surface is out-of-scope per spec; the meet's `tvDisplayMode` config still lives on `TournamentConfig` and is harmless for bracket-kind tournaments.
- Visual sweep (browser harness) gated on Chrome remote-debugging availability — flag in PR description; if reviewer has Chrome up, ask them to verify the new tabs in light + dark.
- `useBracket` polls every 2.5s; the first-load migration effect in A.9 fires once per poll if `bracketRosterMigrated` flag write loses a race with another tab. Mitigation: `bracketRosterMigrated` flag is persisted server-side via `useTournamentState`, so the second poll sees it true. If race becomes a real bug, add a per-tournament-id local in-memory guard.