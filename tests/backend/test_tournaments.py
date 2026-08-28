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
from sqlalchemy.orm import Session as _SA_SESSION

from _helpers import isolate_test_database


def _boom_on_commit(self, *args, **kwargs):
    """Fail the write at the commit boundary.

    Injection point for the two atomicity tests below, which assert that
    a failure in the mutation-to-commit window rolls the *whole*
    transaction back — neither the cleared schedule nor the edited
    config may leak.

    These tests previously patched ``SyncService.enqueue_tournament``,
    which happened to sit in that window. The Supabase mirror was removed
    in SP-CLOUD-3 / 0.E, so the scaffolding went with it. Patching
    ``Session.commit`` expresses the same guarantee against a seam that
    can never become vestigial — deliberately chosen over retaining a
    now-purposeless ``flush()`` in the repository just so a test could
    patch it, since the next dead-code sweep would rightly delete it.
    """
    raise RuntimeError("simulated failure between mutation and commit")


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from workspaces import tournaments

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


def test_list_uses_membership_constrained_repository_query(client, monkeypatch):
    client.post("/tournaments", json={"name": "Visible"})

    from repositories import open_repository
    import repositories.local as local_mod

    with open_repository() as repo:
        repo.tournaments.create(name="Hidden")

    def forbidden_list_all(_self):
        raise AssertionError("list endpoint must not materialize every tournament")

    monkeypatch.setattr(local_mod._LocalTournamentRepo, "list_all", forbidden_list_all)

    response = client.get("/tournaments")

    assert response.status_code == 200
    assert [row["name"] for row in response.json()] == ["Visible"]


def test_get_returns_summary(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.get(f"/tournaments/{created['id']}")
    assert r.status_code == 200
    assert r.json()["name"] == "A"


def test_get_missing_returns_404_to_non_member(client):
    """SP-CLOUD-2 Rule 5: an id that doesn't exist (or that the caller
    isn't a member of) returns a uniform 404 — existence never leaks
    to non-members."""
    r = client.get("/tournaments/00000000-0000-0000-0000-000000000001")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


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


def test_patch_missing_returns_404(client):
    """Rule 5: same as GET — uniform 404 for missing/non-member."""
    r = client.patch(
        "/tournaments/00000000-0000-0000-0000-000000000001",
        json={"name": "X"},
    )
    assert r.status_code == 404


def test_delete_returns_204_then_404(client):
    """First DELETE succeeds (caller is owner via creation). Second
    DELETE: the row + member row are both gone (CASCADE), so the seam
    answers the uniform 404 (Rule 5)."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 204
    r = client.delete(f"/tournaments/{created['id']}")
    assert r.status_code == 404


# ---- Scoped state ------------------------------------------------------


def test_state_get_returns_204_on_empty(client):
    """Tournament created without a name has no seeded config → still 204."""
    created = client.post("/tournaments", json={}).json()
    r = client.get(f"/tournaments/{created['id']}/state")
    assert r.status_code == 204


def test_create_seeds_config_with_name_and_date(client):
    """create_tournament seeds config.tournamentName + config.tournamentDate
    so SetupTab reads the dashboard name on first open instead of blank fields."""
    r = client.post(
        "/tournaments",
        json={"name": "Spring Open", "tournamentDate": "2026-06-01"},
    )
    assert r.status_code == 201
    tid = r.json()["id"]
    state = client.get(f"/tournaments/{tid}/state")
    assert state.status_code == 200
    cfg = state.json()["config"]
    assert cfg["tournamentName"] == "Spring Open"
    assert cfg["tournamentDate"] == "2026-06-01"


def test_create_without_date_seeds_only_name(client):
    """Seeded config includes all required defaults regardless of date."""
    r = client.post("/tournaments", json={"name": "No Date Open"})
    assert r.status_code == 201
    tid = r.json()["id"]
    state = client.get(f"/tournaments/{tid}/state")
    assert state.status_code == 200
    cfg = state.json()["config"]
    assert cfg["tournamentName"] == "No Date Open"
    # tournamentDate absent or None is fine — not seeded
    assert cfg.get("tournamentDate") is None
    # Required fields must be present so the first frontend PUT doesn't 422.
    assert cfg["intervalMinutes"] == 30
    assert cfg["courtCount"] == 4


def test_create_seeded_config_survives_put_roundtrip(client):
    """The seeded config must be Pydantic-valid so the first frontend PUT
    (which snapshots Zustand state) doesn't return 422.

    Simulates the frontend flow: GET seeded state → mutate name → PUT back.
    """
    r = client.post("/tournaments", json={"name": "X"}).json()
    tid = r["id"]
    state = client.get(f"/tournaments/{tid}/state").json()
    # Mutate as the frontend would (name change), then PUT the full blob back.
    state["config"]["tournamentName"] = "Y"
    state.setdefault("version", 2)
    state.setdefault("scheduleStats", None)
    state.setdefault("scheduleIsStale", False)
    state.setdefault("scheduleVersion", 0)
    state.setdefault("scheduleHistory", [])
    put = client.put(f"/tournaments/{tid}/state", json=state)
    assert put.status_code == 200, put.text
    assert put.json()["config"]["tournamentName"] == "Y"


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


def test_state_put_on_missing_tournament_404(client):
    """Rule 5: the seam runs first; missing/non-member → uniform 404."""
    payload = _basic_state("X")
    r = client.put(
        "/tournaments/00000000-0000-0000-0000-000000000001/state",
        json=payload,
    )
    assert r.status_code == 404


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


# ---- Meet standings (Task 2) --------------------------------------------
#
# Authoritative pool (school-vs-school) standings, computed fresh on every
# GET /state from meet.standings.compute_meet_standings — see
# .superpowers/sdd/display/task-2-brief.md. matches/groups/players come
# from the persisted state blob (PUT below); finished/score data lives in
# the separate match_states table, seeded here directly through the repo
# since match_state.py's router isn't mounted on this test app's client.


def _seed_match_state(tid: str, match_id: str, *, status: str, score_a=None, score_b=None) -> None:
    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.match_states.upsert(
            uuid.UUID(tid),
            match_id,
            {"status": status, "score_side_a": score_a, "score_side_b": score_b},
        )
    finally:
        session.close()


def _meet_state_with_pool_play(name: str) -> dict:
    state = _basic_state(name)
    state["groups"] = [
        {"id": "g1", "name": "Riverside"},
        {"id": "g2", "name": "Lakeside"},
    ]
    state["players"] = [
        {"id": "p1", "name": "Alice", "groupId": "g1", "availability": []},
        {"id": "p2", "name": "Bob", "groupId": "g2", "availability": []},
    ]
    state["matches"] = [
        {"id": "m1", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 1},
    ]
    return state


def test_state_returns_standings_for_meet_workspace_with_finished_matches(client):
    """A meet (default kind) workspace with a finished, scored pool match
    surfaces non-empty, computed standings on GET /state."""
    created = client.post("/tournaments", json={"name": "Meet"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_meet_state_with_pool_play("Meet"))
    _seed_match_state(tid, "m1", status="finished", score_a=21, score_b=15)

    got = client.get(f"/tournaments/{tid}/state").json()
    assert got["standings"] == [
        {"groupId": "g1", "groupName": "Riverside", "matchesPlayed": 1, "wins": 1, "losses": 0},
        {"groupId": "g2", "groupName": "Lakeside", "matchesPlayed": 1, "wins": 0, "losses": 1},
    ]


def test_state_standings_empty_for_bracket_only_workspace(client):
    """Same matches/groups/players/match_states shape, but the workspace is
    bracket-kind (meet module only 'available', not 'enabled') — standings
    must be []."""
    created = client.post("/tournaments", json={"name": "Bracket", "kind": "bracket"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_meet_state_with_pool_play("Bracket"))
    _seed_match_state(tid, "m1", status="finished", score_a=21, score_b=15)

    got = client.get(f"/tournaments/{tid}/state").json()
    assert got["standings"] == []


def test_state_standings_not_persisted_by_put(client):
    """standings is derived, not part of the stored blob: PUT-ing a state
    payload that includes a (client-stale) standings value must not make
    it survive into what GET recomputes — the recompute always wins."""
    created = client.post("/tournaments", json={"name": "Meet"}).json()
    tid = created["id"]
    payload = _meet_state_with_pool_play("Meet")
    payload["standings"] = [
        {"groupId": "bogus", "groupName": "Bogus", "matchesPlayed": 99, "wins": 99, "losses": 0}
    ]
    client.put(f"/tournaments/{tid}/state", json=payload)
    # Assert that standings were excluded from the persisted blob itself.
    # This guards the real exclusion point (the PUT handler's
    # model_dump(exclude={"standings"})), not just a recomputed GET.
    from db.session import SessionLocal
    from db.models import Tournament
    session = SessionLocal()
    try:
        row = session.query(Tournament).filter(Tournament.id == uuid.UUID(tid)).one()
        assert "standings" not in row.data, "standings should not be persisted in data blob"
    finally:
        session.close()


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
    # Backups are newest-first. Since create now seeds the config with name
    # "A", the PUT("FIRST") backs up the seeded "A" data (oldest), and
    # PUT("SECOND") backs up "FIRST" (newest). Use backups[0] for "FIRST".
    target = backups[0]["filename"]  # snapshot of FIRST (newest backup)
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

    Rule 5: the post-delete request returns 404 because the member row
    is gone too (CASCADE) — the caller can no longer even learn whether
    the workspace existed.
    """
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v2"))  # creates a backup
    assert client.get(f"/tournaments/{tid}/state/backups").json()["backups"]

    client.delete(f"/tournaments/{tid}")
    r = client.get(f"/tournaments/{tid}/state/backups")
    assert r.status_code == 404


# ---- Role matrix (Step 5) ---------------------------------------------


def _set_role(role: str, tid: str) -> None:
    """Demote (or promote) the local-dev caller to the given role for
    direct manipulation of the membership table in role-matrix tests."""
    from core.dependencies import LOCAL_DEV_USER_UUID
    from db.session import SessionLocal
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
    from core.dependencies import LOCAL_DEV_USER_UUID
    from db.session import SessionLocal
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


def test_role_matrix_non_member_gets_404_everywhere(client):
    """Rule 5: non-members get the uniform 404 on every verb."""
    tid = client.post("/tournaments", json={"name": "A"}).json()["id"]
    _remove_membership(tid)

    assert client.get(f"/tournaments/{tid}").status_code == 404
    assert client.get(f"/tournaments/{tid}/state").status_code == 404
    assert client.put(f"/tournaments/{tid}/state", json=_basic_state("v")).status_code == 404
    assert client.patch(f"/tournaments/{tid}", json={"status": "active"}).status_code == 404
    assert client.delete(f"/tournaments/{tid}").status_code == 404


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
    from db.session import SessionLocal
    from db.models import Tournament
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
    from db.models import Tournament, TournamentMember
    from db.session import SessionLocal
    from core.dependencies import LOCAL_DEV_USER_UUID
    from identity.auth import ensure_bootstrap_user

    other_owner_uuid = uuid.uuid4()
    shared_id = uuid.uuid4()
    session = SessionLocal()
    try:
        # The membership below is hand-seeded rather than earned through
        # the API, so nothing has materialized the bootstrap operator yet
        # — and ``tournament_members.user_id`` is an FK to ``users``.
        ensure_bootstrap_user(session)
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


# ---- Generalized schedule lock (Plan C, Task 3) --------------------------


def _state_with_schedule(name: str = "Locked") -> dict:
    s = _basic_state(name)
    s["matches"] = [
        {"id": "m1", "sideA": ["p1"], "sideB": ["p2"], "durationSlots": 2}
    ]
    s["schedule"] = {
        "assignments": [
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 2}
        ],
        "status": "optimal",  # ScheduleDTO.status is required; brief omitted it
    }
    return s


def test_scheduling_field_locked_while_schedule_retained(client):
    created = client.post("/tournaments", json={"name": "L"}).json()
    tid = created["id"]
    assert client.put(f"/tournaments/{tid}/state", json=_state_with_schedule()).status_code == 200

    edited = _state_with_schedule()
    edited["config"]["defaultRestMinutes"] = 5  # scheduling-relevant
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CONFIG_LOCKED"
    assert detail["fields"] == ["defaultRestMinutes"]
    assert "meet" in detail["schedules"]


def test_non_scheduling_field_passes_while_locked(client):
    created = client.post("/tournaments", json={"name": "L2"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["scoringFormat"] = "simple"  # exempt
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 200


def test_clearing_schedule_in_same_put_passes_without_flag(client):
    # The sanctioned unlock path: the client nulls the schedule itself.
    created = client.post("/tournaments", json={"name": "L3"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["defaultRestMinutes"] = 5
    edited["schedule"] = None
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 200


def test_clear_schedule_flag_clears_and_applies_atomically(client):
    created = client.post("/tournaments", json={"name": "L4"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()  # still carries assignments
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200
    after = client.get(f"/tournaments/{tid}/state").json()
    assert after["schedule"] is None
    assert after["config"]["defaultRestMinutes"] == 5


def test_venue_structural_fields_still_lock(client):
    # The old _STRUCTURAL_CONFIG guard is subsumed, not lost.
    created = client.post("/tournaments", json={"name": "L5"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule())

    edited = _state_with_schedule()
    edited["config"]["courtCount"] = 8
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    assert r.json()["detail"]["fields"] == ["courtCount"]


def test_clear_schedule_flag_atomic_rollback_on_write_failure(client, monkeypatch):
    """If the single commit that would clear+apply fails mid-way, the
    prior schedule must survive intact — no half-cleared state.

    We force the failure inside ``upsert_data`` — after the in-memory
    ``row.data`` mutation, before the write lands — by making
    ``session.commit()`` itself raise. Since nothing commits, the DB row
    is untouched and a fresh read must show the original schedule and
    config, not a partially-applied edit.

    (This used to fire by making the sync-outbox staging step raise. The
    outbox is gone — ADR 0012 — so the commit is patched directly; the
    property under test is unchanged.)
    """
    created = client.post("/tournaments", json={"name": "L6"}).json()
    tid = created["id"]
    original = _state_with_schedule()
    assert client.put(f"/tournaments/{tid}/state", json=original).status_code == 200

    monkeypatch.setattr(_SA_SESSION, "commit", _boom_on_commit)

    edited = _state_with_schedule()
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 500

    # Undo the monkeypatch so the verifying GET (and repo internals) work.
    monkeypatch.undo()

    after = client.get(f"/tournaments/{tid}/state").json()
    assert after["schedule"] is not None
    assert after["schedule"]["assignments"] == original["schedule"]["assignments"]
    # The other half of atomicity: the edit must not leak through either.
    assert after["config"]["defaultRestMinutes"] == original["config"]["defaultRestMinutes"]


# ---- Bracket joins the schedule lock (Plan C, Task 4) --------------------


def _seed_bracket_schedule(tid: str, *, started: bool = False) -> None:
    """Plant a bracket event + a ``bracket_session`` assignments blob
    directly through the repository (the bracket routers aren't mounted
    in this module's ``app``).

    Uses ``db.session.SessionLocal`` directly — the same pattern
    ``test_shared_row_keeps_original_owner_name`` uses above — rather
    than a nonexistent ``get_repository_factory`` seam, so the write
    lands in the same per-test SQLite file the ``client`` fixture bound
    via ``isolate_test_database``.
    """
    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        t_uuid = _uuid.UUID(tid)
        repo.brackets.create_event(
            t_uuid,
            "MS",
            discipline="MS",
            format="se",
            duration_slots=2,
            status="started" if started else "generated",
        )
        row = repo.tournaments.get_by_id(t_uuid)
        data = dict(row.data or {})
        data["bracket_session"] = {
            "total_slots": 128,
            "assignments": [
                {"play_unit_id": "MS-R1-M1", "slot_id": 0, "court_id": 1,
                 "duration_slots": 2}
            ],
        }
        repo.tournaments.upsert_data(t_uuid, data)
    finally:
        session.close()


def test_bracket_assignments_lock_scheduling_fields(client):
    created = client.post("/tournaments", json={"name": "B1"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B1"))
    _seed_bracket_schedule(tid)

    edited = _basic_state("B1")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CONFIG_LOCKED"
    assert detail["schedules"] == ["bracket"]


def test_config_locked_lists_both_schedules_when_both_committed(client):
    """When BOTH the meet and bracket schedules are committed, the
    CONFIG_LOCKED 409 payload must disclose both — the frontend confirm
    modal relies on ``schedules`` to warn the operator the bracket
    schedule will also be cleared."""
    created = client.post("/tournaments", json={"name": "B6"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule("B6"))
    _seed_bracket_schedule(tid)

    edited = _state_with_schedule("B6")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state", json=edited)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CONFIG_LOCKED"
    assert detail["schedules"] == ["meet", "bracket"]


def test_clear_schedule_flag_clears_both_when_both_committed(client):
    """The sanctioned clearSchedule=true PUT clears BOTH schedules
    atomically when both are committed — the combined case the audit
    flagged as uncovered."""
    created = client.post("/tournaments", json={"name": "B7"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule("B7"))
    _seed_bracket_schedule(tid)

    edited = _state_with_schedule("B7")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200
    after = client.get(f"/tournaments/{tid}/state").json()
    assert after["schedule"] is None
    assert after["config"]["defaultRestMinutes"] == 5

    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        data = repo.tournaments.get_by_id(_uuid.UUID(tid)).data
    finally:
        session.close()
    assert data["bracket_session"].get("assignments") in (None, [])


def test_clear_schedule_strips_bracket_assignments(client):
    created = client.post("/tournaments", json={"name": "B2"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B2"))
    _seed_bracket_schedule(tid)

    edited = _basic_state("B2")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200

    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        data = repo.tournaments.get_by_id(_uuid.UUID(tid)).data
    finally:
        session.close()
    assert data["bracket_session"].get("assignments") in (None, [])
    # The rest of the session blob survives (total_slots untouched).
    assert data["bracket_session"]["total_slots"] == 128


def test_started_draw_does_not_block_meet_only_clear(client):
    """A started bracket event with NO committed bracket assignments must
    not freeze the meet's own clearSchedule path. The DRAW_STARTED hard
    lock protects clearing an in-play bracket schedule — it must not
    fire when there is nothing bracket-side to clear."""
    created = client.post("/tournaments", json={"name": "B5"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_state_with_schedule("B5"))

    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        repo.brackets.create_event(
            _uuid.UUID(tid),
            "MS",
            discipline="MS",
            format="se",
            duration_slots=2,
            status="started",
        )
        # No bracket_session assignments seeded — nothing bracket-side
        # to clear.
    finally:
        session.close()

    edited = _state_with_schedule("B5")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 200
    after = client.get(f"/tournaments/{tid}/state").json()
    assert after["schedule"] is None
    assert after["config"]["defaultRestMinutes"] == 5


def test_started_draw_is_hard_locked_even_with_flag(client):
    created = client.post("/tournaments", json={"name": "B3"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B3"))
    _seed_bracket_schedule(tid, started=True)

    edited = _basic_state("B3")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "DRAW_STARTED"


def test_bracket_clear_atomic_rollback_on_write_failure(client, monkeypatch):
    """Mirrors ``test_clear_schedule_flag_atomic_rollback_on_write_failure``
    for the bracket side: if the single commit that would clear bracket
    assignments + apply the edit fails mid-way, the prior assignments
    must survive intact — no half-cleared state."""
    created = client.post("/tournaments", json={"name": "B4"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("B4"))
    _seed_bracket_schedule(tid)

    monkeypatch.setattr(_SA_SESSION, "commit", _boom_on_commit)

    edited = _basic_state("B4")
    edited["config"]["defaultRestMinutes"] = 5
    r = client.put(f"/tournaments/{tid}/state?clearSchedule=true", json=edited)
    assert r.status_code == 500

    monkeypatch.undo()

    import uuid as _uuid

    from db.session import SessionLocal
    from repositories.local import LocalRepository

    session = SessionLocal()
    try:
        repo = LocalRepository(session)
        data = repo.tournaments.get_by_id(_uuid.UUID(tid)).data
    finally:
        session.close()
    assert data["bracket_session"]["assignments"] == [
        {"play_unit_id": "MS-R1-M1", "slot_id": 0, "court_id": 1,
         "duration_slots": 2}
    ]
    # The config edit must not have applied either (atomic all-or-nothing).
    assert data["config"]["defaultRestMinutes"] == 30


# ---- Backup retention, download and delete (SP-CONSOLE-2 WSB-3) ---------


def test_manual_backup_survives_any_number_of_automatic_writes(client):
    """The failure O-5 found in the wild: ten routine writes during setup
    evicted the snapshot a director took deliberately that morning, which is
    the one entry the feature exists for."""
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("seed"))

    manual = client.post(f"/tournaments/{tid}/state/backup").json()
    assert manual["created"] is True

    # Far more automatic writes than the keep window.
    for i in range(25):
        client.put(f"/tournaments/{tid}/state", json=_basic_state(f"T{i}"))

    entries = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    names = [e["filename"] for e in entries]
    assert manual["filename"] in names
    assert any(e["origin"] == "manual" for e in entries)


def test_automatic_backups_thin_to_one_per_hour_beyond_the_keep_window(client):
    """A bounded list is not the same as a useful one. Beyond the newest N,
    automatic rows keep one per hour so a mistake noticed at 4pm still has
    something from the morning to go back to."""
    import datetime as _dt

    from db.session import SessionLocal
    from db.models import TournamentBackup

    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("seed"))

    # Plant a day's worth of automatic rows: 6 per hour across 8 hours.
    session = SessionLocal()
    try:
        base = _dt.datetime(2026, 8, 10, 9, 0, tzinfo=_dt.timezone.utc)
        for hour in range(8):
            for minute in range(0, 60, 10):
                session.add(
                    TournamentBackup(
                        tournament_id=uuid.UUID(tid),
                        filename=f"auto-{hour:02d}{minute:02d}.json",
                        snapshot={"x": 1},
                        size_bytes=8,
                        origin="auto",
                        created_at=base + _dt.timedelta(hours=hour, minutes=minute),
                    )
                )
        session.commit()
    finally:
        session.close()

    # One more state write triggers rotation.
    client.put(f"/tournaments/{tid}/state", json=_basic_state("trigger"))

    entries = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    stamps = [e["modifiedAt"] for e in entries]
    # Bounded…
    assert len(entries) < 20
    # …and it still reaches back across the day rather than the last few minutes.
    assert min(stamps) < max(stamps)
    assert any(s.startswith("2026-08-10T09") for s in stamps), stamps


def test_backup_download_returns_the_snapshot_without_replacing_anything(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    filename = client.post(f"/tournaments/{tid}/state/backup").json()["filename"]

    r = client.get(f"/tournaments/{tid}/state/backups/{filename}")
    assert r.status_code == 200
    assert r.headers["content-disposition"].endswith(f'filename="{filename}"')
    assert isinstance(r.json(), dict)

    # Non-destructive: the workspace is untouched.
    assert client.get(f"/tournaments/{tid}/state/backups").json()["backups"]


def test_backup_delete_removes_one_row_and_404s_for_an_unknown_name(client):
    created = client.post("/tournaments", json={"name": "A"}).json()
    tid = created["id"]
    client.put(f"/tournaments/{tid}/state", json=_basic_state("v1"))
    filename = client.post(f"/tournaments/{tid}/state/backup").json()["filename"]

    assert client.delete(f"/tournaments/{tid}/state/backups/{filename}").status_code == 204
    remaining = client.get(f"/tournaments/{tid}/state/backups").json()["backups"]
    assert filename not in [e["filename"] for e in remaining]

    assert client.delete(f"/tournaments/{tid}/state/backups/nope.json").status_code == 404
