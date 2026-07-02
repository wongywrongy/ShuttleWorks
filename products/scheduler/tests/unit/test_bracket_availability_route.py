"""SP-D7 S2 route-level end-to-end: roster availability + rest reach the
CP-SAT solve.

Flow: seed tournament → ``PUT /tournaments/{tid}/state`` with a
``bracketPlayers`` roster (one player with a blocked-out morning and an
explicit ``restSlots``) → ``POST /bracket`` (round-robin, 3 entrants, so
one solve wave holds two matches for the same player) → generate → assert
on the REAL solver output:

  (a) the constrained player's matches land only inside the allowed
      window's slots, and
  (b) the player's two matches are separated by >= restSlots.

Both assertions hold for ANY feasible solution, so solver
non-determinism cannot flake them. The full CP-SAT solve is used (not
just the build_problem boundary) — the model is 3 matches / 64 slots,
which solves in milliseconds, and the existing generate-route tests
already run the solver in-suite.
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
    return seed_tournament(client, "Bracket Availability Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


# Session starts 09:00, 30-minute slots → slot k is 09:00 + k*30min.
# p-one is only available 12:00–18:00 → allowed slots [6, 18).
_ALLOWED_START, _ALLOWED_END = 6, 18
_REST_SLOTS = 4


def _rr3_body() -> dict:
    """3-entrant round robin: all 3 matches are ready in ONE solve wave,
    so p-one plays twice within a single schedule — exactly what the
    rest-separation assertion needs."""
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 5.0,
        "start_time": "2026-07-02T09:00:00",
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "rr",
                "participants": [
                    {"id": "p-one", "name": "One"},
                    {"id": "p-two", "name": "Two"},
                    {"id": "p-three", "name": "Three"},
                ],
                "duration_slots": 1,
            }
        ],
    }


def _roster_state() -> dict:
    return {
        "bracketPlayers": [
            {
                "id": "p-one",
                "name": "One",
                "restSlots": _REST_SLOTS,
                # POSITIVE window: mornings are blocked out.
                "availability": [{"start": "12:00", "end": "18:00"}],
            },
            {"id": "p-two", "name": "Two"},
            {"id": "p-three", "name": "Three"},
        ],
    }


def test_generate_honours_roster_windows_and_rest(client, tid):
    # 1. Roster blob first (PUT /state overwrites data but create_bracket
    #    merges bracket_session into whatever is already there).
    r = client.put(f"/tournaments/{tid}/state", json=_roster_state())
    assert r.status_code == 200, r.text

    # 2. Create the bracket session + draft event.
    r = client.post(_bracket_url(tid), json=_rr3_body())
    assert r.status_code == 200, r.text

    # 3. Generate — runs the CP-SAT solver through the hydrated session,
    #    which now carries the roster player_extras.
    r = client.post(
        _bracket_url(tid, "events", "MS", "generate"), json={"wipe": False}
    )
    assert r.status_code == 200, r.text
    body = r.json()

    by_pu = {a["play_unit_id"]: a for a in body["assignments"]}
    p_one_matches = [
        pu
        for pu in body["play_units"]
        if "p-one" in (pu["side_a"] or []) + (pu["side_b"] or [])
    ]
    assert len(p_one_matches) == 2  # RR-3: p-one plays twice
    assert all(pu["id"] in by_pu for pu in p_one_matches)

    spans = sorted(
        (
            by_pu[pu["id"]]["slot_id"],
            by_pu[pu["id"]]["slot_id"] + by_pu[pu["id"]]["duration_slots"],
        )
        for pu in p_one_matches
    )

    # (a) Every p-one match sits fully inside the allowed 12:00–18:00
    #     window (slots [6, 18)).
    for start, end in spans:
        assert start >= _ALLOWED_START, spans
        assert end <= _ALLOWED_END, spans

    # (b) p-one's two matches are separated by >= restSlots.
    (first_start, first_end), (second_start, _) = spans
    assert second_start >= first_end + _REST_SLOTS, spans

    # The schedule persists: a fresh GET (re-hydration) sees the same
    # constrained assignments.
    again = client.get(_bracket_url(tid)).json()
    assert {a["play_unit_id"]: a["slot_id"] for a in again["assignments"]} == {
        a["play_unit_id"]: a["slot_id"] for a in body["assignments"]
    }


def test_generate_without_roster_is_unconstrained_baseline(client, tid):
    """Control: same draw with NO roster blob schedules from slot 0 —
    proving the constraint in the main test comes from the roster
    channel, not from the draw shape."""
    r = client.post(_bracket_url(tid), json=_rr3_body())
    assert r.status_code == 200, r.text
    r = client.post(
        _bracket_url(tid, "events", "MS", "generate"), json={"wipe": False}
    )
    assert r.status_code == 200, r.text
    slots = sorted(a["slot_id"] for a in r.json()["assignments"])
    # Makespan objective packs the wave early — well before slot 6.
    assert slots[0] < _ALLOWED_START
