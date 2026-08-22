"""Every route requires a session — and it stays that way.

This is a **coverage gate**, not a behaviour test. It derives the route table
from ``app.openapi()`` and asserts that each route refuses an anonymous caller,
except for an explicit, justified allowlist. Add a new endpoint without auth and
this test fails, naming it.

It is the same shape as ``test_tenant_isolation.py``, which derives workspace
routes from the schema and fails on a missing access seam — and for the same
reason. A convention that lives only in review gets forgotten; a convention
derived from the running app cannot.

**Why the allowlist is enumerated rather than pattern-matched.** A rule like
"anything under /auth is public" would silently bless a future
``/auth/admin/impersonate``. Each entry below is a specific method+path with a
stated reason, so widening the public surface is a deliberate edit to this file
and shows up in review as exactly that.

Run in ``AUTH_MODE=cloud``: in local mode an anonymous request deliberately
resolves to the bootstrap operator (the solo offline flow), so there is nothing
to assert. Cloud mode is the deployed posture and the one that matters.
"""
from __future__ import annotations

import uuid

import pytest

# (METHOD, PATH) reachable without a session, each with the reason it must be.
#
# **This list has changed shape twice, and both changes are the point.**
#
# Until 2026-08-06 the note here read "nothing here exposes workspace data",
# and it was true: every public route was a read behind a capability token,
# or an auth endpoint that by definition cannot require auth. **SP-E1-1**
# broke that, deliberately: ``/e/{slug}`` publishes workspace data — the
# events, the fee, the regulations, the entrant list — to anyone with the
# link, and ``/e/{slug}/submit`` let an anonymous stranger *write a row*.
# The justification written here was that an entrant "has no account and
# never will (spec Q4 — no entrant accounts in v1)", so requiring one would
# mean the capability could not exist.
#
# **Ruling R10 (2026-08-07) ended that premise, and SP-E1-2 is unwinding
# it.** Entrants are now a real principal type with accounts, sessions and a
# login of their own (spec Q13): ``entrant_accounts`` / ``entrant_sessions``,
# the ``sw_play_session`` cookie, and ``get_current_entrant``, which has no
# bootstrap fallback in either mode. So the shape of this list changes with
# it:
#
# - **``POST /e/account/signup`` and ``/login`` go IN.** They are session-free
#   by nature, not by policy — an account is what the caller is trying to
#   obtain — exactly as ``/auth/register`` and ``/auth/login`` are. ``/logout``
#   joins them on ``/auth/logout``'s precedent: nothing to destroy is a no-op.
# - **The public entry read STAYS, under a new name.** The page is still
#   public by design; R10 changed who *writes*, not who reads. Phase 6's
#   cut-over retired the FastAPI-rendered ``GET /e/{slug}`` — that address
#   is served by the React Router 7 tier now and never reaches FastAPI —
#   and its allowlist slot passed to ``GET /e/api/page/{slug}``, the JSON
#   projection that tier reads. Same posture, same guards, one fewer
#   renderer.
# - **``POST /e/{slug}/submit`` is OUT** (SP-E1-2 Phase C). R10 put
#   submission behind a session; the route now depends on
#   ``get_current_entrant``, which has no bootstrap fallback in either mode,
#   so there is no "some entrant" an anonymous caller resolves to. The
#   listing was kept through Phase B on purpose — removing it before the
#   gate existed would only have meant the gate stopped being checked.
# - **``GET /e/account/me`` is deliberately NOT here.** It carries the
#   entrant dependency and answers this gate's 401 like any other guarded
#   route, which is the point: the second principal is inside the gate, not
#   an exception to it.
#
# What replaces "no workspace data is exposed" as the standard:
#
# - the page is a *strict projection* — names and events, never contact
#   data, and rows with ``list_opt_out`` are absent (I6/Q4);
# - the slug is the only key, so a raw tournament UUID is never a public
#   address, and an unknown or closed slug gets one uniform 404;
# - the one remaining public write is **signup**, and it carries the whole
#   anti-abuse stack: the server-side challenge that moved there from submit
#   (Q4's R3 restack), its own throttle namespace, and a non-enumerating
#   answer — every one of them exercised in
#   ``tests/test_entrant_auth_routes.py``, because an entry in an allowlist
#   is a claim and a claim wants a check.
PUBLIC_BY_DESIGN: dict[tuple[str, str], str] = {
    ("POST", "/auth/register"): "account creation — cannot require an account",
    ("POST", "/auth/login"): "the login endpoint itself",
    ("POST", "/auth/logout"): "idempotent; no session to destroy is a no-op",
    ("POST", "/auth/request-password-reset"): "reached when locked out",
    ("POST", "/auth/reset-password"): "reached when locked out; token-guarded",
    ("GET", "/health"): (
        "liveness. Deliberately credential-free: a probe that cannot tell "
        "'unauthorized' from 'dead' gets the container killed while healthy"
    ),
    ("GET", "/display/{token}/summary"): "capability URL — a venue TV has no account",
    ("GET", "/display/{token}/state"): "capability URL",
    ("GET", "/display/{token}/match-states"): "capability URL",
    ("GET", "/display/{token}/bracket"): "capability URL",
    ("GET", "/invites/{token}"): (
        "invite preview — the recipient has no account yet by definition"
    ),
    ("GET", "/e/api/page/{slug}"): (
        "the public entry page as JSON, read by the RR7 loader that serves "
        "/e/{slug} — the address this replaced in the Phase 6 cut-over. "
        "Discoverable and shareable BY DESIGN (Q4): it is a poster URL, not "
        "a capability URL. Strict projection (entrant names + the codes of "
        "the events they entered, one row per PERSON, opt-outs excluded, no "
        "contact data selected — not even the club the consent copy does "
        "not cover), the "
        "slug as the only key so a raw tournament UUID is never a public "
        "address, and the uniform 404 for an unknown or closed page. The "
        "leak claim is checked, not assumed, in "
        "tests/backend/test_entries_json_routes.py::"
        "test_the_projection_never_carries_an_entrants_contact_data"
    ),
    ("GET", "/e/api/config"): (
        "public runtime configuration for the entrant app: the Turnstile "
        "SITEKEY (rendered into every signup page — public by nature) and "
        "the auth mode. It cannot require a session: it is read by the "
        "signup page, which is where a session is obtained. Two fields, no "
        "repository access, no tenant scope. The claim that it never "
        "carries the SECRET key — the adjacent, near-identically-named "
        "setting — is checked in tests/test_entries_json_routes.py::"
        "test_the_config_route_never_publishes_the_turnstile_secret"
    ),
    ("GET", "/e/api/pages"): (
        "the open entry pages' slugs — the list Task 26's sitemap.xml route "
        "crawls. Public for the same reason GET /e/{slug} is: a poster URL "
        "is meant to be discoverable. Filtered on is_open, which is checked "
        "as a negative control in "
        "tests/backend/test_entries_json_routes.py::"
        "test_a_closed_pages_slug_never_appears_in_the_list — an unfiltered "
        "list would publish a closed workspace's address into a crawlable "
        "sitemap, disclosing it exists before the director opened entries"
    ),
    ("POST", "/e/account/signup"): (
        "entrant account creation — cannot require an account, for the same "
        "reason /auth/register cannot. Session-free BY NATURE, not by policy. "
        "Its guards are asserted in tests/test_entrant_auth_routes.py rather "
        "than assumed: server-side Turnstile (the challenge moved here from "
        "submit — spec Q4, R3 restack), its own esignup: throttle namespace "
        "read before the outbound call, the shared NIST password policy, and "
        "a uniform non-enumerating answer that never reveals whether an "
        "address is already registered"
    ),
    ("POST", "/e/account/login"): (
        "the entrant login endpoint itself — the twin of /auth/login and "
        "public for the same reason. Its own credential namespaces "
        "(eacct:/eip:), a uniform 401 whatever the cause, and the Argon2 "
        "cost paid on a miss so timing is not the oracle the body is not"
    ),
    ("POST", "/e/account/logout"): (
        "idempotent; no session to destroy is a no-op — /auth/logout's "
        "precedent. It revokes only the token presented, so a caller with "
        "no cookie can end nobody else's session"
    ),
    # ---- E2 / program Phase 7 (spec §6, ruling R10) --------------------
    #
    # All three are session-free BY NATURE for the same structural reason:
    # each exists to be reached by someone who cannot present a session. An
    # unverified entrant has one but it proves nothing yet; a locked-out one
    # has none at all and is asking for the way back in. The credential each
    # carries instead is a 256-bit token from ``secrets``, mailed to the
    # address on the account and stored only as its SHA-256 — the
    # ``auth_sessions`` precedent, not the display-token plaintext one (I5).
    #
    # ``POST /e/account/resend-verification`` is deliberately NOT here: it
    # takes no address and reads the caller's own account off the session,
    # which is what stops it being a mail cannon aimed at other people's
    # inboxes. It answers this gate's 401 like any other guarded route.
    ("POST", "/e/account/verify"): (
        "double-opt-in confirmation — session-free by nature: the entrant "
        "may not be signed in when they open their mail, and requiring a "
        "session would make verification depend on the state it exists to "
        "establish. A POST, not the mailed GET, so link-prefetching mail "
        "scanners cannot consume the token before the human clicks. Uniform "
        "refusal on unknown/expired/already-used, so a leaked link cannot be "
        "used to learn that it was once valid; guards asserted in "
        "tests/test_entrant_lifecycle_routes.py"
    ),
    ("POST", "/e/account/request-password-reset"): (
        "reset request — cannot require a session for the obvious reason. "
        "R10 extends the non-enumeration rule here explicitly: always 202, "
        "one body and one redirect target whether or not the address is "
        "registered, and the unknown branch CHARGES the eip: throttle so "
        "walking an address list is not free"
    ),
    ("POST", "/e/account/reset-password"): (
        "reset completion — the mailed token IS the credential, which is "
        "the whole point of the flow. Consuming it revokes every live "
        "session on the account (OWASP: a reset with the attacker's session "
        "still alive is theatre), and an invalid token is refused without "
        "revealing whether it ever existed"
    ),
}

# Note on the entry that is NO LONGER here, kept because its absence is the
# deliberate act. The public submit was listed until SP-E1-2 Phase C; it now
# carries ``get_current_entrant`` and answers this gate's 401 like any other
# guarded route. (Phase 6's cut-over moved the route itself: the address is
# ``POST /e/api/submit/{slug}`` and the FastAPI-rendered
# ``POST /e/{slug}/submit`` no longer exists. The posture is what this note
# is about, and that did not move.) The reason the removal is worth a
# paragraph is that the gate would have tolerated the route either way: it
# probes with a random-uuid slug and every field on that route is optional
# at the schema level, so an anonymous probe used to reach the handler and
# get the uniform 404 — a pass on the gate's own terms, with or without the
# allowlist line. The allowlist records *intent*, and a public write the
# gate happens to tolerate silently is exactly what this file exists to make
# visible. The refusal is asserted directly in
# ``tests/test_entries_submit_api.py::test_an_anonymous_submit_is_rejected``,
# with the signed-in submit as its negative control.

# Ops-token-gated rather than session-gated. Separate because they are
# protected by a DIFFERENT mechanism, and conflating the two would let a
# genuinely open route hide in this list.
OPS_TOKEN_GATED: set[tuple[str, str]] = {
    ("GET", "/health/ready"),
    ("GET", "/health/deep"),
    ("GET", "/health/metrics"),
}

_PARAM_FILL = str(uuid.uuid4())


@pytest.fixture
def cloud_client(tmp_path, monkeypatch):
    """The app in cloud auth mode, with no session cookie."""
    monkeypatch.setenv("AUTH_MODE", "cloud")
    # ENVIRONMENT stays local so the cloud secret validator (which demands a
    # postgres DSN and SMTP) does not refuse to build Settings. What is under
    # test is the AUTH posture, which AUTH_MODE alone governs.
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("OPS_TOKEN", "surface-test-token")
    from tests.backend._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app), app


def _concrete(path: str) -> str:
    out = path
    while "{" in out:
        a, b = out.index("{"), out.index("}")
        out = out[:a] + _PARAM_FILL + out[b + 1 :]
    return out


def _routes(app):
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            m = method.upper()
            if m in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                yield m, path


def test_every_route_refuses_an_anonymous_caller(cloud_client):
    """The gate. A new endpoint without auth fails here, by name."""
    client, app = cloud_client
    reachable: list[str] = []

    for method, path in _routes(app):
        key = (method, path)
        if key in PUBLIC_BY_DESIGN or key in OPS_TOKEN_GATED:
            continue
        r = client.request(
            method,
            _concrete(path),
            json={} if method in ("POST", "PUT", "PATCH") else None,
            headers={"X-ShuttleWorks-CSRF": "1"},
        )
        # 401 = no session. 403 = CSRF/ops guard. 404 = the tenancy seam's
        # uniform answer, which is itself a refusal — a non-member must not
        # learn whether a workspace exists.
        if r.status_code not in (401, 403, 404):
            reachable.append(f"{method} {path} -> {r.status_code}")

    assert not reachable, (
        "These routes answered an anonymous caller. Either gate them with "
        "Depends(get_current_user) / require_tournament_access, or add them to "
        "PUBLIC_BY_DESIGN with a written reason:\n  "
        + "\n  ".join(sorted(reachable))
    )


def test_the_allowlist_has_no_stale_entries(cloud_client):
    """An allowlist that outlives its routes stops being reviewable.

    Without this, a deleted public endpoint leaves an entry behind, and the
    next reader assumes the surface is wider than it is.
    """
    _, app = cloud_client
    live = set(_routes(app))
    stale = [f"{m} {p}" for (m, p) in PUBLIC_BY_DESIGN if (m, p) not in live]
    stale += [f"{m} {p}" for (m, p) in OPS_TOKEN_GATED if (m, p) not in live]
    assert not stale, f"allowlist references routes that no longer exist: {stale}"


def test_ops_endpoints_refuse_a_caller_without_the_token(cloud_client):
    """The ops tree is gated by a token, not a session — verify it actually is.

    Listed separately from PUBLIC_BY_DESIGN precisely so this assertion exists.
    An entry in an allowlist is a claim; this is the check on the claim.
    """
    client, _ = cloud_client
    for method, path in sorted(OPS_TOKEN_GATED):
        r = client.request(method, _concrete(path))
        assert r.status_code == 403, f"{method} {path} answered {r.status_code}"


def test_display_capability_routes_reject_a_bogus_token(cloud_client):
    """Unauthenticated is not the same as unguarded.

    These four are the only anonymous *read* plane. Their guard is the token,
    so the guard is worth asserting rather than assuming.
    """
    client, _ = cloud_client
    for method, path in sorted(
        k for k in PUBLIC_BY_DESIGN if k[1].startswith("/display/")
    ):
        r = client.request(method, _concrete(path))
        assert r.status_code == 404, f"{method} {path} answered {r.status_code}"


# ---- the public entry surface (SP-E1-1) ---------------------------------
#
# The same discipline as the display block above, applied to the harder
# case: these routes are unauthenticated AND one of them writes. Each guard
# gets its negative control, because "this request was refused" also passes
# against a route that refuses everything.
#
# Run in cloud mode like everything else in this file, which is also the
# only mode the Entries module exists in (R6/D2) — so this is the deployed
# posture, not a convenience.


ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000000AA"
ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA"


@pytest.fixture
def turnstile(cloud_client, monkeypatch):
    """Cloudflare's dummy-key semantics without Cloudflare: a secret
    beginning ``2x`` always fails, anything else passes. The configuration
    drives the verdict exactly as the real keys will."""
    import json

    from identity import turnstile as service

    def fake_post(url, fields, timeout):
        if fields.get("secret", "").startswith("2x"):
            return json.dumps(
                {"success": False, "error-codes": ["invalid-input-response"]}
            )
        return json.dumps({"success": True})

    monkeypatch.setattr(service, "_post", fake_post)


@pytest.fixture
def entry_page(cloud_client):
    """Two workspaces, each with an open entry page — seeded directly,
    since an anonymous caller has no route that could create one."""
    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        out = {}
        for label, name in (("a", "Club A Open"), ("b", "Club B Invitational")):
            t = Tournament(name=name, kind="meet", data={})
            session.add(t)
            session.flush()
            session.add(
                EntryPage(tournament_id=t.id, slug=f"club-{label}", is_open=True)
            )
            ev = EntryEvent(
                tournament_id=t.id,
                code="MS",
                discipline=f"{name} Men's Singles",
                entry_type="singles",
            )
            session.add(ev)
            session.flush()
            out[label] = {
                "tid": str(t.id),
                "slug": f"club-{label}",
                "event": str(ev.id),
                "name": name,
            }
        session.commit()
        return out
    finally:
        session.close()


def _entry_count(tid=None) -> int:
    import uuid as _uuid

    from db.models import Entry
    from db.session import SessionLocal
    from sqlalchemy import func, select

    session = SessionLocal()
    try:
        stmt = select(func.count()).select_from(Entry)
        if tid is not None:
            stmt = stmt.where(Entry.tournament_id == _uuid.UUID(tid))
        return session.execute(stmt).scalar_one()
    finally:
        session.close()


def _post_entry(client, workspace, **overrides):
    """A well-formed submission in the R13 shape.

    No ``contactName`` / ``contactEmail`` (Q13 §6 — the account is who
    submitted) and no challenge token (R10 — Turnstile guards signup now).
    The event checkbox value carries the player index, which is how 1–N
    events per person travel in a flat form post.
    """
    data = {
        "playerName": "Alice Chen",
        "gender": "F",
        "events": [f"0:{workspace['event']}"],
        "acknowledged": "on",
    }
    headers = overrides.pop("headers", {})
    data.update(overrides)
    return client.post(
        f"/e/api/submit/{workspace['slug']}",
        data=data,
        headers=headers,
        follow_redirects=False,
    )


def test_the_entry_page_answers_an_anonymous_caller(cloud_client, entry_page):
    """It must. An entrant has no account, and this is the negative control
    for every 404 asserted below."""
    client, _ = cloud_client
    r = client.get(f"/e/api/page/{entry_page['a']['slug']}")
    assert r.status_code == 200, r.text
    assert r.json()["tournament"]["name"] == "Club A Open"


def test_a_bogus_slug_answers_the_uniform_404(cloud_client, entry_page):
    client, _ = cloud_client
    r = client.get(f"/e/api/page/{_PARAM_FILL}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_the_page_of_one_workspace_never_carries_another_workspaces_data(
    cloud_client, entry_page
):
    """The cross-tenant probe. Two workspaces exist and neither knows the
    other; a slug is a key to exactly one of them."""
    client, _ = cloud_client
    body = client.get(f"/e/api/page/{entry_page['a']['slug']}").text
    assert "Club B Invitational" not in body
    assert entry_page["b"]["tid"] not in body
    assert entry_page["b"]["event"] not in body


# The seven tests that used to sit here asserted the guards standing in
# front of an ANONYMOUS write: a Turnstile refusal and its always-pass
# control, the per-IP flood lockout and its under-budget control, and three
# idempotency claims. **Ruling R10 superseded all seven by removing the
# thing they guarded** — submit is not anonymous any more.
#
# They are replaced rather than deleted, in both directions:
#
# - the challenge pair moved *with the challenge*, to
#   ``tests/test_entrant_auth_routes.py``, which asserts the refusal, the
#   always-pass control and the throttle-before-the-outbound-call ordering
#   at signup — the act a stranger can now perform;
# - the flood and idempotency claims moved *with the route's new shape*, to
#   ``tests/test_entries_submit_api.py``, where the key is resolved at
#   the submission level (R13) and the throttle sits behind the session;
# - and the headline control — "the always-pass secret WRITES the entry" —
#   inverts into the pair below. That inversion is the point of this file:
#   the surface's claim about this route changed sign, and the allowlist
#   above changed with it.


def test_an_anonymous_submit_is_rejected(cloud_client, entry_page):
    """The inversion of E1's headline behavior (R10).

    ``get_current_entrant`` has no bootstrap fallback in either mode, so
    there is no "some entrant" an anonymous caller resolves to — the
    refusal is structural rather than a check someone remembered to write.
    """
    client, _ = cloud_client
    r = _post_entry(client, entry_page["a"])
    assert r.status_code == 401
    assert _entry_count() == 0


def test_the_same_submit_with_an_entrant_session_is_accepted(
    cloud_client, entry_page, turnstile
):
    """Negative control for the refusal above: same request, same route,
    one session cookie different. Without it, the assertion above would
    pass just as happily against a route that refuses everything."""
    client, _ = cloud_client
    assert (
        client.post(
            "/e/account/signup",
            json={
                "email": "entrant@example.com",
                "password": "a perfectly fine passphrase",
                "turnstileToken": "a-solved-token",
            },
            headers={"X-ShuttleWorks-CSRF": "1"},
        ).status_code
        == 202
    )
    assert (
        client.post(
            "/e/account/login",
            json={
                "email": "entrant@example.com",
                "password": "a perfectly fine passphrase",
            },
            headers={"X-ShuttleWorks-CSRF": "1"},
        ).status_code
        == 200
    )

    # Read off the projection rather than recomputed: a recomputed digest
    # would pass even if the loader stopped emitting the field, and that
    # field is the only thing that lets an unhydrated form post this write.
    token = client.get(f"/e/api/page/{entry_page['a']['slug']}").json()[
        "viewer"
    ]["formCsrf"]

    r = _post_entry(client, entry_page["a"], _csrf=token)
    assert r.status_code == 303, r.text
    assert _entry_count(entry_page["a"]["tid"]) == 1


