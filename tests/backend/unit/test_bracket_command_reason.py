"""The record_result bracket command accepts a contingency `reason`.

Contract-only for now (spec 2026-07-14 §1): walkover routing already
exists; `retired` / `forfeit` ride the same result path and their
distinct routing semantics are deferred (debt-log). The model must
(a) accept the three reasons, (b) reject unknown ones, and
(c) normalize reason=="walkover" to walkover=True so the two fields
can't contradict.

Task 5b extends this from "validates" to "persists": ``submit_bracket_command``
used to destructure ``body`` and never read ``.reason`` — the field
validated and was then silently dropped, so a RETIRED/FORFEIT result was
stored indistinguishably from a plain win. The tests below prove the
reason now round-trips through ``POST /bracket/commands`` -> DB ->
``GET /bracket``, and that it is annotation only (advancement/BYE
routing is unchanged from a plain result).
"""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from _helpers import isolate_test_database, seed_tournament

from app.schemas import BracketCommandRequest


def _body(**overrides):
    base = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": "pu1",
        "winner_side": "A",
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("reason", ["walkover", "retired", "forfeit"])
def test_reason_accepted(reason):
    cmd = BracketCommandRequest(**_body(reason=reason))
    assert cmd.reason == reason


def test_reason_defaults_to_none():
    assert BracketCommandRequest(**_body()).reason is None


def test_unknown_reason_rejected():
    with pytest.raises(ValidationError):
        BracketCommandRequest(**_body(reason="rage_quit"))


def test_walkover_reason_forces_walkover_flag():
    cmd = BracketCommandRequest(**_body(reason="walkover", walkover=False))
    assert cmd.walkover is True


# ---------------------------------------------------------------------------
# Persistence round-trip (task 5b): the reason must actually reach the DB
# and come back out of GET /bracket, via POST /bracket/commands.
# ---------------------------------------------------------------------------


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
    return seed_tournament(client, "Bracket Reason Persistence Test")


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


def _command_body(play_unit_id: str, **overrides) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": play_unit_id,
        "winner_side": "A",
        "finished_at_slot": 0,
    }
    base.update(overrides)
    return base


def test_retired_reason_round_trips_and_does_not_change_advancement(client, tid):
    """A `reason="retired"` command persists the annotation AND advances
    exactly as a plain result would — reason is annotation, not routing."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)

    r = client.post(
        _bracket_url(tid, "commands"),
        json=_command_body(sf1["id"], reason="retired"),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    result = next(
        res for res in body["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert result["reason"] == "retired"
    assert result["winner_side"] == "A"
    assert result["walkover"] is False  # retired does NOT force walkover

    # Advancement outcome is unchanged from a plain result: the final's
    # slot_a resolves to the winner, feeder pointer clears.
    new_final = next(p for p in body["play_units"] if p["round_index"] == 1)
    assert new_final["slot_a"]["participant_id"] == sf1["side_a"][0]
    assert new_final["slot_a"]["feeder_play_unit_id"] is None

    # Re-fetching the bracket from a clean GET (forces a DB round-trip
    # through _hydrate_session) still carries the reason.
    reloaded = client.get(_bracket_url(tid)).json()
    reloaded_result = next(
        res for res in reloaded["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert reloaded_result["reason"] == "retired"


def test_walkover_reason_still_produces_existing_walkover_routing(client, tid):
    """Guard against regression in the BYE sweep: `reason="walkover"` must
    still set walkover=True and drop the loser (no consolation feed),
    exactly like a plain walkover=True command."""
    client.post(_bracket_url(tid), json=_se_4_body())
    state = client.get(_bracket_url(tid)).json()
    sf1 = _semifinal(state)

    r = client.post(
        _bracket_url(tid, "commands"),
        json=_command_body(sf1["id"], reason="walkover"),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    result = next(
        res for res in body["results"] if res["play_unit_id"] == sf1["id"]
    )
    assert result["reason"] == "walkover"
    assert result["walkover"] is True  # unchanged existing routing

    new_final = next(p for p in body["play_units"] if p["round_index"] == 1)
    assert new_final["slot_a"]["participant_id"] == sf1["side_a"][0]
    assert new_final["slot_a"]["feeder_play_unit_id"] is None
