"""Unit tests for the per-event bracket routes added in A.4:

  POST   /tournaments/{id}/bracket/events/{event_id}         — upsert
  POST   /tournaments/{id}/bracket/events/{event_id}/generate — generate
  DELETE /tournaments/{id}/bracket/events/{event_id}          — delete

Also tests that ``record_match_result`` flips ``event.status`` from
``'generated'`` to ``'started'`` on the first result.

Tests run against an in-memory SQLite via the ``isolate_test_database``
helper; the FastAPI TestClient pipeline exercises the routers + auth
deps + repository layer end-to-end.
"""
from __future__ import annotations

import uuid

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
    return seed_tournament(client, "Event Routes Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _event_url(tid: str, event_id: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket/events/{event_id}"
    if not suffix:
        return base
    return base + "/" + "/".join(suffix)


def _minimal_bracket(tid: str, client) -> None:
    """Create a minimal bracket session so events can be registered."""
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 2.0,
        "events": [
            {
                "id": "_SEED",
                "discipline": "Seed",
                "format": "se",
                "participants": [
                    {"id": "s1", "name": "Seed1"},
                    {"id": "s2", "name": "Seed2"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text


def _upsert_body(participants=None) -> dict:
    if participants is None:
        participants = [
            {"id": f"P{i}", "name": f"Player {i}", "seed": i}
            for i in range(1, 5)
        ]
    return {
        "discipline": "Men's Singles",
        "format": "se",
        "duration_slots": 1,
        "participants": participants,
    }


def _get_event_status(client, tid: str, event_id: str) -> str:
    """Read the event status directly from the DB (not just from route response)."""
    from db.session import SessionLocal
    from db.models import BracketEvent
    from sqlalchemy.orm import Session
    session: Session = SessionLocal()
    try:
        row = session.get(BracketEvent, (uuid.UUID(tid), event_id))
        return row.status if row else "NOT_FOUND"
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /events/{event_id} — upsert
# ---------------------------------------------------------------------------


def test_upsert_event_creates_draft_event(client, tid):
    """Happy path: upsert creates a draft event with participants."""
    _minimal_bracket(tid, client)
    r = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r.status_code == 200, r.text
    body = r.json()
    # The response includes all events (including _SEED from create).
    event_ids = [e["id"] for e in body["events"]]
    assert "MS" in event_ids
    # DB status should be 'draft'.
    assert _get_event_status(client, tid, "MS") == "draft"


def test_upsert_event_replaces_participants(client, tid):
    """Upsert replaces participants on a second call."""
    _minimal_bracket(tid, client)
    r1 = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r1.status_code == 200, r1.text
    # Second upsert with 2 participants.
    new_participants = [
        {"id": "A", "name": "Alpha"},
        {"id": "B", "name": "Beta"},
    ]
    r2 = client.post(_event_url(tid, "MS"), json=_upsert_body(new_participants))
    assert r2.status_code == 200, r2.text
    body = r2.json()
    ms_event = next(e for e in body["events"] if e["id"] == "MS")
    assert ms_event["participant_count"] == 2


def test_upsert_event_serializes_per_event_participants(client, tid):
    """Draft events carry their OWN participants on EventOut (SP-D7 S3).

    The flat ``TournamentOut.participants`` list cannot attribute a draft
    singles entry to its event (no play units yet, and the participant id
    is just the player slug), so the roster surface reads
    ``events[].participants``.
    """
    _minimal_bracket(tid, client)
    r = client.post(
        _event_url(tid, "MS"),
        json=_upsert_body(
            [
                {"id": "p-alex", "name": "Alex"},
                {"id": "MS-T1", "name": "Ben / Cam", "members": ["p-ben", "p-cam"]},
            ]
        ),
    )
    assert r.status_code == 200, r.text
    ms_event = next(e for e in r.json()["events"] if e["id"] == "MS")
    by_id = {p["id"]: p for p in ms_event["participants"]}
    assert set(by_id) == {"p-alex", "MS-T1"}
    assert by_id["p-alex"]["members"] is None
    assert by_id["MS-T1"]["members"] == ["p-ben", "p-cam"]


def test_upsert_event_preserves_seeds_through_echo(client, tid):
    """Seeds survive a create-or-replace echo: ``ParticipantOut`` serializes
    ``seed``, so echoing an event's own participants back through the upsert
    no longer silently resets imported seeds (SP-D7 debt)."""
    _minimal_bracket(tid, client)
    # The default body seeds P1..P4 with seed=1..4.
    r1 = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r1.status_code == 200, r1.text
    ms1 = next(e for e in r1.json()["events"] if e["id"] == "MS")
    assert {p["id"]: p["seed"] for p in ms1["participants"]} == {
        "P1": 1, "P2": 2, "P3": 3, "P4": 4,
    }

    # Echo the returned participants straight back through the upsert —
    # the seed-drop bug lived exactly here (ParticipantOut omitted `seed`).
    echoed = [
        {
            "id": p["id"],
            "name": p["name"],
            **({"members": p["members"]} if p.get("members") else {}),
            **({"seed": p["seed"]} if p.get("seed") is not None else {}),
        }
        for p in ms1["participants"]
    ]
    r2 = client.post(_event_url(tid, "MS"), json=_upsert_body(echoed))
    assert r2.status_code == 200, r2.text
    ms2 = next(e for e in r2.json()["events"] if e["id"] == "MS")
    assert {p["id"]: p["seed"] for p in ms2["participants"]} == {
        "P1": 1, "P2": 2, "P3": 3, "P4": 4,
    }


def test_upsert_event_404_on_missing_tournament(client):
    """Upsert 404s on an unknown tournament."""
    fake_tid = str(uuid.uuid4())
    r = client.post(_event_url(fake_tid, "MS"), json=_upsert_body())
    # Auth wall fires first (403) or 404 — either is acceptable.
    assert r.status_code in (403, 404)


def test_upsert_event_409_on_started(client, tid):
    """Cannot upsert a started event."""
    _minimal_bracket(tid, client)
    # Create + generate + record a result to flip to 'started'.
    r = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r.status_code == 200, r.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert rg.status_code == 200, rg.text
    body = rg.json()
    # Pick a scheduled MS match and record a result.
    assignments = body.get("assignments", [])
    assert assignments, "generate should have produced assignments"
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    rr = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert rr.status_code == 200, rr.text
    # Now upsert should 409.
    r2 = client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# POST /events/{event_id}/generate — generate
# ---------------------------------------------------------------------------


def test_generate_draft_sets_status_generated(client, tid):
    """Draft event → generate → status becomes 'generated'."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["assignments"], "generate should produce assignments"
    # DB status should be 'generated'.
    assert _get_event_status(client, tid, "MS") == "generated"
    # Response events[MS].rounds must be populated (not an empty draw).
    ms_event = next(e for e in body["events"] if e["id"] == "MS")
    assert ms_event["rounds"], "events[MS].rounds should be populated after generate"
    # Response play_units must include MS matches.
    ms_play_units = [p for p in body["play_units"] if p["event_id"] == "MS"]
    assert ms_play_units, "play_units should include MS matches after generate"


def _participant_rows(tid: str, event_id: str) -> dict[str, dict]:
    """``meta`` + ``entry_player_id`` straight from the DB, by participant id."""
    from db.session import SessionLocal
    from db.models import BracketParticipant
    from sqlalchemy import select
    session = SessionLocal()
    try:
        rows = session.scalars(
            select(BracketParticipant).where(
                BracketParticipant.tournament_id == uuid.UUID(tid),
                BracketParticipant.bracket_event_id == event_id,
            )
        ).all()
        return {
            r.id: {"meta": dict(r.meta or {}), "entry_player_id": r.entry_player_id}
            for r in rows
        }
    finally:
        session.close()


def _mint_person(tid: str, email: str = "stamp@example.com") -> uuid.UUID:
    """Create a real ``entry_players`` row and return its id.

    Real, not a bare ``uuid4``: the composite FK
    ``(tournament_id, entry_player_id)`` on ``bracket_participants`` is
    enforced (SQLite ``PRAGMA foreign_keys`` is ON for every app session),
    so a fabricated key is an IntegrityError, not a stored value. ``email``
    is a parameter because ``entrant_accounts.email`` is unique — a test
    minting two people must vary it.
    """
    from db.session import SessionLocal
    from db.models import EntrantAccount, EntryPlayer
    session = SessionLocal()
    try:
        account = EntrantAccount(email=email, password_hash="x")
        session.add(account)
        session.flush()
        player = EntryPlayer(
            tournament_id=uuid.UUID(tid),
            account_id=account.id,
            full_name="Player 1",
            gender="F",
        )
        session.add(player)
        session.commit()
        return player.id
    finally:
        session.close()


def _stamp_person(tid: str, event_id: str, pid: str, meta: dict) -> uuid.UUID:
    """Write ``meta`` **and** a real ``entry_player_id`` onto a participant row.

    Done in SQL because the upsert route writes neither from its own
    payload before an operator has echoed one back — the entries commit
    seam is what puts ``sourceEntryId`` and the key there in production
    (see
    ``test_entries_commit_seam.test_a_committed_entry_puts_the_person_key_on_its_participant``).
    """
    from db.session import SessionLocal
    from db.models import BracketParticipant
    player_id = _mint_person(tid)
    session = SessionLocal()
    try:
        row = session.get(BracketParticipant, (uuid.UUID(tid), event_id, pid))
        row.meta = meta
        row.entry_player_id = player_id
        session.commit()
        return player_id
    finally:
        session.close()


def test_regenerating_a_draw_preserves_the_person_key_and_meta(client, tid):
    """The flip of Task 1's characterization (commit ``0a5f40e9``'s
    ``test_regenerating_a_draw_TODAY_destroys_participant_meta``).

    ``brackets.py`` rebuilds participant rows FROM engine Participants on
    every generate and regenerate, so any column not lifted into
    ``Participant.metadata`` at hydration is destroyed by a regenerate.
    ``seed`` is the prior art for the lift; ``entry_player_id`` follows it,
    and ``meta`` — dropped entirely today (F-DM-09's generation half) — is
    carried with it."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    player_id = _stamp_person(tid, "MS", "P1", {"sourceEntryId": "entry-abc"})
    assert _participant_rows(tid, "MS")["P1"] == {
        "meta": {"sourceEntryId": "entry-abc"},
        "entry_player_id": player_id,
    }

    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text
    assert _participant_rows(tid, "MS")["P1"] == {
        "meta": {"sourceEntryId": "entry-abc"},
        "entry_player_id": player_id,
    }, "generate destroyed the person key or meta"

    # And again — a REgenerate is the hop the round trip actually dies on.
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": True})
    assert r.status_code == 200, r.text
    assert _participant_rows(tid, "MS")["P1"] == {
        "meta": {"sourceEntryId": "entry-abc"},
        "entry_player_id": player_id,
    }, "regenerate destroyed the person key or meta"


def _echo_shape(participants: list[dict]) -> list[dict]:
    """``ParticipantOut`` payloads narrowed to the ``ParticipantIn`` keys.

    What the console's ``toUpsertParticipant`` does: take the participants
    the GET returned and hand them straight back to the create-or-replace
    upsert.
    """
    keys = ("id", "name", "members", "seed", "entryPlayerId")
    return [{k: v for k, v in p.items() if k in keys} for p in participants]


def test_get_bracket_exposes_the_person_key_and_source_entry(client, tid):
    """F-DM-09's exit half. ``ParticipantOut`` dropped ``meta`` outright, so
    the provenance ``bracket_participants`` carries reached NO layer above
    the table: no console, no export, no display. ``entryPlayerId`` (the
    R-DM-2(a) key — join a draw node to a human) and ``sourceEntryId`` (the
    entry that produced it) are the two exits it was missing."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    player_id = _stamp_person(tid, "MS", "P1", {"sourceEntryId": "entry-abc"})

    r = client.get(_bracket_url(tid))
    assert r.status_code == 200, r.text
    body = r.json()

    ms = next(e for e in body["events"] if e["id"] == "MS")
    p1 = next(p for p in ms["participants"] if p["id"] == "P1")
    assert p1["entryPlayerId"] == str(player_id)
    assert p1["sourceEntryId"] == "entry-abc"

    # The session-level list is the SECOND ``ParticipantOut`` call site —
    # a fix at one is not a fix at both.
    top = next(p for p in body["participants"] if p["id"] == "P1")
    assert top["entryPlayerId"] == str(player_id)
    assert top["sourceEntryId"] == "entry-abc"

    # A hand-added participant is nobody in ``entry_players`` — hence
    # Optional, not required.
    p2 = next(p for p in ms["participants"] if p["id"] == "P2")
    assert p2["entryPlayerId"] is None
    assert p2["sourceEntryId"] is None


def test_upsert_echo_preserves_the_person_key(client, tid):
    """Echo the GET's participants back through the upsert; the key stays.

    The roster editor owns the whole participant list and re-POSTs it
    (``rosterEvents.ts::toUpsertParticipant``). ``ParticipantIn`` is a
    ``StrictModel``, so a field on ``ParticipantOut`` that ``ParticipantIn``
    does not accept is either a 422 or — if the client strips it to avoid
    the 422 — a silent erasure of the key on every roster edit. That is the
    SP-CONSOLE-4 write-echo class of bug, and it is why the field is on
    both models.

    **New edge, deliberately NOT softened:** with the FK enforced, an
    upsert carrying a *fabricated* ``entryPlayerId`` (no ``entry_players``
    row behind it) surfaces as a 500 ``IntegrityError``, not a 422. The
    route echoes what it was handed, and a key pointing at no person is a
    client bug failing loudly rather than a validation case. No pre-flight
    existence check is added — the database already answers that question,
    and a second authority for it would drift from the first.
    """
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    player_id = _stamp_person(tid, "MS", "P1", {"sourceEntryId": "entry-abc"})

    out = client.get(_bracket_url(tid)).json()
    ms = next(e for e in out["events"] if e["id"] == "MS")
    echoed = _echo_shape(ms["participants"])
    assert any(p["entryPlayerId"] == str(player_id) for p in echoed), (
        "the GET did not carry the key — nothing to echo"
    )

    r = client.post(_event_url(tid, "MS"), json=_upsert_body(echoed))
    assert r.status_code == 200, r.text
    assert _participant_rows(tid, "MS")["P1"]["entry_player_id"] == player_id, (
        "the roster edit erased the person key"
    )


def test_generate_with_wipe_true_succeeds(client, tid):
    """Generated event + wipe=true → re-generates successfully."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r1 = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r1.status_code == 200, r1.text
    # Re-generate with wipe.
    r2 = client.post(_event_url(tid, "MS", "generate"), json={"wipe": True})
    assert r2.status_code == 200, r2.text
    assert _get_event_status(client, tid, "MS") == "generated"


def test_generate_started_returns_409(client, tid):
    """Started event → generate → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    # Record a result to make it 'started'.
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 409


def test_generate_already_generated_without_wipe_returns_409(client, tid):
    """Generated + wipe=false → 409 (must pass wipe=true)."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 409


def test_generate_infeasible_returns_409(client, tid):
    """Infeasible problem → 409.

    Create a bracket with 1 court and 1 total_slot. Even a 2-entrant event
    (1 match, duration_slots=2) cannot fit — the match needs 2 consecutive
    slots but only 1 is available.
    """
    body = {
        "courts": 1,
        "total_slots": 1,
        "rest_between_rounds": 0,
        "interval_minutes": 30,
        "time_limit_seconds": 2.0,
        "events": [
            {
                "id": "_SEED",
                "discipline": "Seed",
                "format": "se",
                "participants": [
                    {"id": "s1", "name": "Seed1"},
                    {"id": "s2", "name": "Seed2"},
                ],
                "duration_slots": 1,
            }
        ],
    }
    r = client.post(_bracket_url(tid), json=body)
    assert r.status_code == 200, r.text
    # Upsert a 2-entrant event with duration_slots=2, but only 1 slot exists.
    # The single match cannot be placed.
    r2 = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "duration_slots": 2,
            "participants": [
                {"id": "P1", "name": "Player 1"},
                {"id": "P2", "name": "Player 2"},
            ],
        },
    )
    assert r2.status_code == 200, r2.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    # With only 1 total slot and a match needing 2 slots, it's infeasible.
    assert rg.status_code == 409
    # DB must have rolled back — no bracket_matches rows for MS.
    from db.session import SessionLocal
    from db.models import BracketMatch
    import uuid as _uuid
    _s = SessionLocal()
    try:
        ms_matches = list(
            _s.query(BracketMatch).filter(
                BracketMatch.tournament_id == _uuid.UUID(tid),
                BracketMatch.bracket_event_id == "MS",
            ).all()
        )
    finally:
        _s.close()
    assert ms_matches == [], "infeasible generate must not write any matches to DB"


# ---------------------------------------------------------------------------
# DELETE /events/{event_id}
# ---------------------------------------------------------------------------


def test_delete_draft_event_returns_204(client, tid):
    """Draft event → delete → 204."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    assert _get_event_status(client, tid, "MS") == "draft"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 204
    assert _get_event_status(client, tid, "MS") == "NOT_FOUND"


def test_delete_generated_event_returns_409(client, tid):
    """Generated event → delete → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert _get_event_status(client, tid, "MS") == "generated"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 409


def test_delete_started_event_returns_409(client, tid):
    """Started event → delete → 409."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    r = client.delete(_event_url(tid, "MS"))
    assert r.status_code == 409


def test_delete_nonexistent_event_returns_404(client, tid):
    """Delete on a non-existent event → 404."""
    _minimal_bracket(tid, client)
    r = client.delete(_event_url(tid, "GHOST"))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Status write wiring: record_match_result → 'started'
# ---------------------------------------------------------------------------


def test_record_result_flips_generated_to_started(client, tid):
    """First result on a Generated event → event.status becomes 'started'."""
    _minimal_bracket(tid, client)
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    r = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert r.status_code == 200, r.text
    assert _get_event_status(client, tid, "MS") == "generated"
    body = r.json()
    assignments = body.get("assignments", [])
    first_pu_id = next(
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    )
    rr = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": first_pu_id, "winner_side": "A"},
    )
    assert rr.status_code == 200, rr.text
    assert _get_event_status(client, tid, "MS") == "started"


def test_second_result_does_not_flip_started_back(client, tid):
    """A second result on a different match in a Started event stays 'started'.

    The event was flipped to 'started' on the first result. Recording a
    second match result should succeed (200) and keep status as 'started'.
    """
    _minimal_bracket(tid, client)
    # Use a 4-entrant SE: 2 semis + 1 final — both semis can be recorded.
    client.post(_event_url(tid, "MS"), json=_upsert_body())
    client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    body = client.get(_bracket_url(tid)).json()
    assignments = body.get("assignments", [])
    # All assigned MS matches.
    ms_assigned = [
        a["play_unit_id"] for a in assignments
        if a["play_unit_id"].startswith("MS")
    ]
    assert len(ms_assigned) >= 2, "4-entrant SE should have at least 2 ready matches"
    # Record first semi.
    client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": ms_assigned[0], "winner_side": "A"},
    )
    assert _get_event_status(client, tid, "MS") == "started"
    # Record second semi — should succeed and keep status 'started'.
    r2 = client.post(
        _bracket_url(tid, "results"),
        json={"play_unit_id": ms_assigned[1], "winner_side": "B"},
    )
    assert r2.status_code == 200, r2.text
    assert _get_event_status(client, tid, "MS") == "started"


# ---------------------------------------------------------------------------
# C-1 regression: BYE walkover results persisted by generate_event_route
# ---------------------------------------------------------------------------


def test_generate_bye_result_persisted(client, tid):
    """SE event with 3 participants forces bracket_size=4 → one R1 BYE.

    After generate, the walkover Result written by register_draw / auto_walkover_byes
    must appear as a row in bracket_results (walkover=True).  Without the C-1
    fix, this row was only in-memory and would disappear on next hydration.
    """
    _minimal_bracket(tid, client)
    # 3 participants → bracket_size=4 → one R1 match is a BYE walkover.
    r = client.post(
        _event_url(tid, "MS"),
        json={
            "discipline": "Men's Singles",
            "format": "se",
            "duration_slots": 1,
            "participants": [
                {"id": "P1", "name": "Player 1"},
                {"id": "P2", "name": "Player 2"},
                {"id": "P3", "name": "Player 3"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    rg = client.post(_event_url(tid, "MS", "generate"), json={"wipe": False})
    assert rg.status_code == 200, rg.text

    # Query the DB directly for walkover result rows for this event.
    from db.session import SessionLocal
    from db.models import BracketResult
    import uuid as _uuid

    _s = SessionLocal()
    try:
        rows = list(
            _s.query(BracketResult).filter(
                BracketResult.tournament_id == _uuid.UUID(tid),
                BracketResult.bracket_event_id == "MS",
                BracketResult.walkover.is_(True),
            ).all()
        )
    finally:
        _s.close()

    assert len(rows) == 1, (
        f"expected 1 BYE walkover result row in DB for MS, got {len(rows)}"
    )
    assert rows[0].winner_side in ("A", "B"), (
        f"BYE winner_side should be A or B, got {rows[0].winner_side!r}"
    )


# ---------------------------------------------------------------------------
# Explicit seed ordering (the documented placement contract)
# ---------------------------------------------------------------------------


def test_generate_honors_explicit_seed_order(client, tid):
    """Placement follows the explicit ``seed`` field, and re-seeding
    re-places participants.

    The generators treat input order as seed order; the generate route
    orders participants by ascending seed before building the draw, so
    seed 1 occupies the top slot (round 0, match 0, side A). Re-seeding a
    different participant to seed 1 must move it into that slot — this is
    what lets the operator place players in specific bracket positions.
    """
    _minimal_bracket(tid, client)

    def top_slot(parts):
        r1 = client.post(_event_url(tid, "MS"), json=_upsert_body(parts))
        assert r1.status_code == 200, r1.text
        r2 = client.post(_event_url(tid, "MS", "generate"), json={"wipe": True})
        assert r2.status_code == 200, r2.text
        pus = [
            p
            for p in r2.json()["play_units"]
            if p["event_id"] == "MS"
            and p["round_index"] == 0
            and p["match_index"] == 0
        ]
        assert len(pus) == 1
        return pus[0]["side_a"]

    eight = [{"id": f"P{i}", "name": f"P{i}", "seed": i} for i in range(1, 9)]
    # Seed 1 (P1) occupies the top slot.
    assert top_slot(eight) == ["P1"]

    # Re-seed so P3 becomes seed 1 and P1 becomes seed 3 — P3 takes the slot.
    reseeded = [
        {
            **p,
            "seed": 1 if p["id"] == "P3" else 3 if p["id"] == "P1" else p["seed"],
        }
        for p in eight
    ]
    assert top_slot(reseeded) == ["P3"]
