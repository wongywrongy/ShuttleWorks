# SP-A — Control-Plane Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workspace create persist an explicit module seed, and give every workspace summary a server-computed `signals` object (health, coded attention, per-kind readiness, module + collaboration counts), with zero per-row N+1.

**Architecture:** Pure helpers in `database/models.py` (dependency rule + seed normalization), grouped `*_by_tournament(ids)` count helpers on the repositories, a pure `build_signals(row, modules, counts)` builder in a new `api/workspace_signals.py`, and thin wiring in `api/tournaments.py` (create accepts `modules[]`; list/get compute the 6 grouped maps once and slice per row). `api/workspace_modules.py` PATCH switches to the shared dependency rule.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 (`select`/`func.count`/`group_by`), Pydantic v2, pytest + FastAPI `TestClient`.

## Global Constraints

- Branch `dev/workspace-suite`. Backend-only — no frontend, no new routes, no route-path changes.
- `kind` is preserved as legacy compatibility; no new `kind` literals (create still validates `kind in {meet, bracket}`).
- Module status vocabulary is exactly `enabled | available | disabled | coming_soon` (`MODULE_STATUSES` in `database/models.py`). Module ids exactly `meet | bracket | display` (`MODULE_IDS`). Operational (data-producing) modules: `meet | bracket` (`OPERATIONAL_MODULES`).
- Display dependency rule (verbatim intent): `display` may be `enabled` only if `meet` or `bracket` is `enabled`.
- "Active invite" = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)` — must match the frontend `inviteStatus.ts`.
- Signals add **no per-row DB round-trip** beyond a fixed set of **6 grouped queries** (members, active-invites, bracket events/matches/results, match-states). Meet `configured`/`roster`/`scheduled` read the already-loaded `Tournament.data` blob (zero queries).
- `signals` is always populated by the backend; the DTO field is typed `Optional` for frontend resilience.
- No data-lossy behavior. Backend suite stays green (currently 489 pass / 1 pre-existing psycopg2 `test_config` skip).
- Run tests from `products/scheduler`: `python3 -m pytest <path> -v`.

---

### Task 1: Shared Display-dependency rule + PATCH refactor

Extract the inline display-dependency check from the PATCH handler into one reusable pure function, and make PATCH call it. No behavior change.

**Files:**
- Modify: `products/scheduler/backend/database/models.py` (add function next to `derive_modules`, ~line 645)
- Modify: `products/scheduler/backend/api/workspace_modules.py:155-165` (the `if new_status == "enabled" and module_id == "display":` block)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py` (add unit test for the function)

**Interfaces:**
- Produces: `display_dependency_satisfied(statuses: dict[str, str]) -> bool` in `database.models` — returns `True` unless `display` is `enabled` while no operational module is `enabled`.

- [ ] **Step 1: Write the failing test**

Add to `products/scheduler/tests/unit/test_workspace_modules.py`:

```python
from database.models import display_dependency_satisfied


def test_display_dependency_satisfied_rule():
    # Display not enabled → always satisfied.
    assert display_dependency_satisfied({"meet": "available", "display": "available"}) is True
    assert display_dependency_satisfied({"meet": "disabled", "display": "disabled"}) is True
    # Display enabled with an enabled operator → satisfied.
    assert display_dependency_satisfied({"meet": "enabled", "display": "enabled"}) is True
    assert display_dependency_satisfied({"bracket": "enabled", "display": "enabled"}) is True
    # Display enabled with no enabled operator → violated.
    assert display_dependency_satisfied({"meet": "available", "bracket": "disabled", "display": "enabled"}) is False
    assert display_dependency_satisfied({"display": "enabled"}) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_display_dependency_satisfied_rule -v`
Expected: FAIL with `ImportError: cannot import name 'display_dependency_satisfied'`.

- [ ] **Step 3: Add the function**

In `products/scheduler/backend/database/models.py`, immediately after `derive_modules` (after its `return {...}` for the meet shape):

```python
def display_dependency_satisfied(statuses: dict[str, str]) -> bool:
    """Whether the Display-dependency rule holds for a module status map.

    ``display`` may be ``enabled`` only if a data-producing (operational)
    module — ``meet`` or ``bracket`` — is also ``enabled``. Returns ``True``
    whenever ``display`` is not ``enabled`` (the rule is vacuously satisfied).
    Shared by the create-seed validation and the PATCH handler so the rule
    lives in exactly one place.
    """
    if statuses.get("display") != "enabled":
        return True
    return any(statuses.get(m) == "enabled" for m in OPERATIONAL_MODULES)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_display_dependency_satisfied_rule -v`
Expected: PASS.

- [ ] **Step 5: Refactor PATCH to use it**

In `products/scheduler/backend/api/workspace_modules.py`, replace the display block inside `patch_module`:

```python
        if new_status == "enabled" and module_id == "display":
            has_operator = any(
                m.module_id in OPERATIONAL_MODULES and m.status == "enabled"
                for m in modules
            )
            if not has_operator:
                raise http_error(
                    409,
                    ErrorCode.MODULE_DEPENDENCY_UNMET,
                    "enabling display requires an enabled operational module",
                )
```

with (build the post-transition status map, then call the shared rule):

```python
        if new_status == "enabled" and module_id == "display":
            statuses = {m.module_id: m.status for m in modules}
            statuses["display"] = "enabled"
            if not display_dependency_satisfied(statuses):
                raise http_error(
                    409,
                    ErrorCode.MODULE_DEPENDENCY_UNMET,
                    "enabling display requires an enabled operational module",
                )
```

And add `display_dependency_satisfied` to the existing `from database.models import (...)` block (which already imports `MODULE_STATUSES`, `OPERATIONAL_MODULES`, `WorkspaceModule`).

- [ ] **Step 6: Run the workspace-modules suite to verify no regression**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -v`
Expected: PASS (all existing cases + the new one). The display-dependency 409 case still passes through the shared function.

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/backend/database/models.py products/scheduler/backend/api/workspace_modules.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "refactor(modules): extract shared display_dependency_satisfied rule"
```

---

### Task 2: `normalize_module_seed` pure helper

A pure function that takes the create endpoint's optional `modules[]` seed, backfills the missing modules to a well-formed full set, and validates structure (unknown id, duplicate id, bad status). Raises `ValueError` on malformed input; the API layer (Task 4) translates that to a 400. The display-dependency check is applied by the caller via Task 1's function (kept separate so this helper stays purely structural).

**Files:**
- Modify: `products/scheduler/backend/database/models.py` (add after `display_dependency_satisfied`)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

**Interfaces:**
- Consumes: `MODULE_IDS`, `MODULE_STATUSES`, `OPERATIONAL_MODULES` (already in `database.models`).
- Produces: `normalize_module_seed(seeds: list[dict]) -> list[dict]` in `database.models`. Each input dict has keys `moduleId: str`, `status: str`, optional `config: dict | None`. Returns an ordered list (by `MODULE_IDS`) of dicts `{"module_id": str, "status": str, "config": dict | None}` covering all three modules. Raises `ValueError` for unknown/duplicate `moduleId` or invalid `status`.

- [ ] **Step 1: Write the failing tests**

Add to `products/scheduler/tests/unit/test_workspace_modules.py`:

```python
import pytest
from database.models import normalize_module_seed


def _as_map(rows):
    return {r["module_id"]: r["status"] for r in rows}


def test_normalize_seed_meet_day_template():
    rows = normalize_module_seed([
        {"moduleId": "meet", "status": "enabled"},
        {"moduleId": "display", "status": "enabled"},
        {"moduleId": "bracket", "status": "available"},
    ])
    assert _as_map(rows) == {"meet": "enabled", "display": "enabled", "bracket": "available"}
    # Ordered by MODULE_IDS = (meet, bracket, display).
    assert [r["module_id"] for r in rows] == ["meet", "bracket", "display"]


def test_normalize_seed_backfills_missing_modules():
    # Only bracket named; meet/display backfilled. Display backfills to
    # coming_soon because no operational module is enabled.
    rows = normalize_module_seed([{"moduleId": "bracket", "status": "enabled"}])
    assert _as_map(rows) == {"bracket": "enabled", "meet": "available", "display": "coming_soon"}


def test_normalize_seed_backfills_display_available_when_operator_enabled():
    rows = normalize_module_seed([{"moduleId": "meet", "status": "enabled"}])
    assert _as_map(rows)["display"] == "available"


def test_normalize_seed_preserves_config():
    rows = normalize_module_seed([{"moduleId": "meet", "status": "enabled", "config": {"x": 1}}])
    meet = next(r for r in rows if r["module_id"] == "meet")
    assert meet["config"] == {"x": 1}


def test_normalize_seed_rejects_unknown_module():
    with pytest.raises(ValueError):
        normalize_module_seed([{"moduleId": "scoreboard", "status": "enabled"}])


def test_normalize_seed_rejects_duplicate_module():
    with pytest.raises(ValueError):
        normalize_module_seed([
            {"moduleId": "meet", "status": "enabled"},
            {"moduleId": "meet", "status": "available"},
        ])


def test_normalize_seed_rejects_bad_status():
    with pytest.raises(ValueError):
        normalize_module_seed([{"moduleId": "meet", "status": "on"}])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k normalize_seed -v`
Expected: FAIL with `ImportError: cannot import name 'normalize_module_seed'`.

- [ ] **Step 3: Add the function**

In `products/scheduler/backend/database/models.py`, after `display_dependency_satisfied`:

```python
def normalize_module_seed(seeds: list[dict]) -> list[dict]:
    """Validate and complete an explicit create-time module seed.

    ``seeds`` is the create endpoint's optional ``modules[]`` — each item a
    dict with ``moduleId``, ``status``, and optional ``config``. Validates
    structure (known id, no duplicates, valid status), backfills any of the
    three modules not named, and returns an ordered (by ``MODULE_IDS``) list
    of ``{"module_id", "status", "config"}`` rows ready to persist.

    Backfill: an unnamed ``meet`` / ``bracket`` becomes ``available``; an
    unnamed ``display`` becomes ``available`` only if ``meet`` is enabled in
    the named set, else ``coming_soon`` (display is a meet-specific surface;
    bracket-display is not built yet — matching ``derive_modules``). Raises
    ``ValueError`` on malformed input; the caller maps that to a 400 and
    separately applies ``display_dependency_satisfied``.
    """
    named: dict[str, dict] = {}
    for item in seeds:
        module_id = item.get("moduleId")
        status = item.get("status")
        if module_id not in MODULE_IDS:
            raise ValueError(f"unknown moduleId: {module_id!r}")
        if module_id in named:
            raise ValueError(f"duplicate moduleId: {module_id!r}")
        if status not in MODULE_STATUSES:
            raise ValueError(f"invalid status: {status!r}")
        named[module_id] = {
            "module_id": module_id,
            "status": status,
            "config": item.get("config"),
        }

    # display is a meet-specific surface — gated on meet, NOT OPERATIONAL_MODULES
    # (bracket-display is coming_soon / not built; matches derive_modules).
    meet_enabled = named.get("meet", {}).get("status") == "enabled"
    rows: list[dict] = []
    for module_id in MODULE_IDS:
        if module_id in named:
            rows.append(named[module_id])
        elif module_id == "display":
            rows.append({
                "module_id": "display",
                "status": "available" if meet_enabled else "coming_soon",
                "config": None,
            })
        else:
            rows.append({"module_id": module_id, "status": "available", "config": None})
    return rows
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k normalize_seed -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/database/models.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(modules): normalize_module_seed — validate + backfill create-time seeds"
```

---

### Task 3: `seed_modules` repository method

Persist a normalized seed as `workspace_modules` rows for a freshly-created tournament.

**Files:**
- Modify: `products/scheduler/backend/repositories/local.py` (add method to `_LocalModuleRepo`, after `update`, ~line 1200)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

**Interfaces:**
- Consumes: normalized rows from `normalize_module_seed` (`{"module_id", "status", "config"}`).
- Produces: `_LocalModuleRepo.seed_modules(tournament: Tournament, rows: list[dict]) -> list[WorkspaceModule]` — inserts one `WorkspaceModule` per row, commits, returns them ordered by `module_id`. Because it inserts rows, the later `ensure_modules` call is a no-op (it only seeds when zero rows exist).

- [ ] **Step 1: Write the failing test**

Add to `products/scheduler/tests/unit/test_workspace_modules.py` (uses the existing `client`/`tid` fixtures and `open_repository`):

```python
def test_seed_modules_persists_explicit_set(client, tid):
    from repositories import open_repository
    from database.models import normalize_module_seed

    rows = normalize_module_seed([
        {"moduleId": "meet", "status": "enabled"},
        {"moduleId": "display", "status": "enabled"},
        {"moduleId": "bracket", "status": "available"},
    ])
    # Use a SECOND fresh tournament whose modules have not been seeded yet.
    r = client.post("/tournaments", json={"name": "Seeded"})
    new_id = r.json()["id"]
    with open_repository() as repo:
        import uuid as _uuid
        t = repo.tournaments.get_by_id(_uuid.UUID(new_id))
        seeded = repo.modules.seed_modules(t, rows)
        assert {m.module_id: m.status for m in seeded} == {
            "meet": "enabled", "display": "enabled", "bracket": "available",
        }
        # ensure_modules is now a no-op (rows already exist).
        again = repo.modules.ensure_modules(t)
        assert {m.module_id: m.status for m in again} == {
            "meet": "enabled", "display": "enabled", "bracket": "available",
        }
```

Note: the create endpoint currently auto-seeds modules only when something reads them; a freshly POSTed tournament whose modules summary was returned will already have rows. To test `seed_modules` against an unseeded workspace, this test seeds via the repo directly on a new id before any module read. If `_to_summary` in create already triggered `_modules_for`, this test will instead assert seed_modules raises or replaces — see Step 3's idempotency note; adjust the test to create the row, not POST, if needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_seed_modules_persists_explicit_set -v`
Expected: FAIL with `AttributeError: '_LocalModuleRepo' object has no attribute 'seed_modules'`.

- [ ] **Step 3: Add the method**

In `products/scheduler/backend/repositories/local.py`, inside `_LocalModuleRepo`, after `update` (before `count_matches`):

```python
    def seed_modules(
        self,
        tournament: Tournament,
        rows: list[dict],
    ) -> list[WorkspaceModule]:
        """Persist an explicit, normalized module seed for a new workspace.

        ``rows`` are the output of ``normalize_module_seed`` —
        ``{"module_id", "status", "config"}`` covering all three modules.
        Inserts one row per module and commits; because rows now exist,
        a later ``ensure_modules`` is a no-op. Intended for create-time
        seeding of a workspace that has no module rows yet; if rows already
        exist this would violate the unique ``(tournament_id, module_id)``
        constraint, so callers must seed before any module read.
        """
        for row in rows:
            self.session.add(
                WorkspaceModule(
                    tournament_id=tournament.id,
                    module_id=row["module_id"],
                    status=row["status"],
                    config=row.get("config"),
                )
            )
        self.session.flush()
        self.session.commit()
        return self._rows_for(tournament.id)
```

Idempotency note: `seed_modules` assumes no existing rows. Task 4 calls it on the create path *before* `_modules_for` runs, so this holds. If the test in Step 1 hits a pre-seeded row (because create already read modules), change it to construct the tournament row via `repo.tournaments.create(...)` directly instead of POSTing.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_seed_modules_persists_explicit_set -v`
Expected: PASS. If it fails on a unique-constraint error, apply the Step-3 idempotency note (build the tournament via `repo.tournaments.create`, not the HTTP POST) and re-run.

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/repositories/local.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(modules): seed_modules repo method for create-time module seeds"
```

---

### Task 4: Create endpoint accepts `modules[]`

Wire the seed into `POST /tournaments`: add the DTO field, normalize + dependency-check + seed before `_modules_for`.

**Files:**
- Modify: `products/scheduler/backend/api/tournaments.py` (DTO ~line 72; `create_tournament` ~line 187-243)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py`

**Interfaces:**
- Consumes: `normalize_module_seed`, `display_dependency_satisfied` (from `database.models`), `repo.modules.seed_modules` (Task 3).
- Produces: `POST /tournaments` accepts optional `modules: [{moduleId, status, config?}]`; persists the validated+backfilled set; the returned summary's `modules[]` reflects the seed. Malformed seed → 400 `VALIDATION_FAILED`.

- [ ] **Step 1: Write the failing tests**

Add to `products/scheduler/tests/unit/test_workspace_modules.py`:

```python
def _modules_map(body) -> dict:
    return {m["moduleId"]: m["status"] for m in body["modules"]}


def test_create_with_hybrid_seed_persists_all_enabled(client):
    r = client.post("/tournaments", json={
        "name": "Hybrid", "kind": "meet",
        "modules": [
            {"moduleId": "meet", "status": "enabled"},
            {"moduleId": "bracket", "status": "enabled"},
            {"moduleId": "display", "status": "enabled"},
        ],
    })
    assert r.status_code == 201, r.text
    assert _modules_map(r.json()) == {"meet": "enabled", "bracket": "enabled", "display": "enabled"}
    # Persisted: a re-list shows the same set.
    listed = next(t for t in client.get("/tournaments").json() if t["id"] == r.json()["id"])
    assert _modules_map(listed) == {"meet": "enabled", "bracket": "enabled", "display": "enabled"}


def test_create_with_blank_seed_all_available(client):
    r = client.post("/tournaments", json={
        "name": "Blank", "kind": "meet",
        "modules": [
            {"moduleId": "meet", "status": "available"},
            {"moduleId": "bracket", "status": "available"},
            {"moduleId": "display", "status": "disabled"},
        ],
    })
    assert r.status_code == 201, r.text
    assert _modules_map(r.json()) == {"meet": "available", "bracket": "available", "display": "disabled"}


def test_create_with_partial_seed_backfills(client):
    r = client.post("/tournaments", json={
        "name": "Partial", "modules": [{"moduleId": "bracket", "status": "enabled"}],
    })
    assert r.status_code == 201, r.text
    assert _modules_map(r.json()) == {"bracket": "enabled", "meet": "available", "display": "coming_soon"}


def test_create_seed_rejects_unknown_module(client):
    r = client.post("/tournaments", json={
        "name": "Bad", "modules": [{"moduleId": "scoreboard", "status": "enabled"}],
    })
    assert r.status_code == 400


def test_create_seed_rejects_display_without_source(client):
    r = client.post("/tournaments", json={
        "name": "BadDisplay",
        "modules": [
            {"moduleId": "meet", "status": "available"},
            {"moduleId": "bracket", "status": "available"},
            {"moduleId": "display", "status": "enabled"},
        ],
    })
    assert r.status_code == 400


def test_create_without_seed_unchanged(client):
    r = client.post("/tournaments", json={"name": "Legacy", "kind": "bracket"})
    assert r.status_code == 201
    # kind-derived seed: bracket enabled, others coming_soon.
    assert _modules_map(r.json()) == {"bracket": "enabled", "display": "coming_soon", "meet": "coming_soon"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "create_with or create_seed or create_without_seed" -v`
Expected: FAIL — the create endpoint ignores `modules` (extra field), so seed tests assert wrong module maps / no 400.

- [ ] **Step 3: Add the DTO field**

In `products/scheduler/backend/api/tournaments.py`, add the seed DTO above `TournamentCreateDTO` and the field on it:

```python
class WorkspaceModuleSeedDTO(BaseModel):
    moduleId: str = Field(max_length=20)
    status: str = Field(max_length=20)
    config: Optional[dict] = None


class TournamentCreateDTO(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    kind: str = Field(default="meet", max_length=20)
    tournamentDate: Optional[str] = Field(default=None, max_length=32)
    modules: Optional[List[WorkspaceModuleSeedDTO]] = None
```

- [ ] **Step 4: Wire create_tournament**

In `create_tournament`, after the member is added and **before** the `if body.name or body.tournamentDate:` seeded-config block, insert the module-seed handling. Add the imports at the top of the file: `from database.models import normalize_module_seed, display_dependency_satisfied`.

```python
    if user_uuid is not None:
        repo.members.add_member(row.id, user_uuid, role="owner")

    # Explicit module seed (control-plane templates / custom create). When
    # present, validate + backfill, enforce the display dependency, and
    # persist before any module read so ensure_modules is a no-op.
    if body.modules is not None:
        try:
            seed_rows = normalize_module_seed([m.model_dump() for m in body.modules])
        except ValueError as exc:
            raise http_error(400, ErrorCode.VALIDATION_FAILED, str(exc))
        statuses = {r["module_id"]: r["status"] for r in seed_rows}
        if not display_dependency_satisfied(statuses):
            raise http_error(
                400,
                ErrorCode.VALIDATION_FAILED,
                "display may be enabled only with an enabled operational module",
            )
        repo.modules.seed_modules(row, seed_rows)
```

The final `return _to_summary(row, role="owner", modules=_modules_for(row, repo))` is unchanged — `_modules_for` → `ensure_modules` now returns the seeded rows.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "create_with or create_seed or create_without_seed" -v`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full workspace-modules + tournaments suites**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py tests/test_tournaments.py -v`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add products/scheduler/backend/api/tournaments.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(tournaments): accept explicit modules[] seed on create"
```

---

### Task 5: Grouped count repository helpers

Add the six grouped `*_by_tournament(ids)` count helpers that feed signals — one `GROUP BY` query each, returning `{tournament_id: count}`.

**Files:**
- Modify: `products/scheduler/backend/repositories/local.py` (`_LocalMemberRepo`, `_LocalInviteLinkRepo`, `_LocalBracketRepo`, `_LocalMatchStateRepo`)
- Test: `products/scheduler/tests/unit/test_repositories.py`

**Interfaces:**
- Produces, each `(ids: list[uuid.UUID]) -> dict[uuid.UUID, int]`, returning `{}` for empty `ids` and omitting tournaments with zero rows:
  - `_LocalMemberRepo.count_by_tournament`
  - `_LocalInviteLinkRepo.count_active_by_tournament` (active = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)`)
  - `_LocalBracketRepo.count_events_by_tournament`
  - `_LocalBracketRepo.count_matches_by_tournament`
  - `_LocalBracketRepo.count_results_by_tournament`
  - `_LocalMatchStateRepo.count_by_tournament`

- [ ] **Step 1: Write the failing tests**

Add to `products/scheduler/tests/unit/test_repositories.py` (this file already constructs repos against an isolated DB — follow its existing fixture; the snippet below uses `open_repository` + direct model inserts, matching the workspace-modules staging idiom). Confirm the file's existing import style and reuse it.

```python
import uuid
from datetime import datetime, timedelta, timezone


def test_count_by_tournament_helpers(tmp_path, monkeypatch):
    from _helpers import isolate_test_database
    isolate_test_database(tmp_path, monkeypatch)
    from repositories import open_repository
    from database.models import (
        Tournament, TournamentMember, InviteLink, BracketEvent,
        BracketMatch, BracketResult, MatchState,
    )

    now = datetime.now(timezone.utc)
    with open_repository() as repo:
        s = repo.session
        t1 = repo.tournaments.create(name="A", kind="meet", tournament_date=None,
                                     owner_id=uuid.uuid4(), owner_email="a@x.io")
        t2 = repo.tournaments.create(name="B", kind="bracket", tournament_date=None,
                                     owner_id=uuid.uuid4(), owner_email="b@x.io")
        # Members: 2 on t1, 0 on t2.
        s.add(TournamentMember(tournament_id=t1.id, user_id=uuid.uuid4(), role="owner"))
        s.add(TournamentMember(tournament_id=t1.id, user_id=uuid.uuid4(), role="viewer"))
        # Invites on t1: 1 active, 1 revoked, 1 expired → active count 1.
        s.add(InviteLink(tournament_id=t1.id, role="operator", created_by=uuid.uuid4()))
        s.add(InviteLink(tournament_id=t1.id, role="viewer", created_by=uuid.uuid4(),
                         revoked_at=now))
        s.add(InviteLink(tournament_id=t1.id, role="viewer", created_by=uuid.uuid4(),
                         expires_at=now - timedelta(days=1)))
        # Bracket data on t2.
        s.add(BracketEvent(tournament_id=t2.id, id="E1", name="Men's Singles", status="DRAFT"))
        s.commit()

        ids = [t1.id, t2.id]
        assert repo.members.count_by_tournament(ids) == {t1.id: 2}
        assert repo.invite_links.count_active_by_tournament(ids) == {t1.id: 1}
        assert repo.brackets.count_events_by_tournament(ids) == {t2.id: 1}
        assert repo.members.count_by_tournament([]) == {}
```

Note: `BracketEvent` requires whatever non-null columns the model defines — if its constructor needs more than `tournament_id`/`id`/`name`/`status`, mirror the inserts used in `tests/unit/test_bracket_repository.py` (read that file for the exact column set) rather than guessing. The point of the test is the grouped-count behavior; keep the row inserts minimal-but-valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/unit/test_repositories.py::test_count_by_tournament_helpers -v`
Expected: FAIL with `AttributeError: ... has no attribute 'count_by_tournament'`.

- [ ] **Step 3: Add member + match-state helpers**

In `products/scheduler/backend/repositories/local.py`, add to `_LocalMemberRepo`:

```python
    def count_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: member_count}`` for the given ids, one grouped
        query. Omits ids with zero members; returns ``{}`` for empty input."""
        if not tournament_ids:
            return {}
        rows = self.session.execute(
            select(TournamentMember.tournament_id, func.count())
            .where(TournamentMember.tournament_id.in_(tournament_ids))
            .group_by(TournamentMember.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}
```

Add to `_LocalMatchStateRepo`:

```python
    def count_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: match_state_count}`` — one grouped query. Used as
        the meet 'results entered' signal."""
        if not tournament_ids:
            return {}
        rows = self.session.execute(
            select(MatchState.tournament_id, func.count())
            .where(MatchState.tournament_id.in_(tournament_ids))
            .group_by(MatchState.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}
```

- [ ] **Step 4: Add invite + bracket helpers**

Add to `_LocalInviteLinkRepo`:

```python
    def count_active_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: active_invite_count}`` — one grouped query.
        Active = not revoked AND not expired (matches the frontend
        ``inviteStatus``)."""
        if not tournament_ids:
            return {}
        now = datetime.now(timezone.utc)
        rows = self.session.execute(
            select(InviteLink.tournament_id, func.count())
            .where(
                InviteLink.tournament_id.in_(tournament_ids),
                InviteLink.revoked_at.is_(None),
                or_(InviteLink.expires_at.is_(None), InviteLink.expires_at > now),
            )
            .group_by(InviteLink.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}
```

Add to `_LocalBracketRepo`:

```python
    def count_events_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: bracket_event_count}`` — one grouped query."""
        if not tournament_ids:
            return {}
        rows = self.session.execute(
            select(BracketEvent.tournament_id, func.count())
            .where(BracketEvent.tournament_id.in_(tournament_ids))
            .group_by(BracketEvent.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}

    def count_matches_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: bracket_match_count}`` — one grouped query."""
        if not tournament_ids:
            return {}
        rows = self.session.execute(
            select(BracketMatch.tournament_id, func.count())
            .where(BracketMatch.tournament_id.in_(tournament_ids))
            .group_by(BracketMatch.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}

    def count_results_by_tournament(
        self, tournament_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        """``{tournament_id: bracket_result_count}`` — one grouped query."""
        if not tournament_ids:
            return {}
        rows = self.session.execute(
            select(BracketResult.tournament_id, func.count())
            .where(BracketResult.tournament_id.in_(tournament_ids))
            .group_by(BracketResult.tournament_id)
        ).all()
        return {tid: int(c) for tid, c in rows}
```

Ensure `local.py`'s imports include `or_` from `sqlalchemy`, `datetime`/`timezone` from `datetime`, and the models `InviteLink`, `TournamentMember`, `BracketMatch`, `BracketResult`, `MatchState` (it already imports `Match`, `BracketEvent`, `WorkspaceModule`, `select`, `func`). Add whichever are missing to the existing import lines.

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m pytest tests/unit/test_repositories.py::test_count_by_tournament_helpers -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/backend/repositories/local.py products/scheduler/tests/unit/test_repositories.py
git commit -m "feat(repo): grouped *_by_tournament count helpers for workspace signals"
```

---

### Task 6: Signals DTOs + pure `build_signals` builder

A new, pure, router-free module holding the signals DTOs, the `RowCounts` input, and `build_signals(row, modules, counts)` — health, coded attention, per-kind readiness, module counts, collaboration. No DB access.

**Files:**
- Create: `products/scheduler/backend/api/workspace_signals.py`
- Test: `products/scheduler/tests/unit/test_workspace_signals.py`

**Interfaces:**
- Consumes: `WorkspaceModuleDTO` (from `app.schemas`) for the module list (`.moduleId`, `.status`); a `Tournament` row (`.kind`, `.status`, `.data`).
- Produces:
  - `@dataclass RowCounts` with int fields `members, active_invites, bracket_events, bracket_matches, bracket_results, match_states` (all default 0).
  - `WorkspaceSignalsDTO` (Pydantic) with `health: str`, `attention: list[AttentionReasonDTO]`, `modules: ModuleCountsDTO`, `setup: dict[str, bool]`, `collaboration: CollaborationDTO`.
  - `build_signals(row: Tournament, modules: list[WorkspaceModuleDTO], counts: RowCounts) -> WorkspaceSignalsDTO`.

- [ ] **Step 1: Write the failing tests**

Create `products/scheduler/tests/unit/test_workspace_signals.py`:

```python
from __future__ import annotations

from types import SimpleNamespace

from api.workspace_signals import RowCounts, build_signals
from app.schemas import WorkspaceModuleDTO


def _mod(module_id: str, status: str) -> WorkspaceModuleDTO:
    return WorkspaceModuleDTO(moduleId=module_id, status=status, config=None)


def _row(kind="meet", status="active", data=None):
    return SimpleNamespace(kind=kind, status=status, data=data or {})


def test_module_counts():
    mods = [_mod("meet", "enabled"), _mod("bracket", "available"), _mod("display", "coming_soon")]
    sig = build_signals(_row(), mods, RowCounts())
    assert sig.modules.enabled == 1
    assert sig.modules.available == 1
    assert sig.modules.comingSoon == 1
    assert sig.modules.disabled == 0


def test_health_archived_and_draft_take_precedence():
    mods = [_mod("meet", "enabled")]
    assert build_signals(_row(status="archived"), mods, RowCounts()).health == "archived"
    assert build_signals(_row(status="draft"), mods, RowCounts()).health == "draft"


def test_health_attention_when_reasons_present():
    # active meet, no enabled modules → NO_MODULES_ENABLED → attention.
    mods = [_mod("meet", "available"), _mod("bracket", "available"), _mod("display", "available")]
    sig = build_signals(_row(status="active"), mods, RowCounts())
    assert sig.health == "attention"
    assert any(a.code == "NO_MODULES_ENABLED" for a in sig.attention)


def test_health_good_when_clean():
    # meet enabled, roster + schedule present, match_states present → no reasons.
    mods = [_mod("meet", "enabled"), _mod("bracket", "coming_soon"), _mod("display", "available")]
    data = {"config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "17:00"},
            "players": [{"id": "p1"}], "schedule": {"assignments": [1]}}
    sig = build_signals(_row(status="active", data=data), mods, RowCounts(match_states=1))
    assert sig.attention == []
    assert sig.health == "good"
    assert sig.setup["roster"] is True
    assert sig.setup["scheduled"] is True
    assert sig.setup["results"] is True
    assert sig.setup["configured"] is True


def test_meet_attention_no_roster_and_not_scheduled():
    mods = [_mod("meet", "enabled"), _mod("bracket", "coming_soon"), _mod("display", "available")]
    sig = build_signals(_row(status="active", data={"config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "17:00"}}), mods, RowCounts())
    codes = {a.code for a in sig.attention}
    assert "NO_ROSTER" in codes
    assert "NOT_SCHEDULED" in codes
    assert sig.setup["roster"] is False


def test_display_no_source_attention():
    mods = [_mod("meet", "available"), _mod("bracket", "available"), _mod("display", "enabled")]
    sig = build_signals(_row(status="active"), mods, RowCounts())
    assert any(a.code == "DISPLAY_NO_SOURCE" for a in sig.attention)


def test_bracket_readiness_from_counts():
    mods = [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]
    counts = RowCounts(bracket_events=2, bracket_matches=7, bracket_results=1)
    sig = build_signals(_row(kind="bracket", status="active"), mods, counts)
    assert sig.setup == {"events": True, "bracketBuilt": True, "results": True}
    assert sig.attention == []


def test_bracket_not_built_attention():
    mods = [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]
    sig = build_signals(_row(kind="bracket", status="active"), mods, RowCounts())
    assert any(a.code == "NO_BRACKET" for a in sig.attention)
    assert sig.setup["events"] is False


def test_collaboration_counts():
    mods = [_mod("meet", "enabled")]
    sig = build_signals(_row(status="active"), mods, RowCounts(members=3, active_invites=2))
    assert sig.collaboration.memberCount == 3
    assert sig.collaboration.activeInviteCount == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_signals.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.workspace_signals'`.

- [ ] **Step 3: Create the module**

Create `products/scheduler/backend/api/workspace_signals.py`:

```python
"""Pure workspace-signal computation for the control-plane summary.

``build_signals`` turns an already-loaded tournament row + its module DTOs +
a ``RowCounts`` slice (from the grouped count helpers) into a
``WorkspaceSignalsDTO``: health, coded attention reasons, per-kind setup
readiness, module counts, and collaboration counts. It performs NO database
access — all relational counts arrive via ``RowCounts`` and meet readiness
reads the already-loaded ``Tournament.data`` blob. This keeps the list
endpoint free of per-row queries (see the SP-A spec's N+1 guardrail).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from pydantic import BaseModel

from database.models import OPERATIONAL_MODULES


@dataclass
class RowCounts:
    """One tournament's slice of the grouped count maps."""
    members: int = 0
    active_invites: int = 0
    bracket_events: int = 0
    bracket_matches: int = 0
    bracket_results: int = 0
    match_states: int = 0


class AttentionReasonDTO(BaseModel):
    code: str
    label: str


class ModuleCountsDTO(BaseModel):
    enabled: int = 0
    available: int = 0
    disabled: int = 0
    comingSoon: int = 0


class CollaborationDTO(BaseModel):
    memberCount: int = 0
    activeInviteCount: int = 0


class WorkspaceSignalsDTO(BaseModel):
    health: str
    attention: List[AttentionReasonDTO]
    modules: ModuleCountsDTO
    setup: dict  # dict[str, bool] — keys vary by kind
    collaboration: CollaborationDTO


def _module_counts(modules) -> ModuleCountsDTO:
    counts = ModuleCountsDTO()
    for m in modules:
        if m.status == "enabled":
            counts.enabled += 1
        elif m.status == "available":
            counts.available += 1
        elif m.status == "disabled":
            counts.disabled += 1
        elif m.status == "coming_soon":
            counts.comingSoon += 1
    return counts


def _meet_setup(data: dict, counts: RowCounts) -> dict:
    config = data.get("config") or {}
    configured = bool(
        config.get("courtCount") and config.get("dayStart") and config.get("dayEnd")
    )
    roster = len(data.get("players") or []) > 0
    schedule = data.get("schedule")
    scheduled = bool(schedule) and bool(
        (schedule or {}).get("assignments") if isinstance(schedule, dict) else schedule
    )
    results = counts.match_states > 0
    return {
        "configured": configured,
        "roster": roster,
        "scheduled": scheduled,
        "results": results,
    }


def _bracket_setup(counts: RowCounts) -> dict:
    return {
        "events": counts.bracket_events > 0,
        "bracketBuilt": counts.bracket_matches > 0,
        "results": counts.bracket_results > 0,
    }


def build_signals(row, modules, counts: RowCounts) -> WorkspaceSignalsDTO:
    """Compute the control-plane signals for one workspace. Pure — no DB."""
    statuses = {m.moduleId: m.status for m in modules}
    module_counts = _module_counts(modules)
    kind = getattr(row, "kind", "meet") or "meet"

    if kind == "bracket":
        setup = _bracket_setup(counts)
    else:
        setup = _meet_setup(getattr(row, "data", None) or {}, counts)

    attention: List[AttentionReasonDTO] = []
    if module_counts.enabled == 0:
        attention.append(AttentionReasonDTO(code="NO_MODULES_ENABLED", label="No modules enabled"))
    if statuses.get("display") == "enabled" and not any(
        statuses.get(m) == "enabled" for m in OPERATIONAL_MODULES
    ):
        attention.append(AttentionReasonDTO(
            code="DISPLAY_NO_SOURCE", label="Display is on but no data module is enabled"))

    if kind == "bracket":
        if not setup["events"]:
            attention.append(AttentionReasonDTO(code="NO_BRACKET", label="Bracket not built yet"))
    else:
        if not setup["roster"]:
            attention.append(AttentionReasonDTO(code="NO_ROSTER", label="No players added yet"))
        if not setup["scheduled"]:
            attention.append(AttentionReasonDTO(code="NOT_SCHEDULED", label="Schedule not generated"))

    status = getattr(row, "status", "draft")
    if status == "archived":
        health = "archived"
    elif status == "draft":
        health = "draft"
    elif attention:
        health = "attention"
    else:
        health = "good"

    collaboration = CollaborationDTO(
        memberCount=counts.members, activeInviteCount=counts.active_invites
    )
    return WorkspaceSignalsDTO(
        health=health,
        attention=attention,
        modules=module_counts,
        setup=setup,
        collaboration=collaboration,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_signals.py -v`
Expected: PASS (9 tests). (`app/schemas.WorkspaceModuleDTO` is confirmed to be `moduleId: str`, `status: str`, `config: Optional[Dict] = None` — the `_mod` helper kwargs match it exactly.)

- [ ] **Step 5: Commit**

```bash
git add products/scheduler/backend/api/workspace_signals.py products/scheduler/tests/unit/test_workspace_signals.py
git commit -m "feat(signals): pure build_signals builder + signal DTOs"
```

---

### Task 7: Wire signals into the summary endpoints

Compute the 6 grouped maps once in `list_tournaments`, slice per row, and attach `signals` to every `TournamentSummaryDTO` (list, get, create, update) via the same grouped helpers.

**Files:**
- Modify: `products/scheduler/backend/api/tournaments.py` (`TournamentSummaryDTO` ~line 69; `_to_summary` ~line 102; `list_tournaments` ~line 155; `get_tournament`/`create_tournament`/`update_tournament` summary returns)
- Test: `products/scheduler/tests/unit/test_workspace_modules.py` (or extend `test_tournaments.py`)

**Interfaces:**
- Consumes: `build_signals`, `RowCounts`, `WorkspaceSignalsDTO` (Task 6); the grouped helpers (Task 5).
- Produces: `TournamentSummaryDTO.signals: Optional[WorkspaceSignalsDTO]`, always populated; a private `_counts_for(ids, repo) -> dict[uuid.UUID, RowCounts]` helper used by both list and single-summary paths.

- [ ] **Step 1: Write the failing tests**

Add to `products/scheduler/tests/unit/test_workspace_modules.py`:

```python
def test_summary_carries_signals(client):
    r = client.post("/tournaments", json={
        "name": "Sig", "kind": "meet",
        "modules": [
            {"moduleId": "meet", "status": "enabled"},
            {"moduleId": "bracket", "status": "available"},
            {"moduleId": "display", "status": "available"},
        ],
    })
    body = r.json()
    assert "signals" in body and body["signals"] is not None
    sig = body["signals"]
    assert sig["modules"]["enabled"] == 1
    assert sig["health"] in {"good", "attention", "draft", "archived"}
    # Fresh meet with no roster/schedule → attention reasons present.
    assert any(a["code"] == "NO_ROSTER" for a in sig["attention"])
    assert sig["collaboration"]["memberCount"] == 1  # owner


def test_list_carries_signals_for_each_row(client):
    client.post("/tournaments", json={"name": "One"})
    client.post("/tournaments", json={"name": "Two", "kind": "bracket"})
    listing = client.get("/tournaments").json()
    assert len(listing) == 2
    for row in listing:
        assert row["signals"] is not None
        assert "health" in row["signals"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "carries_signals" -v`
Expected: FAIL — `signals` missing from the summary (KeyError / None).

- [ ] **Step 3: Add the DTO field + imports**

In `products/scheduler/backend/api/tournaments.py`, add the import near the top:

```python
from api.workspace_signals import RowCounts, WorkspaceSignalsDTO, build_signals
```

Add the field to `TournamentSummaryDTO` (after `modules`):

```python
    signals: Optional[WorkspaceSignalsDTO] = None
```

- [ ] **Step 4: Extend `_to_summary` + add `_counts_for`**

Change `_to_summary` to accept and pass `signals`:

```python
def _to_summary(
    row: Tournament,
    *,
    role: Optional[str] = None,
    modules: Optional[List[WorkspaceModuleDTO]] = None,
    signals: Optional[WorkspaceSignalsDTO] = None,
) -> TournamentSummaryDTO:
    return TournamentSummaryDTO(
        id=str(row.id),
        name=row.name,
        status=row.status,  # type: ignore[arg-type]
        kind=getattr(row, "kind", "meet"),
        tournamentDate=row.tournament_date,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
        role=role,
        ownerName=row.owner_email,
        modules=modules or [],
        signals=signals,
    )
```

Add a grouped-counts helper near `_modules_for`:

```python
def _counts_for(
    ids: List[uuid.UUID], repo: LocalRepository
) -> dict:
    """``{tournament_id: RowCounts}`` from the 6 grouped count queries.

    Computed once for a set of ids (the list path) or a single id (the
    get/create/update paths). No per-row DB round-trips.
    """
    members = repo.members.count_by_tournament(ids)
    invites = repo.invite_links.count_active_by_tournament(ids)
    bevents = repo.brackets.count_events_by_tournament(ids)
    bmatches = repo.brackets.count_matches_by_tournament(ids)
    bresults = repo.brackets.count_results_by_tournament(ids)
    mstates = repo.match_states.count_by_tournament(ids)
    return {
        tid: RowCounts(
            members=members.get(tid, 0),
            active_invites=invites.get(tid, 0),
            bracket_events=bevents.get(tid, 0),
            bracket_matches=bmatches.get(tid, 0),
            bracket_results=bresults.get(tid, 0),
            match_states=mstates.get(tid, 0),
        )
        for tid in ids
    }
```

- [ ] **Step 5: Wire `list_tournaments`**

Replace the list comprehension return with a grouped-counts version:

```python
    visible = [t for t in repo.tournaments.list_all() if t.id in role_by_tournament]
    counts = _counts_for([t.id for t in visible], repo)
    out: List[TournamentSummaryDTO] = []
    for t in visible:
        modules = _modules_for(t, repo)
        out.append(
            _to_summary(
                t,
                role=role_by_tournament[t.id],
                modules=modules,
                signals=build_signals(t, modules, counts[t.id]),
            )
        )
    return out
```

- [ ] **Step 6: Wire the single-summary paths**

For `create_tournament`, `get_tournament`, and `update_tournament`, change each `return _to_summary(row, role=..., modules=_modules_for(row, repo))` to compute modules + signals via the same helper. Pattern (apply to each of the three):

```python
    modules = _modules_for(row, repo)
    counts = _counts_for([row.id], repo)
    return _to_summary(
        row,
        role=role,  # "owner" in create; the resolved role in get/update
        modules=modules,
        signals=build_signals(row, modules, counts[row.id]),
    )
```

(In `create_tournament` use `role="owner"`. In `get_tournament`/`update_tournament` keep whatever `role` variable each already passes.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `python3 -m pytest tests/unit/test_workspace_modules.py -k "carries_signals" -v`
Expected: PASS (2 tests).

- [ ] **Step 8: Add the N+1 guard test**

Add to `products/scheduler/tests/unit/test_workspace_modules.py` — assert the grouped helpers are each called exactly once for a multi-row list (proving no per-row fan-out):

```python
def test_list_signals_uses_grouped_queries_once(client, monkeypatch):
    client.post("/tournaments", json={"name": "One"})
    client.post("/tournaments", json={"name": "Two"})
    client.post("/tournaments", json={"name": "Three"})

    import repositories.local as local_mod
    calls = {"members": 0, "invites": 0}
    real_members = local_mod._LocalMemberRepo.count_by_tournament
    real_invites = local_mod._LocalInviteLinkRepo.count_active_by_tournament

    def counted_members(self, ids):
        calls["members"] += 1
        return real_members(self, ids)

    def counted_invites(self, ids):
        calls["invites"] += 1
        return real_invites(self, ids)

    monkeypatch.setattr(local_mod._LocalMemberRepo, "count_by_tournament", counted_members)
    monkeypatch.setattr(local_mod._LocalInviteLinkRepo, "count_active_by_tournament", counted_invites)

    r = client.get("/tournaments")
    assert r.status_code == 200
    assert len(r.json()) == 3
    # Grouped: exactly one call each across 3 rows — NOT 3.
    assert calls["members"] == 1
    assert calls["invites"] == 1
```

Run: `python3 -m pytest tests/unit/test_workspace_modules.py::test_list_signals_uses_grouped_queries_once -v`
Expected: PASS.

- [ ] **Step 9: Run the full backend suite**

Run: `python3 -m pytest -q`
Expected: 491 pass / 1 pre-existing psycopg2 `test_config` skip (489 prior + the SP-A additions; exact count may differ by the number of new tests — the bar is **zero new failures** and the one pre-existing skip unchanged).

- [ ] **Step 10: Commit**

```bash
git add products/scheduler/backend/api/tournaments.py products/scheduler/tests/unit/test_workspace_modules.py
git commit -m "feat(tournaments): attach computed signals to every workspace summary"
```

---

## Self-Review

**Spec coverage:**
- `modules?` seed on create → Tasks 2 (normalize), 3 (persist), 4 (wire). ✓
- Shared `display_dependency_satisfied` used by create + PATCH → Task 1 (extract + PATCH) + Task 4 (create uses it). ✓
- `signals` on summary (health/attention/modules/setup/collaboration) → Tasks 6 (builder) + 7 (wire). ✓
- Coded attention reasons `{code,label}` → Task 6 `AttentionReasonDTO`. ✓
- Richer per-kind readiness → Task 6 `_meet_setup` (configured/roster/scheduled/results) + `_bracket_setup` (events/bracketBuilt/results). ✓
- Batched, no N+1 (6 grouped queries; pure builder) → Task 5 (helpers) + Task 7 (`_counts_for` once + guard test Step 8). ✓
- Active-invite = not revoked AND not expired → Task 5 `count_active_by_tournament` + test. ✓
- `kind` preserved; no new kinds; no routes changed → create still validates `kind in {meet,bracket}` (untouched); only DTO fields + helpers added. ✓
- Backend suite green → Task 7 Step 9. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows full code. Two tasks carry explicit *fallback instructions* (Task 3 idempotency note; Task 5 bracket-row columns) — these are concrete contingencies with the exact alternative action, not vague placeholders.

**Type consistency:** `RowCounts` fields (`members, active_invites, bracket_events, bracket_matches, bracket_results, match_states`) match `_counts_for`'s construction (Task 7) and the grouped helper names (Task 5). `build_signals(row, modules, counts)` signature matches its call sites (Task 7 list + single paths). `WorkspaceSignalsDTO` / `AttentionReasonDTO` / `ModuleCountsDTO` / `CollaborationDTO` field names match the test assertions (Task 6) and the frontend-facing JSON (`comingSoon`, `memberCount`, `activeInviteCount`). `normalize_module_seed` output keys (`module_id`/`status`/`config`) match `seed_modules` (Task 3) and the create wiring (Task 4).

**Verified externals:** `app/schemas.WorkspaceModuleDTO` is confirmed `moduleId: str` / `status: str` / `config: Optional[Dict] = None` (`app/schemas.py:467-469`) — all test code using it is correct as written. The two remaining contingencies (Task 3 idempotency, Task 5 bracket-row columns) are concrete fallbacks with exact alternative actions, not open questions.
