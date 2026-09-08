"""The SP-P7 public-site projections: draws, player pages, schedule.

The claims that matter, in the order the spec states them:

- **gates gate at the source** (§4): unpublished draws are a uniform 404 /
  empty envelope; unpublished results strip scores, standings, records AND
  resolved advancement — a semifinal that names a player says who won the
  quarterfinal, so with results off, sides come from structural placement
  only. Off-states are tested directly (§7's traps), not inferred.
- **strict projection** (§5): key-sets asserted exactly on the wire rows.
- **person, not name** (R-P7c): the player page is keyed by person id; a
  pending person 404s publicly while their events stay visible to no one.

Bracket data is seeded through the real bracket API (create + commands),
so the projection is tested against what the draw actually is, not a
hand-built imitation of it.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.mark.parametrize(
    ("event_id", "discipline", "expected"),
    [
        ("T027-MS", "MS", "MS"),
        ("T027-XD", "Mixed Doubles", "XD"),
        ("U17-A", "U17", "U17"),
        ("T027-U17", "Under 17 Boys Singles", "Under 17 Boys Singles"),
        ("T027-INTERNAL", "", "Event"),
    ],
)
def test_public_event_codes_hide_import_namespaces(event_id, discipline, expected):
    from entries.entries_site import _event_public_code

    assert _event_public_code(SimpleNamespace(id=event_id, discipline=discipline)) == expected


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


# ---- seeding helpers ------------------------------------------------------


def _make_workspace(client, name="Draws Open", slug="draws-open", kind="meet", **flags):
    tid = client.post("/tournaments", json={"name": name, "kind": kind}, headers=CSRF).json()["id"]

    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug=slug,
                is_open=True,
                audience="public",
                **flags,
            )
        )
        session.commit()
    finally:
        session.close()
    return tid


def _seed_person(
    tid, full_name="Ada Chen", club="Riverside BC", state="confirmed", event_code="MS"
):
    """A person with an entry (default confirmed) + the event it names.
    Returns the person id — ``entry-{id}`` is their roster/participant key."""
    from db.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Submission,
    )
    from db.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        account = session.scalars(select(EntrantAccount).limit(1)).first()
        if account is None:
            account = EntrantAccount(
                email=f"seed-{uuid.uuid4().hex[:8]}@example.com", password_hash="x"
            )
            session.add(account)
            session.flush()
        event = session.scalars(
            select(EntryEvent).where(
                EntryEvent.tournament_id == uuid.UUID(tid),
                EntryEvent.code == event_code,
            )
        ).first()
        if event is None:
            event = EntryEvent(
                tournament_id=uuid.UUID(tid),
                code=event_code,
                discipline="Men's Singles",
                entry_type="singles",
            )
            session.add(event)
            session.flush()
        submission = Submission(tournament_id=uuid.UUID(tid), account_id=account.id)
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name=full_name,
            gender="X",
            club=club,
        )
        session.add_all([submission, player])
        session.flush()
        session.add(
            Entry(
                tournament_id=uuid.UUID(tid),
                entry_event_id=event.id,
                submission_id=submission.id,
                entry_player_id=player.id,
                state=state,
            )
        )
        session.commit()
        return str(player.id)
    finally:
        session.close()


def _set_flags(tid, **flags):
    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(tid))
        for key, value in flags.items():
            setattr(row, key, value)
        session.commit()
    finally:
        session.close()


def _set_bracket_players(tid, players):
    from db.models import Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        tournament = session.get(Tournament, uuid.UUID(tid))
        tournament.data = {**(tournament.data or {}), "bracketPlayers": players}
        session.commit()
    finally:
        session.close()


def _declare_divisions(client, tid, counts):
    """Declare Meet divisions the way an operator does: ``config.rankCounts``
    through the real state PUT, which is the one blob funnel the
    ``meet_events`` derivation hangs on. Seeding rows by hand would test a
    hand-built imitation of the table instead of the table."""
    r = client.put(
        f"/tournaments/{tid}/state",
        json={
            "config": {
                "intervalMinutes": 30,
                "dayStart": "09:00",
                "dayEnd": "17:00",
                "courtCount": 4,
                "defaultRestMinutes": 30,
                "freezeHorizonSlots": 0,
                "rankCounts": counts,
            }
        },
        headers=CSRF,
    )
    assert r.status_code == 200, r.text


def _se4_bracket(client, tid, participants):
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "start_time": "2026-09-12T09:00:00",
        "events": [
            {
                "id": "MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": participants,
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(f"/tournaments/{tid}/bracket", json=body, headers=CSRF)
    assert r.status_code == 200, r.text
    return r.json()


def _units_by_round(state, event="MS"):
    rounds = {}
    for pu in state["play_units"]:
        if pu["event_id"] == event:
            rounds.setdefault(pu["round_index"], []).append(pu)
    for units in rounds.values():
        units.sort(key=lambda p: p["match_index"])
    return rounds


def _record(client, tid, unit, winner="A", score=None):
    body = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": unit["id"],
        "winner_side": winner,
        "seen_version": unit["version"],
    }
    if score is not None:
        body["score"] = score
    r = client.post(f"/tournaments/{tid}/bracket/commands", json=body, headers=CSRF)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def bracket_page(client):
    """A published-draws workspace: 4-entrant SE, two entered persons (with
    clubs) and two hand-added participants, one court assignment."""
    tid = _make_workspace(client, draws_published=True, entrants_published=True)
    ada = _seed_person(tid, "Ada Chen", "Riverside BC")
    bo = _seed_person(tid, "Bo Lee", "Northside SC")
    participants = [
        {"id": f"entry-{ada}", "name": "Ada Chen", "seed": 1},
        {"id": f"entry-{bo}", "name": "Bo Lee", "seed": 2},
        {"id": "P3", "name": "Cass Doe"},
        {"id": "P4", "name": "Dev Roy"},
    ]
    state = _se4_bracket(client, tid, participants)
    rounds = _units_by_round(state)
    sf0 = rounds[0][0]
    assert (
        client.post(
            f"/tournaments/{tid}/bracket/assign",
            json={"play_unit_id": sf0["id"], "court_id": 1, "slot_id": 3},
            headers=CSRF,
        ).status_code
        == 200
    )
    return {"tid": tid, "slug": "draws-open", "ada": ada, "bo": bo}


# ---- draws index (§3.4) ---------------------------------------------------


def test_unpublished_draws_answer_an_explicit_false_envelope(client):
    _make_workspace(client, slug="quiet-open")
    body = client.get("/e/api/page/quiet-open/draws").json()
    assert body == {
        "published": False,
        "resultsPublished": False,
        "draws": [],
        "divisions": [],
    }


def test_the_draws_index_lists_the_draw_with_exact_card_keys(client, bracket_page):
    body = client.get(f"/e/api/page/{bracket_page['slug']}/draws").json()
    assert body["published"] is True
    (card,) = body["draws"]
    assert set(card) == {
        "drawKey",
        "eventCode",
        "discipline",
        "kind",
        "size",
        "hasConsolation",
        "matchCoverage",
        "recordScope",
        "topologyScope",
        "roundCount",
        "champions",
        "finalists",
        "drawParticipantCount",
        "remainingMatchCount",
        "progress",
        "historical",
        "sourceUrl",
    }
    assert card["kind"] == "se"
    assert card["size"] == 4
    assert card["roundCount"] == 2
    assert card["champions"] == []
    assert card["finalists"] == []
    assert card["remainingMatchCount"] is None
    assert card["hasConsolation"] is False
    assert card["matchCoverage"] == {"imported": 3, "expected": 3, "missing": 0}
    assert card["recordScope"] == "full_draw"
    assert card["topologyScope"] == "full_draw"


def test_draw_progress_states_where_play_has_reached(client, bracket_page):
    """public-visual-fixes P6: the Draws index's one progress fact.

    Results-gated like the champions beside it — an unpublished result is
    not allowed to leak as "in play" — and it names the earliest unfinished
    round, its scheduled start when the grid places one, and nothing at all
    once the draw is decided."""
    tid, slug = bracket_page["tid"], bracket_page["slug"]

    # Results off: no progress at all, even with a recorded semifinal.
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    rounds = _units_by_round(state)
    _record(client, tid, rounds[0][0], winner="A")
    (card,) = client.get(f"/e/api/page/{slug}/draws").json()["draws"]
    assert card["progress"] is None

    # Results on: one semifinal decided, the other not — the semifinals are
    # the front of the draw and they are in play.
    _set_flags(tid, results_published=True)
    (card,) = client.get(f"/e/api/page/{slug}/draws").json()["draws"]
    assert card["progress"] == {
        "state": "in_play",
        "roundLabel": "SF",
        "startTime": None,
    }

    # Both semifinals decided: the front moves to the final, which the
    # fixture leaves unassigned, so it is simply still to play.
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    _record(client, tid, _units_by_round(state)[0][1], winner="A")
    (card,) = client.get(f"/e/api/page/{slug}/draws").json()["draws"]
    assert card["progress"]["state"] == "to_play"
    assert card["progress"]["roundLabel"] == "Final"

    # A scheduled final states its venue-local start instead.
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    final = _units_by_round(state)[1][0]
    assert (
        client.post(
            f"/tournaments/{tid}/bracket/assign",
            json={"play_unit_id": final["id"], "court_id": 1, "slot_id": 4},
            headers=CSRF,
        ).status_code
        == 200
    )
    (card,) = client.get(f"/e/api/page/{slug}/draws").json()["draws"]
    assert card["progress"] == {
        "state": "scheduled",
        "roundLabel": "Final",
        "startTime": "11:00",
    }

    # Decided: complete, with no round left to name.
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    _record(client, tid, _units_by_round(state)[1][0], winner="A")
    (card,) = client.get(f"/e/api/page/{slug}/draws").json()["draws"]
    assert card["progress"] == {
        "state": "complete",
        "roundLabel": None,
        "startTime": None,
    }


def test_historical_draw_uses_advertised_size_and_source_round_labels(client):
    tid = _make_workspace(client, slug="historical-open", draws_published=True)
    payload = {
        "courts": 1,
        "total_slots": 8,
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "record_scope": "completed_matches_only",
                "historical": True,
                "advertised_size": 32,
                "round_labels": ["Quarterfinals", "Finals"],
                "source_url": "https://example.test/results",
                "topology_scope": "none",
                "imported_match_count": 2,
                "expected_match_count": 31,
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                    {"id": "P3", "name": "Player 3"},
                    {"id": "P4", "name": "Player 4"},
                ],
                "rounds": [
                    [
                        {
                            "id": "QF-1",
                            "side_a": ["P1"],
                            "side_b": ["P2"],
                            "result": {"winner_side": "A"},
                            "played_on": "2025-10-19",
                            "local_time": "10:00",
                            "court_label": "Court 1",
                            "source_url": "https://example.test/results#qf-1",
                            "source_ref": "QF 1",
                        }
                    ],
                    [
                        {
                            "id": "F-1",
                            "side_a": ["P3"],
                            "side_b": ["P4"],
                            "result": {"winner_side": "B"},
                        }
                    ],
                ],
            }
        ],
    }
    imported = client.post(f"/tournaments/{tid}/bracket/import", json=payload, headers=CSRF)
    assert imported.status_code == 200, imported.text

    draws = client.get("/e/api/page/historical-open/draws").json()
    assert draws["draws"][0]["size"] == 32
    assert draws["draws"][0]["matchCoverage"] == {
        "imported": 2,
        "expected": 31,
        "missing": 29,
    }
    assert draws["draws"][0]["recordScope"] == "completed_matches_only"
    assert draws["draws"][0]["topologyScope"] == "none"
    assert draws["draws"][0]["sourceUrl"] == "https://example.test/results"
    detail = client.get("/e/api/page/historical-open/draws/MS").json()
    assert [round_["label"] for round_ in detail["segments"][0]["rounds"]] == [
        "Quarterfinals",
        "Finals",
    ]
    assert all(
        side["feederNodeKey"] is None
        for round_ in detail["segments"][0]["rounds"]
        for match in round_["matches"]
        for side in match["sides"]
    )
    first_match = detail["segments"][0]["rounds"][0]["matches"][0]
    assert {
        key: first_match[key]
        for key in ("playedOn", "localTime", "courtLabel", "sourceUrl", "sourceRef")
    } == {
        "playedOn": "2025-10-19",
        "localTime": "10:00",
        "courtLabel": "Court 1",
        "sourceUrl": "https://example.test/results#qf-1",
        "sourceRef": "QF 1",
    }


def test_draw_node_publishes_the_approved_day_beside_the_source_record(client):
    """P7 — operator/public parity for a rescheduled imported match.

    ``playedOn`` / ``localTime`` / ``courtLabel`` are the IMPORTED SOURCE
    record: where and when the match was originally played. Once Operations
    approves a slot and a court, those are the published schedule, and the
    projection must state them — the source record stays on the wire as
    provenance beside them, never instead of them. Before this, the draw node
    carried an approved ``scheduledTime``/``court`` but no approved DAY at
    all, so the only date a draw card could show was the source record's, and
    a live match read as last October while the operator console and the
    public schedule agreed it was today.
    """
    tid = _make_workspace(
        client, slug="parity-open", draws_published=True, results_published=True
    )
    payload = {
        "courts": 2,
        "total_slots": 64,
        "interval_minutes": 30,
        "start_time": "2026-09-12T09:00:00",
        "events": [
            {
                "id": "MS",
                "discipline": "MS",
                "format": "se",
                "participants": [
                    {"id": "P1", "name": "Player 1"},
                    {"id": "P2", "name": "Player 2"},
                    {"id": "P3", "name": "Player 3"},
                    {"id": "P4", "name": "Player 4"},
                ],
                "rounds": [
                    [
                        {
                            "id": "SF-1",
                            "side_a": ["P1"],
                            "side_b": ["P2"],
                            "played_on": "2025-10-19",
                            "local_time": "10:00",
                            "court_label": "Court 1",
                        },
                        {"id": "SF-2", "side_a": ["P3"], "side_b": ["P4"]},
                    ],
                    [
                        {
                            "id": "F-1",
                            "feeder_a": "SF-1",
                            "feeder_b": "SF-2",
                        }
                    ],
                ],
            }
        ],
    }
    imported = client.post(
        f"/tournaments/{tid}/bracket/import", json=payload, headers=CSRF
    )
    assert imported.status_code == 200, imported.text

    # The desk approves a different court on a LATER DAY: slot 51 is
    # 09:00 + 51 × 30min = 25.5h after the 2026-09-12 start, i.e. 10:30 on
    # the 13th.
    assigned = client.post(
        f"/tournaments/{tid}/bracket/assign",
        json={"play_unit_id": "SF-1", "court_id": 2, "slot_id": 51},
        headers=CSRF,
    )
    assert assigned.status_code == 200, assigned.text

    detail = client.get("/e/api/page/parity-open/draws/MS").json()
    node = next(
        match
        for round_ in detail["segments"][0]["rounds"]
        for match in round_["matches"]
        if match["nodeKey"] == "SF-1"
    )
    # The approved schedule — day included.
    assert node["scheduledDate"] == "2026-09-13"
    assert node["scheduledTime"] == "10:30"
    assert node["court"] == 2
    # The source record survives beside it, unchanged and clearly different.
    assert node["playedOn"] == "2025-10-19"
    assert node["localTime"] == "10:00"
    assert node["courtLabel"] == "Court 1"

    # And the two public surfaces state ONE schedule: the schedule
    # projection's row for the same match agrees with the draw node.
    row = next(
        item
        for item in client.get("/e/api/page/parity-open/matches").json()["items"]
        if item["matchKey"].endswith("SF-1")
    )
    assert (row["scheduledDate"], row["scheduledTime"], row["court"]) == (
        node["scheduledDate"],
        node["scheduledTime"],
        node["court"],
    )


def test_draw_players_are_published_draw_roster_people_with_profiles(client):
    tid = _make_workspace(client, slug="roster-open", draws_published=True)
    _set_bracket_players(
        tid,
        [
            {"id": "P-A", "name": "Áda Chen"},
            {"id": "P-B", "name": "Bo Lee"},
            {"id": "P-C", "name": "Cass Doe"},
        ],
    )
    payload = {
        "courts": 1,
        "total_slots": 4,
        "events": [
            {
                "id": "MD",
                "discipline": "Men's Doubles",
                "format": "se",
                "participants": [
                    {"id": "PAIR-1", "name": "Do not split this", "members": ["P-A", "P-B"]},
                    {"id": "PAIR-2", "name": "Missing / Cass", "members": ["P-MISSING", "P-C"]},
                ],
                "rounds": [[{"id": "F", "side_a": ["PAIR-1"], "side_b": ["PAIR-2"]}]],
            },
            {
                "id": "WS",
                "discipline": "Women's Singles",
                "format": "se",
                "participants": [
                    {"id": "P-A", "name": "Wrong fallback label"},
                    {"id": "P-B", "name": "Another wrong fallback label"},
                ],
                "rounds": [[{"id": "WS-F", "side_a": ["P-A"], "side_b": ["P-B"]}]],
            },
        ],
    }
    imported = client.post(f"/tournaments/{tid}/bracket/import", json=payload, headers=CSRF)
    assert imported.status_code == 200, imported.text

    players = client.get("/e/api/page/roster-open/players").json()
    # P6 (2026-09-08), a DELIBERATE behaviour change: a published draw's own
    # roster people are addressable. Their names, clubs and results were
    # already public on the draw; what was missing was a key that resolved,
    # so every imported name was a dead reference and
    # ``/players/{roster id}`` was a 422. The list and the detail route now
    # share ONE key space — the roster id — and ``identity.id`` carries it.
    assert players == {
        "published": True,
        "players": [
            {
                "playerKey": "P-A",
                "person": {"identity": {"id": "P-A", "name": "Áda Chen"}, "resolution": "resolved", "label": None},
                "club": None,
                "eventCodes": ["MD", "WS"],
            },
            {
                "playerKey": "P-B",
                "person": {"identity": {"id": "P-B", "name": "Bo Lee"}, "resolution": "resolved", "label": None},
                "club": None,
                "eventCodes": ["MD", "WS"],
            },
            {
                "playerKey": "P-C",
                "person": {"identity": {"id": "P-C", "name": "Cass Doe"}, "resolution": "resolved", "label": None},
                "club": None,
                "eventCodes": ["MD"],
            },
        ],
        "referencedPlayerCount": 4,
        "missingNameCount": 1,
    }
    assert all("href" not in player for player in players["players"])
    for player in players["players"]:
        assert set(player["person"]) == {"identity", "resolution", "label"}
        assert set(player["person"]["identity"]) == {"id", "name"}
        assert player["person"]["identity"]["id"] == player["playerKey"]

    # The key the list emits is the key the detail route parses. This is the
    # whole defect: it used to be two identifier spaces.
    profile = client.get("/e/api/page/roster-open/players/P-A")
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert body["person"]["identity"] == {"id": "P-A", "name": "Áda Chen"}
    assert sorted(event["code"] for event in body["events"]) == ["MD", "WS"]
    # Both members of a doubles pair resolve, and each one names the other.
    md = next(event for event in body["events"] if event["code"] == "MD")
    assert md["partner"]["identity"] == {"id": "P-B", "name": "Bo Lee"}
    # An imported person with no entries still gets a history of one.
    assert [row["current"] for row in body["history"]] == [True]
    assert body["history"][0]["playerKey"] == "P-A"
    # A roster id that is not on this workspace's published roster answers
    # the same uniform 404 an unknown entrant gets.
    assert client.get("/e/api/page/roster-open/players/P-MISSING").status_code == 404

    detail = client.get("/e/api/page/roster-open/draws/MD").json()
    teams = {team["participantKey"]: team for team in detail["teams"]}
    assert [p["identity"]["name"] for p in teams["PAIR-1"]["persons"]] == ["Áda Chen", "Bo Lee"]
    # Partial member resolution falls back to the whole source label; it is
    # never split on punctuation into invented people.
    assert [p["identity"]["name"] for p in teams["PAIR-2"]["persons"]] == ["Missing / Cass"]


def _import_singles_draw(client, tid, event_id, participants, rounds):
    body = {
        "courts": 1,
        "total_slots": 4,
        "events": [
            {
                "id": event_id,
                "discipline": "Men's Singles",
                "format": "se",
                "participants": participants,
                "rounds": rounds,
            }
        ],
    }
    r = client.post(f"/tournaments/{tid}/bracket/import", json=body, headers=CSRF)
    assert r.status_code == 200, r.text


def test_an_imported_person_is_one_person_across_workspaces(client):
    """P6: the SAME dataset person id in two published draws is one profile.

    The roster ID is tournament-scoped and deliberately NOT re-keyed, so the
    join is the import's own declared identity (``personId``) — never the
    display name on its own, and never anything reaching into the entries
    spine.
    """
    first = _make_workspace(client, name="Alpha Open", slug="alpha-open", draws_published=True)
    second = _make_workspace(client, name="Beta Open", slug="beta-open", draws_published=True)
    _set_bracket_players(
        first,
        [
            {"id": "A-1", "name": "Rin Sato", "personId": "P0001", "personSource": "fixture:1"},
            {"id": "A-2", "name": "Kim Park", "personId": "P0002", "personSource": "fixture:1"},
        ],
    )
    _set_bracket_players(
        second,
        [
            {"id": "B-9", "name": "Rin Sato", "personId": "P0001", "personSource": "fixture:1"},
            {"id": "B-8", "name": "Lee Chen", "personId": "P0003", "personSource": "fixture:1"},
        ],
    )
    _import_singles_draw(
        client,
        first,
        "MS",
        [{"id": "A-1", "name": "Rin Sato"}, {"id": "A-2", "name": "Kim Park"}],
        [[{"id": "A-F", "side_a": ["A-1"], "side_b": ["A-2"]}]],
    )
    _import_singles_draw(
        client,
        second,
        "MS",
        [{"id": "B-9", "name": "Rin Sato"}, {"id": "B-8", "name": "Lee Chen"}],
        [[{"id": "B-F", "side_a": ["B-9"], "side_b": ["B-8"]}]],
    )

    body = client.get("/e/api/page/alpha-open/players/A-1").json()
    history = {row["slug"]: row for row in body["history"]}
    assert set(history) == {"alpha-open", "beta-open"}
    assert history["alpha-open"]["current"] is True
    other = history["beta-open"]
    # The other workspace's OWN key for the same human — the link target.
    assert other["playerKey"] == "B-9"
    assert other["current"] is False
    assert other["expanded"] is True
    assert other["eventCodes"] == ["MS"]
    (event,) = other["events"]
    assert event["code"] == "MS"
    assert [step["roundLabel"] for step in event["drawPath"]] == ["Final"]
    assert [
        person["identity"]["name"] for person in event["drawPath"][0]["opponents"]
    ] == ["Lee Chen"]
    # Results are unpublished in that workspace, so no outcome is claimed.
    assert event["drawPath"][0]["outcome"] is None

    # The other person is a DIFFERENT dataset id, so no history is shared.
    kim = client.get("/e/api/page/alpha-open/players/A-2").json()
    assert [row["slug"] for row in kim["history"]] == ["alpha-open"]


def test_an_unpublished_draw_keeps_a_person_out_of_the_history(client):
    """A workspace that has not published its draws is absent, not summarised."""
    first = _make_workspace(client, name="Alpha Open", slug="alpha-2", draws_published=True)
    quiet = _make_workspace(client, name="Quiet Open", slug="quiet-2")
    for tid, keys in ((first, ("A-1", "A-2")), (quiet, ("Q-1", "Q-2"))):
        _set_bracket_players(
            tid,
            [
                {"id": keys[0], "name": "Rin Sato", "personId": "P0001"},
                {"id": keys[1], "name": "Kim Park", "personId": "P0002"},
            ],
        )
        _import_singles_draw(
            client,
            tid,
            "MS",
            [{"id": keys[0], "name": "Rin Sato"}, {"id": keys[1], "name": "Kim Park"}],
            [[{"id": f"{keys[0]}-F", "side_a": [keys[0]], "side_b": [keys[1]]}]],
        )

    body = client.get("/e/api/page/alpha-2/players/A-1").json()
    assert [row["slug"] for row in body["history"]] == ["alpha-2"]


def test_draw_players_are_hidden_until_draws_are_published(client):
    _make_workspace(client, slug="quiet-roster")
    assert client.get("/e/api/page/quiet-roster/players").json() == {
        "published": False,
        "players": [],
        "referencedPlayerCount": 0,
        "missingNameCount": 0,
    }


def test_players_directory_preserves_confirmed_entrant_profiles_before_draws(client):
    tid = _make_workspace(client, slug="entry-players", entrants_published=True)
    person_id = _seed_person(tid, full_name="Ada Chen", club="Riverside BC")

    assert client.get("/e/api/page/entry-players/players").json() == {
        "published": True,
        "players": [
            {
                "playerKey": f"entry-{person_id}",
                "person": {
                    "identity": {"id": str(person_id), "name": "Ada Chen"},
                    "resolution": "resolved",
                    "label": None,
                },
                "club": "Riverside BC",
                "eventCodes": ["MS"],
            }
        ],
        "referencedPlayerCount": 1,
        "missingNameCount": 0,
    }


def test_a_meet_only_workspace_publishes_an_empty_draws_list(client):
    _make_workspace(client, slug="meet-only", draws_published=True)
    body = client.get("/e/api/page/meet-only/draws").json()
    assert body["published"] is True
    assert body["draws"] == []


# ---- F-DM-33: an empty draws list says WHY it is empty (P7b-NC9) ----------


def test_a_meet_with_divisions_is_distinguishable_from_a_bracket_with_no_events(
    client,
):
    """**P7b-NC9a.** Before ``meet_events``, these two bodies were the same
    bytes: a Meet workspace has never created a ``bracket_events`` row, so
    ``_hydrate_session`` answered ``None`` for it exactly as it does for a
    bracket workspace nobody has added an event to, and both fell to the
    draws comprehension's ``else []``. ``divisions`` is what makes the two
    answerable apart, and it carries the reason rather than a flag naming it.
    """
    meet = _make_workspace(client, slug="the-meet", draws_published=True)
    _declare_divisions(client, meet, {"MS": 3, "WS": 3, "MD": 2})
    _make_workspace(client, slug="the-bracket", kind="bracket", draws_published=True)

    meet_body = client.get("/e/api/page/the-meet/draws").json()
    bracket_body = client.get("/e/api/page/the-bracket/draws").json()

    assert meet_body["draws"] == [] and bracket_body["draws"] == []
    assert meet_body["divisions"] == ["MD", "MS", "WS"]
    assert bracket_body["divisions"] == []
    assert meet_body != bracket_body


def test_a_draft_bracket_event_still_emits_its_card(client):
    """**P7b-NC9b.** The already-distinguishable case stays distinguishable.
    ``status`` defaults to ``'draft'`` and nothing filters on it, so a created
    but ungenerated event has always produced a card (with ``size`` = its
    participant count, here 0). This slice must not quietly start hiding it
    behind the new field."""
    tid = _make_workspace(client, slug="drafty", kind="bracket", draws_published=True)
    r = client.post(
        f"/tournaments/{tid}/bracket/events/MS",
        json={"discipline": "Men's Singles", "format": "se"},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text

    body = client.get("/e/api/page/drafty/draws").json()
    (card,) = body["draws"]
    assert card["eventCode"] == "MS"
    assert card["size"] == 0
    assert body["divisions"] == []


def test_a_bracket_workspace_does_not_publish_divisions_it_never_configured(
    client,
):
    """**P7b-NC9c.** The gate that keeps the new field honest.

    ``meet_events`` is derived for ANY workspace whose blob carries a
    ``config.rankCounts`` (Task 1 kept the derivation module-agnostic on
    purpose), and the console store seeds five division codes into every
    fresh workspace, which the first autosave persists. So a bracket
    workspace really can hold rows nobody configured - and publishing those
    would re-create F-DM-33 pointing the other way.

    The projection therefore gates on ``tournaments.kind`` (ruling P7b-14,
    applying R-DM-10: ``kind`` is the single domain authority,
    CHECK-constrained since P7a; ``workspace_modules`` is UI enablement
    only). The two toggle controls below are the other half of that ruling.
    """
    tid = _make_workspace(client, slug="bracket-with-junk", kind="bracket", draws_published=True)
    _declare_divisions(client, tid, {"MS": 3, "WS": 3})

    body = client.get("/e/api/page/bracket-with-junk/draws").json()
    assert body["divisions"] == []


def test_enabling_the_meet_module_on_a_bracket_workspace_changes_nothing_public(
    client,
):
    """**P7b-NC9e.** The reachable half NC9c did not cover.

    ``available -> enabled`` on ``meet`` is ONE PATCH a bracket director can
    make just to look at the module, and the console store has already
    autosaved five default division codes. Under a ``workspace_modules``
    gate that single click would have made a bracket event's public page
    read "Played as a meet, not by draws. Divisions: MD, MS, WD, WS, XD."
    Under R-DM-10's authority it cannot: ``kind`` did not move, so the wire
    did not move.
    """
    tid = _make_workspace(client, slug="bracket-toggled", kind="bracket", draws_published=True)
    _declare_divisions(client, tid, {"MS": 3, "WS": 3, "MD": 2, "WD": 2, "XD": 2})
    before = client.get("/e/api/page/bracket-toggled/draws").json()

    r = client.patch(f"/tournaments/{tid}/modules/meet", json={"status": "enabled"}, headers=CSRF)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "enabled"

    assert client.get("/e/api/page/bracket-toggled/draws").json() == before
    assert before["divisions"] == []


def test_disabling_the_meet_module_on_a_meet_workspace_changes_nothing_public(
    client,
):
    """**P7b-NC9f.** The other toggle direction, and the reason concern 3 of
    the first round is retired: module state no longer reaches the public
    wire, so a control-plane toggle has no undisclosed public effect.

    Disabling the last enabled operational module is refused, so ``bracket``
    is enabled first - which leaves the workspace's UI describing a bracket
    while ``kind`` still says meet. The public answer follows ``kind``.
    """
    tid = _make_workspace(client, slug="meet-toggled", draws_published=True)
    _declare_divisions(client, tid, {"MS": 3, "WS": 3})
    before = client.get("/e/api/page/meet-toggled/draws").json()
    assert before["divisions"] == ["MS", "WS"]

    for module_id, status in (("bracket", "enabled"), ("meet", "disabled")):
        r = client.patch(
            f"/tournaments/{tid}/modules/{module_id}",
            json={"status": status},
            headers=CSRF,
        )
        assert r.status_code == 200, r.text

    assert client.get("/e/api/page/meet-toggled/draws").json() == before


def test_divisions_are_withheld_while_draws_are_unpublished(client):
    """The gate gates at the source (§4): an unpublished tier leaks no
    division list, the same way it leaks no draw card."""
    tid = _make_workspace(client, slug="quiet-meet")
    _declare_divisions(client, tid, {"MS": 3})
    body = client.get("/e/api/page/quiet-meet/draws").json()
    assert body["published"] is False
    assert body["divisions"] == []


# ---- draw detail (§3.4) ---------------------------------------------------


def test_draw_detail_is_a_uniform_404_while_unpublished(client, bracket_page):
    _set_flags(bracket_page["tid"], draws_published=False)
    r = client.get(f"/e/api/page/{bracket_page['slug']}/draws/MS")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_the_tree_renders_rounds_seeds_schedule_and_placeholders(client, bracket_page):
    body = client.get(f"/e/api/page/{bracket_page['slug']}/draws/MS").json()
    (segment,) = body["segments"]
    labels = [r["label"] for r in segment["rounds"]]
    assert labels == ["Semifinals", "Final"]

    teams = {t["participantKey"]: t for t in body["teams"]}
    assert teams[f"entry-{bracket_page['ada']}"]["club"] == "Riverside BC"
    assert teams[f"entry-{bracket_page['ada']}"]["seed"] == 1
    assert teams["P3"]["club"] is None

    sf1, sf2 = segment["rounds"][0]["matches"]
    assert sf1["scheduledTime"] == "10:30"  # 09:00 + slot 3 x 30min
    assert sf1["court"] == 1
    assert sf2["scheduledTime"] is None

    (final,) = segment["rounds"][1]["matches"]
    # public-visual-fixes P3: the feeder reference is the SHARED one
    # (state-and-formatting §6.1) — "SF1", the same string the node it points
    # at is labelled with and the same string the operator's match list
    # shows. The tier's own "SF 1" speller is gone.
    assert [side["placeholder"] for side in final["sides"]] == [
        "Winner of SF1",
        "Winner of SF2",
    ]
    assert [side["feederNodeKey"] for side in final["sides"]] == [
        sf1["nodeKey"],
        sf2["nodeKey"],
    ]
    assert [side["feederTake"] for side in final["sides"]] == ["winner", "winner"]

    # P3: every node publishes the shared human match reference — full for a
    # mixed-event view, event-code-dropped for this single-draw one.
    assert [(m["reference"], m["shortReference"]) for m in segment["rounds"][0]["matches"]] == [
        ("MS SF1", "SF1"),
        ("MS SF2", "SF2"),
    ]
    assert (final["reference"], final["shortReference"]) == ("MS F", "F")
    # ...and no surface publishes a bare row number as a label any more.
    assert "Match 1" not in json.dumps(body)


def test_the_tree_carries_the_discriminated_unresolved_reason(client, bracket_page):
    """V3-11-1: the public wire states WHY a side has no name, as a `kind` a
    renderer switches on — not as a sentence it has to parse. The formatted
    `reference` comes off the same locator the legacy `placeholder` uses, so
    the two can never disagree (D16)."""
    body = client.get(f"/e/api/page/{bracket_page['slug']}/draws/MS").json()
    (segment,) = body["segments"]
    (final,) = segment["rounds"][1]["matches"]
    assert [side["unresolved"] for side in final["sides"]] == [
        {"kind": "winner_of", "known": [], "missing": 0, "reference": "SF1"},
        {"kind": "winner_of", "known": [], "missing": 0, "reference": "SF2"},
    ]

    # A resolved side has no reason at all — the persons ARE the answer, and
    # they are reached through `participantKey` -> `teams`.
    sf1, _sf2 = segment["rounds"][0]["matches"]
    assert [side["unresolved"] for side in sf1["sides"]] == [None, None]


def test_approved_slot_with_unresolved_predecessor_still_reads_scheduled(
    client, bracket_page
):
    """Contract §3.1: a pending participant does not make a slot pending. A
    match whose second side is "Winner of QF1" and whose slot is approved
    is publicly Scheduled with its time (V3-PE09.2: the reverse — showing
    "Scheduled" with no approved time at all — is the actual defect)."""
    slug = bracket_page["slug"]
    body = client.get(f"/e/api/page/{slug}/matches").json()
    items = {item["matchKey"]: item for item in body["items"]}
    sf1 = items["MS:MS-R0-0"]
    assert sf1["status"] == "scheduled"
    assert sf1["scheduledTime"] == "10:30"
    assert sf1["court"] == 1

    final = items["MS:MS-R1-0"]
    assert final["status"] == "scheduled"
    # The final has no approved slot yet — the "scheduled" wire status here
    # is a *match*-state default (nobody's called it, nobody's played it),
    # not a schedule-domain claim; the schedule domain's own answer is
    # carried separately in scheduledTime, which the entrant tier's
    # ``schedulePublicState`` reads to say "Time to be confirmed".
    assert final["scheduledTime"] is None
    assert [side["placeholder"] for side in final["sides"]] == [
        "Winner of SF1",
        "Winner of SF2",
    ]
    # P3: the schedule row names the match the same way the bracket node and
    # the operator's list do (§6.1, "One reference, both tiers").
    assert (sf1["reference"], sf1["shortReference"]) == ("MS SF1", "SF1")
    assert (final["reference"], final["shortReference"]) == ("MS F", "F")


def test_courts_reach_live_bracket_matches_assigned_directly(client, bracket_page):
    """V3-PE09.1: a directly-assigned match that is then started must
    publish its real court, not withhold it."""
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    rounds = _units_by_round(state)
    sf0 = rounds[0][0]
    r = client.post(
        f"/tournaments/{tid}/bracket/match-action",
        json={"id": str(uuid.uuid4()), "play_unit_id": sf0["id"], "action": "start"},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    body = client.get(f"/e/api/page/{slug}/matches").json()
    item = next(item for item in body["items"] if item["matchKey"] == f"MS:{sf0['id']}")
    assert item["status"] == "live"
    assert item["court"] == 1


def test_courts_reach_live_bracket_matches_assigned_via_solver_commit(client):
    """V3-PE09.1 root cause investigation: a match started straight off a
    solver-committed round (never touching the direct /assign endpoint,
    which is how a normal "schedule next round" flow plays out) must still
    publish its court — the ``_merge_live_bracket_courts`` fallback in
    ``_schedule_runtime_snapshot`` is exactly the mechanism that backfills
    it from the bracket session's own assignment when Operations has not
    (yet) materialized a Match row for this play unit."""
    tid = _make_workspace(client, draws_published=True, entrants_published=True)
    ada = _seed_person(tid, "Ada Chen", "Riverside BC")
    bo = _seed_person(tid, "Bo Lee", "Northside SC")
    participants = [
        {"id": f"entry-{ada}", "name": "Ada Chen", "seed": 1},
        {"id": f"entry-{bo}", "name": "Bo Lee", "seed": 2},
        {"id": "P3", "name": "Cass Doe"},
        {"id": "P4", "name": "Dev Roy"},
    ]
    state = _se4_bracket(client, tid, participants)
    slug = "draws-open"
    sf0 = _units_by_round(state)[0][0]
    committed = client.post(
        f"/tournaments/{tid}/bracket/schedule-next/commit",
        json={"assignments": [{"play_unit_id": sf0["id"], "slot_id": 3, "court_id": 1}]},
        headers=CSRF,
    )
    assert committed.status_code == 200, committed.text
    started = client.post(
        f"/tournaments/{tid}/bracket/match-action",
        json={"id": str(uuid.uuid4()), "play_unit_id": sf0["id"], "action": "start"},
        headers=CSRF,
    )
    assert started.status_code == 200, started.text
    body = client.get(f"/e/api/page/{slug}/matches").json()
    item = next(item for item in body["items"] if item["matchKey"] == f"MS:{sf0['id']}")
    assert item["status"] == "live"
    assert item["court"] == 1


def test_results_off_hides_scores_and_resolved_advancement(client, bracket_page):
    """§7's core trap. A recorded semifinal must not reach the public draw
    in ANY form while results are unpublished — no score, no winner mark,
    and the final's side stays a placeholder rather than a name."""
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    sf0 = _units_by_round(state)[0][0]
    _record(
        client,
        tid,
        sf0,
        winner="A",
        score={"sets": [{"sideA": 21, "sideB": 15}, {"sideA": 21, "sideB": 12}]},
    )

    body = client.get(f"/e/api/page/{slug}/draws/MS").json()
    assert body["resultsPublished"] is False
    (segment,) = body["segments"]
    sf_node = segment["rounds"][0]["matches"][0]
    assert sf_node["result"] is None
    (final,) = segment["rounds"][1]["matches"]
    assert final["sides"][0]["participantKey"] is None
    assert final["sides"][0]["placeholder"] == "Winner of SF1"
    assert body["standings"] is None

    # Publish results: the same read now carries all of it.
    _set_flags(tid, results_published=True)
    body = client.get(f"/e/api/page/{slug}/draws/MS").json()
    sf_node = body["segments"][0]["rounds"][0]["matches"][0]
    assert sf_node["result"]["winnerSide"] == "A"
    assert sf_node["result"]["score"] == [[21, 15], [21, 12]]
    (final,) = body["segments"][0]["rounds"][1]["matches"]
    assert final["sides"][0]["participantKey"] == f"entry-{bracket_page['ada']}"


def test_rr_standings_ride_the_detail_with_history_pills(client):
    tid = _make_workspace(client, slug="rr-open", draws_published=True, results_published=True)
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "events": [
            {
                "id": "WS",
                "discipline": "Women's Singles",
                "format": "rr",
                "participants": [
                    {"id": "A", "name": "Ann"},
                    {"id": "B", "name": "Bea"},
                    {"id": "C", "name": "Cyd"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    assert client.post(f"/tournaments/{tid}/bracket", json=body, headers=CSRF).status_code == 200
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    for pu in [p for p in state["play_units"] if p["event_id"] == "WS"]:
        if pu["side_a"] and pu["side_b"]:
            winner = "A" if "A" in (pu["side_a"] or []) else "A"
            _record(client, tid, pu, winner=winner, score={"sets": [{"sideA": 21, "sideB": 10}]})
        state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()

    detail = client.get("/e/api/page/rr-open/draws/WS").json()
    assert detail["standings"] is not None
    top = detail["standings"][0]
    assert set(top) == {
        "position",
        "participantKey",
        "played",
        "wins",
        "losses",
        "gamesWon",
        "gamesLost",
        "pointsWon",
        "pointsLost",
        "history",
    }
    assert top["position"] == 1
    assert all(pill in ("W", "L") for row in detail["standings"] for pill in row["history"])
    (segment,) = detail["segments"]
    assert segment["rounds"][0]["label"] == "Round 1"


# ---- player pages (§3.3) --------------------------------------------------


def test_a_player_page_is_404_while_entrants_are_unpublished(client, bracket_page):
    _set_flags(bracket_page["tid"], entrants_published=False)
    r = client.get(f"/e/api/page/{bracket_page['slug']}/players/{bracket_page['ada']}")
    assert r.status_code == 404


def test_a_pending_person_has_no_public_page(client, bracket_page):
    pending = _seed_person(bracket_page["tid"], "Quiet Kid", None, state="pending")
    r = client.get(f"/e/api/page/{bracket_page['slug']}/players/{pending}")
    assert r.status_code == 404


def test_an_unknown_person_and_a_garbage_key_answer_identically(client, bracket_page):
    ghost = client.get(f"/e/api/page/{bracket_page['slug']}/players/{uuid.uuid4()}")
    garbage = client.get(f"/e/api/page/{bracket_page['slug']}/players/not-a-key")
    assert ghost.status_code == garbage.status_code == 404
    assert ghost.json() == garbage.json()


def test_the_player_page_header_events_and_upcoming_matches(client, bracket_page):
    body = client.get(f"/e/api/page/{bracket_page['slug']}/players/{bracket_page['ada']}").json()
    assert set(body) == {"person", "club", "events", "matches", "history"}
    assert set(body["person"]) == {"identity", "resolution", "label"}
    assert body["person"]["identity"]["name"] == "Ada Chen"
    assert body["club"] == "Riverside BC"
    # SP-P7 delta (§3.3): event rows carry the accepted-partner slot. None
    # here — a singles event has no partner; the populated case and its
    # privacy gates live in test_partner_names_on_the_player_page.
    assert len(body["events"]) == 1
    assert body["events"][0]["code"] == "MS"
    assert body["events"][0]["partner"] is None
    assert body["events"][0]["seed"] == 1
    assert set(body["events"][0]) == {"code", "discipline", "partner", "seed", "drawPath"}
    # P6: a draw-path step is a STRUCTURED ROW, not a token in an
    # arrow-joined sentence — it carries its own result and reference so the
    # profile can lay the path out as rounds. Undecided/unpublished steps
    # keep a null outcome and a null score; nothing is inferred from the
    # existence of a later round.
    assert all(
        set(path) == {"roundLabel", "opponents", "outcome", "score", "reference"}
        for path in body["events"][0]["drawPath"]
    )
    assert all(path["outcome"] is None for path in body["events"][0]["drawPath"])
    # Results unpublished: the SF shows as undecided.
    (match,) = body["matches"]
    assert match["decided"] is False and match["score"] is None
    assert match["roundLabel"] == "Semifinals"
    assert match["scheduledTime"] == "10:30" and match["court"] == 1


def test_player_match_results_follow_publication(client, bracket_page):
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    sf0 = _units_by_round(state)[0][0]
    assert f"entry-{bracket_page['ada']}" in (sf0["side_a"] or []) + (sf0["side_b"] or [])
    winner = "A" if f"entry-{bracket_page['ada']}" in (sf0["side_a"] or []) else "B"
    _record(client, tid, sf0, winner=winner)

    body = client.get(f"/e/api/page/{slug}/players/{bracket_page['ada']}").json()
    assert all(not match["decided"] for match in body["matches"])

    _set_flags(tid, results_published=True)
    body = client.get(f"/e/api/page/{slug}/players/{bracket_page['ada']}").json()
    decided = [m for m in body["matches"] if m["decided"]]
    assert decided and any(s["winner"] for s in decided[0]["sides"])


# ---- meet-origin matches (§3.3, the other engine) -------------------------


def test_meet_matches_reach_the_player_page_with_gated_scores(client):
    tid = _make_workspace(
        client,
        name="Dual Meet",
        slug="dual-meet",
        entrants_published=True,
        draws_published=True,
    )
    person = _seed_person(tid, "Ada Chen", "Riverside BC", event_code="MS1")
    roster_id = f"entry-{person}"

    from db.models import Match, MatchState, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.data = {
            "config": {"intervalMinutes": 30, "dayStart": "09:00"},
            "players": [
                {"id": roster_id, "name": "Ada Chen", "groupId": "g1"},
                {"id": "opp-1", "name": "Rival Person", "groupId": "g2"},
            ],
            "matches": [
                {
                    "id": "m1",
                    "sideA": [roster_id],
                    "sideB": ["opp-1"],
                    "eventRank": "MS1",
                }
            ],
            "schedule": {
                "assignments": [{"matchId": "m1", "slotId": 2, "courtId": 2, "durationSlots": 1}]
            },
        }
        # The blob is written straight in, bypassing the projection that
        # normally creates the ``matches`` row. Since SP-DM-3 P4 the state row
        # has a composite FK onto it (migration y9e4f0a2b7c8), so the parent
        # has to exist here too. Leave its court empty first to prove the
        # planning blob's courtId is not public (R-U3).
        session.add(Match(tournament_id=uuid.UUID(tid), id="m1"))
        session.add(
            MatchState(
                tournament_id=uuid.UUID(tid),
                match_id="m1",
                status="finished",
                score_side_a=21,
                score_side_b=15,
            )
        )
        session.commit()
    finally:
        session.close()

    body = client.get(f"/e/api/page/dual-meet/players/{person}").json()
    (match,) = body["matches"]
    assert match["eventCode"] == "MS1"
    assert match["scheduledTime"] == "10:00" and match["court"] is None
    assert [[p["identity"]["name"] for p in side["persons"]] for side in match["sides"]] == [
        ["Ada Chen"],
        ["Rival Person"],
    ]
    # Results unpublished: the finished score exists in match_states and
    # must not reach the page.
    assert match["decided"] is False and match["score"] is None

    # Operations materializes the assignment on the match row. Only now may
    # the same planned court become public.
    session = SessionLocal()
    try:
        persisted = session.get(Match, (uuid.UUID(tid), "m1"))
        persisted.court_id = 2
        session.commit()
    finally:
        session.close()

    body = client.get(f"/e/api/page/dual-meet/players/{person}").json()
    (match,) = body["matches"]
    assert match["court"] == 2
    assert match["decided"] is False and match["score"] is None

    _set_flags(tid, results_published=True)
    body = client.get(f"/e/api/page/dual-meet/players/{person}").json()
    (match,) = body["matches"]
    assert match["decided"] is True
    assert match["score"] == [[21, 15]]
    assert match["sides"][0]["winner"] is True


def test_mixed_visibility_hides_the_opted_out_event_everywhere(client):
    """One visible event must not make another opted-out event public."""
    tid = _make_workspace(
        client,
        name="Mixed Visibility Meet",
        slug="mixed-visibility-meet",
        entrants_published=True,
        draws_published=True,
    )
    _declare_divisions(client, tid, {"MS": 1, "WS": 1})

    from db.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Match,
        Submission,
        Tournament,
    )
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        account = EntrantAccount(
            email=f"mixed-{uuid.uuid4().hex[:8]}@example.test",
            password_hash="x",
        )
        session.add(account)
        session.flush()
        submission = Submission(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
        )
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name="Ada Visible Once",
            gender="X",
            club="Privacy BC",
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            meet_event_id="MS",
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
            meet_event_id="WS",
        )
        session.add_all([submission, player, ms, ws])
        session.flush()
        session.add_all(
            [
                Entry(
                    tournament_id=uuid.UUID(tid),
                    entry_event_id=ms.id,
                    submission_id=submission.id,
                    entry_player_id=player.id,
                    state="confirmed",
                    list_opt_out=False,
                ),
                Entry(
                    tournament_id=uuid.UUID(tid),
                    entry_event_id=ws.id,
                    submission_id=submission.id,
                    entry_player_id=player.id,
                    state="confirmed",
                    list_opt_out=True,
                ),
            ]
        )
        roster_key = f"entry-{player.id}"
        tournament = session.get(Tournament, uuid.UUID(tid))
        tournament.data = {
            "config": {"intervalMinutes": 30, "dayStart": "09:00"},
            "players": [
                {
                    "id": roster_key,
                    "name": "Ada Visible Once",
                    "entryPlayerId": str(player.id),
                },
                {"id": "opponent", "name": "Imported Opponent"},
            ],
            "matches": [
                {
                    "id": "visible-match",
                    "sideA": [roster_key],
                    "sideB": ["opponent"],
                    "eventRank": "MS1",
                },
                {
                    "id": "hidden-match",
                    "sideA": [roster_key],
                    "sideB": ["opponent"],
                    "eventRank": "WS1",
                },
            ],
            "schedule": {
                "assignments": [
                    {"matchId": "visible-match", "slotId": 0},
                    {"matchId": "hidden-match", "slotId": 1},
                ]
            },
        }
        session.add_all(
            [
                Match(tournament_id=uuid.UUID(tid), id="visible-match"),
                Match(tournament_id=uuid.UUID(tid), id="hidden-match"),
            ]
        )
        session.commit()
        person_id = str(player.id)
    finally:
        session.close()

    person_page = client.get(
        f"/e/api/page/mixed-visibility-meet/players/{person_id}"
    ).json()
    assert [event["code"] for event in person_page["events"]] == ["MS"]
    assert [match["eventCode"] for match in person_page["matches"]] == ["MS1"]

    schedule = client.get("/e/api/page/mixed-visibility-meet/matches").json()
    by_event = {match["eventCode"]: match for match in schedule["items"]}
    visible_ref = by_event["MS1"]["sides"][0]["persons"][0]
    hidden_ref = by_event["WS1"]["sides"][0]["persons"][0]
    assert visible_ref["identity"]["name"] == "Ada Visible Once"
    assert visible_ref["resolution"] == "resolved"
    assert hidden_ref == {
        "identity": None,
        "resolution": "dead",
        "label": "Player not published",
    }


# ---- profile v1: identity + tournament history (public-visual-fixes P2) ---


def _seed_person_for(tid, account_id, full_name, club=None, state="confirmed", event_code="MS", list_opt_out=False):
    """``_seed_person`` pinned to a GIVEN entrant account.

    The account is the canonical identity a public history is joined on, so
    a test about history has to be able to say which account it means — and,
    just as importantly, to give one account two DIFFERENT people (the club
    manager shape, which is why the account alone is not a person key)."""
    from db.models import Entry, EntryEvent, EntryPlayer, Submission
    from db.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        event = session.scalars(
            select(EntryEvent).where(
                EntryEvent.tournament_id == uuid.UUID(tid),
                EntryEvent.code == event_code,
            )
        ).first()
        if event is None:
            event = EntryEvent(
                tournament_id=uuid.UUID(tid),
                code=event_code,
                discipline="Men's Singles",
                entry_type="singles",
            )
            session.add(event)
            session.flush()
        submission = Submission(tournament_id=uuid.UUID(tid), account_id=account_id)
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account_id,
            full_name=full_name,
            gender="X",
            club=club,
        )
        session.add_all([submission, player])
        session.flush()
        session.add(
            Entry(
                tournament_id=uuid.UUID(tid),
                entry_event_id=event.id,
                submission_id=submission.id,
                entry_player_id=player.id,
                state=state,
                list_opt_out=list_opt_out,
            )
        )
        session.commit()
        return str(player.id)
    finally:
        session.close()


def _an_account(email=None):
    from db.models import EntrantAccount
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        account = EntrantAccount(
            email=email or f"hist-{uuid.uuid4().hex[:8]}@example.com", password_hash="x"
        )
        session.add(account)
        session.commit()
        return account.id
    finally:
        session.close()


def _set_dates(tid, start, end=None):
    from db.models import Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(Tournament, uuid.UUID(tid))
        row.tournament_date = start
        row.tournament_end_date = end
        session.commit()
    finally:
        session.close()


def test_history_always_carries_the_current_tournament_marked_current(client, bracket_page):
    body = client.get(
        f"/e/api/page/{bracket_page['slug']}/players/{bracket_page['ada']}"
    ).json()
    (row,) = body["history"]
    assert row["current"] is True
    assert row["slug"] == bracket_page["slug"]
    # The row is a link TARGET: this workspace's own key for this person.
    assert row["playerKey"] == bracket_page["ada"]
    assert row["eventCodes"] == ["MS"]
    assert row["drawsPublished"] is True
    # A person with no linked history still reads as a history of one.
    assert len(body["history"]) == 1


def test_history_links_the_same_human_across_workspaces_by_verified_account(client):
    account = _an_account()
    first = _make_workspace(
        client, name="Spring Open", slug="spring-open", entrants_published=True
    )
    second = _make_workspace(
        client, name="Winter Classic", slug="winter-classic", entrants_published=True
    )
    _set_dates(first, "2026-09-19", "2026-09-20")
    _set_dates(second, "2026-01-10")
    here = _seed_person_for(first, account, "Ada Chen", "Riverside BC")
    there = _seed_person_for(second, account, "Ada Chen", "Riverside BC", event_code="XD")
    # The SAME account, a DIFFERENT human — a club manager entering two
    # players. Account alone would merge them into one profile.
    other = _seed_person_for(second, account, "Bo Lee", "Riverside BC")

    body = client.get(f"/e/api/page/spring-open/players/{here}").json()
    assert [row["slug"] for row in body["history"]] == ["spring-open", "winter-classic"]
    linked = body["history"][1]
    assert linked["playerKey"] == there
    assert linked["playerKey"] != other
    assert linked["current"] is False
    assert linked["tournamentName"] == "Winter Classic"
    assert linked["date"] == "2026-01-10"
    assert linked["eventCodes"] == ["XD"]
    # Newest first: the current September workspace precedes the January one.
    assert body["history"][0]["date"] == "2026-09-19"
    assert body["history"][0]["endDate"] == "2026-09-20"

    # ...and the other person's own profile is their own history, not Ada's.
    theirs = client.get(f"/e/api/page/winter-classic/players/{other}").json()
    assert [row["slug"] for row in theirs["history"]] == ["winter-classic"]


@pytest.mark.parametrize(
    ("flags", "why"),
    [
        ({"entrants_published": False}, "the other list is unpublished"),
        ({"audience": "private"}, "the other page is private"),
        ({"audience": "unlisted"}, "the other page is deliberately undiscoverable"),
        ({"is_open": False}, "the other page is closed"),
    ],
)
def test_history_omits_a_workspace_that_has_not_published_its_own_list(client, flags, why):
    account = _an_account()
    first = _make_workspace(
        client, name="Spring Open", slug="spring-open", entrants_published=True
    )
    second = _make_workspace(
        client, name="Winter Classic", slug="winter-classic", entrants_published=True
    )
    here = _seed_person_for(first, account, "Ada Chen")
    _seed_person_for(second, account, "Ada Chen")
    _set_flags(second, **flags)

    body = client.get(f"/e/api/page/spring-open/players/{here}").json()
    assert [row["slug"] for row in body["history"]] == ["spring-open"], why


@pytest.mark.parametrize(
    ("kwargs", "why"),
    [
        ({"state": "pending"}, "an unconfirmed entry is not public anywhere"),
        ({"list_opt_out": True}, "an opted-out entry is not published"),
    ],
)
def test_history_omits_a_workspace_the_person_is_not_public_in(client, kwargs, why):
    account = _an_account()
    first = _make_workspace(
        client, name="Spring Open", slug="spring-open", entrants_published=True
    )
    second = _make_workspace(
        client, name="Winter Classic", slug="winter-classic", entrants_published=True
    )
    here = _seed_person_for(first, account, "Ada Chen")
    _seed_person_for(second, account, "Ada Chen", **kwargs)

    body = client.get(f"/e/api/page/spring-open/players/{here}").json()
    assert [row["slug"] for row in body["history"]] == ["spring-open"], why


def test_history_is_never_a_name_match_across_accounts(client):
    """Two strangers who share a name are two people, in history no less
    than on the page-of-one (R-P7c). Only the verified account joins them."""
    first = _make_workspace(
        client, name="Spring Open", slug="spring-open", entrants_published=True
    )
    second = _make_workspace(
        client, name="Winter Classic", slug="winter-classic", entrants_published=True
    )
    here = _seed_person_for(first, _an_account(), "Ada Chen")
    _seed_person_for(second, _an_account(), "Ada Chen")

    body = client.get(f"/e/api/page/spring-open/players/{here}").json()
    assert [row["slug"] for row in body["history"]] == ["spring-open"]


def test_history_matches_a_name_across_case_spacing_and_accents(client):
    """The same human's name is stored twice by two desks; a leading space
    or a folded accent must not fork one person into two profiles."""
    account = _an_account()
    first = _make_workspace(
        client, name="Spring Open", slug="spring-open", entrants_published=True
    )
    second = _make_workspace(
        client, name="Winter Classic", slug="winter-classic", entrants_published=True
    )
    here = _seed_person_for(first, account, "Rasmus Kjær")
    there = _seed_person_for(second, account, "  rasmus  kjær ")

    body = client.get(f"/e/api/page/spring-open/players/{here}").json()
    assert [row["playerKey"] for row in body["history"]] == [here, there]


# ---- linkability of every eligible name (C-PE-19) -------------------------


def test_a_namespaced_bracket_event_still_links_its_entry_backed_people(client):
    """The draw's event id and the entry desk's event code are the SAME
    event spelled two ways (``T027-MS`` vs ``MS``). Resolving people against
    only one spelling turned every eligible name in a namespaced import into
    "Player not published" — a name that cannot be clicked."""
    tid = _make_workspace(
        client, slug="namespaced", draws_published=True, entrants_published=True
    )
    ada = _seed_person(tid, "Ada Chen", "Riverside BC")
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "start_time": "2026-09-12T09:00:00",
        "events": [
            {
                "id": "T027-MS",
                "discipline": "Men's Singles",
                "format": "se",
                "participants": [
                    {"id": f"entry-{ada}", "name": "Ada Chen", "seed": 1},
                    {"id": "P2", "name": "Bo Lee"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    assert client.post(f"/tournaments/{tid}/bracket", json=body, headers=CSRF).status_code == 200

    # The draw is addressed by the event's own id; the PEOPLE inside it are
    # the claim under test.
    detail = client.get("/e/api/page/namespaced/draws/T027-MS").json()
    people = [person for team in detail["teams"] for person in team["persons"]]
    ada_ref = next(p for p in people if (p["identity"] or {}).get("name") == "Ada Chen")
    assert ada_ref["resolution"] == "resolved"
    # The id is what makes the name a link; without it the row renders as
    # plain text and the profile is unreachable from the draw.
    assert ada_ref["identity"]["id"] == ada
    assert client.get(f"/e/api/page/namespaced/players/{ada}").status_code == 200


def test_the_directory_reads_club_from_the_same_gate_as_the_name(client):
    """Club is the second field the public search matches on, so it comes
    from the ONE gated person directory the name comes from — not from a
    second, wider list read beside it. The invariant this pins is the one a
    reader can see: a row that says "Player not published" carries no club,
    and a published row keeps its own (the C4 ruling)."""
    tid = _make_workspace(
        client, slug="club-gate", entrants_published=True, draws_published=True
    )
    ada = _seed_person(tid, "Ada Chen", "Riverside BC")
    withheld = _seed_person(tid, "Quiet Kid", "Secret SC", state="pending")
    # Both are in the published draw, so both reach the directory — one as a
    # person, one as an unpublished reference.
    _set_bracket_players(
        tid,
        [
            {"id": f"entry-{ada}", "name": "Ada Chen"},
            {"id": f"entry-{withheld}", "name": "Quiet Kid"},
        ],
    )
    _se4_bracket(
        client,
        tid,
        [
            {"id": f"entry-{ada}", "name": "Ada Chen", "seed": 1},
            {"id": f"entry-{withheld}", "name": "Quiet Kid", "seed": 2},
            {"id": "P3", "name": "Cass Doe"},
            {"id": "P4", "name": "Dev Roy"},
        ],
    )

    response = client.get("/e/api/page/club-gate/players")
    body = response.json()
    by_key = {row["playerKey"]: row for row in body["players"]}
    # The unconfirmed person is not in the directory at all, and neither is
    # anything about them — the club included.
    assert f"entry-{withheld}" not in by_key
    assert "Secret SC" not in response.text
    assert "Quiet Kid" not in response.text

    published = by_key[f"entry-{ada}"]
    assert published["person"]["resolution"] == "resolved"
    assert published["club"] == "Riverside BC"
