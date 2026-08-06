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
# Nothing here exposes workspace data. The two token routes are capability
# URLs: the token IS the credential, it is 192-bit and rotatable, and the
# payload behind it is a strict projection.
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
}

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

    These four are the only anonymous data plane. Their guard is the token, so
    the guard is worth asserting rather than assuming.
    """
    client, _ = cloud_client
    for method, path in sorted(
        k for k in PUBLIC_BY_DESIGN if k[1].startswith("/display/")
    ):
        r = client.request(method, _concrete(path))
        assert r.status_code == 404, f"{method} {path} answered {r.status_code}"
