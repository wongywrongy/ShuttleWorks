"""SP-E1-1 — the operator's minimal Entries configuration surface.

Two routes, both workspace-scoped and both behind the tenancy seam:

- ``PUT  /tournaments/{tournament_id}/entry-page``   — upsert the page.
- ``POST /tournaments/{tournament_id}/entry-events`` — create one event.

**Why they exist.** Until now nothing in the API could create an
``entry_pages`` or ``entry_events`` row: both were reachable only by
writing to the database by hand, which every test in this slice does and
which the Phase E walkthrough explicitly may not — step 2 of it says the
demo is seeded "through real paths". A demo that proves the pipe works
while stepping around the API for the first two rows proves less than it
appears to.

Scope is exactly that and no more. There is no list route, no delete, and
no event update: the desk and the walkthrough need neither, and an
operator configuration UI is a later slice with its own design. What is
here is the minimum that lets an entry page exist without a SQL client.

The cross-tenant 404 is not asserted here — ``test_tenant_isolation.py``
derives every ``{tournament_id}`` operation from the OpenAPI schema and
probes them all, so these two are covered there by construction. What this
file pins is the role matrix, the slug rules, and the Q11.4 version bump.
"""
from __future__ import annotations

import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
PW = "a perfectly fine passphrase"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _register(client, email):
    r = client.post(
        "/auth/register", json={"email": email, "password": PW}, headers=CSRF
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _login(client, email):
    client.cookies.clear()
    r = client.post("/auth/login", json={"email": email, "password": PW}, headers=CSRF)
    assert r.status_code == 200, r.text


@pytest.fixture
def workspace(client):
    """Owner + operator + viewer on one workspace; left signed in as owner."""
    _register(client, "owner@example.com")
    tid = client.post(
        "/tournaments", json={"name": "Entries Config"}, headers=CSRF
    ).json()["id"]

    for label, role in [("op", "operator"), ("viewer", "viewer")]:
        _login(client, "owner@example.com")
        token = client.post(
            f"/tournaments/{tid}/invites", json={"role": role}, headers=CSRF
        ).json()["token"]
        _register(client, f"{label}@example.com")
        assert client.post(f"/invites/{token}/accept", headers=CSRF).status_code == 200

    _login(client, "owner@example.com")
    return tid


@pytest.fixture
def other_workspace(client, workspace):
    """A second workspace the owner also owns — the slug-collision case.

    Owned by the same account on purpose: the 409 must be about the slug
    being globally unique, not about membership. A collision with a
    stranger's workspace would answer the same way, but it would be
    indistinguishable from the tenancy 404 and prove nothing.
    """
    return client.post(
        "/tournaments", json={"name": "Autumn Open"}, headers=CSRF
    ).json()["id"]


def _put_page(client, tid, **body):
    payload = {"slug": "spring-open", "isOpen": True}
    payload.update(body)
    return client.put(f"/tournaments/{tid}/entry-page", json=payload, headers=CSRF)


def _page_row(tid):
    """The stored row, read directly — the routes return a projection and a
    round-trip through the DTO could agree with itself while persisting
    nothing."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        return session.get(EntryPage, uuid.UUID(tid))
    finally:
        session.close()


# ---- the entry page: upsert --------------------------------------------


def test_the_page_is_created_then_updated_by_the_same_route(client, workspace):
    """PUT is an upsert: one route, whether or not a row exists. The second
    call must not create a second page — ``entry_pages`` is one row per
    workspace and its primary key says so."""
    tid = workspace

    created = _put_page(
        client,
        tid,
        introText="All welcome.",
        regulationsText="Play fair.",
        waiverRequired=True,
    )
    assert created.status_code == 200, created.text
    assert created.json()["slug"] == "spring-open"
    assert created.json()["regulationsVersion"] == 1

    updated = _put_page(
        client,
        tid,
        slug="spring-open-2026",
        isOpen=False,
        introText="Entries close Friday.",
        regulationsText="Play fair.",
        waiverRequired=False,
    )
    assert updated.status_code == 200, updated.text

    row = _page_row(tid)
    assert row.slug == "spring-open-2026"
    assert row.is_open is False
    assert row.intro_text == "Entries close Friday."
    assert row.waiver_required is False


def test_the_page_reaches_the_public_slug_route(client, workspace):
    """The point of the route: an entry page authored through the API is
    live at its public address, with no SQL client involved anywhere."""
    tid = workspace
    _put_page(client, tid, regulationsText="Play fair.")

    r = client.get("/e/spring-open")
    assert r.status_code == 200, r.text
    assert "Entries Config" in r.text
    assert "Play fair." in r.text


# ---- the entry page: the Q11.4 version bump ----------------------------


def test_editing_the_regulations_text_bumps_the_version(client, workspace):
    """Q11.4 — an entry records the version it accepted, so the version has
    to move when the words move or the recorded consent means nothing."""
    tid = workspace
    assert _put_page(client, tid, regulationsText="Play fair.").json()[
        "regulationsVersion"
    ] == 1

    r = _put_page(client, tid, regulationsText="Play fair. Bring your own shuttles.")
    assert r.json()["regulationsVersion"] == 2
    assert _page_row(tid).regulations_version == 2


def test_saving_the_same_regulations_text_does_not_bump_the_version(
    client, workspace
):
    """Negative control for the bump: it keys on the *text*, not on the save.

    An operator fixing a typo in the intro, or toggling ``isOpen``, must
    not invalidate every acknowledgment already recorded — which is what a
    bump-on-every-PUT would silently do.
    """
    tid = workspace
    _put_page(client, tid, regulationsText="Play fair.")

    r = _put_page(
        client,
        tid,
        introText="Now with a corrected typo.",
        isOpen=False,
        regulationsText="Play fair.",
    )
    assert r.status_code == 200, r.text
    assert r.json()["regulationsVersion"] == 1
    assert _page_row(tid).regulations_version == 1


# ---- the entry page: slug rules ----------------------------------------


@pytest.mark.parametrize(
    "slug",
    [
        "ab",  # under the 3-character floor
        "x" * 61,  # over the 60-character ceiling
        "Spring-Open",  # uppercase — the slug appears in a URL
        "spring open",  # whitespace
        "spring_open",  # underscore is not in the alphabet
        "spring/open",  # a path separator would change the route shape
    ],
)
def test_a_malformed_slug_is_refused(client, workspace, slug):
    assert _put_page(client, workspace, slug=slug).status_code == 400
    assert _page_row(workspace) is None


def test_a_well_formed_slug_is_accepted(client, workspace):
    """Negative control for the parametrized refusals: the conservative
    alphabet still admits an ordinary slug."""
    assert _put_page(client, workspace, slug="spring-open-2026").status_code == 200


def test_a_slug_another_workspace_holds_is_a_specific_409(
    client, workspace, other_workspace
):
    """Slugs are globally unique — they are the public address. The generic
    integrity error would surface as a 500; this says which field and why,
    because the operator can fix it in one edit."""
    assert _put_page(client, workspace, slug="spring-open").status_code == 200

    r = _put_page(client, other_workspace, slug="spring-open")
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "ENTRY_PAGE_SLUG_TAKEN"
    assert _page_row(other_workspace) is None


def test_keeping_your_own_slug_is_not_a_conflict(client, workspace):
    """Negative control for the 409: the uniqueness check must not find the
    row it is about to update. Re-saving a page unchanged is the single
    most ordinary thing an operator does with this route."""
    assert _put_page(client, workspace, slug="spring-open").status_code == 200
    assert _put_page(client, workspace, slug="spring-open").status_code == 200


# ---- the entry page: the role matrix -----------------------------------


def test_a_viewer_cannot_write_the_entry_page(client, workspace):
    _login(client, "viewer@example.com")
    assert _put_page(client, workspace).status_code == 403
    assert _page_row(workspace) is None


def test_an_operator_can_write_the_same_entry_page(client, workspace):
    """Negative control for the 403: identical request, only the role
    differs. Without it the refusal would pass against a broken route."""
    _login(client, "viewer@example.com")
    assert _put_page(client, workspace).status_code == 403

    _login(client, "op@example.com")
    assert _put_page(client, workspace).status_code == 200
    assert _page_row(workspace) is not None


# ---- entry events -------------------------------------------------------


def _post_event(client, tid, **body):
    payload = {"code": "MS", "discipline": "Men's Singles"}
    payload.update(body)
    return client.post(
        f"/tournaments/{tid}/entry-events", json=payload, headers=CSRF
    )


def _events(tid):
    from database.models import EntryEvent
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        return list(
            session.scalars(
                select(EntryEvent).where(EntryEvent.tournament_id == uuid.UUID(tid))
            )
        )
    finally:
        session.close()


def test_an_event_is_created_with_its_optional_fields(client, workspace):
    tid = workspace
    r = _post_event(
        client,
        tid,
        entryType="doubles",
        bracketEventId="bracket-event-1",
        cap=32,
        feeCents=1500,
        opensAt="2026-08-01T09:00:00+00:00",
        closesAt="2026-09-01T09:00:00+00:00",
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["code"] == "MS"
    assert body["entryType"] == "doubles"
    assert body["cap"] == 32
    assert body["feeCents"] == 1500

    (row,) = _events(tid)
    assert str(row.id) == body["id"]
    assert row.bracket_event_id == "bracket-event-1"
    assert row.opens_at is not None and row.closes_at is not None


def test_an_event_defaults_to_singles_with_everything_optional_omitted(
    client, workspace
):
    r = _post_event(client, workspace)
    assert r.status_code == 201, r.text
    assert r.json()["entryType"] == "singles"
    assert r.json()["feeCents"] is None


def test_an_unknown_entry_type_is_refused(client, workspace):
    """E1 is singles-only and E3 adds doubles; anything else is a typo that
    would reach the commit seam as an unmappable event."""
    r = _post_event(client, workspace, entryType="mixed-quad")
    assert r.status_code == 422
    assert _events(workspace) == []


def test_an_empty_code_is_refused(client, workspace):
    """``code`` is the pivot the commit seam maps onto Meet's ``ranks[]`` or
    a bracket event. An empty one is an entry that can never be committed."""
    assert _post_event(client, workspace, code="   ").status_code == 400
    assert _events(workspace) == []


def test_a_viewer_cannot_create_an_entry_event(client, workspace):
    _login(client, "viewer@example.com")
    assert _post_event(client, workspace).status_code == 403
    assert _events(workspace) == []


def test_an_operator_can_create_the_same_entry_event(client, workspace):
    """Negative control for the 403 above."""
    _login(client, "viewer@example.com")
    assert _post_event(client, workspace).status_code == 403

    _login(client, "op@example.com")
    assert _post_event(client, workspace).status_code == 201
    assert len(_events(workspace)) == 1


def test_both_config_routes_are_registered(client):
    from app.main import app

    paths = app.openapi()["paths"]
    assert "put" in paths["/tournaments/{tournament_id}/entry-page"]
    assert "post" in paths["/tournaments/{tournament_id}/entry-events"]
