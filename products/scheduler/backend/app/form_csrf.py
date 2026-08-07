"""The cookie-derived double-submit CSRF token (SP-PROGRAM-1 Phase 6, R8-B).

**Why this is a module and not a route helper.** It was one — a private
function of ``api/entries_public.py`` serving one route, exempted from the
custom-header check by a path regex in ``app/main.py``. Phase 6 turns the
token into a **second enumerated proof channel** of the middleware itself,
which means the middleware has to be able to call this, and it must not
import a route module to do it. A path-based escape hatch that only one
file can honour becomes a channel every write is measured against;
promoting the function is what makes deleting that exemption possible
later. (It is still in place — the FastAPI-rendered route it names does
not retire until the Phase 6 cutover.)

**What the token proves.** The app's primary CSRF defense is the custom
request header ``X-ShuttleWorks-CSRF``, which a cross-site page cannot
attach without a preflight we do not approve. A native ``<form
method=post>`` cannot attach it either — that is the same property seen
from the other side — so an unhydrated entrant form would be refused the
moment it carried a session cookie. The form instead carries a digest of a
cookie the attacker's page can make the browser *send* but can never
*read*. Comparison is constant time at the call site
(``secrets.compare_digest``).

Stateless on purpose: no server-side token store, and the session-derived
token is invalidated by logging out because it is a function of the
session token.
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Optional

from fastapi import Response

from app.config import settings

# Domain separator. Any constant works; naming it means the digest can
# never collide with another sha256 of the same session token computed
# somewhere else for another purpose. Moved verbatim from
# ``api/entries_public.py`` — changing the string invalidates every form
# a browser currently holds, so it is a deliberate act, not a rename.
_FORM_CSRF_PREFIX = "sw-play-form-csrf:"

# The hidden input's name. One constant, read by the renderer and by the
# middleware, so the two cannot drift.
FORM_FIELD = "_csrf"

# The pre-session nonce cookie. **Deliberately absent from
# ``settings.session_cookie_names``** — see ``issue_play_csrf``.
PLAY_CSRF_COOKIE = "sw_play_csrf"

# Bytes of entropy behind the nonce, matching the session token's own
# minting. It only has to survive the life of one open form, but there is
# no cost to it being unguessable for longer than that.
_PLAY_CSRF_BYTES = 32

# How long an unsubmitted login/signup form stays valid. Long enough that
# someone can be interrupted mid-form and come back to it; short enough
# that a nonce left in a shared browser is not indefinitely reusable. On
# expiry the post is refused with the existing "this form has expired,
# reload the page" answer, which is a reload, not a lost account.
_PLAY_CSRF_MAX_AGE = 60 * 60 * 4


def form_csrf_token(secret: Optional[str]) -> str:
    """The hidden-field token derived from ``secret``.

    ``secret`` is whichever unreadable cookie value is available: the
    entrant session token for a signed-in write, or the pre-session
    ``sw_play_csrf`` nonce for a login/signup post.

    Returns ``""`` when there is no secret. Callers must treat that as
    "no proof is available", never as a token to compare against — an
    empty expected value that compared equal to an empty presented value
    would be an open door for exactly the anonymous caller this defends
    against.
    """
    if not secret:
        return ""
    return hashlib.sha256((_FORM_CSRF_PREFIX + secret).encode("utf-8")).hexdigest()


def issue_play_csrf(response: Response) -> str:
    """Mint a fresh ``sw_play_csrf`` nonce on ``response`` and return its token.

    **The gap this fills.** ``form_csrf_token`` needs an unreadable cookie
    to derive from, and a login or signup post happens *before* there is a
    session to supply one. Without a secret the derivation returns ``""``,
    which every caller must reject — so the pre-session forms would have no
    proof channel at all and would be left relying on SameSite alone, which
    Chrome's "Lax+POST" intervention weakens for cookies under two minutes
    old.

    **This cookie authenticates nothing, and that is enforced.** It is a
    random value handed to an anonymous visitor; it names no principal and
    grants no access. It is therefore kept *out* of
    ``settings.session_cookie_names`` — that registry is the CSRF
    middleware's trigger for "this write is cookie-authenticated", and
    registering a cookie every anonymous visitor holds would make the
    middleware demand a header from callers who have not signed in, while
    dressing a nobody-value as a credential.

    ``httponly`` is the load-bearing flag: the double-submit argument is
    precisely that a cross-site page can make the browser send this cookie
    but can never read it. ``secure`` follows the deployment's session
    setting so the nonce is never the weaker half of the pair.

    Returns the token to embed in the form, not the nonce — the nonce stays
    in the cookie jar and nowhere else.
    """
    nonce = secrets.token_urlsafe(_PLAY_CSRF_BYTES)
    response.set_cookie(
        key=PLAY_CSRF_COOKIE,
        value=nonce,
        max_age=_PLAY_CSRF_MAX_AGE,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return form_csrf_token(nonce)
