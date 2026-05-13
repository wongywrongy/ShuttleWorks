"""HTTP-level tests for the multi-tournament CRUD + scoped state endpoints.

Covers `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}`,
plus `GET/PUT /tournaments/{id}/state` and the three backup endpoints.
Step 5 added the role-matrix block at the bottom.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    return TestClient(app_)


def _basic_state(name: str = "Test", scheduleVersion: int = 0) -> dict:
    return {
        "version": 2,
        "config": {
            "tournamentName": name,
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "17:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 30,
            "freezeHorizonSlots": 0,
        },
        "groups": [],
        "players": [],
        "matches": [],
        "schedule": None,
        "scheduleStats": None,
        "scheduleIsStale": False,
        "scheduleVersion": scheduleVersion,
        "scheduleHistory": [],
    }


# ---- CRUD --------------------------------------------------------------


def test_list_empty_on_fresh_db(client):
    r = client.get("/tournaments")
    assert r.status_code == 200
    assert r.json() == []


def test_create_returns_summary(client):
    r = client.post("/tournaments", json={"name": "Spring", "tournamentDate": "2026-04-01"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Spring"
    assert body["tournamentDate"] == "2026-04-01"
    assert body["status"] == "draft"
    assert body["id"]
    assert body["createdAt"]
    assert body["updatedAt"]


def test_create_then_list_returns_row(client):
    client.post("/tournaments", json={"name": "A"})
    r = client.get("/tournaments")
    assert r.status_code == 200
    listing = r.json()
    assert len(listing) == 1
    assert listing[0]["name"] == "A"


def test_list_newest_first(client):
    client.post("/tournaments", json={"name": "A"})
    client.post("/tournaments", json={"name": "B"})
    listing = client.get("/tournaments").json()
    # Newest first.
    assert [t["name"] for t in listing] == ["B", "A"]


def test_get_returns_summary(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}")
    assert r.status_code == 200
    assert r.json()["name"] == "A"


def test_get_missing_returns_403_to_non_member(client):
    """Step 5: an id that doesn't exist (or that the caller isn't a
    member of) returns 403, not 404. Hiding the existence distinction
    keeps tournament ids from leaking via membership probes."""
    r = client.get("/tournaments/00000000-0000-0000-0000-000000000001")
    assert r.status_code == 403


def test_patch_updates_name_status_and_date(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.patch(
        f"/tournaments/{created['id']}",
        json={"name": "Renamed", "status": "active", "tournamentDate": "2026-05-01"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["status"] == "active"
    assert body["tournamentDate"] == "2026-05-01"


def test_patch_partial_keeps_other_fields(client):
    created = client.post(
        "/tournaments",
        json={"name": "A", "tournamentDate": "2026-04-01"},
    ).json()
    r = client.patch(f"/tournaments/{created['id']}", json={"status": "active"})
    body = r.json()
    assert body["name"] == "A"
    assert body["tournamentDate"] == "2026-04-01"
    assert body["status"] == "active"


def test_patch_rejects_unknown_status(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.patch(f"/tournaments/{created['id']}", json={"status": "bogus"})
    assert r.status_code == 422


def test_patch_missing_returns_403(client):
    """Step 5: same as GET — non-membership trumps not-found."""
    r = client.patch(
        "/tournaments/00000000-0000-0000-0000-000000000001",
        json={"name": "X"},
    )
    assert r.status_code == 403


def test_delete_returns_204_then_403(client):
    """First DELETE succeeds (caller is owner via creation). Second
    DELETE: the row + member row are both gone (CASCADE), so the
    role check returns 403 — matching the missing/not-a-member pattern
    used by GET and PATCH."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 204
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 403


# ---- Scoped state ------------------------------------------------------


def test_state_get_returns_204_on_empty(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}/state")
    assert r.status_code == 204


def test_state_put_then_get_roundtrip(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    payload = _basic_state("A v1")
    put_r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert put_r.status_code == 200
    # Server stamps updatedAt + version.
    assert put_r.json()["updatedAt"] is not None

    get_r = client.get(f"/tournaments/{tid}/state")
    assert get_r.status_code == 200
    assert get_r.json()["config"]["tournamentName"] == "A v1"


def test_state_put_updates_denormalised_name_on_summary(client):
    created = client.post("/tournaments", json={"name": "Old"}).json()
    tid = created["id"]
    payload = _basic_state("Renamed via PUT")
    client.put(f"/tournaments/{tid}/state", json=payload)
    summary = client.get(f"/tournaments/{tid}").json()
    assert summary["name"] == "Renamed via PUT"


def test_state_put_on_missing_tournament_403(client):
    """Step 5: role check runs first; missing/non-member → 403."""
    payload = _basic_state("X")
    r = client.put(
        "/tournaments/00000000-0000-0000-0000-000000000001/state",
        json=payload,
    )
    assert r.status_code == 403


def test_state_put_overwrites_previous(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("First"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("Second"))
    got = client.get(f"/tournaments/{tid}/state").json()
    assert got["config"]["tournamentName"] == "Second"


def test_state_put_rejects_zero_interval(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    bad = _basic_state("A")
    bad["config"]["intervalMinutes"] = 0
    r = client.put(f"/tournaments/{created['id']}/state", json=bad)
    assert r.status_code == 422


# ---- Scoped backups ----------------------------------------------------


def test_backups_empty_on_fresh_tournament(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}/state/backups")
    assert r.status_code == 200
    assert r.json()["backups"] == []


def test_backup_rotation_after_writes(client):
    """First PUT after create has no prior data → no backup. Subsequent
    PUTs back up the prior payload. Twelve PUTs → 10 backups after rotation."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    for i in range(12):
        client.put(f"/tournaments/{tid}/state", json=_basic_state(f"T{i}"))
    entries = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    # 11 backups created across 12 PUTs (first is no-op); rotated to 10.
    assert len(entries) == 10


def test_create_backup_endpoint_snapshots(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("A v1"))
    r = client.post(f"/tournaments/{tid}/state/backup")
    assert r.status_code == 200
    assert r.json()["created"] is True


def test_restore_backup_replaces_state(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("FIRST"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("SECOND"))
    backups = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    target = backups[-1]["filename"]  # snapshot of FIRST
    r = client.post(f"/tournaments/{tid}/state/restore/{target}")
    assert r.status_code == 200
    live = client.get(f"/tournaments/{tid}/state").json()
    assert live["config"]["tournamentName"] == "FIRST"


def test_restore_unknown_backup_404(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.post(
        f"/tournaments/{created['id']}/state/restore/missing.json",
    )
    assert r.status_code == 404


# ---- Cross-tournament isolation ----------------------------------------


def test_state_writes_do_not_leak_across_tournaments(client):
    a = client.post("/tournaments", json={"name": "A"}).json()
    b = client.post("/tournaments", json={"name": "B"}).json()
    client.put(f"/tournaments/{a['id']}/state", json=_basic_state("A-state"))
    client.put(f"/tournaments/{b['id']}/state", json=_basic_state("B-state"))

    assert (
        client.get(f"/tournaments/{a['id']}/state").json()["config"]["tournamentName"]
        == "A-state"
    )
    assert (
        client.get(f"/tournaments/{b['id']}/state").json()["config"]["tournamentName"]
        == "B-state"
    )


def test_delete_cascades_backups(client):
    """Deleting a tournament drops its backups (CASCADE on the FK).

    Step 5: the post-delete request returns 403 because the member row
    is gone too (CASCADE) — the caller is no longer authorized to ask
    whether backups exist.
    """
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v2"))  # creates a backup
    assert client.get(f"/tournaments/{tid}/state/backups").json()["backups"]

    client.delete(f"/tournaments/{tid}")
    r = client.get(f"/tournaments/{tid}/state/backups")
    assert r.status_code == 403


# ---- Role matrix (Step 5) ---------------------------------------------


def _set_role(role: str, tid: str) -> None:
    """Demote (or promote) the local-dev caller to the given role for
    direct manipulation of the membership table in role-matrix tests."""
    from app.dependencies import LOCAL_DEV_USER_UUID
    from database.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.members.set_role(uuid.UUID(tid), LOCAL_DEV_USER_UUID, role)
    finally:
        session.close()


def _remove_membership(tid: str) -> None:
    """Drop the local-dev member row entirely — simulates a request from
    someone who has zero access to the tournament."""
    from app.dependencies import LOCAL_DEV_USER_UUID
    from database.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.members.remove_member(uuid.UUID(tid), LOCAL_DEV_USER_UUID)
    finally:
        session.close()


def test_role_matrix_owner_can_read_write_delete(client):
    """The user who POSTs ``/tournaments`` is implicitly owner."""
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    assert client.get(f"/tournaments/{tid}").status_code == 200
    assert client.put(f"/tournaments/{tid}/state", json=_basic_state("v")).status_code == 200
    assert client.patch(f"/tournaments/{tid}", json={"status": "active"}).status_code == 200
    assert client.delete(f"/tournaments/{tid}").status_code == 204


def test_role_matrix_operator_can_read_write_but_not_delete(client):
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    _set_role("operator", tid)

    assert client.get(f"/tournaments/{tid}").status_code == 200
    assert client.put(f"/tournaments/{tid}/state", json=_basic_state("v")).status_code == 200
    assert client.patch(f"/tournaments/{tid}", json={"status": "active"}).status_code == 200
    # DELETE / restore are owner-only.
    assert client.delete(f"/tournaments/{tid}").status_code == 403


def test_role_matrix_viewer_can_read_but_not_write(client):
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    _set_role("viewer", tid)

    assert client.get(f"/tournaments/{tid}").status_code == 200
    assert client.get(f"/tournaments/{tid}/state").status_code in (200, 204)
    # Writes blocked.
    assert client.put(f"/tournaments/{tid}/state", json=_basic_state("v")).status_code == 403
    assert client.patch(f"/tournaments/{tid}", json={"status": "active"}).status_code == 403
    assert client.delete(f"/tournaments/{tid}").status_code == 403


def test_role_matrix_non_member_gets_403_everywhere(client):
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    _remove_membership(tid)

    assert client.get(f"/tournaments/{tid}").status_code == 403
    assert client.get(f"/tournaments/{tid}/state").status_code == 403
    assert client.put(f"/tournaments/{tid}/state", json=_basic_state("v")).status_code == 403
    assert client.patch(f"/tournaments/{tid}", json={"status": "active"}).status_code == 403
    assert client.delete(f"/tournaments/{tid}").status_code == 403


def test_role_matrix_owner_only_for_restore(client):
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v2"))
    backups = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    assert backups
    target = backups[-1]["filename"]

    # Operator can list + create backups but cannot restore.
    _set_role("operator", tid)
    assert client.get(f"/tournaments/{tid}/state/backups").status_code == 200
    assert client.post(f"/tournaments/{tid}/state/backup").status_code == 200
    assert client.post(f"/tournaments/{tid}/state/restore/{target}").status_code == 403

    # Owner restore succeeds.
    _set_role("owner", tid)
    assert client.post(f"/tournaments/{tid}/state/restore/{target}").status_code == 200


def test_list_tournaments_returns_only_user_memberships(client):
    """Two tournaments exist; the caller is a member of only one."""
    own_id = client.post("/tournaments", json={"name": "Mine"}).json()["id"]

    # Create a second tournament that the local-dev user is NOT a member
    # of (simulating a tournament owned by a different user).
    other_uuid = uuid.uuid4()
    from database.session import SessionLocal
    from database.models import Tournament
    session = SessionLocal()
    try:
        session.add(Tournament(id=other_uuid, data={}, name="Other"))
        session.commit()
    finally:
        session.close()

    listing = client.get("/tournaments").json()
    listed_ids = {row["id"] for row in listing}
    assert own_id in listed_ids
    assert str(other_uuid) not in listed_ids


# ---- Step 6: role + ownerName fields ---------------------------------


def test_create_response_includes_role_and_owner_name(client):
    """Creator becomes owner; the synthetic local-dev user has
    email='local@dev' which surfaces as ownerName."""
    r = client.post("/tournaments", json={"name": "A"})
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "owner"
    assert body["ownerName"] == "local@dev"


def test_list_response_includes_role_per_row(client):
    own_id = client.post("/tournaments", json={"name": "Owned"}).json()["id"]
    shared_id = client.post("/tournaments", json={"name": "Shared"}).json()["id"]
    # Demote the second to viewer so it shows up in the shared section.
    _set_role("viewer", shared_id)

    rows = client.get("/tournaments").json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[own_id]["role"] == "owner"
    assert by_id[shared_id]["role"] == "viewer"


def test_get_response_includes_role_and_owner_name(client):
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    body = client.get(f"/tournaments/{tid}").json()
    assert body["role"] == "owner"
    assert body["ownerName"] == "local@dev"


def test_patch_preserves_owner_name(client):
    """A rename shouldn't clear the denormalised owner email."""
    tid = client.post("/tournaments", json={"name": "Original"}).json()["id"]
    r = client.patch(f"/tournaments/{tid}", json={"name": "Renamed"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["ownerName"] == "local@dev"


def test_shared_row_keeps_original_owner_name(client):
    """A tournament owned by someone else (here: a manually seeded row
    with a different owner_email) still reports that original owner
    even when the caller has a non-owner role on it."""
    from database.models import Tournament, TournamentMember
    from database.session import SessionLocal
    from app.dependencies import LOCAL_DEV_USER_UUID

    other_owner_uuid = uuid.uuid4()
    shared_id = uuid.uuid4()
    session = SessionLocal()
    try:
        session.add(Tournament(
            id=shared_id,
            data={},
            name="Owned by someone else",
            owner_id=other_owner_uuid,
            owner_email="alice@example.com",
        ))
        # Caller is just a viewer on this one.
        session.add(TournamentMember(
            tournament_id=shared_id,
            user_id=LOCAL_DEV_USER_UUID,
            role="viewer",
        ))
        session.commit()
    finally:
        session.close()

    rows = client.get("/tournaments").json()
    matching = [r for r in rows if r["id"] == str(shared_id)]
    assert len(matching) == 1
    assert matching[0]["role"] == "viewer"
    assert matching[0]["ownerName"] == "alice@example.com"
