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


def _etag(response) -> str:
    """The concurrency token a real client would keep from this response."""
    tag = response.headers.get("etag")
    assert tag, f"no ETag on {response.request.method} {response.request.url}"
    return tag


def _load(client, tid) -> tuple[dict, str]:
    """One tab hydrating: the state plus the version it now holds."""
    r = client.get(f"/tournaments/{tid}/state")
    assert r.status_code == 200, r.text
    return r.json(), _etag(r)


def _save(client, tid, payload: dict, etag: str):
    """One tab saving, carrying the version it loaded — as the client does."""
    return client.put(
        f"/tournaments/{tid}/state", json=payload, headers={"If-Match": etag}
    )


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
    seed_etag = _etag(client.get(f"/tournaments/{tid}/state"))
    r = _save(client, tid, payload, seed_etag)
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
    """The tournament-day scenario.

    Tablet adds a player; laptop — which loaded before that write — changes
    the court count. The laptop's blob still carries the old one-player
    roster, so accepting it would silently revert the tablet's addition.

    Phase 0 left this asserting "either 409 or a merge, but never a silent
    revert", with a pytest.fail on the 409 branch and a note to assert the
    body once conflict detection landed. It has landed; this is that
    assertion.
    """
    baseline = _seed(client, tid)

    # Both sessions load the same snapshot at T0 — same state, same version.
    state, shared_etag = _load(client, tid)
    tablet = _writable(state)
    laptop = _writable(state)

    # T1 — tablet adds a player to the roster.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r1 = _save(client, tid, tablet, shared_etag)
    assert r1.status_code == 200, r1.text

    # T2 — laptop, still holding its T0 version, edits an unrelated field.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    r2 = _save(client, tid, laptop, shared_etag)

    assert r2.status_code == 409, (
        f"LOST UPDATE: the stale write was accepted with {r2.status_code}"
    )
    detail = r2.json()["detail"]
    assert detail["code"] == "STATE_VERSION_CONFLICT"
    assert detail["currentVersion"] > detail["seenVersion"]

    # The refusal carries the current state, so the client can reconcile
    # without a second round trip. That is the whole point of answering 409
    # with a body rather than a bare 412.
    assert [p["name"] for p in detail["currentState"]["players"]] == ["Alice", "Bob"]

    # And Bob is still there — nothing was reverted.
    final = client.get(f"/tournaments/{tid}/state").json()
    assert sorted(p["name"] for p in final["players"]) == ["Alice", "Bob"]
    assert baseline is not None


def test_court_edit_survives_concurrent_roster_edit(client, tid):
    """The mirror ordering — before Phase 1, whoever wrote second won
    entirely, whichever tab that happened to be."""
    _seed(client, tid)
    state, shared_etag = _load(client, tid)
    tablet = _writable(state)
    laptop = _writable(state)

    # T1 — laptop changes court count.
    laptop["config"] = {**laptop["config"], "courtCount": 6}
    assert _save(client, tid, laptop, shared_etag).status_code == 200

    # T2 — tablet, holding its T0 version, adds a player.
    tablet["players"] = tablet["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    r2 = _save(client, tid, tablet, shared_etag)
    assert r2.status_code == 409, "the stale writer won again"

    # The court change survives — it is no longer at the mercy of write order.
    final = client.get(f"/tournaments/{tid}/state").json()
    assert final["config"]["courtCount"] == 6

    # And the tablet can now succeed by reloading first, which is exactly what
    # the client does on a 409. The conflict is recoverable, not a dead end.
    fresh, fresh_etag = _load(client, tid)
    retry = _writable(fresh)
    retry["players"] = retry["players"] + [
        {"id": "p2", "name": "Bob", "groupId": "g1", "ranks": ["MS2"]}
    ]
    assert _save(client, tid, retry, fresh_etag).status_code == 200
    merged = client.get(f"/tournaments/{tid}/state").json()
    assert sorted(p["name"] for p in merged["players"]) == ["Alice", "Bob"]
    assert merged["config"]["courtCount"] == 6


def test_stale_write_is_detectable_at_all(client, tid):
    """The minimum bar (Rule 2): a stale write must be distinguishable."""
    _seed(client, tid)
    baseline, stale_etag = _load(client, tid)
    stale = _writable(baseline)

    fresh = _writable(baseline)
    fresh["config"] = {**fresh["config"], "courtCount": 6}
    assert _save(client, tid, fresh, stale_etag).status_code == 200

    # Replay the T0 copy verbatim, with the version it was loaded at. It is
    # provably based on a superseded revision.
    r = _save(client, tid, stale, stale_etag)
    assert r.status_code == 409, (
        f"a write based on a superseded revision was accepted with {r.status_code}"
    )


def test_missing_if_match_is_refused_not_guessed(client, tid):
    """Fail-closed: an absent precondition is rejected, not assumed current.

    This is the difference between this guard and ``seen_version`` on
    /bracket/results, which is Optional and therefore silently does nothing
    for any caller that forgets it. A precondition that is optional is a
    precondition that will be omitted.

    412 rather than 409: there is no conflict to reconcile and no state worth
    returning — it is a client bug.
    """
    _seed(client, tid)
    state, _ = _load(client, tid)
    r = client.put(f"/tournaments/{tid}/state", json=_writable(state))
    assert r.status_code == 412
    assert r.json()["detail"]["code"] == "STATE_VERSION_REQUIRED"


def test_write_response_carries_the_next_version(client, tid):
    """A client must be able to save twice without re-reading in between.

    If the PUT response did not hand back the new ETag, every second
    consecutive save would conflict with the client's own previous one.
    """
    _seed(client, tid)
    state, etag = _load(client, tid)
    body = _writable(state)

    body["config"] = {**body["config"], "courtCount": 5}
    first = _save(client, tid, body, etag)
    assert first.status_code == 200
    next_etag = _etag(first)
    assert next_etag != etag

    body["config"] = {**body["config"], "courtCount": 7}
    assert _save(client, tid, body, next_etag).status_code == 200


def test_conflicts_are_counted_for_observability(client, tid):
    """0.F — a rejected stale write is visible to an operator.

    A conflict is an event, not a column, so it cannot be derived from the
    schema the way the rest of /health/metrics is. Counted in-process.
    """
    from services import conflict_metrics

    conflict_metrics.reset()
    _seed(client, tid)
    state, shared = _load(client, tid)

    assert _save(client, tid, _writable(state), shared).status_code == 200
    assert _save(client, tid, _writable(state), shared).status_code == 409

    snap = conflict_metrics.snapshot()
    assert snap["total"] == 1
    assert snap["byPath"]["PUT /tournaments/{id}/state"] == 1
    assert snap["lastConflictAt"] is not None
