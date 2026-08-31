"""The SP-P7 public-site projections: draws, seeds, winners, player pages.

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
        "remainingMatchCount",
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


def test_draw_players_are_published_draw_roster_people_not_profiles(client):
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
    assert players == {
        "published": True,
        "players": [
            {
                "playerKey": "P-A",
                "person": {"identity": {"id": None, "name": "Áda Chen"}, "resolution": "dead", "label": None},
                "club": None,
                "eventCodes": ["MD", "WS"],
            },
            {
                "playerKey": "P-B",
                "person": {"identity": {"id": None, "name": "Bo Lee"}, "resolution": "dead", "label": None},
                "club": None,
                "eventCodes": ["MD", "WS"],
            },
            {
                "playerKey": "P-C",
                "person": {"identity": {"id": None, "name": "Cass Doe"}, "resolution": "dead", "label": None},
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
        assert player["person"]["identity"]["id"] is None

    detail = client.get("/e/api/page/roster-open/draws/MD").json()
    teams = {team["participantKey"]: team for team in detail["teams"]}
    assert [p["identity"]["name"] for p in teams["PAIR-1"]["persons"]] == ["Áda Chen", "Bo Lee"]
    # Partial member resolution falls back to the whole source label; it is
    # never split on punctuation into invented people.
    assert [p["identity"]["name"] for p in teams["PAIR-2"]["persons"]] == ["Missing / Cass"]


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
    assert [side["placeholder"] for side in final["sides"]] == [
        "Winner of SF 1",
        "Winner of SF 2",
    ]
    assert [side["feederNodeKey"] for side in final["sides"]] == [
        sf1["nodeKey"],
        sf2["nodeKey"],
    ]
    assert [side["feederTake"] for side in final["sides"]] == ["winner", "winner"]


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
    assert final["sides"][0]["placeholder"] == "Winner of SF 1"
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


# ---- seeds (§3.5) ---------------------------------------------------------


def test_seeds_are_gated_by_draws_and_ordered(client, bracket_page):
    body = client.get(f"/e/api/page/{bracket_page['slug']}/seeds").json()
    assert body["published"] is True
    (event,) = body["events"]
    assert [line["seed"] for line in event["seeds"]] == [1, 2]
    assert [p["identity"]["name"] for p in event["seeds"][0]["persons"]] == ["Ada Chen"]
    assert event["seeds"][0]["club"] == "Riverside BC"

    _set_flags(bracket_page["tid"], draws_published=False)
    assert client.get(f"/e/api/page/{bracket_page['slug']}/seeds").json() == {
        "published": False,
        "events": [],
    }


# ---- winners (§3.6) -------------------------------------------------------


def test_winners_gate_then_populate_as_the_draw_decides(client, bracket_page):
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    assert client.get(f"/e/api/page/{slug}/winners").json() == {
        "published": False,
        "events": [],
    }

    _set_flags(tid, results_published=True)
    (event,) = client.get(f"/e/api/page/{slug}/winners").json()["events"]
    assert event["decided"] is False and event["winner"] is None

    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    rounds = _units_by_round(state)
    _record(client, tid, rounds[0][0], winner="A")
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    _record(client, tid, _units_by_round(state)[0][1], winner="B")
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    _record(client, tid, _units_by_round(state)[1][0], winner="A")

    (event,) = client.get(f"/e/api/page/{slug}/winners").json()["events"]
    assert event["decided"] is True
    assert event["winner"] is not None and event["runnerUp"] is not None
    assert len(event["semifinalists"]) == 2
    assert set(event["winner"]) == {"persons", "club"}
    assert set(event) == {
        "eventCode", "discipline", "decided", "winner", "runnerUp",
        "semifinalists", "finalScore", "finalists",
    }
    assert all(
        set(person) == {"identity", "resolution", "label"}
        and set(person["identity"]) == {"id", "name"}
        for person in event["winner"]["persons"]
    )


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
    assert set(body) == {"person", "club", "events", "matches"}
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
    assert all(set(path) == {"roundLabel", "opponents"} for path in body["events"][0]["drawPath"])
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
