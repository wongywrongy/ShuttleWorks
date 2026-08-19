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

from tests.backend._helpers import isolate_test_database

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

    # Read at the seam that still exists: Phase 6 retired the HTML page, so
    # the public address is served by the RR7 tier and the thing this route
    # feeds is the projection that tier loads.
    r = client.get("/e/api/page/spring-open")
    assert r.status_code == 200, r.text
    assert r.json()["tournament"]["name"] == "Entries Config"
    assert r.json()["page"]["regulationsText"] == "Play fair."


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


@pytest.mark.parametrize(
    "slug",
    [
        "api",  # ruling R8-A: nginx prefix-routes /e/api/ to this backend
        "account",  # same ruling, /e/account/
        "health",  # node's static /e/health route ranks above :slug
        "signup",  # node's static /e/signup route
        "login",  # node's static /e/login route
    ],
)
def test_a_reserved_slug_is_refused(client, workspace, slug):
    """Each of these is well-formed by ``_SLUG_RE`` alone — the alphabet
    check would let it through. It has to be refused anyway: node's
    `app/routes.ts` ranks these paths (or, for `api`/`account`, nginx's
    prefix match) above the entrant app's `:slug` catch-all, so a page at
    one of these addresses would be unreachable behind a route that always
    wins the match first."""
    r = _put_page(client, workspace, slug=slug)
    assert r.status_code == 400, r.text
    assert _page_row(workspace) is None


def test_a_reserved_slug_does_not_touch_an_existing_page(client, workspace):
    """The same refuse-before-write guarantee the malformed-slug case gets:
    an operator who fat-fingers a rename into a reserved word must not lose
    the page they already had."""
    tid = workspace
    assert _put_page(client, tid, slug="spring-open", introText="All welcome.").status_code == 200

    r = _put_page(client, tid, slug="api", introText="Changed.")
    assert r.status_code == 400, r.text

    row = _page_row(tid)
    assert row.slug == "spring-open"
    assert row.intro_text == "All welcome."


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


# ---- the entry page: the R12/R14 fields (SP-E1-2, F-E1-2-D1) -----------
#
# ADDITIVE. Everything above this line is SP-E1-1's and is unedited: the
# fields below are all optional, and a body written against the older
# shape behaves exactly as it did. What is new is that the columns ruling
# R12/R14 added to ``entry_pages`` — read by the public page, the pricing
# and the policy check — finally have a route that can write them. Until
# this commit the only way to price a tournament was a SQL client, which
# is the state this module's docstring says it exists to end.


def test_the_r12_r14_fields_round_trip_through_the_route(client, workspace):
    """Set them, read them back off the response, and off the stored row.

    Both halves matter: the DTO could agree with itself while persisting
    nothing, and the row could be right while the operator's screen shows
    them nothing back.
    """
    tid = workspace
    r = _put_page(
        client,
        tid,
        feeSchedule={"1": 4000, "2": 5500},
        paymentInstructions="Zelle to treasurer@club.example.",
        maxEventsPerPerson=3,
        disciplineCaps={"Men's Singles": 1},
        collectPhone=True,
        venueName="Riverside Sports Hall",
        venueAddress="12 Mill Lane",
    )
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["feeSchedule"] == {"1": 4000, "2": 5500}
    assert body["paymentInstructions"] == "Zelle to treasurer@club.example."
    assert body["maxEventsPerPerson"] == 3
    assert body["disciplineCaps"] == {"Men's Singles": 1}
    assert body["collectPhone"] is True
    assert body["venueName"] == "Riverside Sports Hall"

    row = _page_row(tid)
    assert row.fee_schedule == {"1": 4000, "2": 5500}
    assert row.payment_instructions == "Zelle to treasurer@club.example."
    assert row.max_events_per_person == 3
    assert row.discipline_caps == {"Men's Singles": 1}
    assert row.collect_phone is True
    assert row.venue_name == "Riverside Sports Hall"
    assert row.venue_address == "12 Mill Lane"


def test_a_page_configured_here_prices_and_renders_publicly(client, workspace):
    """The point of the route, end to end: a schedule authored through the
    API is the price list the public page prints, with no SQL anywhere."""
    _put_page(
        client,
        workspace,
        feeSchedule={"1": 4000, "2": 5500},
        paymentInstructions="Cash at check-in.",
        venueName="Riverside Sports Hall",
    )

    payload = client.get("/e/api/page/spring-open").json()
    # Cents, not formatted currency: the money is formatted by whatever
    # renders it, and after Phase 6 that is the RR7 tier. What this route
    # owes is the numbers the director authored, unrounded and unrenamed.
    assert payload["page"]["feeSchedule"] == {"1": 4000, "2": 5500}
    assert payload["page"]["paymentInstructions"] == "Cash at check-in."
    assert payload["venue"]["name"] == "Riverside Sports Hall"


def test_omitting_the_new_fields_clears_them_like_every_other_field(
    client, workspace
):
    """The PUT's whole-state semantics, unchanged. An omitted optional
    field means "clear it" on this route (the DTO says so), and the new
    fields do not get to be the exception — an operator who removes the
    fee schedule from their body has removed the fee schedule."""
    tid = workspace
    _put_page(client, tid, feeSchedule={"1": 4000}, maxEventsPerPerson=2)
    assert _page_row(tid).fee_schedule == {"1": 4000}

    assert _put_page(client, tid).status_code == 200
    assert _page_row(tid).fee_schedule is None
    assert _page_row(tid).max_events_per_person is None


@pytest.mark.parametrize(
    "schedule",
    [
        {"1": "4000"},        # a price as a string of digits
        {"1": 4000, "2": "on request"},  # a price that is not a number
        {"0": 4000},          # zero events is not a count
        {"-1": 4000},         # nor is a negative one
        {"one": 4000},        # nor is a word
        {"1": -4000},         # a negative price
        {"1": 40.5},          # cents are whole
    ],
)
def test_an_unusable_fee_tier_is_refused_with_the_rule_stated(
    client, workspace, schedule
):
    """**Never a silent drop** — R14 §4's rule for the policy caps, applied
    to the schedule for the same reason.

    ``normalize_fee_schedule`` is lenient by design: it drops what it
    cannot use rather than raising, because a malformed tier must not take
    down the public page. That is the right posture for a reader and the
    wrong one for a writer. An operator who typed a price the pricing
    ignores would have configured a number nobody is ever charged, and
    would find out from an entrant.

    (``{"1": "4000"}`` is the interesting one: the normalization *coerces*
    it rather than dropping it, so it would price correctly — and still be
    a stored row that does not equal what was sent. The writer refuses
    coercion as well as dropping, for that reason.)
    """
    r = _put_page(client, workspace, feeSchedule=schedule)

    assert r.status_code in (400, 422), r.text
    assert _page_row(workspace) is None


def test_a_usable_fee_schedule_is_the_negative_control(client, workspace):
    """Without this, every refusal above would pass against a route that
    had simply stopped accepting a fee schedule at all."""
    r = _put_page(client, workspace, feeSchedule={"1": 4000, "3": 6000})

    assert r.status_code == 200, r.text
    assert _page_row(workspace).fee_schedule == {"1": 4000, "3": 6000}


def test_a_refused_schedule_leaves_an_existing_page_untouched(client, workspace):
    """The validation runs before the row is touched. A director fixing a
    typo must not lose the page they already had to a rejected tier."""
    tid = workspace
    _put_page(client, tid, feeSchedule={"1": 4000}, introText="All welcome.")

    assert _put_page(
        client, tid, feeSchedule={"1": "on request"}, introText="Changed."
    ).status_code == 400

    row = _page_row(tid)
    assert row.fee_schedule == {"1": 4000}
    assert row.intro_text == "All welcome."


@pytest.mark.parametrize("caps", [{"MS": "1"}, {"MS": -1}, {"MS": True}])
def test_an_unusable_discipline_cap_is_refused(client, workspace, caps):
    """``services/entry_policy`` skips a cap that is not an ``int``, so an
    unusable one here is a limit the director believes they set and the
    form does not enforce. (``True`` is an ``int`` in Python and is not a
    cap of one.)"""
    assert _put_page(client, workspace, disciplineCaps=caps).status_code == 400
    assert _page_row(workspace) is None


def test_a_usable_discipline_cap_is_the_negative_control(client, workspace):
    r = _put_page(client, workspace, disciplineCaps={"Men's Singles": 1})
    assert r.status_code == 200, r.text
    assert _page_row(workspace).discipline_caps == {"Men's Singles": 1}


def test_a_cap_of_zero_events_per_person_is_refused(client, workspace):
    """A page nobody may enter is ``isOpen=False``, which says so without
    the confusion of a policy that refuses every submission."""
    assert _put_page(client, workspace, maxEventsPerPerson=0).status_code == 422
    assert _page_row(workspace) is None


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


# ---- entry events: the R12/R14 fields (SP-E1-2, F-E1-2-D1) -------------
#
# ADDITIVE, same posture as the page section above: both fields optional,
# an event created without them is what every event created before this
# commit already was.


def test_an_event_round_trips_its_gender_constraint_and_withdrawal_deadline(
    client, workspace
):
    r = _post_event(
        client,
        workspace,
        genderConstraint="M",
        withdrawsUntil="2026-09-05T17:00:00+00:00",
    )
    assert r.status_code == 201, r.text
    assert r.json()["genderConstraint"] == "M"
    assert r.json()["withdrawsUntil"].startswith("2026-09-05T17:00:00")

    (row,) = _events(workspace)
    assert row.gender_constraint == "M"
    assert row.withdraws_until is not None


def test_an_event_without_them_is_open_and_has_no_withdrawal_deadline(
    client, workspace
):
    """Negative control for the round-trip: the fields are genuinely
    optional, and their absence is the open event R12 makes the default."""
    r = _post_event(client, workspace)
    assert r.status_code == 201, r.text
    assert r.json()["genderConstraint"] is None
    assert r.json()["withdrawsUntil"] is None

    (row,) = _events(workspace)
    assert row.gender_constraint is None and row.withdraws_until is None


@pytest.mark.parametrize("value", ["male", "F ", "x", "womens", ""])
def test_a_gender_constraint_outside_the_vocabulary_is_refused(
    client, workspace, value
):
    """``entryType``'s reason, for the same kind of field. The vocabulary
    is closed — ``services/entry_policy`` folds a constraint onto
    'M' / 'F' / 'mixed' — and an unrecognised one does not refuse anything
    at submit time, it silently flags every entrant who chose the event.
    Refusing here is the only place it can be caught."""
    assert _post_event(client, workspace, genderConstraint=value).status_code == 422
    assert _events(workspace) == []


@pytest.mark.parametrize("value", ["M", "F", "mixed"])
def test_the_whole_vocabulary_is_accepted(client, workspace, value):
    """Negative control for the refusals above."""
    assert _post_event(client, workspace, genderConstraint=value).status_code == 201


def test_an_unreadable_withdrawal_deadline_names_its_own_field(client, workspace):
    """``_parse_moment``'s existing contract, extended to the third
    timestamp on this route: the answer says which field was unreadable,
    because an operator hand-types all three."""
    r = _post_event(client, workspace, withdrawsUntil="next Wednesday")

    assert r.status_code == 400, r.text
    assert "withdrawsUntil" in r.json()["detail"]["message"]
    assert _events(workspace) == []


def test_a_readable_withdrawal_deadline_is_the_negative_control(client, workspace):
    assert _post_event(
        client, workspace, withdrawsUntil="2026-09-05T17:00:00Z"
    ).status_code == 201
    assert _events(workspace)[0].withdraws_until is not None


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
