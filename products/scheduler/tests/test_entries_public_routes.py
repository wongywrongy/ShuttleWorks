"""SP-E1-1 — the public entry surface: the slug page and the submit write.

This is the first route in ShuttleWorks that lets **an anonymous stranger
write to workspace data**. Everything else public is a read behind a
capability token. So the tests here are weighted accordingly: a handful pin
what the page renders, and the rest pin the I5 defense stack and prove each
guard actually guards.

Every guard test has a negative control — the same request with the guard
condition removed must succeed. A test asserting "this was refused" passes
just as happily against a route that refuses everything, which is why
CODE_HEALTH rule 3b asks for the pair.

**No test reaches Cloudflare.** ``services/turnstile.py`` isolates the HTTP
call in ``_post``; the fixture below replaces it with a fake that reproduces
the documented dummy-key semantics — a secret beginning ``1x`` always
passes, one beginning ``2x`` always fails. So the *configuration* drives the
verdict exactly as it will in Phase 2, and the code path under test is the
real one end to end.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA"


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture
def turnstile(client, monkeypatch):
    """Cloudflare's dummy-key semantics, without Cloudflare.

    Returns a handle that can force a transport failure, so the fail-closed
    path is exercised through the route rather than only in the unit test.
    """
    from services import turnstile as service

    state = {"raises": None}

    def fake_post(url, fields, timeout):
        if state["raises"] is not None:
            raise state["raises"]
        secret = fields.get("secret", "")
        if secret.startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)
    return state


@pytest.fixture
def page(client):
    """A workspace with an open entry page and two entry events.

    Seeded directly: E1 ships no operator UI for authoring an entry page
    (that is Phase D's desk plus later configuration work), and the public
    contract is worth pinning before the authoring surface exists rather
    than after.
    """
    tid = client.post(
        "/tournaments", json={"name": "Spring Open"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = "2026-09-12"
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(tid),
                slug="spring-open",
                is_open=True,
                intro_text="All welcome.",
                regulations_text="Play fair. Bring your own shuttles.",
                waiver_required=True,
                regulations_version=3,
            )
        )
        ms = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
            fee_cents=1500,
        )
        ws = EntryEvent(
            tournament_id=uuid.UUID(tid),
            code="WS",
            discipline="Women's Singles",
            entry_type="singles",
        )
        session.add_all([ms, ws])
        session.commit()
        return {"tid": tid, "slug": "spring-open", "ms": str(ms.id), "ws": str(ws.id)}
    finally:
        session.close()


def _submit(client, page, **overrides):
    """A well-formed submission; overrides replace individual fields."""
    data = {
        "eventId": page["ms"],
        "playerName": "Alice Chen",
        "contactName": "Parent Chen",
        "contactEmail": "Parent.Chen@Example.COM",
        "remarks": "can't play before 6pm Saturday",
        "acknowledged": "on",
        "cf-turnstile-response": "a-solved-token",
    }
    headers = overrides.pop("headers", {})
    data.update({k: v for k, v in overrides.items() if v is not None})
    for k, v in overrides.items():
        if v is None:
            data.pop(k, None)
    return client.post(f"/e/{page['slug']}/submit", data=data, headers=headers)


def _entries(tid=None):
    from database.models import Entry
    from database.session import SessionLocal
    from sqlalchemy import select

    session = SessionLocal()
    try:
        stmt = select(Entry)
        if tid is not None:
            stmt = stmt.where(Entry.tournament_id == uuid.UUID(tid))
        return list(session.scalars(stmt.order_by(Entry.submitted_at, Entry.id)))
    finally:
        session.close()


def _add_entry(tid, event_id, **kwargs):
    from database.models import Entry
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = Entry(
            tournament_id=uuid.UUID(tid),
            entry_event_id=uuid.UUID(event_id),
            state=kwargs.pop("state", "pending"),
            contact_name="Parent Chen",
            contact_email=kwargs.pop("contact_email", "parent@example.com"),
            manage_token_hash="0" * 64,
            player_name=kwargs.pop("player_name", "Seeded Player"),
            **kwargs,
        )
        session.add(row)
        session.commit()
        return str(row.id)
    finally:
        session.close()


# ---- the page -----------------------------------------------------------


def test_the_page_shows_the_tournament_its_date_and_its_events(client, page):
    r = client.get(f"/e/{page['slug']}")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/html")
    body = r.text
    assert "Spring Open" in body
    assert "2026-09-12" in body
    assert "Men&#x27;s Singles" in body or "Men's Singles" in body
    assert "Women" in body


def test_the_page_shows_the_fee_and_the_regulations_with_their_version(client, page):
    body = client.get(f"/e/{page['slug']}").text
    assert "15.00" in body  # fee_cents 1500, rendered as major units
    assert "Play fair" in body
    assert "3" in body  # regulations version, recorded on every entry


def test_the_page_lists_entrant_names_and_events_only(client, page):
    """I6 / Q4: the published fields are display name + event. Contact data
    is structurally excluded — the projection does not select it."""
    _add_entry(
        page["tid"],
        page["ms"],
        player_name="Bobby Tables",
        contact_email="secret@example.com",
    )

    body = client.get(f"/e/{page['slug']}").text
    assert "Bobby Tables" in body
    assert "secret@example.com" not in body
    assert "Parent Chen" not in body


def test_an_opted_out_entrant_is_absent_but_a_listed_one_is_present(client, page):
    """The flag governs publication, never participation — and the pair is
    one test so the "absent" half cannot pass by the list being broken."""
    _add_entry(page["tid"], page["ms"], player_name="Shy Player", list_opt_out=True)
    _add_entry(page["tid"], page["ms"], player_name="Loud Player")

    body = client.get(f"/e/{page['slug']}").text
    assert "Loud Player" in body
    assert "Shy Player" not in body


def test_withdrawn_and_rejected_entries_are_not_listed(client, page):
    _add_entry(page["tid"], page["ms"], player_name="Gone Away", state="withdrawn")
    _add_entry(page["tid"], page["ms"], player_name="Turned Down", state="rejected")
    _add_entry(page["tid"], page["ms"], player_name="Still Here", state="confirmed")

    body = client.get(f"/e/{page['slug']}").text
    assert "Still Here" in body
    assert "Gone Away" not in body
    assert "Turned Down" not in body


def test_the_list_never_reveals_entry_state(client, page):
    """Entry is not acceptance. A list that showed `confirmed` next to one
    name and `pending` next to another would publish the organiser's
    in-progress decisions."""
    _add_entry(page["tid"], page["ms"], player_name="Alpha", state="confirmed")
    _add_entry(page["tid"], page["ms"], player_name="Beta", state="pending")

    body = client.get(f"/e/{page['slug']}").text
    listed = body[body.index("Alpha") - 200 : body.index("Beta") + 200]
    assert "confirmed" not in listed
    assert "pending" not in listed


def test_every_interpolated_value_is_escaped(client, page):
    """Ruling D3 builds this page from f-strings, so escaping is the whole
    defense. Both authorship directions are hostile: the regulations text is
    director-authored and the player name is stranger-authored."""
    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.regulations_text = "<script>alert('director')</script>"
        session.commit()
    finally:
        session.close()
    _add_entry(
        page["tid"], page["ms"], player_name="<img src=x onerror=alert('entrant')>"
    )

    body = client.get(f"/e/{page['slug']}").text
    assert "<script>alert" not in body
    assert "<img src=x" not in body
    assert "&lt;script&gt;" in body
    assert "&lt;img src=x" in body


def test_an_unknown_slug_and_a_closed_page_answer_identically(client, page):
    """Uniform 404, the display precedent. A different answer for "closed"
    than for "never existed" is an enumeration oracle."""
    unknown = client.get(f"/e/{uuid.uuid4()}")
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"

    from database.models import EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.get(EntryPage, uuid.UUID(page["tid"])).is_open = False
        session.commit()
    finally:
        session.close()

    closed = client.get(f"/e/{page['slug']}")
    assert closed.status_code == 404
    assert closed.json() == unknown.json()


def test_an_open_page_is_the_negative_control_for_that_404(client, page):
    """Without this, the pair above would pass against a route that 404s
    unconditionally."""
    assert client.get(f"/e/{page['slug']}").status_code == 200


def test_the_page_carries_its_own_security_headers(client, page):
    """The nginx snippet's CSP forbids third-party scripts and frames, which
    would break the Turnstile widget. This page is served by the API and
    carries a page-scoped policy of its own."""
    r = client.get(f"/e/{page['slug']}")
    csp = r.headers["content-security-policy"]
    assert "script-src" in csp and "https://challenges.cloudflare.com" in csp
    assert "frame-src https://challenges.cloudflare.com" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert r.headers["x-content-type-options"] == "nosniff"


def test_the_page_is_built_for_a_390px_screen(client, page):
    """The bar for E1 is mobile-usable, and the entrant is on a phone."""
    body = client.get(f"/e/{page['slug']}").text
    assert 'name="viewport"' in body
    assert "width=device-width" in body
    # 16px is the threshold below which iOS Safari zooms on focus, which on
    # a form this narrow leaves the entrant scrolled sideways mid-typing.
    assert "font-size: 16px" in body


def test_the_widget_renders_with_the_configured_sitekey(client, page):
    from app.config import settings

    body = client.get(f"/e/{page['slug']}").text
    assert "https://challenges.cloudflare.com/turnstile/v0/api.js" in body
    assert f'data-sitekey="{settings.turnstile_site_key}"' in body


def test_the_acknowledgment_checkbox_gates_submit_in_the_browser_too(client, page):
    """Server-side is the guard that counts (below), but a form that lets
    the entrant discover the requirement only after losing their typing is
    a bad form. `required` does it with no script — which is also what keeps
    the CSP free of 'unsafe-inline'."""
    body = client.get(f"/e/{page['slug']}").text
    checkbox = re.search(r"<input[^>]*name=\"acknowledged\"[^>]*>", body)
    assert checkbox is not None
    assert "required" in checkbox.group(0)


# ---- submit: the happy path ---------------------------------------------


def test_a_valid_submission_lands_a_pending_entry(client, page, turnstile):
    r = _submit(client, page)
    assert r.status_code == 201, r.text

    (row,) = _entries(page["tid"])
    # Ruling D1: E1 has no email verification, so `unverified` is never
    # entered and the desk sees the entry immediately.
    assert row.state == "pending"
    assert row.player_name == "Alice Chen"
    assert row.contact_name == "Parent Chen"
    # Normalized at write time — the index that powers the duplicate flag is
    # a plain index, so the column has to arrive already lowercased.
    assert row.contact_email == "parent.chen@example.com"
    assert row.remarks == "can't play before 6pm Saturday"
    assert row.pending_reasons == []
    assert row.committed_player_id is None


def test_the_acknowledgment_is_recorded_with_the_version_agreed_to(
    client, page, turnstile
):
    """Q11: "they agreed to something at some point" is not a record."""
    _submit(client, page)

    (row,) = _entries(page["tid"])
    assert row.regulations_accepted_at is not None
    assert row.regulations_version_accepted == 3


def test_the_manage_token_is_shown_once_and_stored_only_as_a_hash(
    client, page, turnstile
):
    """auth_sessions' precedent, not display's plaintext one: entrant tokens
    are numerous and long-lived."""
    body = _submit(client, page).text
    (row,) = _entries(page["tid"])

    match = re.search(r'data-manage-token="([A-Za-z0-9_-]+)"', body)
    assert match, "the raw token is returned exactly once, in this response"
    raw = match.group(1)
    assert len(raw) >= 40  # token_urlsafe(32)
    assert row.manage_token_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert raw not in row.manage_token_hash


def test_the_entry_lands_under_the_tournament_the_slug_resolves_to(
    client, page, turnstile
):
    _submit(client, page)
    (row,) = _entries()
    assert str(row.tournament_id) == page["tid"]


# ---- submit: Turnstile ---------------------------------------------------


def test_a_failed_turnstile_refuses_and_writes_nothing(client, page, turnstile):
    """The always-FAIL dummy secret. Same code path as the success below —
    only the configured secret differs, which is exactly how Phase 2's real
    keys will differ from these."""
    from app.config import settings

    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        r = _submit(client, page)
    finally:
        settings.turnstile_secret_key = "1x0000000000000000000000000000000AA"

    assert r.status_code == 403, r.text
    assert _entries(page["tid"]) == []


def test_the_always_pass_secret_is_the_negative_control(client, page, turnstile):
    """Without this, the refusal above would pass against a submit route
    that was simply broken."""
    assert _submit(client, page).status_code == 201
    assert len(_entries(page["tid"])) == 1


def test_a_missing_token_is_refused_server_side(client, page, turnstile):
    """The bypass a client-side-only check invites: post directly, never
    render the widget, never carry a token."""
    r = _submit(client, page, **{"cf-turnstile-response": None})
    assert r.status_code == 403
    assert _entries(page["tid"]) == []


def test_an_unreachable_verifier_refuses_rather_than_letting_entries_through(
    client, page, turnstile
):
    turnstile["raises"] = OSError("connection refused")
    r = _submit(client, page)
    assert r.status_code == 403
    assert _entries(page["tid"]) == []


def test_a_refusal_says_nothing_about_the_entrant(client, page, turnstile):
    from app.config import settings

    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        body = _submit(client, page).text
    finally:
        settings.turnstile_secret_key = "1x0000000000000000000000000000000AA"

    assert "invalid-input-response" not in body
    assert ALWAYS_FAIL_SECRET not in body


# ---- submit: the acknowledgment -----------------------------------------


def test_submission_without_the_acknowledgment_is_refused(client, page, turnstile):
    """Q11: a waiver acknowledged after the fact is not an acknowledgment.
    This is one of the few places the software genuinely refuses."""
    r = _submit(client, page, acknowledged=None)
    assert r.status_code == 400
    assert _entries(page["tid"]) == []


def test_the_same_submission_with_the_box_ticked_succeeds(client, page, turnstile):
    assert _submit(client, page, acknowledged="on").status_code == 201


# ---- submit: the throttle ------------------------------------------------


def test_a_flood_from_one_ip_is_locked_out(client, page, turnstile, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 3)
    codes = [_submit(client, page).status_code for _ in range(5)]

    assert codes[:3] == [201, 201, 201]
    assert codes[-1] == 429
    assert len(_entries(page["tid"])) == 3


def test_under_the_budget_nothing_is_locked(client, page, turnstile, monkeypatch):
    """Negative control for the flood test: with the budget raised, the same
    five requests all go through."""
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 50)
    codes = [_submit(client, page).status_code for _ in range(5)]

    assert codes == [201] * 5


def test_a_locked_out_ip_is_refused_without_reaching_turnstile(
    client, page, turnstile, monkeypatch
):
    """The lock is a local read; siteverify is an outbound 5s round trip.

    Checking the challenge first let anything already locked out spend one
    of our outbound requests per post — the cheapest possible amplification
    against a route whose whole job is to be cheap to refuse. The transport
    here raises if it is called at all, so this cannot pass by the verdict
    merely being ignored.
    """
    from app.config import settings
    from services import turnstile as service

    monkeypatch.setattr(settings, "entries_max_per_ip", 1)
    assert _submit(client, page).status_code == 201

    calls = []

    def must_not_be_called(url, fields, timeout):
        calls.append(url)
        raise AssertionError("siteverify called for an IP that is already locked out")

    monkeypatch.setattr(service, "_post", must_not_be_called)

    r = _submit(client, page)
    assert r.status_code == 429
    assert calls == []
    assert len(_entries(page["tid"])) == 1


def test_an_unlocked_ip_still_reaches_turnstile(client, page, turnstile, monkeypatch):
    """Negative control for the ordering: with the budget raised, the same
    submission does make the siteverify call. Otherwise the test above would
    pass just as well against a route that never verifies anything."""
    from app.config import settings
    from services import turnstile as service

    monkeypatch.setattr(settings, "entries_max_per_ip", 50)
    calls = []
    real_post = service._post

    def counting_post(url, fields, timeout):
        calls.append(url)
        return real_post(url, fields, timeout)

    monkeypatch.setattr(service, "_post", counting_post)

    assert _submit(client, page).status_code == 201
    assert len(calls) == 1


def test_the_throttle_bucket_is_its_own_namespace():
    """A separate namespace from the credential and registration buckets, so
    an entry flood cannot lock a venue out of signing in."""
    from services import auth as auth_service

    assert auth_service.entries_key("203.0.113.7") == "entry:203.0.113.7"
    assert auth_service.entries_key("203.0.113.7") != auth_service.registration_key(
        "203.0.113.7"
    )
    assert auth_service.entries_key("203.0.113.7") != "ip:203.0.113.7"


# ---- submit: idempotency (ruling D4) -------------------------------------


def test_a_replayed_key_returns_the_original_and_creates_nothing(
    client, page, turnstile
):
    first = _submit(client, page, headers={"Idempotency-Key": "form-retry-1"})
    assert first.status_code == 201
    (original,) = _entries(page["tid"])

    replay = _submit(client, page, headers={"Idempotency-Key": "form-retry-1"})

    assert replay.status_code == 200
    assert str(original.id) in replay.text
    assert len(_entries(page["tid"])) == 1


def test_a_different_key_creates_a_second_entry(client, page, turnstile):
    """Negative control: the replay above must be the *key* deduplicating,
    not the route refusing every second submission."""
    _submit(client, page, headers={"Idempotency-Key": "form-retry-1"})
    second = _submit(client, page, headers={"Idempotency-Key": "form-retry-2"})

    assert second.status_code == 201
    assert len(_entries(page["tid"])) == 2


def test_a_replay_does_not_re_issue_the_manage_token(client, page, turnstile):
    """The raw token is unrecoverable by design, and re-minting one would
    silently invalidate the credential the entrant already holds."""
    first = _submit(client, page, headers={"Idempotency-Key": "form-retry-1"})
    (row,) = _entries(page["tid"])
    before = row.manage_token_hash

    replay = _submit(client, page, headers={"Idempotency-Key": "form-retry-1"})

    assert "data-manage-token" not in replay.text
    assert "data-manage-token" in first.text
    assert _entries(page["tid"])[0].manage_token_hash == before


def test_a_lost_race_on_the_unique_index_returns_the_original_not_a_conflict(
    client, page, turnstile, monkeypatch
):
    """Two identical retries in flight at once: one inserts, the other trips
    the unique index. The loser re-reads and answers with the winner's
    entry — a 409 here would be a correct-looking answer to a client that
    did nothing wrong.

    Simulated by blinding the pre-check exactly once, which is precisely
    what the racing request sees.
    """
    _submit(client, page, headers={"Idempotency-Key": "raced"})
    (original,) = _entries(page["tid"])

    from api import entries_public

    real = entries_public._find_by_idempotency_key
    blinded = {"done": False}

    def blind_once(repo, tournament_id, key):
        if not blinded["done"]:
            blinded["done"] = True
            return None
        return real(repo, tournament_id, key)

    monkeypatch.setattr(entries_public, "_find_by_idempotency_key", blind_once)

    r = _submit(client, page, headers={"Idempotency-Key": "raced"})

    assert r.status_code == 200, r.text
    assert str(original.id) in r.text
    assert len(_entries(page["tid"])) == 1


def test_a_key_is_scoped_to_the_tournament_the_slug_resolves_to(client, page, turnstile):
    """Ruling D4. The solve rail's index is global; on an unauthenticated
    route a global lookup lets an outsider probe another tenant's keyspace
    — and, worse, be handed that tenant's entry.
    """
    other = client.post(
        "/tournaments", json={"name": "Other Club"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent, EntryPage
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        session.add(
            EntryPage(
                tournament_id=uuid.UUID(other), slug="other-club", is_open=True
            )
        )
        ev = EntryEvent(
            tournament_id=uuid.UUID(other),
            code="MS",
            discipline="Men's Singles",
            entry_type="singles",
        )
        session.add(ev)
        session.commit()
        other_event = str(ev.id)
    finally:
        session.close()

    _submit(client, page, headers={"Idempotency-Key": "shared-key"})
    r = client.post(
        "/e/other-club/submit",
        data={
            "eventId": other_event,
            "playerName": "Someone Else",
            "contactName": "Someone Else",
            "contactEmail": "someone@example.com",
            "acknowledged": "on",
            "cf-turnstile-response": "a-solved-token",
        },
        headers={"Idempotency-Key": "shared-key"},
    )

    assert r.status_code == 201, r.text
    assert "Alice Chen" not in r.text
    assert len(_entries(page["tid"])) == 1
    assert len(_entries(other)) == 1


# ---- submit: the soft duplicate flag (R7 / Q12) --------------------------


def test_a_repeat_of_the_same_event_email_and_player_flags_the_new_entry(
    client, page, turnstile
):
    """Soft, never a rejection: the operator resolves it (invariant I4).

    The two rows are told apart by their remarks rather than by
    ``submitted_at``: on Windows the system clock ticks every ~15 ms, so two
    requests in one test genuinely share a timestamp and any
    order-by-time assertion here would be a coin flip.
    """
    _submit(client, page, remarks="the first one")
    _submit(client, page, remarks="the second one")

    by_remark = {row.remarks: row for row in _entries(page["tid"])}
    assert by_remark["the first one"].pending_reasons == []
    assert "needs_review" in by_remark["the second one"].pending_reasons
    assert by_remark["the second one"].state == "pending"


def test_a_second_player_on_one_email_is_not_flagged(client, page, turnstile):
    """Negative control, and the case the rejected unique index would have
    broken outright: one parent entering two children."""
    _submit(client, page, playerName="Alice Chen")
    _submit(client, page, playerName="Ben Chen")

    by_name = {row.player_name: row for row in _entries(page["tid"])}
    assert by_name["Ben Chen"].pending_reasons == []
    assert by_name["Alice Chen"].contact_email == by_name["Ben Chen"].contact_email


def test_the_same_player_in_a_different_event_is_not_flagged(client, page, turnstile):
    _submit(client, page, eventId=page["ms"])
    _submit(client, page, eventId=page["ws"])

    by_event = {str(row.entry_event_id): row for row in _entries(page["tid"])}
    assert by_event[page["ws"]].pending_reasons == []


def test_a_repeat_email_is_never_refused_and_the_answer_looks_the_same(
    client, page, turnstile
):
    """Seam B invariant: the response never reveals whether an email has
    already entered. Under Q12 a repeat is a *legitimate* submission, so
    there is nothing to reveal — and the answer must not accidentally say so
    anyway."""
    first = _submit(client, page, playerName="Alice Chen")
    second = _submit(client, page, playerName="Ben Chen")

    assert first.status_code == second.status_code == 201
    for body in (first.text, second.text):
        assert "already" not in body.lower()
        assert "duplicate" not in body.lower()
        assert "needs_review" not in body


# ---- submit: the event, and cross-tenant probing -------------------------


def test_an_event_from_another_workspace_is_refused_and_leaks_nothing(
    client, page, turnstile
):
    """The cross-tenant probe. A stranger holding a real event id from
    workspace B must not be able to attach an entry to it through workspace
    A's slug, and must learn nothing about B."""
    other = client.post(
        "/tournaments", json={"name": "Other Club"}, headers=CSRF
    ).json()["id"]

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        ev = EntryEvent(
            tournament_id=uuid.UUID(other),
            code="XD",
            discipline="Secret Mixed Doubles",
            entry_type="singles",
        )
        session.add(ev)
        session.commit()
        foreign_event = str(ev.id)
    finally:
        session.close()

    r = _submit(client, page, eventId=foreign_event)

    assert r.status_code == 400
    assert "Secret Mixed Doubles" not in r.text
    assert "Other Club" not in r.text
    assert _entries(page["tid"]) == []
    assert _entries(other) == []


def test_an_event_of_this_workspace_is_the_negative_control(client, page, turnstile):
    assert _submit(client, page, eventId=page["ms"]).status_code == 201


def test_a_closed_event_is_refused(client, page, turnstile):
    from datetime import datetime, timedelta, timezone

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page["ms"])))
        row.closes_at = datetime.now(timezone.utc) - timedelta(days=1)
        session.commit()
    finally:
        session.close()

    assert _submit(client, page).status_code == 400
    assert _entries(page["tid"]) == []
    # …and the page says so rather than offering it.
    body = client.get(f"/e/{page['slug']}").text
    assert "Closed" in body


def test_an_event_that_has_not_opened_yet_is_refused(client, page, turnstile):
    from datetime import datetime, timedelta, timezone

    from database.models import EntryEvent
    from database.session import SessionLocal

    session = SessionLocal()
    try:
        row = session.get(EntryEvent, (uuid.UUID(page["tid"]), uuid.UUID(page["ms"])))
        row.opens_at = datetime.now(timezone.utc) + timedelta(days=7)
        session.commit()
    finally:
        session.close()

    assert _submit(client, page).status_code == 400
    assert _entries(page["tid"]) == []


def test_a_submission_to_an_unknown_slug_is_the_uniform_404(client, page, turnstile):
    r = client.post(
        f"/e/{uuid.uuid4()}/submit",
        data={
            "eventId": page["ms"],
            "playerName": "Alice Chen",
            "contactName": "Parent Chen",
            "contactEmail": "parent@example.com",
            "acknowledged": "on",
            "cf-turnstile-response": "a-solved-token",
        },
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"
    assert _entries(page["tid"]) == []


def test_an_unusable_email_is_refused(client, page, turnstile):
    r = _submit(client, page, contactEmail="not-an-address")
    assert r.status_code == 400
    assert _entries(page["tid"]) == []


def test_the_global_body_cap_applies_to_this_route_too(client, page, turnstile):
    """SEC-01's ceiling is route-agnostic — worth pinning on the one route
    an anonymous stranger can post to."""
    r = client.post(
        f"/e/{page['slug']}/submit",
        data={"eventId": page["ms"], "remarks": "x" * (5 * 1024 * 1024)},
    )
    assert r.status_code == 413
    assert _entries(page["tid"]) == []


def test_both_public_routes_are_registered(client):
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/e/{slug}" in paths
    assert "/e/{slug}/submit" in paths
