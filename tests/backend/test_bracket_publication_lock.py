"""Ruling D24 — a published draw's public address cannot be silently re-keyed.

``bracket_events.id`` IS the entrant tier's public ``drawKey`` (the
``/e/{slug}/draws/{drawKey}`` URL segment, ``entries/entries_site.py``). Delete
and re-import both destroy and rebuild event rows, so the documented
delete-and-recreate recovery used to change a link that was already on a poster
and in a search index — with nothing said about it.

The lock is coarse and liftable on purpose: it reads the workspace's
``entry_pages.draws_published`` flag, and the operator turns publication off,
rebuilds, and publishes again. Regeneration is deliberately NOT locked —
``POST …/events/{id}/generate`` recreates the row under the same id, so the
public address survives it.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database, seed_tournament

CSRF = {"X-ShuttleWorks-CSRF": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from bracket import brackets
    from entries import entries_routes
    from workspaces import tournaments

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(brackets.router)
    app.include_router(entries_routes.router)
    return TestClient(app)


@pytest.fixture
def tid(client) -> str:
    return seed_tournament(client, "Publication Lock Test")


def _bracket_url(tid: str, *suffix: str) -> str:
    base = f"/tournaments/{tid}/bracket"
    return base + ("/" + "/".join(suffix) if suffix else "")


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


def _import_body() -> dict:
    return {
        "courts": 2,
        "total_slots": 64,
        "interval_minutes": 30,
        "events": [
            {
                "id": "WS",
                "discipline": "Women's Singles",
                "participants": [
                    {"id": "Q1", "name": "Q One"},
                    {"id": "Q2", "name": "Q Two"},
                ],
                "rounds": [[{"id": "WS-F", "side_a": ["Q1"], "side_b": ["Q2"]}]],
            }
        ],
    }


def _create_entry_page(tid: str, *, draws_published: bool) -> None:
    """The workspace's public page. Publication lives here, not in the blob."""
    from db.models import EntryPage
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug=f"lock-{uuid.uuid4().hex[:8]}",
                is_open=True,
                audience="public",
                draws_published=draws_published,
            )
        )
        session.commit()
    finally:
        session.close()


def _unpublish_draws(client, tid: str) -> None:
    """Through the real operator control, not a direct column write."""
    r = client.patch(
        f"/tournaments/{tid}/entry-page/publication",
        json={"drawsPublished": False},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text


def _assert_refused(response) -> None:
    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "DRAW_PUBLISHED"
    # The operator is told what to do, not merely that they may not.
    assert "Publish" in detail["message"]


# ---- refuse while published ------------------------------------------------


def test_delete_event_is_refused_while_draws_are_published(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)

    _assert_refused(client.delete(_bracket_url(tid, "events", "MS"), headers=CSRF))

    # The draw — and therefore its public address — is still there.
    assert any(
        event["id"] == "MS"
        for event in client.get(_bracket_url(tid)).json()["events"]
    )


def test_delete_bracket_is_refused_while_draws_are_published(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)

    _assert_refused(client.delete(_bracket_url(tid), headers=CSRF))
    assert client.get(_bracket_url(tid)).json()["events"]


def test_import_is_refused_while_draws_are_published(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)

    _assert_refused(
        client.post(_bracket_url(tid, "import"), json=_import_body(), headers=CSRF)
    )

    # The import wipes before it installs, so "refused" has to mean the
    # existing draw is untouched — not merely that the new one is absent.
    events = {event["id"] for event in client.get(_bracket_url(tid)).json()["events"]}
    assert events == {"MS"}


def test_csv_import_is_refused_while_draws_are_published(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)

    _assert_refused(
        client.post(
            _bracket_url(tid, "import.csv"),
            content="event_id,round,side_a,side_b\nWS,0,Q One,Q Two\n",
            headers={**CSRF, "Content-Type": "text/csv"},
        )
    )
    events = {event["id"] for event in client.get(_bracket_url(tid)).json()["events"]}
    assert events == {"MS"}


# ---- succeed once unpublished ----------------------------------------------


def test_delete_event_succeeds_after_unpublishing(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)
    _assert_refused(client.delete(_bracket_url(tid, "events", "MS"), headers=CSRF))

    _unpublish_draws(client, tid)

    r = client.delete(_bracket_url(tid, "events", "MS"), headers=CSRF)
    assert r.status_code == 204, r.text


def test_import_succeeds_after_unpublishing(client, tid):
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=True)
    _assert_refused(
        client.post(_bracket_url(tid, "import"), json=_import_body(), headers=CSRF)
    )

    _unpublish_draws(client, tid)

    r = client.post(_bracket_url(tid, "import"), json=_import_body(), headers=CSRF)
    assert r.status_code == 200, r.text
    assert {event["id"] for event in r.json()["events"]} == {"WS"}


# ---- the lock is only about publication ------------------------------------


def test_delete_is_unaffected_when_draws_are_not_published(client, tid):
    """A workspace with a page but draws unpublished keeps the recovery path."""
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)
    _create_entry_page(tid, draws_published=False)

    assert client.delete(_bracket_url(tid, "events", "MS"), headers=CSRF).status_code == 204


def test_delete_is_unaffected_with_no_entry_page_at_all(client, tid):
    """The solo/offline flow has no public page; nothing to protect."""
    client.post(_bracket_url(tid), json=_se_4_body(), headers=CSRF)

    assert client.delete(_bracket_url(tid, "events", "MS"), headers=CSRF).status_code == 204


def test_regenerate_is_not_locked(client, tid):
    """Regeneration recreates the event row under the SAME id, so the public
    address survives. Locking it would block the ordinary correction the
    ruling deliberately leaves open."""
    body = _se_4_body()
    body["events"][0]["participants"] = [
        {"id": f"P{i}", "name": f"Player {i}", "seed": i} for i in range(1, 5)
    ]
    client.post(_bracket_url(tid), json=body, headers=CSRF)
    _create_entry_page(tid, draws_published=True)

    r = client.post(
        _bracket_url(tid, "events", "MS", "generate"),
        json={"wipe": True},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    assert any(event["id"] == "MS" for event in r.json()["events"])
