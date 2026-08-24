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
    "status", "closesInDays", "drawsPublished", "winnersPublished",
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
             closes=None, is_open=True, with_event=True):
        tid = client.post(
            "/tournaments", json={"name": slug.replace("-", " ").title()},
            headers=CSRF,
        ).json()["id"]
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = tournament_date
        session.add(EntryPage(
            tournament_id=uuid.UUID(tid), slug=slug, is_open=is_open,
            venue_name=f"{slug} hall", draws_published=draws,
            results_published=results,
        ))
        if with_event:
            session.add(EntryEvent(
                tournament_id=uuid.UUID(tid), code="MS",
                discipline="Men's Singles", entry_type="singles",
                closes_at=closes,
            ))

    session = SessionLocal()
    try:
        make(session, "case-open", next_month, closes=now + timedelta(days=5))
        make(session, "case-closed", next_month, closes=now - timedelta(days=1))
        make(session, "case-live", today, draws=True)
        make(session, "case-quiet-live", today)
        make(session, "case-winners", yesterday, results=True)
        make(session, "case-done", yesterday)
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
    assert rows["case-closed"]["status"] == "entries_closed"
    assert rows["case-live"]["status"] == "in_progress_live"
    assert rows["case-quiet-live"]["status"] == "in_progress"
    assert rows["case-winners"]["status"] == "completed_winners"
    assert rows["case-done"]["status"] == "completed"


def test_the_key_set_is_pinned(client, season):
    body = client.get("/e/api/pages").json()
    assert set(body) == {"tournaments", "counts", "now"}
    assert all(set(row) == ROW_KEYS for row in body["tournaments"])
    assert set(body["counts"]) == {"takingEntries", "completed"}


def test_counts_match_the_rows(client, season):
    body = client.get("/e/api/pages").json()
    assert body["counts"] == {"takingEntries": 1, "completed": 2}


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
        "case-closed", "case-open",           # next month
    ]


def test_the_public_cache_header_is_set(client, season):
    assert client.get("/e/api/pages").headers["Cache-Control"] == "public, max-age=30"


def test_no_entrant_or_pricing_data_leaks(client, season):
    # §0.4: tournament-level facts only. The key-set test pins the shape;
    # this pins the intent by name for the reviewer.
    body = client.get("/e/api/pages").json()
    text = str(body)
    assert "entryCount" not in text and "feeCents" not in text
