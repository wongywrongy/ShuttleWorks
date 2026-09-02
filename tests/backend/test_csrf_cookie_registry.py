"""CSRF covers **every** session cookie — and a registry keeps it that way.

SP-E1-2 Phase B, task B2 (ruling D-A3; the trap is named in spec Q13 §2).

The middleware in ``core/main.py`` decides whether a write is
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

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"

_BACKEND = Path(__file__).resolve().parents[2] / "apps" / "api" / "src"

# **Every directory where a cookie can be set, not every directory where one
# happened to be set when this guard was written.** The scan covered ``api/``
# alone until SP-PROGRAM-1 Phase 6 put a real ``set_cookie`` in
# ``core/form_csrf.py``, where the glob never looked. (Ruling R8-D has since
# moved that mint to the SSR tier and deleted the function, so ``app/`` is
# clean again — the widened scan stays, because the lesson was about the
# unasked question, not about the one file that raised it.) That
# is the same failure mode as the one-hard-wired-cookie-name defect this whole
# file exists about: not a wrong answer, an unasked question. A cookie set from
# a directory outside this list is invisible to the gate, so adding a layer
# that sets cookies means adding it here.
# Every domain package plus the kernel: SP-REORG-1 Phase 3 replaced the
# flat api/ + app/ split with one package per domain, so the scan follows.
_SCANNED_DIRS = tuple(
    _BACKEND / name
    for name in (
        "core", "workspaces", "identity", "meet", "bracket",
        "operations", "display", "entries", "solve_rail", "ops", "sync",
    )
)

# Cookies that are deliberately NOT credentials — a locale or theme
# preference, say. An addition here is a claim that the cookie cannot
# authenticate anything. Kept as an explicit escape hatch so a future
# non-session cookie is a reviewed edit rather than a reason to weaken the
# assertion below.
#
# ``sw_play_csrf`` (SP-PROGRAM-1 Phase 6, R8-B) is the pre-session
# double-submit nonce minted by the SSR tier (R8-D,
# ``entrant/app/lib/formCsrf.server.ts``) and verified against
# ``core/form_csrf.py::PLAY_CSRF_COOKIE``. It
# is a random value handed to an *anonymous* visitor so that a login or
# signup form has something unreadable to derive a token from; it names no
# principal and grants no access. Registering it would be actively wrong,
# not merely redundant: the registry is the CSRF middleware's trigger for
# "this write is cookie-authenticated", so it would make the middleware
# demand a header from callers who have not signed in.
# ``tests/unit/test_form_csrf.py::test_the_nonce_cookie_authenticates_nothing``
# pins that exclusion from the other side.
_NON_SESSION_COOKIES: set[str] = {"sw_play_csrf"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


# ---- 1. Behaviour ------------------------------------------------------


def test_the_entrant_cookie_is_inside_csrf_enforcement(client):
    """The headline: a write carrying the entrant session cookie needs the
    custom header, exactly as an operator write does."""
    from core.config import settings

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
    from core.config import settings

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
    from core.config import settings

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


def _module_constants(tree: ast.Module) -> dict[str, str]:
    """The module's top-level ``NAME = "literal"`` bindings.

    ``core/form_csrf.py`` sets its cookie as ``key=PLAY_CSRF_COOKIE`` — a
    named constant, because the middleware and the pages read the same name
    and a literal repeated three times is how they drift apart. The guard
    resolves that from the module's own source rather than importing it, so
    a cookie name is still checkable without the scan having to execute the
    code it is auditing.
    """
    constants: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        value = node.value
        if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Name):
                constants[target.id] = value.value
    return constants


def _cookie_key_expressions() -> list[tuple[str, int, ast.AST, dict[str, str]]]:
    """Every ``key=`` argument of every ``*.set_cookie(...)`` under the
    scanned directories, with the constants of the file it was found in."""
    found: list[tuple[str, int, ast.AST, dict[str, str]]] = []
    for directory in _SCANNED_DIRS:
        for path in sorted(directory.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            constants = _module_constants(tree)
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
                assert key is not None, (
                    f"{path.name}:{node.lineno} set_cookie with no key"
                )
                label = f"{path.parent.name}/{path.name}"
                found.append((label, node.lineno, key, constants))
    return found


def _resolve(expr: ast.AST, constants: dict[str, str] | None = None) -> str:
    """The cookie name an expression denotes, as a string.

    Handles the three shapes the codebase uses: a literal, an attribute read
    off ``settings``, and a module-level string constant of the file the call
    was found in. Anything else is refused loudly rather than guessed at — a
    computed cookie name is a thing this guard genuinely cannot check, and
    silently skipping it would make the guard a decoration.
    """
    from core.config import settings

    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return expr.value
    if (
        isinstance(expr, ast.Attribute)
        and isinstance(expr.value, ast.Name)
        and expr.value.id == "settings"
    ):
        return getattr(settings, expr.attr)
    if isinstance(expr, ast.Name) and expr.id in (constants or {}):
        return (constants or {})[expr.id]
    raise AssertionError(
        "set_cookie(key=…) must be a literal, a settings attribute or a "
        "module-level string constant so the registry guard can check it; got "
        f"{ast.dump(expr)}"
    )


def test_every_api_set_cookie_names_a_registered_session_cookie():
    """The structural gate. A new cookie that authenticates a request and is
    not in ``settings.session_cookie_names`` fails here, by file and line."""
    from core.config import settings

    registry = set(settings.session_cookie_names) | _NON_SESSION_COOKIES
    calls = _cookie_key_expressions()
    assert calls, "found no set_cookie calls at all — the scan is broken"

    strays = [
        f"{name}:{line} sets {_resolve(expr, constants)!r}"
        for name, line, expr, constants in calls
        if _resolve(expr, constants) not in registry
    ]

    assert not strays, (
        "These cookies are set by the backend but are not in "
        "settings.session_cookie_names, so the CSRF middleware will not "
        "treat writes carrying them as cookie-authenticated:\n  "
        + "\n  ".join(strays)
    )


def test_the_scan_reaches_every_directory_that_sets_a_cookie():
    """**The control on the scan's own reach**, which is the part that
    silently rots. A guard that globs one directory answers "no strays" just
    as confidently about a directory it never opened, and Phase 6 put a real
    ``set_cookie`` in ``app/`` — so pin that both layers are actually seen.

    Named by file rather than counted, because a count passes for the wrong
    reason the moment a call moves between the two directories.

    **``app/`` currently has no ``set_cookie`` at all, and this test is
    honestly weaker for it.** Ruling R8-D moved the one ``set_cookie`` in
    ``app/`` to the SSR tier and deleted the dead function that held it, so
    there is no live call site outside ``api/`` left to point at. The
    previous version of this test papered over that by asserting
    ``_BACKEND / "core" in _SCANNED_DIRS`` — a module constant compared to
    itself, three lines below its own definition, reddened by no mutation
    except editing that constant in this same file. A green tautology reads
    as coverage the scan does not have, which is the failure this whole file
    exists to argue against, so it is gone rather than kept for the colour.

    What remains is real: the two ``api/`` files below are live call sites,
    and if the scan stops reaching them this fails. What is NOT covered, and
    is written down instead of quietly accepted: a cookie set from ``app/``
    or from some third directory is caught only by whoever remembers to add
    that directory to ``_SCANNED_DIRS``. Restoring real reach means a real
    ``set_cookie`` outside ``api/`` to name here.
    """
    seen = {name for name, _line, _expr, _constants in _cookie_key_expressions()}

    assert "identity/auth_routes.py" in seen
    assert "identity/entrants_routes.py" in seen
    assert "sync/routes.py" in seen


def test_the_registry_names_all_principals():
    from core.config import settings

    assert settings.session_cookie_names == (
        "sw_session",
        "sw_play_session",
        "sw_offline_operator",
    )


def test_the_pre_session_nonce_is_carved_out_and_not_registered():
    """The carve-out, stated as an assertion rather than as a comment.

    Three claims, and all three matter: present in ``_NON_SESSION_COOKIES``
    (so the structural gate above passes it on purpose rather than by not
    looking), absent from ``session_cookie_names`` (so nothing ever reads it
    as a credential), and present in ``csrf_relevant_cookie_names`` (so the
    exclusion is a carve-out and not a hole — the pre-session login post is
    still measured by the CSRF check).
    """
    from core.config import settings

    assert "sw_play_csrf" in _NON_SESSION_COOKIES
    assert "sw_play_csrf" not in settings.session_cookie_names
    assert "sw_play_csrf" in settings.csrf_relevant_cookie_names


# ---- 3. Zero exemptions, and the two channels that replaced the one ----
#
# SP-E1-2 Phase C carved a single route out of the header check: ``POST
# /e/{slug}/submit``, because it was a native HTML form post on a page with
# ``script-src 'none'`` and a form cannot attach a custom header — the same
# property this whole defense rests on, seen from the other side.
# SP-PROGRAM-1 Phase 6 **deleted the exemption rather than narrowing or
# renaming it** (ruling R8-B). The route it named ceases to exist, and the
# proof it substituted — a double-submit token derived from a cookie the
# attacker's page can make the browser send but never read — was promoted
# out of the route into a second enumerated channel the middleware checks
# itself (``core/form_csrf.form_csrf_proves``).
#
# The difference is the whole point. A path-based exemption is a list that
# grows, and every entry on it is a route the middleware does not look at.
# Two enumerated channels are a rule: every cookie-carrying write proves
# itself, by header or by token, and there is no third answer.
#
# So the assertion inverts from "the exemption matches one route shape" to
# "there are no path-based exemptions at all", derived from the source —
# because a regex that is deleted and later re-added under another name
# would pass any behavioural test written against today's routes.


def test_the_app_declares_zero_path_based_csrf_exemptions():
    """**The inverted control.** Derived from ``core/main.py``'s source:
    the CSRF middleware may not skip a write because of its path.

    Break it to prove it is not vacuous: re-add
    ``_SOMETHING = re.compile(r"^/e/[^/]+/submit$")`` at module scope in
    ``core/main.py`` and this fails by line.
    """
    import ast
    import inspect

    from core import main as app_main

    source = inspect.getsource(app_main)
    tree = ast.parse(source)

    # Any module-level name bound to a compiled pattern is a path list by
    # construction — there is no other reason for one to live here.
    patterns = [
        f"line {node.lineno}: {node.targets[0].id}"
        for node in tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr == "compile"
    ]
    assert not patterns, (
        "core/main.py declares path patterns next to the CSRF middleware. "
        "Phase 6 deleted the last path-based exemption; a write proves "
        "itself by header or by cookie-derived token, never by URL:\n  "
        + "\n  ".join(patterns)
    )
    assert "_FORM_CSRF_ROUTES" not in source


def test_a_cookie_carrying_write_with_no_proof_at_all_is_still_refused(client):
    """The behavioural half, on the route that replaced the exempt one.

    A cookie-carrying POST with neither the header nor the form token is
    refused. It is now the *middleware* that refuses it rather than the
    route, which is what deleting the exemption bought.
    """
    from core.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post("/e/api/submit/some-slug", data={"playerName": "Alice"})

    assert r.status_code in (401, 403, 404)
    assert r.status_code != 303


def test_the_retired_html_routes_are_gone(client):
    """The cut-over, asserted where route registration is actually visible.

    Newer FastAPI keeps each ``include_router`` as a nested
    ``_IncludedRouter`` rather than flattening onto ``app.routes``, so the
    OpenAPI document is the assertion surface (CLAUDE.md, known hazards).
    """
    from core.main import app

    paths = app.openapi()["paths"]
    assert "/e/{slug}" not in paths
    assert "/e/{slug}/submit" not in paths
    # Negative control: the surface that replaced them is registered.
    assert "get" in paths["/e/api/page/{slug}"]
    assert "post" in paths["/e/api/submit/{slug}"]


def test_every_other_cookie_carrying_write_is_still_covered(client):
    """Negative control: a write with no proof at all is refused wherever it
    lands, not only on the entrant surface."""
    from core.config import settings

    client.cookies.clear()
    client.cookies.set(settings.entrant_session_cookie_name, "an-entrant-token")

    r = client.post(
        "/auth/register", json={"email": "someone@example.com", "password": GOOD_PW}
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "AUTH_CSRF_REQUIRED"
