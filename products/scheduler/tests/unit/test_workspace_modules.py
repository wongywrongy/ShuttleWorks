"""Unit tests for workspace-modules sub-project #1 — backend persistence.

Covers the spec's nine checks:

1. ``derive_modules`` status map for meet / bracket / unknown.
2. Lazy derive-and-persist: a fresh workspace seeds its modules on first
   read; a second read returns the same rows (no duplication).
3. The tournament summary DTO includes ``modules`` with the derived set.
4. ``GET /tournaments/{id}/modules`` returns the module list.
5. ``PATCH`` enable display with no enabled operator → 409 (dependency);
   with meet enabled → 200.
6. ``PATCH`` disable the only enabled operational module → 409.
7. ``PATCH`` disable a meet module that has matches → 409 (destructive).
8. ``PATCH`` config update on an enabled module → 200, config persisted
   (and a status-only patch preserves config — the no-data-loss rule).
9. Backfill (model-level): ``ensure_modules`` produces the derived rows
   for an existing tournament, for both kinds.

Driven through a FastAPI TestClient so the route → repository pipeline is
exercised end-to-end, plus direct repository access (via
``open_repository``) to stage states the API alone can't reach and to
assert persisted-row counts.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import tournaments, workspace_modules

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(workspace_modules.router)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Modules Test")


# ---- Helpers ----------------------------------------------------------


def _seed_bracket_tournament(client, name: str = "Bracket") -> str:
    r = client.post("/tournaments", json={"name": name, "kind": "bracket"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _stage_module_status(tid: str, module_id: str, status: str) -> None:
    """Force a module into ``status`` via the unguarded repo write.

    Used to reach states the guarded PATCH route can't produce (e.g. a
    disabled meet, needed to test the display dependency 409).
    """
    from repositories import open_repository

    with open_repository() as repo:
        t = repo.tournaments.get_by_id(uuid.UUID(tid))
        repo.modules.ensure_modules(t)
        repo.modules.update(t.id, module_id, {"status": status})


def _seed_match(client, tid: str, match_id: str = "m1") -> None:
    """Populate the ``matches`` table via the schedule-commit projection."""
    payload = {
        "config": {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "courtCount": 2,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "matches": [{"id": match_id, "sideA": ["p1"], "sideB": ["p2"]}],
        "schedule": {
            "status": "feasible",
            "assignments": [
                {"matchId": match_id, "slotId": 0, "courtId": 1, "durationSlots": 1}
            ],
        },
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200, r.text


def _modules_url(tid: str) -> str:
    return f"/tournaments/{tid}/modules"


def _by_id(modules: list[dict]) -> dict[str, dict]:
    return {m["moduleId"]: m for m in modules}


# ---- 1. derive_modules ------------------------------------------------


def test_derive_modules_status_maps(client):
    from database.models import derive_modules

    assert derive_modules("meet") == {
        "meet": "enabled",
        "display": "available",
        "bracket": "coming_soon",
    }
    assert derive_modules("bracket") == {
        "bracket": "enabled",
        "display": "coming_soon",
        "meet": "coming_soon",
    }
    # Unknown / None fall back to the meet shape.
    assert derive_modules("nonsense") == derive_modules("meet")
    assert derive_modules(None) == derive_modules("meet")


# ---- 2. Lazy derive-and-persist (idempotent) --------------------------


def test_lazy_derive_persists_without_duplication(client, tid):
    first = client.get(_modules_url(tid))
    assert first.status_code == 200, first.text
    assert len(first.json()) == 3

    second = client.get(_modules_url(tid))
    assert second.status_code == 200
    assert second.json() == first.json()

    # No duplication at the row level.
    from repositories import open_repository

    with open_repository() as repo:
        t = repo.tournaments.get_by_id(uuid.UUID(tid))
        rows = repo.modules.list_for_tournament(t)
        assert len(rows) == 3
        assert {r.module_id for r in rows} == {"meet", "bracket", "display"}


# ---- 3. Summary DTO includes modules ----------------------------------


def test_summary_includes_modules(client, tid):
    r = client.get(f"/tournaments/{tid}")
    assert r.status_code == 200, r.text
    modules = _by_id(r.json()["modules"])
    assert len(modules) == 3
    assert modules["meet"]["status"] == "enabled"
    assert modules["display"]["status"] == "available"
    assert modules["bracket"]["status"] == "coming_soon"


# ---- 4. GET module list -----------------------------------------------


def test_get_module_list(client, tid):
    r = client.get(_modules_url(tid))
    assert r.status_code == 200, r.text
    modules = _by_id(r.json())
    assert set(modules) == {"meet", "bracket", "display"}
    assert modules["meet"]["config"] is None


# ---- 5. Enable display dependency -------------------------------------


def test_enable_display_requires_enabled_operator(client, tid):
    # 200 branch: meet is enabled (derived), so display can be enabled.
    ok = client.patch(
        f"{_modules_url(tid)}/display", json={"status": "enabled"}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "enabled"


def test_enable_display_with_no_operator_409(client, tid):
    # Stage the unnatural state: meet disabled (only reachable via repo).
    _stage_module_status(tid, "meet", "disabled")
    _stage_module_status(tid, "display", "available")
    r = client.patch(
        f"{_modules_url(tid)}/display", json={"status": "enabled"}
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "MODULE_DEPENDENCY_UNMET"


# ---- 6. Disable the last operational module ---------------------------


def test_disable_last_operational_409(client, tid):
    r = client.patch(f"{_modules_url(tid)}/meet", json={"status": "disabled"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "MODULE_LAST_OPERATIONAL"


# ---- 7. Destructive-disable guard -------------------------------------


def test_disable_meet_with_matches_409(client, tid):
    _seed_match(client, tid)
    r = client.patch(f"{_modules_url(tid)}/meet", json={"status": "disabled"})
    assert r.status_code == 409, r.text
    # Destructive guard surfaces ahead of the last-operational guard.
    assert r.json()["detail"]["code"] == "MODULE_HAS_DATA"


# ---- 8. Config update + no-data-loss ----------------------------------


def test_config_update_persists_and_status_patch_preserves_config(client, tid):
    cfg = {"theme": "dark", "rows": 3}
    r = client.patch(f"{_modules_url(tid)}/meet", json={"config": cfg})
    assert r.status_code == 200, r.text
    assert r.json()["config"] == cfg

    # Persisted across a re-read.
    listed = _by_id(client.get(_modules_url(tid)).json())
    assert listed["meet"]["config"] == cfg

    # A status-only no-op patch must not erase the existing config.
    r2 = client.patch(f"{_modules_url(tid)}/meet", json={"status": "enabled"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["config"] == cfg


# ---- 9. Backfill helper (model-level) ---------------------------------


def test_ensure_modules_backfills_existing_tournament(client):
    """A tournament that exists with no module rows gets the derived set."""
    from repositories import open_repository

    with open_repository() as repo:
        meet_row = repo.tournaments.create(name="M", kind="meet")
        bracket_row = repo.tournaments.create(name="B", kind="bracket")

        meet_mods = {m.module_id: m.status for m in repo.modules.ensure_modules(meet_row)}
        bracket_mods = {
            m.module_id: m.status for m in repo.modules.ensure_modules(bracket_row)
        }

    assert meet_mods == {
        "meet": "enabled",
        "display": "available",
        "bracket": "coming_soon",
    }
    assert bracket_mods == {
        "bracket": "enabled",
        "display": "coming_soon",
        "meet": "coming_soon",
    }


def test_display_dependency_satisfied_rule():
    from database.models import display_dependency_satisfied

    # Display not enabled → always satisfied.
    assert display_dependency_satisfied({"meet": "available", "display": "available"}) is True
    assert display_dependency_satisfied({"meet": "disabled", "display": "disabled"}) is True
    # Display enabled with an enabled operator → satisfied.
    assert display_dependency_satisfied({"meet": "enabled", "display": "enabled"}) is True
    assert display_dependency_satisfied({"bracket": "enabled", "display": "enabled"}) is True
    # Display enabled with no enabled operator → violated.
    assert display_dependency_satisfied({"meet": "available", "bracket": "disabled", "display": "enabled"}) is False
    assert display_dependency_satisfied({"display": "enabled"}) is False


# ---- normalize_module_seed -----------------------------------------------


def _as_map(rows):
    return {r["module_id"]: r["status"] for r in rows}


def test_normalize_seed_meet_day_template():
    from database.models import normalize_module_seed

    rows = normalize_module_seed([
        {"moduleId": "meet", "status": "enabled"},
        {"moduleId": "display", "status": "enabled"},
        {"moduleId": "bracket", "status": "available"},
    ])
    assert _as_map(rows) == {"meet": "enabled", "display": "enabled", "bracket": "available"}
    # Ordered by MODULE_IDS = (meet, bracket, display).
    assert [r["module_id"] for r in rows] == ["meet", "bracket", "display"]


def test_normalize_seed_backfills_missing_modules():
    from database.models import normalize_module_seed

    # Only bracket named; meet/display backfilled. Display backfills to
    # coming_soon because no operational module is enabled.
    rows = normalize_module_seed([{"moduleId": "bracket", "status": "enabled"}])
    assert _as_map(rows) == {"bracket": "enabled", "meet": "available", "display": "coming_soon"}


def test_normalize_seed_backfills_display_available_when_operator_enabled():
    from database.models import normalize_module_seed

    rows = normalize_module_seed([{"moduleId": "meet", "status": "enabled"}])
    assert _as_map(rows)["display"] == "available"


def test_normalize_seed_preserves_config():
    from database.models import normalize_module_seed

    rows = normalize_module_seed([{"moduleId": "meet", "status": "enabled", "config": {"x": 1}}])
    meet = next(r for r in rows if r["module_id"] == "meet")
    assert meet["config"] == {"x": 1}


def test_normalize_seed_rejects_unknown_module():
    from database.models import normalize_module_seed

    with pytest.raises(ValueError):
        normalize_module_seed([{"moduleId": "scoreboard", "status": "enabled"}])


def test_normalize_seed_rejects_duplicate_module():
    from database.models import normalize_module_seed

    with pytest.raises(ValueError):
        normalize_module_seed([
            {"moduleId": "meet", "status": "enabled"},
            {"moduleId": "meet", "status": "available"},
        ])


def test_normalize_seed_rejects_bad_status():
    from database.models import normalize_module_seed

    with pytest.raises(ValueError):
        normalize_module_seed([{"moduleId": "meet", "status": "on"}])
