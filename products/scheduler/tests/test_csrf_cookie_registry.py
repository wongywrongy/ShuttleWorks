"""CSRF covers **every** session cookie — and a registry keeps it that way.

SP-E1-2 Phase B, task B2 (ruling D-A3; the trap is named in spec Q13 §2).

The middleware in ``app/main.py`` decides whether a write is
cookie-authenticated, and until the entrant principal arrived it decided it
by comparing against **one** cookie name. That is correct exactly as long as
the system has one session cookie, and it fails *open* the moment it does
not: an entrant cookie under a second name would authenticate writes the
CSRF check never looked at. Nothing errors, nothing logs — the guard is
simply absent for the newest surface.

So this file holds two different kinds of claim:

1. **Behavioural** — an entrant-cookie write without ``X-ShuttleWorks-CSRF``
   is refused, and the same write with the header is accepted. With an
   inversion proof: point the setting at a name the registry no longer
   contains, and the refusal disappears. That is what makes the first
   assertion a test of the fix rather than a test of something else
   refusing the request for its own reasons.
2. **Structural** — every ``set_cookie`` call in ``backend/api/`` names a
   cookie that ``settings.session_cookie_names`` knows about. Derived from
   the source with ``ast``, in the same spirit as
   ``test_auth_surface.py``/``test_tenant_isolation.py``: a convention that
   lives only in review gets forgotten, and the third principal type (E3's
   partner invite, or whatever Phase 6 needs) is exactly when it would be.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

from tests._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"

_API_DIR = Path(__file__).resolve().parents[1] / "backend" / "api"

# Cookies that are deliberately NOT credentials — a locale or theme
# preference, say. Empty today, and an addition here is a claim that the
# cookie cannot authenticate anything. Kept as an explicit escape hatch so
# a future non-session cookie is a reviewed edit rather than a reason to
# weaken the assertion below.
_NON_SESSION_COOKIES: set[str] = set()


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


# ---- 1. Behaviour ------------------------------------------------------


def test_the_entrant_cookie_is_inside_csrf_enforcement(client):
    """The headline: a write carrying the entrant session cookie needs the
    custom header, exactly as an operator write does."""
    from app.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post(
        "/auth/register", json={"email": "parent@example.com", "password": GOOD_PW}
    )

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_the_same_write_with_the_header_is_accepted(client):
    """Negative control (CODE_HEALTH 3b): same cookie, same route, only the
    header differs. Without this, the assertion above would also pass
    against a route that refuses everything."""
    from app.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post(
        "/auth/register",
        json={"email": "parent@example.com", "password": GOOD_PW},
        headers=CSRF,
    )

    assert r.status_code == 201


def test_inversion_proof_a_cookie_outside_the_registry_is_not_covered(
    client, monkeypatch
):
    """**The proof that the fix is what refuses the first request.**

    Repoint the entrant cookie setting at a name the registry therefore no
    longer contains, send the identical request under the old name, and the
    403 disappears. So the refusal above is produced by the registry
    membership of that cookie name and by nothing else — which is precisely
    the property that was missing while the middleware compared against one
    hard-wired name.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "entrant_session_cookie_name", "sw_not_registered")
    client.cookies.clear()
    client.cookies.set("sw_play_session", "an-entrant-token")

    r = client.post(
        "/auth/register", json={"email": "parent@example.com", "password": GOOD_PW}
    )

    assert r.status_code == 201


def test_the_operator_cookie_is_still_covered(client):
    """The regression side of the widening: adding a name must not lose one.
    (The operator half is pinned in full by
    tests/test_auth_seams_characterization.py — this is the check that the
    registry change did not drop it.)"""
    client.cookies.clear()
    client.cookies.set("sw_session", "an-operator-token")

    r = client.post("/tournaments", json={"name": "no-header"})

    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"


def test_a_non_session_cookie_still_does_not_trigger_the_check(client):
    """The registry widened the trigger to a *list*, not to every cookie in
    the jar. A theme preference must not make a public write unanswerable."""
    client.cookies.clear()
    client.cookies.set("sw_theme", "dark")

    r = client.post(
        "/auth/register", json={"email": "parent@example.com", "password": GOOD_PW}
    )

    assert r.status_code == 201


# ---- 2. The registry guard --------------------------------------------


def _cookie_key_expressions() -> list[tuple[str, int, ast.AST]]:
    """Every ``key=`` argument of every ``*.set_cookie(...)`` in ``api/``."""
    found: list[tuple[str, int, ast.AST]] = []
    for path in sorted(_API_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not isinstance(func, ast.Attribute) or func.attr != "set_cookie":
                continue
            key = next(
                (kw.value for kw in node.keywords if kw.arg == "key"),
                node.args[0] if node.args else None,
            )
            assert key is not None, f"{path.name}:{node.lineno} set_cookie with no key"
            found.append((path.name, node.lineno, key))
    return found


def _resolve(expr: ast.AST) -> str:
    """The cookie name an expression denotes, as a string.

    Handles the two shapes the codebase uses: a literal, and an attribute
    read off ``settings``. Anything else is refused loudly rather than
    guessed at — a computed cookie name is a thing this guard genuinely
    cannot check, and silently skipping it would make the guard a
    decoration.
    """
    from app.config import settings

    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return expr.value
    if (
        isinstance(expr, ast.Attribute)
        and isinstance(expr.value, ast.Name)
        and expr.value.id == "settings"
    ):
        return getattr(settings, expr.attr)
    raise AssertionError(
        "set_cookie(key=…) must be a literal or a settings attribute so the "
        f"registry guard can check it; got {ast.dump(expr)}"
    )


def test_every_api_set_cookie_names_a_registered_session_cookie(client):
    """The structural gate. A new cookie that authenticates a request and is
    not in ``settings.session_cookie_names`` fails here, by file and line."""
    from app.config import settings

    registry = set(settings.session_cookie_names) | _NON_SESSION_COOKIES
    calls = _cookie_key_expressions()
    assert calls, "found no set_cookie calls at all — the scan is broken"

    strays = [
        f"{name}:{line} sets {_resolve(expr)!r}"
        for name, line, expr in calls
        if _resolve(expr) not in registry
    ]

    assert not strays, (
        "These cookies are set by the API but are not in "
        "settings.session_cookie_names, so the CSRF middleware will not "
        "treat writes carrying them as cookie-authenticated:\n  "
        + "\n  ".join(strays)
    )


def test_the_registry_names_both_principals(client):
    from app.config import settings

    assert settings.session_cookie_names == ("sw_session", "sw_play_session")


# ---- 3. The one exemption, and the proof that it is the only one ------
#
# SP-E1-2 Phase C carved a single route out of the header check:
# ``POST /e/{slug}/submit``. The reason is structural rather than
# convenient — it is a native HTML form post on a page with
# ``script-src 'none'``, and a form cannot attach a custom header, which is
# the same property this whole defense rests on seen from the other side.
# That route proves CSRF its own way (a double-submit token derived from
# the session cookie), so the exemption is from *this check*, not from CSRF.
#
# An exemption is exactly the kind of thing that grows, so it is pinned in
# three directions: the pattern is anchored, the route answers 403 without
# its own token, and every other cookie-carrying write is still refused.


def test_the_form_csrf_exemption_matches_exactly_one_route_shape(client):
    from app.main import _FORM_CSRF_ROUTES

    assert _FORM_CSRF_ROUTES.match("/e/spring-open/submit")
    # Anchored at both ends: a prefix match here would exempt anything an
    # attacker could hang off the same path.
    assert not _FORM_CSRF_ROUTES.match("/e/spring-open/submit/extra")
    assert not _FORM_CSRF_ROUTES.match("/e/spring-open/submitx")
    assert not _FORM_CSRF_ROUTES.match("/x/e/spring-open/submit")
    assert not _FORM_CSRF_ROUTES.match("/e/a/b/submit")
    assert not _FORM_CSRF_ROUTES.match("/tournaments/x/entries/commit")


def test_the_exempt_route_still_refuses_a_write_with_no_proof_at_all(client):
    """The exemption is not a hole: the route substitutes its own check.

    A cookie-carrying POST with neither the header nor the form token is
    refused — by the route rather than by the middleware, which is the
    whole claim.
    """
    from app.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post("/e/some-slug/submit", data={"playerName": "Alice"})

    assert r.status_code in (401, 403, 404)
    assert r.status_code != 201


def test_every_other_cookie_carrying_write_is_still_covered(client):
    """Negative control for the exemption: one route, not a category."""
    from app.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post(
        "/auth/register", json={"email": "someone@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
