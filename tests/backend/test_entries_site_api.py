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

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


# ---- seeding helpers ------------------------------------------------------


def _make_workspace(client, name="Draws Open", slug="draws-open", **flags):
    tid = client.post("/tournaments", json={"name": name}, headers=CSRF).json()["id"]

    from database.models import EntryPage
    from database.session import SessionLocal

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


def _seed_person(tid, full_name="Ada Chen", club="Riverside BC", state="confirmed",
                 event_code="MS"):
    """A person with an entry (default confirmed) + the event it names.
    Returns the person id — ``entry-{id}`` is their roster/participant key."""
    from database.models import (
        EntrantAccount,
        Entry,
        EntryEvent,
        EntryPlayer,
        Submission,
    )
    from database.session import SessionLocal
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
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(tid))
        for key, value in flags.items():
            setattr(row, key, value)
        session.commit()
    finally:
        session.close()


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
    assert body == {"published": False, "resultsPublished": False, "draws": []}


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
    }
    assert card["kind"] == "se"
    assert card["size"] == 4
    assert card["hasConsolation"] is False


def test_a_meet_only_workspace_publishes_an_empty_draws_list(client):
    _make_workspace(client, slug="meet-only", draws_published=True)
    body = client.get("/e/api/page/meet-only/draws").json()
    assert body["published"] is True
    assert body["draws"] == []


# ---- draw detail (§3.4) ---------------------------------------------------


def test_draw_detail_is_a_uniform_404_while_unpublished(client, bracket_page):
    _set_flags(bracket_page["tid"], draws_published=False)
    r = client.get(f"/e/api/page/{bracket_page['slug']}/draws/MS")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_the_tree_renders_rounds_seeds_schedule_and_placeholders(
    client, bracket_page
):
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


def test_results_off_hides_scores_and_resolved_advancement(client, bracket_page):
    """§7's core trap. A recorded semifinal must not reach the public draw
    in ANY form while results are unpublished — no score, no winner mark,
    and the final's side stays a placeholder rather than a name."""
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    sf0 = _units_by_round(state)[0][0]
    _record(client, tid, sf0, winner="A",
            score={"sets": [{"sideA": 21, "sideB": 15}, {"sideA": 21, "sideB": 12}]})

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
    tid = _make_workspace(client, slug="rr-open", draws_published=True,
                          results_published=True)
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
    assert (
        client.post(f"/tournaments/{tid}/bracket", json=body, headers=CSRF).status_code
        == 200
    )
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    for pu in [p for p in state["play_units"] if p["event_id"] == "WS"]:
        if pu["side_a"] and pu["side_b"]:
            winner = "A" if "A" in (pu["side_a"] or []) else "A"
            _record(client, tid, pu, winner=winner,
                    score={"sets": [{"sideA": 21, "sideB": 10}]})
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
    assert event["seeds"][0]["names"] == ["Ada Chen"]
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
    assert set(event["winner"]) == {"names", "club"}


# ---- player pages (§3.3) --------------------------------------------------


def test_a_player_page_is_404_while_entrants_are_unpublished(client, bracket_page):
    _set_flags(bracket_page["tid"], entrants_published=False)
    r = client.get(
        f"/e/api/page/{bracket_page['slug']}/players/{bracket_page['ada']}"
    )
    assert r.status_code == 404


def test_a_pending_person_has_no_public_page(client, bracket_page):
    pending = _seed_person(bracket_page["tid"], "Quiet Kid", None, state="pending")
    r = client.get(f"/e/api/page/{bracket_page['slug']}/players/{pending}")
    assert r.status_code == 404


def test_an_unknown_person_and_a_garbage_key_answer_identically(
    client, bracket_page
):
    ghost = client.get(
        f"/e/api/page/{bracket_page['slug']}/players/{uuid.uuid4()}"
    )
    garbage = client.get(f"/e/api/page/{bracket_page['slug']}/players/not-a-key")
    assert ghost.status_code == garbage.status_code == 404
    assert ghost.json() == garbage.json()


def test_the_player_page_header_events_and_upcoming_matches(client, bracket_page):
    body = client.get(
        f"/e/api/page/{bracket_page['slug']}/players/{bracket_page['ada']}"
    ).json()
    assert set(body) == {"personKey", "name", "club", "events", "record", "matches"}
    assert body["name"] == "Ada Chen"
    assert body["club"] == "Riverside BC"
    assert body["events"] == [{"code": "MS", "discipline": "Men's Singles"}]
    # Results unpublished: no record claim, and the SF shows as undecided.
    assert body["record"] is None
    (match,) = body["matches"]
    assert match["decided"] is False and match["score"] is None
    assert match["roundLabel"] == "Semifinals"
    assert match["scheduledTime"] == "10:30" and match["court"] == 1


def test_the_record_counts_published_results_only(client, bracket_page):
    tid, slug = bracket_page["tid"], bracket_page["slug"]
    state = client.get(f"/tournaments/{tid}/bracket", headers=CSRF).json()
    sf0 = _units_by_round(state)[0][0]
    assert f"entry-{bracket_page['ada']}" in (sf0["side_a"] or []) + (
        sf0["side_b"] or []
    )
    winner = "A" if f"entry-{bracket_page['ada']}" in (sf0["side_a"] or []) else "B"
    _record(client, tid, sf0, winner=winner)

    body = client.get(f"/e/api/page/{slug}/players/{bracket_page['ada']}").json()
    assert body["record"] is None  # still unpublished

    _set_flags(tid, results_published=True)
    body = client.get(f"/e/api/page/{slug}/players/{bracket_page['ada']}").json()
    assert body["record"] == {"played": 1, "wins": 1, "losses": 0}
    decided = [m for m in body["matches"] if m["decided"]]
    assert decided and any(s["winner"] for s in decided[0]["sides"])


# ---- meet-origin matches (§3.3, the other engine) -------------------------


def test_meet_matches_reach_the_player_page_with_gated_scores(client):
    tid = _make_workspace(client, name="Dual Meet", slug="dual-meet",
                          entrants_published=True)
    person = _seed_person(tid, "Ada Chen", "Riverside BC", event_code="MS1")
    roster_id = f"entry-{person}"

    from database.models import MatchState, Tournament
    from database.session import SessionLocal

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
                "assignments": [
                    {"matchId": "m1", "slotId": 2, "courtId": 2, "durationSlots": 1}
                ]
            },
        }
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
    assert match["scheduledTime"] == "10:00" and match["court"] == 2
    assert [side["names"] for side in match["sides"]] == [
        ["Ada Chen"],
        ["Rival Person"],
    ]
    # Results unpublished: the finished score exists in match_states and
    # must not reach the page.
    assert match["decided"] is False and match["score"] is None
    assert body["record"] is None

    _set_flags(tid, results_published=True)
    body = client.get(f"/e/api/page/dual-meet/players/{person}").json()
    (match,) = body["matches"]
    assert match["decided"] is True
    assert match["score"] == [[21, 15]]
    assert match["sides"][0]["winner"] is True
    assert body["record"] == {"played": 1, "wins": 1, "losses": 0}
