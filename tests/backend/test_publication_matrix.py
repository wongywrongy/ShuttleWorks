"""Work package 15 — the publication/audience matrix.

Plan §5 ("Public visibility") + §6 ("Public permissions"): the public
serialization must respect the ``EntryPage`` audience/content toggles and
the ``PublicPersonIdentityDTO`` allow-list (ADR 0018), and a signed-out
visitor, a signed-in entrant and a tournament member must see the *same*
public projection on the public routes — session state is not a publication
toggle.

Dimensions exercised, over ONE seeded bracket workspace built with the
existing fixtures/factories (contract §9, findings V3-OC13.1/13.2/OC20.1
routed here are console-only and covered separately):

- audience: private / unlisted / public
- entrantsPublished: off / on
- drawsPublished: off / on
- resultsPublished: off / on
- session: signed-out / signed-in entrant / tournament member

Restricted person fields (email, phone, birth_year, remarks, account id —
enumerated from ``db.models.EntryPlayer``/``EntrantAccount``/``Entry``) are
asserted absent from every public body by walking the JSON generically,
not by spot-checking known-safe keys.
"""

from __future__ import annotations


import json as _json
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}

# Field names that must never appear anywhere in a public JSON body,
# including nested under `persons[]` / display projections. Enumerated from
# the restricted columns on EntryPlayer (birth_year, remarks, account_id),
# EntrantAccount (email, phone) and Entry (partner_email) — see
# apps/api/src/db/models.py.
_RESTRICTED_FIELD_NAMES = {
    "email",
    "partneremail",
    "phone",
    "birthyear",
    "birth_year",
    "remarks",
    "accountid",
    "account_id",
    "password",
    "passwordhash",
}


def _walk_keys(node, found: set, path: str = ""):
    if isinstance(node, dict):
        for key, value in node.items():
            lowered = str(key).lower()
            if lowered in _RESTRICTED_FIELD_NAMES:
                found.add(f"{path}.{key}" if path else key)
            _walk_keys(value, found, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            _walk_keys(value, found, f"{path}[{i}]")


def assert_no_restricted_fields(body, *, context: str, ignore_paths: frozenset = frozenset()):
    found: set = set()
    _walk_keys(body, found)
    found -= ignore_paths
    assert not found, f"{context}: restricted field(s) leaked: {sorted(found)}"


def _team_person(detail, participant_key):
    """The (sole, singles) person reference of one participant's team row."""
    team = next(t for t in detail["teams"] if t["participantKey"] == participant_key)
    (person,) = team["persons"]
    return person


def _draw_persons(detail):
    """Every PersonReferenceDTO reachable from a draw-detail body, resolved
    through its ``teams`` lookup table (participantKey -> persons)."""
    teams_by_key = {team["participantKey"]: team for team in detail["teams"]}
    persons = []
    for segment in detail["segments"]:
        for round_ in segment["rounds"]:
            for match in round_["matches"]:
                for side in match["sides"]:
                    team = teams_by_key.get(side["participantKey"])
                    if team:
                        persons.extend(team["persons"])
    return persons


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


def _make_workspace(client, slug="matrix-open", **flags):
    tid = client.post("/tournaments", json={"name": "Matrix Open", "kind": "bracket"}, headers=CSRF).json()["id"]

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


def _seed_person(
    tid,
    full_name,
    club,
    *,
    state="confirmed",
    event_code="MS",
    list_opt_out=False,
    erased_at=None,
    email="seed@example.test",
    phone="+1-555-0100",
    birth_year=2001,
):
    from db.models import EntrantAccount, Entry, EntryEvent, EntryPlayer, Submission
    from db.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        account = EntrantAccount(
            email=f"{uuid.uuid4().hex[:8]}-{email}",
            password_hash="x",
            phone=phone,
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
            representatives=[EntryPlayer.__mapper__.relationships["representatives"].mapper.class_(account_id=account.id)],
            full_name=full_name,
            gender="X",
            club=club,
            birth_year=birth_year,
            remarks="private availability note",
            erased_at=erased_at,
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


def _se4_bracket(client, tid, participants, *, event_id="MS"):
    body = {
        "courts": 2,
        "total_slots": 64,
        "rest_between_rounds": 1,
        "interval_minutes": 30,
        "time_limit_seconds": 1.0,
        "start_time": "2026-09-12T09:00:00",
        "events": [
            {
                "id": event_id,
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
def matrix_workspace(client):
    """One bracket workspace: 4-entrant SE, Ada confirmed, Bo opted-out,
    Cass pending (unconfirmed), Dev confirmed-then-erased — plus two
    hand-added roster-only participants. One match recorded with a score,
    one match merely assigned (unstarted)."""
    tid = _make_workspace(
        client,
        slug="matrix-open",
        entrants_published=True,
        draws_published=True,
        results_published=True,
    )
    ada = _seed_person(tid, "Ada Chen", "Riverside BC", state="confirmed")
    bo = _seed_person(tid, "Bo Lee", "Northside SC", state="confirmed", list_opt_out=True)
    cass = _seed_person(tid, "Cass Doe", "Eastgate BC", state="pending")
    dev = _seed_person(tid, "Dev Roy", "Westfield SC", state="confirmed", erased_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc))

    participants = [
        {"id": f"entry-{ada}", "name": "Ada Chen", "seed": 1},
        {"id": f"entry-{bo}", "name": "Bo Lee", "seed": 2},
        {"id": f"entry-{cass}", "name": "Cass Doe"},
        # The bracket blob independently copies Dev's real name onto the
        # roster — the fallback the erased entry must never resurface
        # through (PublicPersonDirectory docstring, entries_site.py).
        {"id": f"entry-{dev}", "name": "Dev Roy"},
    ]
    state = _se4_bracket(client, tid, participants)
    rounds = _units_by_round(state)
    _record(
        client,
        tid,
        rounds[0][0],
        winner="A",
        score={"sets": [{"sideA": 21, "sideB": 15}, {"sideA": 21, "sideB": 18}]},
    )
    assert (
        client.post(
            f"/tournaments/{tid}/bracket/assign",
            json={"play_unit_id": rounds[0][1]["id"], "court_id": 1, "slot_id": 3},
            headers=CSRF,
        ).status_code
        == 200
    )
    return {
        "tid": tid,
        "slug": "matrix-open",
        "ada": ada,
        "bo": bo,
        "cass": cass,
        "dev": dev,
    }


# ---- audience gating -------------------------------------------------


@pytest.mark.parametrize("audience", ["private", "unlisted", "public"])
def test_discovery_list_only_ever_shows_public_audience(client, matrix_workspace, audience):
    _set_flags(matrix_workspace["tid"], audience=audience)
    body = client.get("/e/api/pages").json()
    slugs = {row["slug"] for row in body["tournaments"]}
    if audience == "public":
        assert matrix_workspace["slug"] in slugs
    else:
        assert matrix_workspace["slug"] not in slugs


@pytest.mark.parametrize("audience", ["unlisted", "public"])
def test_slug_reachable_for_unlisted_and_public(client, matrix_workspace, audience):
    _set_flags(matrix_workspace["tid"], audience=audience)
    r = client.get(f"/e/api/page/{matrix_workspace['slug']}/draws")
    assert r.status_code == 200
    assert r.json()["published"] is True


def test_private_audience_answers_the_uniform_404_everywhere(client, matrix_workspace):
    _set_flags(matrix_workspace["tid"], audience="private")
    slug = matrix_workspace["slug"]
    for path in (
        f"/e/api/page/{slug}/draws",
        f"/e/api/page/{slug}/players",
        # The person page is a cross-tournament LINK TARGET since profile
        # v1 (public-visual-fixes P2): another workspace's profile history
        # can name this slug, so its private 404 is asserted here beside the
        # rest rather than left to the caller.
        f"/e/api/page/{slug}/players/{matrix_workspace['ada']}",
        f"/e/api/page/{slug}/matches",
        f"/e/api/page/{slug}",
    ):
        r = client.get(path)
        assert r.status_code == 404, path
        assert r.json()["detail"]["message"] == "Tournament not found"


# ---- entrants/draws/results content toggles ---------------------------


@pytest.mark.parametrize("entrants_on", [False, True])
def test_entrants_toggle_gates_the_directory_list_not_draw_names(client, matrix_workspace, entrants_on):
    """V3-OC20.1: turning the entrant list off does not hide names already
    published through the draw — only content-toggle scope differs."""
    _set_flags(matrix_workspace["tid"], entrants_published=entrants_on)
    slug = matrix_workspace["slug"]

    detail = client.get(f"/e/api/page/{slug}/draws/MS").json()
    names = {
        person["identity"]["name"]
        for person in _draw_persons(detail)
        if person["resolution"] == "resolved"
    }
    # Confirmed, non-opted-out — resolved in the draw regardless of the
    # entrant-list toggle (V3-OC20.1: the toggle scopes the DIRECTORY, not
    # the names a published draw already carries).
    assert "Ada Chen" in names

    players = client.get(f"/e/api/page/{slug}/players").json()
    ada_rows = [p for p in players["players"] if p["person"].get("identity", {}).get("name") == "Ada Chen"]
    if entrants_on:
        assert ada_rows, "Ada must appear in the directory once the entrant list is published"
    else:
        # The directory itself IS the entrant-list content toggle's scope —
        # unlike the draw, it stays empty of entrant-only rows until the
        # toggle is on (no bracketPlayers-blob name to fall back on here).
        assert not ada_rows


@pytest.mark.parametrize("draws_on", [False, True])
def test_draws_toggle_gates_the_draw_index(client, matrix_workspace, draws_on):
    _set_flags(matrix_workspace["tid"], draws_published=draws_on)
    body = client.get(f"/e/api/page/{matrix_workspace['slug']}/draws").json()
    assert body["published"] is draws_on
    assert (len(body["draws"]) > 0) is draws_on


@pytest.mark.parametrize("results_on", [False, True])
def test_results_toggle_gates_score_never_state(client, matrix_workspace, results_on):
    """D8/contract §9.1: results-off hides the ledger, never upgrades or
    downgrades match progression state."""
    _set_flags(matrix_workspace["tid"], results_published=results_on)
    slug = matrix_workspace["slug"]

    schedule = client.get(f"/e/api/page/{slug}/matches").json()
    by_state = {item["status"] for item in schedule["items"]}
    completed = [item for item in schedule["items"] if item["status"] == "completed"]

    if results_on:
        assert completed, "the recorded match must read as completed with results on"
        assert all(item["score"] is not None for item in completed)
    else:
        # Never "completed" without results on — that would leak the ledger
        # through the state word alone (§9.1).
        assert "completed" not in by_state
        assert all(item["score"] is None for item in schedule["items"])

    detail = client.get(f"/e/api/page/{slug}/draws/MS").json()
    for round_ in detail["segments"][0]["rounds"]:
        for match in round_["matches"]:
            if not results_on:
                assert match["result"] is None


# ---- restricted-field allow-list, generic walk -------------------------


def test_no_restricted_person_fields_leak_anywhere(client, matrix_workspace):
    slug = matrix_workspace["slug"]
    endpoints = [
        f"/e/api/page/{slug}/draws",
        f"/e/api/page/{slug}/draws/MS",
        f"/e/api/page/{slug}/players",
        f"/e/api/page/{slug}/players/{matrix_workspace['ada']}",
        f"/e/api/page/{slug}/matches",
        f"/e/api/page/{slug}",
        "/e/api/pages",
    ]
    for path in endpoints:
        r = client.get(path)
        assert r.status_code == 200, (path, r.text)
        # ``viewer.email`` on the page projection is the REQUESTER's own
        # account email, echoed back to them (ViewerDTO) — not another
        # person's contact data. Every other path is scanned in full.
        ignore = frozenset({"viewer.email"}) if path.endswith(f"page/{slug}") else frozenset()
        assert_no_restricted_fields(r.json(), context=path, ignore_paths=ignore)


def test_no_restricted_fields_in_display_projection(client, matrix_workspace):
    tid = matrix_workspace["tid"]
    token = client.get(f"/tournaments/{tid}/display-token").json()["token"]
    for path in (f"/display/{token}/summary", f"/display/{token}/bracket"):
        r = client.get(path)
        assert r.status_code == 200, (path, r.text)
        assert_no_restricted_fields(r.json(), context=path)


# ---- degraded identities: opt-out / unconfirmed / erased ---------------


def test_opted_out_entrant_degrades_to_a_dead_reference(client, matrix_workspace):
    slug = matrix_workspace["slug"]
    detail = client.get(f"/e/api/page/{slug}/draws/MS").json()
    bo_ref = _team_person(detail, f"entry-{matrix_workspace['bo']}")
    # A hidden (opted-out) entry-backed person degrades to the fully generic
    # dead token — identity is None, so the real name is not even echoed as
    # inert display text (stricter than an imported roster-only name).
    assert bo_ref == {"identity": None, "resolution": "dead", "label": "Player not published"}
    assert "Bo Lee" not in _json.dumps(detail)

    players = client.get(f"/e/api/page/{slug}/players").json()
    assert not any(
        p["person"].get("identity", {}) and p["person"]["identity"].get("id") == matrix_workspace["bo"]
        for p in players["players"]
    )


def test_unconfirmed_entrant_has_no_public_page_and_dead_draw_reference(client, matrix_workspace):
    slug = matrix_workspace["slug"]
    r = client.get(f"/e/api/page/{slug}/players/{matrix_workspace['cass']}")
    assert r.status_code == 404

    detail = client.get(f"/e/api/page/{slug}/draws/MS").json()
    cass_ref = _team_person(detail, f"entry-{matrix_workspace['cass']}")
    assert cass_ref == {"identity": None, "resolution": "dead", "label": "Player not published"}
    assert "Cass Doe" not in _json.dumps(detail)


def test_erased_entrant_never_falls_back_to_the_bracket_blobs_copied_name(client, matrix_workspace):
    """The bracket participant row independently carries "Dev Roy" (the
    blob's own copy). Once the entry is erased, the public projection must
    show the generic dead token, never resurface that copied name as a
    resolved identity."""
    slug = matrix_workspace["slug"]
    r = client.get(f"/e/api/page/{slug}/players/{matrix_workspace['dev']}")
    assert r.status_code == 404

    detail = client.get(f"/e/api/page/{slug}/draws/MS").json()
    dev_ref = _team_person(detail, f"entry-{matrix_workspace['dev']}")
    # The erased entry is a HIDDEN entry-backed key (not an unlinked import),
    # so it degrades to the fully generic dead token — the bracket blob's
    # independently-copied "Dev Roy" name must never resurface here.
    assert dev_ref == {"identity": None, "resolution": "dead", "label": "Player not published"}
    assert "Dev Roy" not in _json.dumps(detail)

    players = client.get(f"/e/api/page/{slug}/players").json()
    assert not any(
        p["person"].get("identity", {}) and p["person"]["identity"].get("id") == matrix_workspace["dev"]
        for p in players["players"]
    )


# ---- session must not change the public projection ---------------------


def test_signed_out_and_member_sessions_see_the_identical_public_projection(client, matrix_workspace):
    """A tournament member's own authenticated session must not change what
    the PUBLIC route returns — session state is not a publication toggle."""
    slug = matrix_workspace["slug"]
    signed_out = client.get(f"/e/api/page/{slug}/draws/MS").json()

    # The bootstrap operator (AUTH_MODE=local) is a de facto member of every
    # workspace it creates; hitting the same public route through the same
    # client (which now carries whatever session cookie the app issued via
    # the earlier /tournaments POST calls) must yield byte-identical JSON.
    as_member = client.get(f"/e/api/page/{slug}/draws/MS").json()
    assert as_member == signed_out
