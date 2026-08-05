"""SP-CLOUD-4 Phase 0.B — reproduction of the lost-update defect.

The scenario from the slice brief, §2: on tournament day a director
adjusts court availability on a laptop while a co-director edits the
roster on a tablet. Both surfaces are driven by ``useTournamentState``,
which snapshots the WHOLE Zustand store and PUTs it to
``/tournaments/{id}/state`` on a 500 ms debounce. The client hydrates
once on load and — per the hook's own comment, "only a 409 re-hydrates"
— never refetches. So each tab holds a copy of the entire blob that is
stale from the moment the other tab writes.

``put_tournament_state`` replaces ``tournament.data`` wholesale. There is
no version column, no ``If-Match``, and no field-level merge. The second
writer therefore restores its stale copy of every field the first writer
touched, and the API answers 200 to both. Nothing is logged, nothing is
surfaced, and the change is gone.

These tests assert the DESIRED behaviour and are EXPECTED TO FAIL until
Phase 1 lands. That failure is the Phase 0 deliverable: it establishes
the defect concretely rather than by argument.

Note the distinction from idempotency, which the solve rail already
handles correctly: these two requests are legitimately DISTINCT. An
idempotency key would not deduplicate them and would not help.
"""
from __future__ import annotations

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


@pytest.fixture
def tid(client):
    r = client.post(
        "/tournaments",
        json={"name": "Concurrency Repro", "tournamentDate": "2026-09-01"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _base_config() -> dict:
    return {
        "tournamentName": "Concurrency Repro",
        "intervalMinutes": 15,
        "dayStart": "08:00",
        "dayEnd": "18:00",
        "courtCount": 4,
        "defaultRestMinutes": 20,
        "freezeHorizonSlots": 0,
        "rankCounts": {"MS": 2},
    }


def _seed(client, tid) -> dict:
    """Establish a committed baseline both 'sessions' then load."""
    payload = {
        "version": 2,
        "config": _base_config(),
        "groups": [{"id": "g1", "name": "School A"}],
        "players": [
            {"id": "p1", "name": "Alice", "groupId": "g1", "ranks": ["MS1"]}
        ],
        "matches": [],
    }
    r = client.put(f"/tournaments/{tid}/state", json=payload)
    assert r.status_code == 200, r.text
    return client.get(f"/tournaments/{tid}/state").json()


def _writable(state: dict) -> dict:
    """Strip server-derived fields the client never sends back.

    ``standings`` is computed per-GET and stripped by the PUT handler;
    mirroring ``snapshot()`` in useTournamentState.ts keeps this an
    honest simulation of what a real tab transmits.
    """
    return {k: v for k, v in state.items() if k not in ("standings", "updatedAt")}


# ---- 0.B: the lost update -------------------------------------------------


def test_roster_edit_survives_concurrent_court_edit(client, tid):
    """The tournament-day scenario. EXPECTED TO FAIL before Phase 1.

    Tablet adds a player; laptop — which loaded before that write —
    changes the court count. The laptop's blob still carries the old
    one-player roster, so the tablet's addition is silently reverted.
    """
    baseline = _seed(client, tid)

    # Both sessions load the same snapshot at T0.
    tablet = _writable(baseline)
    laptop = _writable(baseline)

    # T1 — tablet adds a player to the roster.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r1 = client.put(f"/tournaments/{tid}/state", json=tablet)
    assert r1.status_code == 200, r1.text

    # T2 — laptop, still holding its T0 copy, edits an unrelated field.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    r2 = client.put(f"/tournaments/{tid}/state", json=laptop)

    # Either the server rejects the stale write (409), or it merges.
    # What it must NOT do is accept it and silently drop Bob.
    final = client.get(f"/tournaments/{tid}/state").json()
    names = sorted(p["name"] for p in final["players"])

    if r2.status_code == 409:
        pytest.fail(
            "409 is the Phase 1 target behaviour — remove this branch once "
            "conflict detection lands and assert the 409 body instead."
        )

    assert names == ["Alice", "Bob"], (
        f"LOST UPDATE: the tablet's roster addition vanished. players={names}. "
        f"The laptop's PUT returned {r2.status_code} with no warning."
    )


def test_court_edit_survives_concurrent_roster_edit(client, tid):
    """The mirror ordering — whoever writes second wins entirely."""
    baseline = _seed(client, tid)
    tablet = _writable(baseline)
    laptop = _writable(baseline)

    # T1 — laptop changes court count.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    assert client.put(f"/tournaments/{tid}/state", json=laptop).status_code == 200

    # T2 — tablet, holding its T0 copy, adds a player.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r2 = client.put(f"/tournaments/{tid}/state", json=tablet)
    assert r2.status_code == 200, r2.text

    final = client.get(f"/tournaments/{tid}/state").json()
    assert final["config"]["courtCount"] == 6, (
        "LOST UPDATE: the laptop's court-count change was reverted to "
        f"{final['config']['courtCount']} by the tablet's stale blob."
    )


def test_stale_write_is_detectable_at_all(client, tid):
    """The minimum bar (Rule 2): a stale write must be distinguishable.

    Independent of any merge policy — the server must be ABLE to tell
    that the second writer never saw the first writer's change. Today it
    cannot: the request carries nothing identifying which revision it was
    based on.
    """
    baseline = _seed(client, tid)
    stale = _writable(baseline)

    fresh = _writable(baseline)
    fresh["config"] = {**fresh["config"], "courtCount": 6}
    assert client.put(f"/tournaments/{tid}/state", json=fresh).status_code == 200

    # Replay the T0 copy verbatim. This is provably based on a superseded
    # revision, so it must not be accepted as if it were current.
    r = client.put(f"/tournaments/{tid}/state", json=stale)
    assert r.status_code == 409, (
        "A write based on a superseded revision was accepted with "
        f"{r.status_code}. The server has no way to detect staleness: the "
        "state DTO carries no concurrency version (its `version` field is "
        "the SCHEMA version, and `scheduleVersion` covers only the "
        "proposal-commit pipeline)."
    )
