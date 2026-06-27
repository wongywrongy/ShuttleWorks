"""SP-F3 — bracket result recording through optimistic concurrency.

Bracket result writes now route through a client command queue that mirrors
the meet path: a UUID idempotency key (client-side, in IndexedDB) plus
version-based optimistic concurrency on the server. ``BracketMatch`` already
carries a ``version`` column, so this needs no Alembic migration — only the
``/results`` route grows an optional ``seen_version`` token.

Semantics (mirroring the meet ``submitCommand`` 409 contract):
  - Omitting ``seen_version`` keeps the legacy behavior untouched (every
    pre-existing caller + test still passes).
  - A ``seen_version`` that does not match the match's current version is a
    stale write — the route returns 409 ``stale_version`` and records nothing
    and advances nothing.
  - A matching ``seen_version`` commits and advances exactly as before.

Advancement stays bracket-owned: the queue carries the *result*; the bracket
engine processes advancement as a consequence of commit (``record_result``
unchanged).
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from api import brackets, tournaments
    from app.exceptions import ConflictError
    from app.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Optimistic Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _se_4_body() -> dict:
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i}
                    for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }


def _semifinal(state: dict) -> dict:
    return next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 0
    )


def test_state_exposes_match_version(client, tid):
    """The play-unit DTO carries the optimistic-concurrency token so the
    client knows what ``seen_version`` to send."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)
    assert sf1["version"] == 1


def test_stale_seen_version_is_rejected_without_recording(client, tid):
    """A wrong ``seen_version`` is a stale write: 409 stale_version, and
    neither the result nor any downstream advancement lands."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)
    final_before = next(p for p in state["play_units"] if p["round_index"] == 1)
    assert final_before["slot_a"]["feeder_play_unit_id"] == sf1["id"]

    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": sf1["id"],
            "winner_side": "A",
            "finished_at_slot": 0,
            "seen_version": 999,  # deliberately stale
        },
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert body["error"] == "stale_version"
    assert body["current_version"] == 1
    assert body["seen_version"] == 999

    # Nothing recorded, nothing advanced.
    after = client.get(_bracket_url(tid)).json()
    assert after["results"] == []
    final_after = next(p for p in after["play_units"] if p["round_index"] == 1)
    assert final_after["slot_a"]["participant_id"] is None
    assert final_after["slot_a"]["feeder_play_unit_id"] == sf1["id"]


def test_fresh_seen_version_commits_and_advances(client, tid):
    """A matching ``seen_version`` records the result and advances the
    downstream slot."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)
    assert sf1["version"] == 1

    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": sf1["id"],
            "winner_side": "A",
            "finished_at_slot": 0,
            "seen_version": sf1["version"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    new_final = next(p for p in body["play_units"] if p["round_index"] == 1)
    assert new_final["slot_a"]["participant_id"] == sf1["side_a"][0]
    assert new_final["slot_a"]["feeder_play_unit_id"] is None
    assert any(
        res["play_unit_id"] == sf1["id"] and res["winner_side"] == "A"
        for res in body["results"]
    )


def test_omitted_seen_version_keeps_legacy_behavior(client, tid):
    """No ``seen_version`` → no optimistic check; records and advances."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)

    r = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": sf1["id"],
            "winner_side": "B",
            "finished_at_slot": 0,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert any(
        res["play_unit_id"] == sf1["id"] and res["winner_side"] == "B"
        for res in body["results"]
    )


def test_stale_write_to_advanced_match_is_rejected(client, tid):
    """The mechanism end-to-end: advancing both semis bumps the final's
    version, so a writer holding the stale final@v1 is rejected by the
    version check (not the already-recorded guard) and does not
    double-advance; the fresh version then commits."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)
    sf2 = next(
        p
        for p in state["play_units"]
        if p["round_index"] == 0 and p["match_index"] == 1
    )

    # Both semis resolve the final's slots AND bump the final's version.
    for sf in (sf1, sf2):
        r = client.post(
            _bracket_url(tid, "results"),
            json={
                "play_unit_id": sf["id"],
                "winner_side": "A",
                "finished_at_slot": 0,
                "seen_version": sf["version"],
            },
        )
        assert r.status_code == 200, r.text

    after = client.get(_bracket_url(tid)).json()
    final = next(p for p in after["play_units"] if p["round_index"] == 1)
    assert final["version"] > 1  # advancement bumped it

    # A writer holding the stale final@v1 is rejected via the version check.
    stale = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": final["id"], "winner_side": "A", "seen_version": 1},
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["error"] == "stale_version"

    # The fresh version commits.
    ok = client.post(
        _bracket_url(tid, "results"),
        json={
            "play_unit_id": final["id"],
            "winner_side": "A",
            "seen_version": final["version"],
        },
    )
    assert ok.status_code == 200, ok.text
