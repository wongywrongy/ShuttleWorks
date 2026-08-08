"""The cookie-derived double-submit token, as a unit.

SP-PROGRAM-1 Phase 6 (ruling R8-B). ``_form_csrf`` was a private helper of
``api/entries_public.py`` and every assertion about it reached it through a
rendered page, which is not coverage of the primitive — it is coverage of
the page that happened to call it. Phase 6 promotes it into
``app/form_csrf.py`` because the CSRF middleware has to call it too, so it
gets characterized first (CODE_HEALTH 11): the digests below are the
incumbent's actual output, captured before the move, so a move that
changed the derivation fails on an equality rather than on a route
behaving differently three files away.

The second half of the file covers the pre-session nonce cookie
``sw_play_csrf``, which stands in as a secret when a login, signup or
server-rendered entry form has no session to derive one from. **Only the
half the backend still owns is here.** Ruling R8-D moved the *minting* to
the SSR tier, so the cookie's own properties (unreadable to script,
unguessable, four-hour life) are asserted in
``entrant/tests/formCsrf.server.test.ts``, against the code that runs; what
remains below is the cookie's NAME, the two registries that decide when a
token is demanded, and a control that the backend does not start minting it
again.
"""
from __future__ import annotations

# Captured from api/entries_public._form_csrf before the promotion.
# sha256("sw-play-form-csrf:" + token).hexdigest()
_GOLDEN = {
    "tok-123": "a7ce0306886041690f40c7c52244e594ceda3785f5db849bb25f7cdc36f4276e",
    "another-token": "fc255256ce5cbc9b3d601d7060efbd28cf76c1edc6c12cf17072edf940b87980",
    "a-secret-nonce": "88498cc8b4bf91ae5536fe708e5ce8d40190759445727b249b8ce4e506ec5881",
}


# ---- 1. The promoted derivation ---------------------------------------


def test_the_promoted_token_matches_the_captured_digests():
    from app.form_csrf import form_csrf_token

    for token, digest in _GOLDEN.items():
        assert form_csrf_token(token) == digest


def test_an_absent_session_yields_an_empty_token():
    """The pre-session gap, pinned as behaviour rather than as prose: with
    no secret the function returns ``""``, which the callers must treat as
    "no proof available" and never as "proof matched"."""
    from app.form_csrf import form_csrf_token

    assert form_csrf_token(None) == ""
    assert form_csrf_token("") == ""


def test_two_different_sessions_do_not_share_a_token():
    from app.form_csrf import form_csrf_token

    assert form_csrf_token("tok-123") != form_csrf_token("tok-124")


def test_the_route_helper_is_now_the_promoted_function():
    """The incumbent name survives as an alias, so the submit route and the
    ~90 tests in test_entries_public_routes.py are untouched by the move."""
    from api.entries_public import _form_csrf
    from app.form_csrf import form_csrf_token

    assert _form_csrf is form_csrf_token


def test_there_is_exactly_one_derivation_in_the_backend():
    """**The point of the module.** A second sha256 of the domain separator
    anywhere else is the failure this file exists to prevent: two
    derivations drift, and the one that drifts is the one the middleware
    trusts. Derived from the source rather than asserted in review, in the
    spirit of tests/test_csrf_cookie_registry.py's structural half.
    """
    from pathlib import Path

    backend = Path(__file__).resolve().parents[2] / "backend"
    owner = backend / "app" / "form_csrf.py"

    offenders = [
        str(path.relative_to(backend))
        for path in backend.rglob("*.py")
        if path != owner and "sw-play-form-csrf:" in path.read_text(encoding="utf-8")
    ]

    assert not offenders, (
        "The form CSRF domain separator appears outside app/form_csrf.py, "
        "which means there is a second derivation of the token: " + ", ".join(offenders)
    )


def test_the_form_field_name_is_the_one_the_page_emits():
    from app.form_csrf import FORM_FIELD

    assert FORM_FIELD == "_csrf"


# ---- 2. The pre-session nonce cookie ----------------------------------
#
# **The minting half of this file is gone, and that is the point.** It used
# to cover ``issue_play_csrf`` - httponly, entropy, max-age, secure,
# last-issuance-wins - seven properties of a function with **zero production
# call sites**. Nothing ever called it, while ``ViewerDTO``'s docstring
# asserted that "the SSR tier mints" the nonce. Seven green tests over a
# mechanism that never ran is how the empty-``_csrf`` defect reached a
# cutover review.
#
# Ruling R8-D put the mint where the pages are: the React Router loader, in
# ``entrant/app/lib/formCsrf.server.ts``, which sets the cookie on the SSR
# document response. Those seven properties moved with it and are asserted
# against the code that actually runs, in
# ``entrant/tests/formCsrf.server.test.ts``.
#
# What the backend still owns - and what stays covered here and in
# ``tests/test_form_csrf_channel.py`` - is verification: the derivation
# above, the cookie NAME, and the two registries that decide when a token is
# demanded. The cross-tier pin against the TypeScript derivation lives in
# ``tests/unit/test_form_csrf_cross_tier.py``.


def test_the_nonce_cookie_authenticates_nothing():
    """**Negative control, and the one global constraint on this task.**

    ``sw_play_csrf`` must stay OUT of ``settings.session_cookie_names``.
    That registry is the CSRF middleware's trigger - put a cookie in it and
    every write carrying it is treated as cookie-authenticated. This cookie
    is handed to *anonymous* visitors on a page render, so registering it
    would make the middleware demand a header from callers who have not
    signed in, and, worse, would dress a value that identifies nobody as a
    credential. Add it to the registry and this fails.
    """
    from app.config import settings
    from app.form_csrf import PLAY_CSRF_COOKIE

    assert PLAY_CSRF_COOKIE == "sw_play_csrf"
    assert PLAY_CSRF_COOKIE not in settings.session_cookie_names


def test_the_nonce_is_nevertheless_inside_the_csrf_trigger():
    """**The other half of the carve-out, and the half that closes the gap.**

    Keeping the nonce out of ``session_cookie_names`` is only safe because a
    second, wider registry exists: ``csrf_relevant_cookie_names`` answers
    "must this write prove it was sent deliberately", which is a strictly
    wider question than "does this request carry a credential". A login post
    carries no identity at all and still has to present a matching token.

    Without this list the exclusion above would not be a carve-out, it would
    be a hole: the one write with no session behind it - login, signup -
    would trigger no CSRF check on either channel.
    """
    from app.config import settings
    from app.form_csrf import PLAY_CSRF_COOKIE

    assert PLAY_CSRF_COOKIE in settings.csrf_relevant_cookie_names
    for name in settings.session_cookie_names:
        assert name in settings.csrf_relevant_cookie_names


def test_the_trigger_list_is_the_registry_plus_the_nonce_and_nothing_else():
    """Exact, not a superset check. A widened trigger that quietly grew a
    third name would make the middleware demand a header from callers
    holding some unrelated cookie - the failure mode
    ``test_a_non_session_cookie_still_does_not_trigger_the_check`` guards
    behaviourally, pinned here at the definition.
    """
    from app.config import settings
    from app.form_csrf import PLAY_CSRF_COOKIE

    assert settings.csrf_relevant_cookie_names == (
        *settings.session_cookie_names,
        PLAY_CSRF_COOKIE,
    )


def test_the_backend_no_longer_mints_the_nonce_itself():
    """**The dead-code decision, pinned so it cannot quietly come back.**

    Exactly one tier may set ``sw_play_csrf``. Two minters means two sets of
    cookie attributes and a last-writer-wins race between them, and the tier
    that lost would be handing out forms whose token no longer matches the
    cookie - a refusal an entrant reads as "this site is broken".

    Node mints (R8-D); the backend verifies. Re-adding an ``issue_play_csrf``
    - or any other ``set_cookie`` of this name in the backend - turns this
    red, and whoever does it has to argue with the paragraph above rather
    than discover the race in production.
    """
    import ast
    from pathlib import Path

    # AST, not a substring pair: ``config.py`` legitimately says both
    # "set_cookie" and "sw_play_csrf" in prose, and a guard that a docstring
    # can trip is a guard someone eventually silences.
    backend = Path(__file__).resolve().parents[2] / "backend"
    offenders = []
    for path in backend.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "set_cookie" not in source:
            continue
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not (isinstance(func, ast.Attribute) and func.attr == "set_cookie"):
                continue
            segment = ast.get_source_segment(source, node) or ""
            if "PLAY_CSRF_COOKIE" in segment or "sw_play_csrf" in segment:
                offenders.append(f"{path.relative_to(backend)}:{node.lineno}")

    assert not offenders, (
        "The backend sets the sw_play_csrf cookie again: " + ", ".join(offenders)
    )


def test_the_trigger_list_reads_the_cookie_name_from_its_owner():
    """No second literal. ``PLAY_CSRF_COOKIE`` is the module constant the
    verification path actually uses and the registry guard resolves from
    source; if the trigger list carried its own copy of ``"sw_play_csrf"``
    the two could drift, and the drifted one would be the list the
    middleware trusts while the cookie went out under the other name.
    """
    import ast
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "backend" / "app" / "config.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    # Docstrings are excluded on purpose: naming the cookie in prose is how
    # the decision stays legible, and it is the *value* being restated in
    # code that creates the second source of truth.
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(
            node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        )
        and node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
        and isinstance(node.body[0].value.value, str)
    }

    literals = [
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and node.value == "sw_play_csrf"
        and id(node) not in docstrings
    ]

    assert not literals, (
        f"config.py carries its own copy of the nonce cookie name at line(s) "
        f"{literals}; it must read app.form_csrf.PLAY_CSRF_COOKIE instead"
    )
