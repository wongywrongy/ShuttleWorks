"""SP-P8 §3: the season listing — rows, counts, the NOW pick, the key-set.

Dates are relative to the REAL today because the route derives status from
``_utcnow``; each page is one enum case."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}

ROW_KEYS = {
    "slug", "name", "organizer", "venueName", "date", "eventCount",
    "status", "closesInDays", "closesAt", "timeZone", "locality",
    "drawsPublished", "winnersPublished",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def season(client):
    """Six open pages, one per status enum case, plus one closed page that
    must never appear."""
    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now - timedelta(days=1)).date().isoformat()
    next_month = (now + timedelta(days=30)).date().isoformat()

    def make(session, slug, tournament_date, *, draws=False, results=False,
             closes=None, is_open=True, with_event=True, venue_address=None,
             time_zone=None):
        tid = client.post(
            "/tournaments", json={"name": slug.replace("-", " ").title()},
            headers=CSRF,
        ).json()["id"]
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = tournament_date
        if time_zone is not None:
            t.time_zone = time_zone
        session.add(EntryPage(
            tournament_id=uuid.UUID(tid), slug=slug, is_open=is_open,
            audience="public",
            venue_name=f"{slug} hall", venue_address=venue_address,
            draws_published=draws, results_published=results,
        ))
        if with_event:
            session.add(EntryEvent(
                tournament_id=uuid.UUID(tid), code="MS",
                discipline="Men's Singles", entry_type="singles",
                closes_at=closes,
            ))

    session = SessionLocal()
    try:
        make(
            session, "case-open", next_month, closes=now + timedelta(days=5),
            venue_address="4 Kingsway, London, United Kingdom",
            time_zone="Europe/London",
        )
        # V3-26-7: the demo simulator's seed data packs an itinerary into
        # venue_address as "<place>; <date range>; <draw format>" — the
        # locality heuristic must still surface the place alone.
        make(
            session, "case-itinerary-address", next_month,
            closes=now + timedelta(days=5),
            venue_address="Asan, South Korea; 4-9 August; 32MS/32WS/32MD/32WD/32XD",
        )
        make(session, "case-closed", next_month, closes=now - timedelta(days=1))
        make(session, "case-live", today, draws=True)
        make(session, "case-quiet-live", today)
        make(session, "case-winners", yesterday, results=True)
        make(session, "case-done", yesterday)
        # Undated: the ONLY page exercising the sort's first key. Reads
        # entries_closed (no date facts, no open events) so it bumps neither
        # count.
        make(session, "case-undated", None, with_event=False)
        make(session, "never-listed", today, is_open=False)
        session.commit()
    finally:
        session.close()
    return {"today": today, "yesterday": yesterday, "next_month": next_month}


def rows_by_slug(body):
    return {row["slug"]: row for row in body["tournaments"]}


def test_every_enum_case_computes_serverside(client, season):
    rows = rows_by_slug(client.get("/e/api/pages").json())
    assert rows["case-open"]["status"] == "entries_open"
    assert rows["case-open"]["closesInDays"] == 5
    # V3-PE01.2/PE01.3: the exact deadline instant, the tournament's own
    # zone, and a best-effort locality out of the free-text venue address.
    assert rows["case-open"]["closesAt"] is not None
    assert rows["case-open"]["timeZone"] == "Europe/London"
    assert rows["case-open"]["locality"] == "London, United Kingdom"
    # V3-26-7: an itinerary-shaped address ("<place>; <dates>; <draw
    # format>") must still reduce to place-only, not the whole string.
    assert rows["case-itinerary-address"]["locality"] == "Asan, South Korea"
    # A closed row has no open-event deadline to count down to, so no exact
    # instant either — never a stale or invented one.
    assert rows["case-closed"]["closesAt"] is None
    # No address was given for this row (`make`'s default) — a heuristic
    # over free text must omit, never guess, when it has nothing to parse.
    assert rows["case-closed"]["locality"] is None
    assert rows["case-closed"]["status"] == "entries_closed"
    assert rows["case-live"]["status"] == "in_progress_live"
    assert rows["case-quiet-live"]["status"] == "in_progress"
    assert rows["case-winners"]["status"] == "completed_winners"
    assert rows["case-done"]["status"] == "completed"
    assert rows["case-undated"]["status"] == "entries_closed"
    # The two publication flags carry VALUES, not just keys: winnersPublished
    # mirrors results_published (SP-P7 §4) and drawsPublished mirrors
    # draws_published. Each fixture page sets exactly one, so a swapped
    # mirror reddens here.
    assert rows["case-winners"]["winnersPublished"] is True
    assert rows["case-winners"]["drawsPublished"] is False
    assert rows["case-live"]["drawsPublished"] is True
    assert rows["case-live"]["winnersPublished"] is False


def test_the_key_set_is_pinned(client, season):
    body = client.get("/e/api/pages").json()
    assert set(body) == {"tournaments", "counts", "now"}
    assert all(set(row) == ROW_KEYS for row in body["tournaments"])
    assert set(body["counts"]) == {"takingEntries", "completed"}


def test_counts_match_the_rows(client, season):
    body = client.get("/e/api/pages").json()
    assert body["counts"] == {"takingEntries": 2, "completed": 2}


def test_the_now_pick_requires_published_draws(client, season):
    # NEGATIVE-CONTROL PAIR (prompt §7 trap 1): case-quiet-live is in
    # window but unpublished — it must NOT be the pick. Removing the
    # draws_published condition from the route makes this fail.
    body = client.get("/e/api/pages").json()
    assert body["now"] == {"slug": "case-live", "moreCount": 0}


def test_two_live_tournaments_pick_one_and_count_the_rest(client, season):
    from db.models import EntryPage, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        tid = client.post(
            "/tournaments", json={"name": "Also Live"}, headers=CSRF
        ).json()["id"]
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = season["today"]
        session.add(EntryPage(
            tournament_id=uuid.UUID(tid), slug="also-live", is_open=True,
            audience="public",
            draws_published=True,
        ))
        session.commit()
    finally:
        session.close()
    body = client.get("/e/api/pages").json()
    # Both end "today"; the deterministic order (date, slug) breaks the tie.
    assert body["now"] == {"slug": "also-live", "moreCount": 1}


def test_no_live_tournament_means_now_is_null(client):
    assert client.get("/e/api/pages").json()["now"] is None


def test_a_closed_page_never_appears(client, season):
    assert "never-listed" not in rows_by_slug(client.get("/e/api/pages").json())


def test_rows_order_dated_ascending_then_slug(client, season):
    slugs = [r["slug"] for r in client.get("/e/api/pages").json()["tournaments"]]
    assert slugs == [
        "case-done", "case-winners",          # yesterday, slug-tied
        "case-live", "case-quiet-live",       # today
        "case-closed", "case-itinerary-address", "case-open",  # next month
        "case-undated",                       # undated sorts LAST, not first
    ]


def test_the_public_cache_header_is_set(client, season):
    # Audience is revocable (a page can go private again), so intermediaries
    # must revalidate on every read rather than serve a stale public answer
    # from cache: no max-age, but still cacheable-by-name as a public
    # response (register rationale, PU03 family).
    assert client.get("/e/api/pages").headers["Cache-Control"] == "public, no-cache"


def test_no_entrant_or_pricing_data_leaks(client, season):
    # §0.4: tournament-level facts only. The key-set test pins the shape;
    # this pins the intent by name for the reviewer.
    body = client.get("/e/api/pages").json()
    text = str(body)
    assert "entryCount" not in text and "feeCents" not in text
