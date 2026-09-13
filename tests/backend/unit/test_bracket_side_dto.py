"""Package 10a (v3 consolidated plan) — structured ``sides`` on the bracket
wire (``PlayUnitOut.sides``, ``shared/sides.py``).

Coverage: a resolved doubles pair, a resolved singles participant, a bye
slot, and a future winner-of slot each serialize to the right discriminated
variant, per state-and-formatting contract §6 and match-card contract §2.1.
No slash-assembled label appears on the wire — ``sides[*].persons[*].name``
carries the stored name verbatim; the wire never invents or joins a string.

v3 package 29 (V3-10-1 / V3-10-2) adds the two shapes package 10a could not
express: a doubles pair as TWO stacked persons resolved from ``member_ids``
against ``tournaments.data.bracketPlayers``, and ``pending_member`` for a
pair slot one member short. Both signals are STRUCTURAL — a one-member TEAM,
or an entry-backed lone person in a doubles draw — never inferred from a
name, so an imported PLAYER row holding a whole pair under one label is
deliberately left alone.
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
    from competition.service import CompetitionError
    from core.main import _competition_error_handler
    app.add_exception_handler(CompetitionError, _competition_error_handler)
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
    _seed_roster(client, tid, [
        {'id':'p-ana','name':'Ana Silva'}, {'id':'p-ben','name':'Ben Ito'},
        {'id':'p-chidi','name':'Chidi Okeke'}, {'id':'p-eve','name':'Eve Lee'},
        {'id':'p-dan','name':'Dan Reyes'}, {'id':'p-fay','name':'Fay Chen'},
    ])
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
                    {"id": "P2", "name": "Chidi Okeke / Eve Lee", "members": ["p-chidi", "p-eve"]},
                    {"id": "P3", "name": "Dan Reyes / Fay Chen", "members": ["p-dan", "p-fay"]},
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
    assert pair_side["persons"] == [{"id": "p-ana", "name": "Ana Silva"}, {"id": "p-ben", "name": "Ben Ito"}]
    assert pair_side["seed"] == 1
    assert pair_side["unresolved"] is None

    assert all(len(side['persons']) == 2 for side in resolved_sides)


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


# ---------------------------------------------------------------------------
# v3 package 29 — per-member resolution and ``pending_member``.
# ---------------------------------------------------------------------------


def _roster_state(name: str, players: list[dict]) -> dict:
    """The minimal ``PUT /tournaments/{id}/state`` body carrying a bracket
    roster. ``bracketPlayers`` is the blob ``_bracket_side`` resolves
    ``member_ids`` against, and it is the same blob the public tier's
    ``_bracket_roster_names`` reads."""
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
        "scheduleVersion": 0,
        "scheduleHistory": [],
        "bracketPlayers": players,
    }


def _seed_roster(client, tid: str, players: list[dict]) -> None:
    r = client.put(f"/tournaments/{tid}/state", json=_roster_state("Sides", players))
    assert r.status_code == 200, r.text


def _sides_by_key(body: dict) -> dict:
    out = {}
    for pu in body["play_units"]:
        for side in pu["sides"]:
            if side["participantKey"]:
                out[side["participantKey"]] = side
    return out


def _md_draw(participants: list[dict], event_id: str = "MD", discipline: str = "MD") -> dict:
    return {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "events": [
            {
                "id": event_id,
                "discipline": discipline,
                "format": "se",
                "participants": participants,
                "duration_slots": 1,
            }
        ],
    }


def test_a_canonical_pair_resolves_to_two_stacked_persons(client, tid):
    """V3-10-1. The entries seam writes the two roster seats into
    ``member_ids`` and a COMPOSITE label into ``name``. The wire now carries
    the two humans, each with their own id — the composite label is not what
    a renderer stacks, and it is never split on ``' / '`` to get there."""
    _seed_roster(
        client,
        tid,
        [
            {"id": "roster-ana", "name": "Ana Silva"},
            {"id": "roster-ben", "name": "Ben Ito"},
            {"id": "roster-cara", "name": "Cara Diaz"},
            {"id": "roster-dev", "name": "Dev Rao"},
        ],
    )
    r = client.post(
        _bracket_url(tid),
        json=_md_draw(
            [
                {
                    "id": "team-ana-ben",
                    "name": "Ana Silva / Ben Ito",
                    "members": ["roster-ana", "roster-ben"],
                    "seed": 1,
                },
                {
                    "id": "team-cara-dev",
                    "name": "Cara Diaz / Dev Rao",
                    "members": ["roster-cara", "roster-dev"],
                    "seed": 2,
                },
            ]
        ),
    )
    assert r.status_code == 200, r.text
    sides = _sides_by_key(r.json())

    pair = sides["team-ana-ben"]
    assert pair["persons"] == [
        {"id": "roster-ana", "name": "Ana Silva"},
        {"id": "roster-ben", "name": "Ben Ito"},
    ]
    assert pair["unresolved"] is None
    assert pair["seed"] == 1
    # The composite label is nowhere on the side: nothing joined, nothing to
    # split back apart (D15).
    assert all("/" not in person["name"] for person in pair["persons"])


def test_a_hand_entered_pair_stacks_the_same_way(client, tid):
    """A pair the DIRECTOR built (``ParticipantPicker`` writes
    ``members: [pickedA.id, pickedB.id]``) has no entries row behind it, and
    resolves through exactly the same roster read — the fix is not
    seam-only."""
    _seed_roster(
        client,
        tid,
        [
            {"id": "p-ana", "name": "Ana Silva"},
            {"id": "p-ben", "name": "Ben Ito"},
            {"id": "p-cara", "name": "Cara Diaz"},
            {"id": "p-dev", "name": "Dev Rao"},
        ],
    )
    r = client.post(
        _bracket_url(tid),
        json=_md_draw(
            [
                {"id": "MD-T1", "name": "Ana Silva / Ben Ito", "members": ["p-ana", "p-ben"]},
                {"id": "MD-T2", "name": "Cara Diaz / Dev Rao", "members": ["p-cara", "p-dev"]},
            ]
        ),
    )
    assert r.status_code == 200, r.text
    sides = _sides_by_key(r.json())
    assert [p["name"] for p in sides["MD-T1"]["persons"]] == ["Ana Silva", "Ben Ito"]
    assert [p["name"] for p in sides["MD-T2"]["persons"]] == ["Cara Diaz", "Dev Rao"]


def test_a_draw_rejects_unresolvable_members(client, tid):
    """The honest fallback. One member has no roster row, so the stored
    composite name is the only text that names everybody — it is emitted as
    ONE person rather than half a pair or an id masquerading as a name."""
    _seed_roster(
        client,
        tid,
        [{"id": "p-ana", "name": "Ana Silva"}, {"id": "p-cara", "name": "Cara Diaz"}],
    )
    r = client.post(
        _bracket_url(tid),
        json=_md_draw(
            [
                {"id": "MD-T1", "name": "Ana Silva / Ben Ito", "members": ["p-ana", "p-gone"]},
                {"id": "MD-T2", "name": "Cara Diaz / Dev Rao", "members": ["p-cara", "p-also-gone"]},
            ]
        ),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"] == "INVALID_ROSTER"


def test_a_draw_rejects_incomplete_units(client, tid):
    """The other structural signal: a TEAM row with one member id is a pair
    slot with a member missing outright."""
    _seed_roster(
        client,
        tid,
        [{"id": "p-ana", "name": "Ana Silva"}, {"id": "p-cara", "name": "Cara Diaz"}],
    )
    r = client.post(
        _bracket_url(tid),
        json=_md_draw(
            [
                {"id": "MD-T1", "name": "Ana Silva", "members": ["p-ana"]},
                {"id": "MD-T2", "name": "Cara Diaz", "members": ["p-cara"]},
            ]
        ),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"] == "ROSTER_INCOMPLETE"


def test_a_doubles_draw_requires_explicit_people(client, tid):
    """The second negative control. An imported or hand-added PLAYER row may
    legitimately hold a whole pair under one label, so "partner to be
    confirmed" over it would be a false statement about someone else's draw.
    Only an ENTRY-BACKED lone person earns the discriminant."""
    r = client.post(
        _bracket_url(tid),
        json=_md_draw(
            [
                {"id": "IMPORTED-1", "name": "Ana Silva / Ben Ito"},
                {"id": "IMPORTED-2", "name": "Cara Diaz / Dev Rao"},
            ]
        ),
    )
    assert r.status_code == 409, r.text
    assert r.json()["error"] == "ROSTER_INCOMPLETE"


def _engine_participant(**kwargs):
    from scheduler_core.domain.tournament import Participant, ParticipantType

    kwargs.setdefault("type", ParticipantType.PLAYER)
    kwargs.setdefault("member_ids", [])
    kwargs.setdefault("metadata", {})
    return Participant(**kwargs)


def test_an_entry_backed_lone_person_in_a_doubles_draw_is_a_pending_member():
    """V3-10-2. The entries seam drops an entrant whose partner invite is
    unaccepted into the draw as a SINGLETON for the director to pair by hand
    (``entries.py::_pair_batch`` leg 3). On a doubles draw that is a side one
    player short, and it now says so — beside, not instead of, the person it
    does know."""
    from bracket.brackets import _participant_side

    side = _participant_side(
        _engine_participant(
            id="entry-ana",
            name="Ana Silva",
            metadata={"sourceEntryId": "abc"},
        ),
        {},
        pair_event=True,
    )
    assert [(p.id, p.name) for p in side.persons] == [("entry-ana", "Ana Silva")]
    assert side.unresolved is not None
    assert side.unresolved.kind == "pending_member"
    assert side.unresolved.missing == 1
    assert [p.name for p in side.unresolved.known] == ["Ana Silva"]


def test_the_same_person_in_a_SINGLES_draw_is_never_a_pending_member():
    """The negative control that keeps the signal honest: the whole rule is
    conditioned on a PAIR discipline. A singles entrant is a complete side."""
    from bracket.brackets import _participant_side

    side = _participant_side(
        _engine_participant(
            id="entry-ana",
            name="Ana Silva",
            metadata={"sourceEntryId": "abc"},
        ),
        {},
        pair_event=False,
    )
    assert side.unresolved is None
    assert [p.name for p in side.persons] == ["Ana Silva"]


def test_is_pair_discipline_reads_the_code_not_the_prose():
    """A free-text discipline is NOT a pair draw: guessing one would put
    "partner to be confirmed" under a singles player's name. The event id's
    trailing code is the documented second chance (``T027-MD``)."""
    from shared.sides import is_pair_discipline

    assert is_pair_discipline("MD") is True
    assert is_pair_discipline("xd") is True
    assert is_pair_discipline("GEN", "T027-WD") is True
    assert is_pair_discipline("Mixed Doubles") is False
    assert is_pair_discipline(None, "MS1") is False
