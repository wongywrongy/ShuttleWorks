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

The second half of the file covers ``issue_play_csrf``, which did not
exist before: the promoted token needs a secret, and a login or signup
post happens *before* there is a session to derive one from. That gap is
filled by a non-authenticating nonce cookie, and the properties that make
it safe (unreadable to script, unguessable, and outside the session-cookie
registry) are pinned here with negative controls rather than described in
prose.
"""
from __future__ import annotations

from http.cookies import SimpleCookie

from fastapi import Response

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


def _set_cookie(response: Response) -> SimpleCookie:
    jar = SimpleCookie()
    for header, value in response.raw_headers:
        if header.decode().lower() == "set-cookie":
            jar.load(value.decode())
    return jar


def test_issuing_a_play_csrf_returns_the_token_for_the_cookie_it_set():
    """The contract in one line: the caller embeds the return value in the
    form, the browser holds the cookie, and the middleware re-derives one
    from the other. If these two ever stop agreeing, every unhydrated login
    post is refused."""
    from app.form_csrf import PLAY_CSRF_COOKIE, form_csrf_token, issue_play_csrf

    response = Response()
    token = issue_play_csrf(response)

    nonce = _set_cookie(response)[PLAY_CSRF_COOKIE].value
    assert token == form_csrf_token(nonce)
    assert token  # not the empty "no proof available" value


def test_the_nonce_cookie_is_httponly():
    """**Negative control.** The whole double-submit argument is that the
    attacker's page can make the browser *send* the cookie but can never
    *read* it. Drop ``httponly`` and a cross-site script on any page that
    can reach this origin reads the nonce and computes the token, so the
    token proves nothing. This assertion fails the moment that flag goes."""
    from app.form_csrf import PLAY_CSRF_COOKIE, issue_play_csrf

    response = Response()
    issue_play_csrf(response)

    morsel = _set_cookie(response)[PLAY_CSRF_COOKIE]
    assert morsel["httponly"]
    assert morsel["samesite"].lower() == "lax"
    assert morsel["path"] == "/"


def test_the_nonce_is_unguessable_and_fresh_per_issue():
    """A predictable nonce is a token anyone can compute at home. Two issues
    must not collide, and the value must carry real entropy — a counter or a
    timestamp would satisfy "different" and fail this."""
    from app.form_csrf import PLAY_CSRF_COOKIE, issue_play_csrf

    nonces = set()
    for _ in range(25):
        response = Response()
        issue_play_csrf(response)
        nonces.add(_set_cookie(response)[PLAY_CSRF_COOKIE].value)

    assert len(nonces) == 25
    # 32 bytes through ``token_urlsafe`` is 43 characters. Asserted at the
    # real width rather than a round ">= 32": 32 *characters* is what
    # ``token_urlsafe(24)`` produces, so the loose bound would have let the
    # entropy be quietly cut by a quarter and still passed.
    assert all(len(nonce) >= 43 for nonce in nonces)


def test_the_nonce_cookie_expires_after_four_hours():
    """The form's lifetime, pinned because it is a judgement call rather
    than a derived value: long enough to be interrupted mid-signup and come
    back, short enough that a nonce left in a shared club laptop is not
    reusable all week. Changing it should be a visible act."""
    from app.form_csrf import PLAY_CSRF_COOKIE, issue_play_csrf

    response = Response()
    issue_play_csrf(response)

    assert _set_cookie(response)[PLAY_CSRF_COOKIE]["max-age"] == str(4 * 60 * 60)


def test_a_second_issuance_invalidates_the_first_tab_s_token():
    """**The multi-tab consequence, pinned as an accepted decision.**

    The cookie is set at ``path="/"``, so issuing a second one overwrites
    the first for the whole origin: a user who opens login in a second tab
    finds the first tab's embedded token no longer matches the cookie, and
    submitting it is refused with "This form has expired. Reload the entry
    page and try again."

    That is deliberate — the alternative is several live nonces with an
    eviction policy, which is a server-side token store in everything but
    name. This test exists so the behaviour is inherited knowledge for the
    pages built in Tasks 8-12 and 19-21 rather than a surprise bug report,
    and so that anyone who decides to *change* it changes a red test rather
    than discovering the reasoning afterwards. The full argument is in
    ``issue_play_csrf``'s docstring.
    """
    from app.form_csrf import PLAY_CSRF_COOKIE, form_csrf_token, issue_play_csrf

    first_tab = Response()
    first_token = issue_play_csrf(first_tab)

    second_tab = Response()
    second_token = issue_play_csrf(second_tab)
    live_nonce = _set_cookie(second_tab)[PLAY_CSRF_COOKIE].value

    # The browser now holds only the second nonce, and the first tab's form
    # still carries the first token.
    assert form_csrf_token(live_nonce) == second_token
    assert form_csrf_token(live_nonce) != first_token

    # And the overwrite is total, not scoped to a path — which is the
    # mechanism that makes it happen at all.
    assert _set_cookie(first_tab)[PLAY_CSRF_COOKIE]["path"] == "/"
    assert _set_cookie(second_tab)[PLAY_CSRF_COOKIE]["path"] == "/"


def test_the_nonce_cookie_follows_the_deployment_secure_flag():
    """It rides the same setting as the session cookies rather than a
    hard-wired ``False``: the cloud profile refuses to start without
    ``SESSION_COOKIE_SECURE=true``, and a nonce cookie that leaked over
    plain HTTP while the session cookie did not would be the weakest link
    in the pair."""
    from app.config import settings
    from app.form_csrf import PLAY_CSRF_COOKIE, issue_play_csrf

    original = settings.session_cookie_secure
    try:
        settings.session_cookie_secure = True
        response = Response()
        issue_play_csrf(response)
        assert _set_cookie(response)[PLAY_CSRF_COOKIE]["secure"]

        settings.session_cookie_secure = False
        response = Response()
        issue_play_csrf(response)
        assert not _set_cookie(response)[PLAY_CSRF_COOKIE]["secure"]
    finally:
        settings.session_cookie_secure = original


def test_the_nonce_cookie_authenticates_nothing():
    """**Negative control, and the one global constraint on this task.**

    ``sw_play_csrf`` must stay OUT of ``settings.session_cookie_names``.
    That registry is the CSRF middleware's trigger — put a cookie in it and
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
