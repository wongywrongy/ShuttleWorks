"""Public display capability link (SP-CLOUD-2 Rule 8) + email invites.

Pins: unauthenticated read-only access via TOKEN only, projection (no
operator material on the wire), non-enumerability (uniform 404, no raw
UUID acceptance), revocation-by-rotation, and no mutation surface.
"""
from __future__ import annotations

import logging

import pytest

from tests._helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def workspace(client):
    tid = seed_tournament(client, name="TV Night")
    token = client.get(f"/tournaments/{tid}/display-token").json()["token"]
    return tid, token


def test_token_minted_once_and_rotatable(client, workspace):
    tid, token = workspace
    again = client.get(f"/tournaments/{tid}/display-token").json()["token"]
    assert again == token  # stable until rotated

    rotated = client.post(
        f"/tournaments/{tid}/display-token/rotate", headers=CSRF
    ).json()["token"]
    assert rotated != token
    # Old capability is dead, new one lives — for an anonymous caller.
    client.cookies.clear()
    assert client.get(f"/display/{token}/summary").status_code == 404
    assert client.get(f"/display/{rotated}/summary").status_code == 200


def test_projection_is_unauthenticated_and_strips_operator_material(
    client, workspace
):
    tid, token = workspace
    state = {
        "config": {
            "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
            "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0, "tournamentName": "TV Night",
        },
        "players": [], "matches": [], "groups": [],
    }
    assert client.put(f"/tournaments/{tid}/state", json=state).status_code == 200

    client.cookies.clear()  # anonymous spectator
    summary = client.get(f"/display/{token}/summary")
    assert summary.status_code == 200
    assert summary.json()["kind"] == "meet"

    body = client.get(f"/display/{token}/state").json()
    assert body["config"]["tournamentName"] == "TV Night"
    assert "standings" in body
    # Strict projection: ONLY the fields the board renders — the raw
    # blob's operator material (scheduleHistory revert pool,
    # scheduleVersion, planFinalized, bracketPlayers…) never reaches
    # the public wire, whatever the blob accumulates.
    allowed = {
        "config", "groups", "players", "matches",
        "schedule", "scheduleIsStale", "standings",
    }
    assert set(body.keys()) <= allowed, set(body.keys()) - allowed

    ms = client.get(f"/display/{token}/match-states")
    assert ms.status_code == 200 and ms.json() == {}


def test_display_token_is_the_only_public_key(client, workspace):
    tid, token = workspace
    client.cookies.clear()
    # The raw tournament UUID is not a display capability…
    assert client.get(f"/display/{tid}/summary").status_code == 404
    # …nor does the token unlock the authenticated data plane.
    # (In local mode the bootstrap identity is a member of its own
    # workspaces; the isolation suite covers foreign ones. Here: a
    # garbage token answers the same uniform 404 as a real-but-wrong id.)
    assert client.get("/display/not-a-token/state").status_code == 404
    assert (
        client.get("/display/not-a-token/state").json()["detail"]["code"]
        == "TOURNAMENT_NOT_FOUND"
    )


def test_display_routes_have_no_mutation_surface(client, workspace):
    _, token = workspace
    client.cookies.clear()
    for path in ("summary", "state", "match-states", "bracket"):
        r = client.post(f"/display/{token}/{path}", json={})
        assert r.status_code == 405, f"{path} accepted a write"


def test_token_management_is_owner_gated(client, workspace):
    tid, _ = workspace
    from tests._helpers import purge_backend_modules  # noqa: F401

    # A registered non-member gets the uniform 404 on the manage routes.
    client.cookies.clear()
    client.post(
        "/auth/register",
        json={"email": "other@example.com", "password": "a fine passphrase!"},
    )
    assert client.get(f"/tournaments/{tid}/display-token").status_code == 404


def test_email_invite_rides_the_seam_and_expires(client, workspace, caplog):
    tid, _ = workspace
    with caplog.at_level(logging.INFO, logger="scheduler.email"):
        r = client.post(
            f"/tournaments/{tid}/invites",
            json={"role": "viewer", "email": "friend@example.com"},
        )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    mail = [m for m in caplog.messages if "friend@example.com" in m]
    assert mail and f"/invite/{token}" in mail[0]

    listed = client.get(f"/tournaments/{tid}/invites").json()
    row = next(i for i in listed if i["token"] == token)
    assert row["email"] == "friend@example.com"
    assert row["expiresAt"] is not None  # email invites are bounded

    # Public resolve never exposes the invitee's address.
    client.cookies.clear()
    resolved = client.get(f"/invites/{token}").json()
    assert "email" not in resolved or resolved.get("email") is None

    # Link-style invites stay eternal (local mode behavior preserved).


def test_link_invite_still_eternal(client, workspace):
    tid, _ = workspace
    r = client.post(f"/tournaments/{tid}/invites", json={"role": "operator"})
    assert r.status_code == 201
    assert r.json()["token"]
    listed = client.get(f"/tournaments/{tid}/invites").json()
    row = next(i for i in listed if i["token"] == r.json()["token"])
    assert row["expiresAt"] is None and row["email"] is None


# ---- SEC-13: the public state route is cached ------------------------


def test_display_state_is_served_from_a_short_ttl_cache(
    client, workspace, monkeypatch
):
    """The only unauthenticated data plane must not rebuild per request.

    Standings are recomputed from the blob and joined against match_states
    on every call; a leaked capability URL could drive that as fast as it
    liked. Asserted by counting rebuilds, not by timing.
    """
    from services.bracket import response_cache

    response_cache.clear_all()
    tid, token = workspace
    client.put(
        f"/tournaments/{tid}/state",
        json={
            "config": {
                "intervalMinutes": 30, "dayStart": "09:00", "dayEnd": "18:00",
                "breaks": [], "courtCount": 2, "defaultRestMinutes": 0,
                "freezeHorizonSlots": 0, "tournamentName": "TV Night",
            },
            "players": [], "matches": [], "groups": [],
        },
        headers=CSRF,
    )
    client.cookies.clear()

    calls = {"n": 0}
    import api.tournaments as tournaments_api

    real = tournaments_api._meet_standings_for

    def counting(*a, **kw):
        calls["n"] += 1
        return real(*a, **kw)

    monkeypatch.setattr(tournaments_api, "_meet_standings_for", counting)

    for _ in range(3):
        assert client.get(f"/display/{token}/state").status_code == 200
    assert calls["n"] == 1, "standings rebuilt on a cached read"


def test_display_state_and_bracket_caches_do_not_collide(client):
    """Both cache per tournament id; without a namespace one would serve
    the other's payload."""
    from services.bracket import response_cache

    response_cache.clear_all()
    tid = __import__("uuid").uuid4()
    response_cache.put(tid, {"which": "bracket"}, response_cache.BRACKET)
    response_cache.put(tid, {"which": "state"}, response_cache.DISPLAY_STATE)

    assert response_cache.get(tid, response_cache.BRACKET) == {"which": "bracket"}
    assert response_cache.get(tid, response_cache.DISPLAY_STATE) == {"which": "state"}


def test_invalidate_clears_every_namespace(client):
    """A bracket write changes standings the display board also renders."""
    from services.bracket import response_cache

    response_cache.clear_all()
    tid = __import__("uuid").uuid4()
    response_cache.put(tid, {"a": 1}, response_cache.BRACKET)
    response_cache.put(tid, {"b": 2}, response_cache.DISPLAY_STATE)

    response_cache.invalidate(tid)

    assert response_cache.get(tid, response_cache.BRACKET) is None
    assert response_cache.get(tid, response_cache.DISPLAY_STATE) is None
