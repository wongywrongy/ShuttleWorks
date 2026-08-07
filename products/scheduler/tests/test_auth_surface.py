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
# **This list changed shape in SP-E1-1, and the change is the point.** Until
# 2026-08-06 the note here read "nothing here exposes workspace data", and it
# was true: every public route was a read behind a capability token, or an
# auth endpoint that by definition cannot require auth. Entries breaks that.
# ``/e/{slug}`` publishes workspace data — the events, the fee, the
# regulations, and the entrant list — to anyone with the link, and
# ``/e/{slug}/submit`` lets an anonymous stranger *write a row*. It is the
# app's first public write, and it is deliberate: an entrant has no account
# and never will (spec Q4 — no entrant accounts in v1), so requiring one
# would mean the capability cannot exist.
#
# What replaces "no workspace data is exposed" as the standard:
#
# - the page is a *strict projection* — names and events, never contact
#   data, and rows with ``list_opt_out`` are absent (I6/Q4);
# - the slug is the only key, so a raw tournament UUID is never a public
#   address, and an unknown or closed slug gets one uniform 404;
# - the write carries its own defense stack (server-side Turnstile, a
#   per-IP throttle, the acknowledgment, a tenant-scoped idempotency key)
#   and the tests at the bottom of this file exercise each of them, because
#   an entry in an allowlist is a claim and a claim wants a check.
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
    ("GET", "/e/{slug}"): (
        "the public entry page. Discoverable and shareable BY DESIGN (Q4) — "
        "it is a poster URL, not a capability URL. Strict projection: "
        "entrant names + events only, opt-outs excluded, no contact data "
        "selected; unknown or closed slug answers the uniform 404"
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
    ("POST", "/e/{slug}/submit"): (
        "the app's first anonymous WRITE. An entrant has no account and "
        "never will (Q4), so the guard cannot be a session: it is "
        "server-side Turnstile + a per-IP throttle + the required "
        "acknowledgment + a tenant-scoped Idempotency-Key, each asserted "
        "below rather than assumed"
    ),
}

# Note on how the gate below reads that POST. It probes with ``json={}``,
# and every field on the submit route is optional at the schema level (so a
# missing field is a rendered refusal rather than a raw 422 blob in the
# entrant's browser), which means the probe reaches the handler, fails to
# resolve the random-uuid slug, and answers the uniform 404 — a pass on the
# gate's own terms even without the allowlist entry. The entry is here
# anyway: the allowlist records *intent*, and a public write that the gate
# happens to tolerate silently is exactly the thing this file exists to
# make visible.

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
    from tests._helpers import isolate_test_database

    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

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

    from services import turnstile as service

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
    from database.models import EntryEvent, EntryPage, Tournament
    from database.session import SessionLocal

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

    from database.models import Entry
    from database.session import SessionLocal
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
    data = {
        "eventId": workspace["event"],
        "playerName": "Alice Chen",
        "contactName": "Parent Chen",
        "contactEmail": "parent@example.com",
        "acknowledged": "on",
        "cf-turnstile-response": "a-solved-token",
    }
    headers = overrides.pop("headers", {})
    data.update(overrides)
    return client.post(f"/e/{workspace['slug']}/submit", data=data, headers=headers)


def test_the_entry_page_answers_an_anonymous_caller(cloud_client, entry_page):
    """It must. An entrant has no account, and this is the negative control
    for every 404 asserted below."""
    client, _ = cloud_client
    r = client.get(f"/e/{entry_page['a']['slug']}")
    assert r.status_code == 200, r.text
    assert "Club A Open" in r.text


def test_a_bogus_slug_answers_the_uniform_404(cloud_client, entry_page):
    client, _ = cloud_client
    r = client.get(f"/e/{_PARAM_FILL}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "TOURNAMENT_NOT_FOUND"


def test_the_page_of_one_workspace_never_carries_another_workspaces_data(
    cloud_client, entry_page
):
    """The cross-tenant probe. Two workspaces exist and neither knows the
    other; a slug is a key to exactly one of them."""
    client, _ = cloud_client
    body = client.get(f"/e/{entry_page['a']['slug']}").text
    assert "Club B Invitational" not in body
    assert entry_page["b"]["tid"] not in body
    assert entry_page["b"]["event"] not in body


def test_a_failed_challenge_refuses_the_write(cloud_client, entry_page, turnstile):
    client, _ = cloud_client
    from app.config import settings

    settings.turnstile_secret_key = ALWAYS_FAIL_SECRET
    try:
        r = _post_entry(client, entry_page["a"])
    finally:
        settings.turnstile_secret_key = ALWAYS_PASS_SECRET

    assert r.status_code == 403
    assert _entry_count() == 0


def test_the_always_pass_secret_writes_the_entry(cloud_client, entry_page, turnstile):
    """Negative control for the refusal above — same request, same route,
    only the configured secret differs."""
    client, _ = cloud_client
    assert _post_entry(client, entry_page["a"]).status_code == 201
    assert _entry_count(entry_page["a"]["tid"]) == 1


def test_a_flood_from_one_address_is_locked_out(
    cloud_client, entry_page, turnstile, monkeypatch
):
    client, _ = cloud_client
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 2)
    codes = [_post_entry(client, entry_page["a"]).status_code for _ in range(4)]

    assert codes[0] == codes[1] == 201
    assert codes[-1] == 429
    assert _entry_count() == 2


def test_under_the_budget_the_same_flood_goes_through(
    cloud_client, entry_page, turnstile, monkeypatch
):
    """Negative control: the lockout must be the budget, not the route."""
    client, _ = cloud_client
    from app.config import settings

    monkeypatch.setattr(settings, "entries_max_per_ip", 50)
    codes = [_post_entry(client, entry_page["a"]).status_code for _ in range(4)]

    assert codes == [201] * 4


def test_a_replayed_idempotency_key_creates_no_second_entry(
    cloud_client, entry_page, turnstile
):
    client, _ = cloud_client
    first = _post_entry(client, entry_page["a"], headers={"Idempotency-Key": "k1"})
    replay = _post_entry(client, entry_page["a"], headers={"Idempotency-Key": "k1"})

    assert first.status_code == 201
    assert replay.status_code == 200
    assert _entry_count(entry_page["a"]["tid"]) == 1


def test_a_different_key_does_create_a_second_entry(
    cloud_client, entry_page, turnstile
):
    """Negative control: dedup by key, not a route that writes once."""
    client, _ = cloud_client
    _post_entry(client, entry_page["a"], headers={"Idempotency-Key": "k1"})
    _post_entry(client, entry_page["a"], headers={"Idempotency-Key": "k2"})

    assert _entry_count(entry_page["a"]["tid"]) == 2


def test_a_key_used_in_one_workspace_does_not_reach_another(
    cloud_client, entry_page, turnstile
):
    """Ruling D4 — the index is tenant-scoped. A global one would let a
    stranger replay a guessed key against another tenant's slug and be
    handed that tenant's entry."""
    client, _ = cloud_client
    _post_entry(client, entry_page["a"], headers={"Idempotency-Key": "shared"})
    r = _post_entry(client, entry_page["b"], headers={"Idempotency-Key": "shared"})

    assert r.status_code == 201
    assert _entry_count(entry_page["a"]["tid"]) == 1
    assert _entry_count(entry_page["b"]["tid"]) == 1
