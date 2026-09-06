"""Package 10a (v3 consolidated plan) — structured ``sides`` on the bracket
wire (``PlayUnitOut.sides``, ``shared/sides.py``).

Coverage: a resolved doubles pair, a resolved singles participant, a bye
slot, and a future winner-of slot each serialize to the right discriminated
variant, per state-and-formatting contract §6 and match-card contract §2.1.
No slash-assembled label appears on the wire — ``sides[*].persons[*].name``
carries the stored name verbatim; the wire never invents or joins a string.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from workspaces import tournaments
    from core.exceptions import ConflictError
    from core.main import _conflict_error_handler

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.add_exception_handler(ConflictError, _conflict_error_handler)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Bracket Side DTO Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base if not suffix else base + "/" + "/".join(suffix)


def _play_units_by_round(body: dict) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for pu in body["play_units"]:
        out.setdefault(pu["round_index"], []).append(pu)
    return out


def test_doubles_pair_and_bye_serialize_to_the_right_side_variants(client, tid):
    """A 3-entrant SE draw round 1: two matches, one a bye. One participant
    is a doubles pair (``members``) so its resolved side carries the pair's
    composite name with a seed and a participant key — never split."""
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "events": [
            {
                "id": "MD",
                "discipline": "Mixed Doubles",
                "format": "se",
                "participants": [
                    {
                        "id": "PAIR-1",
                        "name": "Ana Silva / Ben Ito",
                        "members": ["p-ana", "p-ben"],
                        "seed": 1,
                    },
                    {"id": "P2", "name": "Chidi Okeke", "seed": None},
                    {"id": "P3", "name": "Dan Reyes", "seed": None},
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text
    created = r.json()
    by_round = _play_units_by_round(created)
    round1 = by_round[0]
    assert len(round1) == 2  # 3 entrants: one real match, one bye

    resolved_sides = []
    bye_sides = []
    for pu in round1:
        for side in pu["sides"]:
            assert len(pu["sides"]) == 2
            if side["unresolved"] is None:
                resolved_sides.append(side)
            else:
                assert side["unresolved"]["kind"] == "bye"
                bye_sides.append(side)

    assert len(bye_sides) == 1
    assert len(resolved_sides) == 3  # PAIR-1, P2, P3 each resolved once

    pair_side = next(s for s in resolved_sides if s["participantKey"] == "PAIR-1")
    assert pair_side["persons"] == [{"id": "PAIR-1", "name": "Ana Silva / Ben Ito"}]
    assert pair_side["seed"] == 1
    assert pair_side["unresolved"] is None

    # No slash-assembled label anywhere else on the wire: the singles sides
    # carry their stored name verbatim, with no ' / ' join applied to them.
    singles_names = {s["persons"][0]["name"] for s in resolved_sides if s["participantKey"] != "PAIR-1"}
    assert singles_names == {"Chidi Okeke", "Dan Reyes"}


def test_future_winner_slot_serializes_to_winner_of(client, tid):
    """A 4-entrant SE draw's final (round 1) has both slots fed by round-0
    winners — an unplayed source resolves to ``winner_of``, never a name."""
    body = {
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
                    {"id": f"P{i}", "name": f"Player {i}", "seed": i} for i in range(1, 5)
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text
    created = r.json()
    by_round = _play_units_by_round(created)
    final = by_round[1][0]
    assert len(final["sides"]) == 2
    for side in final["sides"]:
        assert side["persons"] == []
        assert side["unresolved"]["kind"] == "winner_of"
        assert side["unresolved"]["reference"] in {
            pu["id"] for pu in by_round[0]
        }

    semi = by_round[0][0]
    for side in semi["sides"]:
        assert side["unresolved"] is None
        assert len(side["persons"]) == 1
