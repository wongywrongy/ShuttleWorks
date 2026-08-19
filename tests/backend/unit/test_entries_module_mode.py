"""The cloud-only Entries module: seed, read filter, and both refusals.

Entries is a Tier-1 module (spec Q1) whose ``workspace_modules`` row exists
only where the deployment can actually operate it. ADR 0005 retired
``coming_soon`` precisely so that *every module a workspace shows is
actionable*; a module permanently displayed-but-unenableable in local mode
would resurrect exactly the state ADR 0005 deleted. So local mode never
renders Entries at all.

**The predicate is ``AUTH_MODE``, not ``ENVIRONMENT`` (ruling D2)** — see
``app.config.cloud_modules_enabled``. Every test here flips
``settings.auth_mode`` on the live settings object, the pattern
``tests/unit/test_dependencies.py`` and ``tests/test_client_ip_trust.py``
already use, which is only possible because the predicate reads the
attribute at call time rather than capturing a boolean at import.

Every guard below is paired with its negative control (CODE_HEALTH 3b),
because each of these assertions has a way of passing for the wrong reason:

- "local mode shows no Entries" passes trivially if the module was never
  seeded anywhere — so each such test has a cloud-mode twin proving the
  module genuinely exists and is genuinely being hidden.
- The smuggled-row tests are the sharp ones. A row *inherited* from a cloud
  backup is the case R6 exists for, and its control (the identical row, read
  in cloud mode, still there with its status and config) is what proves the
  filter is a **projection and never a delete** (R6.4) — a filter that
  deleted the row would pass the local-mode half and fail the control.

Auth is deliberately stubbed out with a dependency override: flipping
``auth_mode`` to ``cloud`` is what this file is about, and that flip also
turns off the local bootstrap identity. Overriding ``get_current_user``
keeps the flip surgical — the identity seam has its own tests.
"""
from __future__ import annotations

import uuid

import pytest

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api import tournaments, workspace_modules
    from app.dependencies import LOCAL_DEV_USER_UUID, AuthUser, get_current_user

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(workspace_modules.router)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=str(LOCAL_DEV_USER_UUID), email="local@dev"
    )
    return TestClient(app)


@pytest.fixture
def mode(client, monkeypatch):
    """Set the deployment mode the module system keys off (ruling D2)."""

    def _set(value: str) -> None:
        from app.config import settings

        monkeypatch.setattr(settings, "auth_mode", value)

    return _set


def _create(client, name: str = "WS", **body) -> str:
    r = client.post("/tournaments", json={"name": name, **body})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _module_ids(client, tid: str) -> list[str]:
    r = client.get(f"/tournaments/{tid}/modules")
    assert r.status_code == 200, r.text
    return [m["moduleId"] for m in r.json()]


def _module_ids_from_hub(client, tid: str) -> list[str]:
    """The batched list path — a *different* query from the one above.

    ``ensure_modules_for`` reads ``WorkspaceModule`` directly and does not
    inherit ``_rows_for``'s filter, so a filter applied to only one of the
    two leaks the module onto the Hub. That is the bug this helper exists
    to catch.
    """
    r = client.get("/tournaments")
    assert r.status_code == 200, r.text
    rows = [row for row in r.json() if row["id"] == tid]
    assert rows, f"workspace {tid} missing from the list path"
    return [m["moduleId"] for m in rows[0]["modules"]]


def _smuggle_entries_row(tid: str, status: str = "enabled", config=None) -> None:
    """Insert an ``entries`` module row directly, bypassing every seed path.

    Models the real case R6 is about: a database restored from a cloud
    backup, or copied from the cloud deployment onto a laptop.
    """
    from database.models import WorkspaceModule
    from repositories import open_repository

    with open_repository() as repo:
        repo.session.add(
            WorkspaceModule(
                tournament_id=uuid.UUID(tid),
                module_id="entries",
                status=status,
                config=config,
            )
        )
        repo.session.commit()


# ---- Model layer: mode is a parameter, never an import ----------------


def test_derive_modules_omits_cloud_only_unless_asked():
    """The model layer stays settings-free — the caller supplies the mode."""
    from database.models import CLOUD_ONLY_MODULES, derive_modules

    assert CLOUD_ONLY_MODULES == ("entries",)
    for kind in ("meet", "bracket", None):
        assert "entries" not in derive_modules(kind)
        # Negative control: the module exists and is seedable — the default
        # is omitting it, not lacking it.
        assert derive_modules(kind, include_cloud_only=True)["entries"] == "available"


def test_normalize_module_seed_backfill_respects_the_mode():
    from database.models import normalize_module_seed

    local = {r["module_id"] for r in normalize_module_seed([])}
    assert "entries" not in local
    cloud = {
        r["module_id"] for r in normalize_module_seed([], include_cloud_only=True)
    }
    assert "entries" in cloud
    assert cloud - local == {"entries"}


def test_normalize_module_seed_refuses_an_explicit_cloud_only_seed_in_local_mode():
    """A named ``entries`` seed must not silently persist a row the read
    path would then hide."""
    from database.models import normalize_module_seed

    seed = [{"moduleId": "entries", "status": "available"}]
    with pytest.raises(ValueError):
        normalize_module_seed(seed)
    # Negative control: the same seed is accepted when cloud-only modules
    # are in play, so the refusal is about the mode and not the input.
    rows = normalize_module_seed(seed, include_cloud_only=True)
    assert {"module_id": "entries", "status": "available", "config": None} in rows


# ---- Seed path: both read routes, both modes --------------------------


def test_cloud_mode_seeds_entries_on_the_single_workspace_path(client, mode):
    mode("cloud")
    tid = _create(client, "Cloud WS")
    assert "entries" in _module_ids(client, tid)


def test_local_mode_omits_entries_on_the_single_workspace_path(client, mode):
    mode("local")
    tid = _create(client, "Local WS")
    ids = _module_ids(client, tid)
    assert "entries" not in ids
    # Negative control: the route is working and the other modules are all
    # present — the absence is Entries-specific, not an empty response.
    assert set(ids) == {"meet", "bracket", "display"}


def test_cloud_mode_seeds_entries_on_the_batched_hub_path(client, mode):
    mode("cloud")
    tid = _create(client, "Cloud WS")
    assert "entries" in _module_ids_from_hub(client, tid)


def test_local_mode_omits_entries_on_the_batched_hub_path(client, mode):
    mode("local")
    tid = _create(client, "Local WS")
    ids = _module_ids_from_hub(client, tid)
    assert "entries" not in ids
    assert set(ids) == {"meet", "bracket", "display"}


# ---- Read filter: the inherited (smuggled) row ------------------------


def test_local_mode_hides_an_inherited_entries_row_on_both_read_paths(client, mode):
    """A cloud backup restored onto a laptop must not render Entries."""
    mode("local")
    tid = _create(client, "Restored WS")
    _smuggle_entries_row(tid)

    assert "entries" not in _module_ids(client, tid)
    assert "entries" not in _module_ids_from_hub(client, tid)


def test_cloud_mode_shows_the_same_inherited_entries_row(client, mode):
    """Negative control for the test above.

    The identical row, read by the identical routes, with only the mode
    changed. If this fails the previous test proves nothing — the row might
    simply never have been written.
    """
    mode("local")
    tid = _create(client, "Restored WS")
    _smuggle_entries_row(tid)
    mode("cloud")

    assert "entries" in _module_ids(client, tid)
    assert "entries" in _module_ids_from_hub(client, tid)


def test_the_filter_is_a_projection_and_never_a_delete(client, mode):
    """Cloud → local → cloud returns the row with its status and config
    intact (R6.4). Filtering must not be a migration."""
    mode("cloud")
    tid = _create(client, "Travelling WS")
    r = client.patch(
        f"/tournaments/{tid}/modules/entries",
        json={"status": "enabled", "config": {"slug": "spring-open"}},
    )
    assert r.status_code == 200, r.text

    mode("local")
    assert "entries" not in _module_ids(client, tid)

    mode("cloud")
    rows = client.get(f"/tournaments/{tid}/modules").json()
    entries = next(m for m in rows if m["moduleId"] == "entries")
    assert entries["status"] == "enabled"
    assert entries["config"] == {"slug": "spring-open"}


# ---- Refusals ---------------------------------------------------------


def test_patch_entries_in_local_mode_answers_module_requires_cloud(client, mode):
    """With the read filter in place the generic 404 would already fire —
    correct, but a misleading error. The specific code is defence in depth
    and a better message."""
    mode("cloud")
    tid = _create(client, "WS")  # the row exists…
    mode("local")

    r = client.patch(f"/tournaments/{tid}/modules/entries", json={"status": "enabled"})
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "MODULE_REQUIRES_CLOUD"


def test_patch_entries_in_cloud_mode_succeeds(client, mode):
    """Negative control: the refusal above is the mode, not the module."""
    mode("cloud")
    tid = _create(client, "WS")

    r = client.patch(f"/tournaments/{tid}/modules/entries", json={"status": "enabled"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "enabled"


def test_patch_an_unknown_module_still_answers_module_not_found(client, mode):
    """Negative control on the *placement* of the new check: it must not
    swallow the generic 404 for genuinely unknown module ids."""
    mode("local")
    tid = _create(client, "WS")

    r = client.patch(f"/tournaments/{tid}/modules/nope", json={"status": "enabled"})
    assert r.status_code == 404, r.text
    assert r.json()["detail"]["code"] == "MODULE_NOT_FOUND"


def test_explicit_entries_seed_on_create_is_refused_in_local_mode(client, mode):
    mode("local")
    r = client.post(
        "/tournaments",
        json={
            "name": "Seeded",
            "modules": [{"moduleId": "entries", "status": "available"}],
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "MODULE_REQUIRES_CLOUD"


def test_explicit_entries_seed_on_create_is_accepted_in_cloud_mode(client, mode):
    """Negative control for the refusal above."""
    mode("cloud")
    r = client.post(
        "/tournaments",
        json={
            "name": "Seeded",
            "modules": [{"moduleId": "entries", "status": "available"}],
        },
    )
    assert r.status_code == 201, r.text
    assert "entries" in _module_ids(client, r.json()["id"])


def test_an_unknown_module_seed_still_answers_invalid_input(client, mode):
    """Negative control on the create-path pre-check's placement: it must
    not intercept the existing generic seed validation."""
    mode("local")
    r = client.post(
        "/tournaments",
        json={
            "name": "Seeded",
            "modules": [{"moduleId": "nope", "status": "available"}],
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "INVALID_INPUT"


# ---- Backfill: workspaces that predate the module ---------------------
#
# The seed half of R6 only fires on a workspace with *zero* module rows.
# Every workspace that already existed when Entries shipped — and every
# workspace created while the deployment ran in local mode — carries three
# rows, so the seed branch never runs for it again. Without an explicit
# backfill those workspaces would never gain Entries under cloud mode, and
# spec Q1(R2)'s "lazy-seeds on read" would be true only of new workspaces.
#
# The backfill is scoped to ``CLOUD_ONLY_MODULES``: it exists because the
# *mode* changed under a workspace, not as a general module reconciler.


def _raw_module_ids(tid: str) -> list[str]:
    """Module rows straight from the table — no mode filter, no route.

    The read paths project; this reads. A test that only ever looks through
    the routes cannot tell "row inserted" from "row rendered", which is the
    exact distinction the backfill and the local-mode control turn on.
    """
    from database.models import WorkspaceModule
    from repositories import open_repository
    from sqlalchemy import select

    with open_repository() as repo:
        return sorted(
            repo.session.scalars(
                select(WorkspaceModule.module_id).where(
                    WorkspaceModule.tournament_id == uuid.UUID(tid)
                )
            )
        )


def _legacy_workspace(client, mode, name: str = "Legacy WS") -> str:
    """A workspace whose module rows predate Entries.

    Created in local mode, which persists exactly the three pre-Entries
    rows — the same shape as a workspace that existed before the module
    shipped, without needing to hand-write rows.
    """
    mode("local")
    tid = _create(client, name)
    assert _raw_module_ids(tid) == ["bracket", "display", "meet"]
    return tid


def test_cloud_mode_backfills_entries_onto_a_pre_existing_workspace(client, mode):
    """Q1(R2)'s lazy seed must reach workspaces that already have rows."""
    tid = _legacy_workspace(client, mode)

    mode("cloud")
    assert "entries" in _module_ids(client, tid)
    assert _raw_module_ids(tid) == ["bracket", "display", "entries", "meet"]


def test_cloud_mode_backfills_entries_on_the_batched_hub_path_too(client, mode):
    """The Hub list is a separate query and would otherwise show a different
    module set from the workspace it links to."""
    tid = _legacy_workspace(client, mode, "Legacy Hub WS")

    mode("cloud")
    assert "entries" in _module_ids_from_hub(client, tid)
    assert _raw_module_ids(tid) == ["bracket", "display", "entries", "meet"]


def test_local_mode_backfills_nothing_onto_the_same_workspace(client, mode):
    """Negative control: the backfill is the *mode*, not the read.

    The identical reads, on the identical workspace, in local mode. If this
    also inserted a row the tests above would pass for the wrong reason and
    local mode would be persisting a module it refuses to operate.
    """
    tid = _legacy_workspace(client, mode, "Stays Legacy WS")

    assert "entries" not in _module_ids(client, tid)
    assert "entries" not in _module_ids_from_hub(client, tid)
    assert _raw_module_ids(tid) == ["bracket", "display", "meet"]


def test_the_backfilled_row_carries_the_derived_status_and_then_filters(client, mode):
    """The row the backfill writes is the row ``derive_modules`` describes,
    and it is filtered — not deleted — when the deployment goes local."""
    from database.models import derive_modules

    tid = _legacy_workspace(client, mode, "Round Trip WS")

    mode("cloud")
    rows = client.get(f"/tournaments/{tid}/modules").json()
    entries = next(m for m in rows if m["moduleId"] == "entries")
    assert entries["status"] == derive_modules(None, include_cloud_only=True)["entries"]

    mode("local")
    assert "entries" not in _module_ids(client, tid)
    assert _raw_module_ids(tid) == ["bracket", "display", "entries", "meet"]


def test_the_backfill_is_idempotent_across_repeated_reads(client, mode):
    """Write-on-read that writes on *every* read is a leak. Both paths, twice."""
    tid = _legacy_workspace(client, mode, "Repeat WS")

    mode("cloud")
    for _ in range(2):
        assert "entries" in _module_ids(client, tid)
        assert "entries" in _module_ids_from_hub(client, tid)
    assert _raw_module_ids(tid) == ["bracket", "display", "entries", "meet"]
