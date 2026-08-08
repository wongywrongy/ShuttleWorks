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

from fastapi import Request

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

# The pre-session nonce cookie, minted by the SSR tier and verified here.
#
# **Deliberately absent from ``settings.session_cookie_names``.** That
# registry is the CSRF middleware's trigger for "this write is
# cookie-authenticated". This cookie authenticates nothing — it is a random
# value handed to an anonymous visitor, naming no principal and granting no
# access — so registering it would make the middleware demand a header from
# callers who have not signed in, while dressing a nobody-value as a
# credential. It IS in the wider ``settings.csrf_relevant_cookie_names``,
# which asks the strictly wider question "must this write prove it was sent
# deliberately"; both halves are pinned in ``tests/unit/test_form_csrf.py``.
#
# Its cookie attributes (HttpOnly, SameSite=Lax, Path=/, 4h Max-Age, 32
# bytes of entropy) are set where it is minted — see the R8-D note below —
# and pinned in ``entrant/tests/formCsrf.server.test.ts``.
PLAY_CSRF_COOKIE = "sw_play_csrf"


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


# **The nonce is minted by node, not here** (SP-PROGRAM-1 Phase 6, ruling
# R8-D). This module used to carry ``issue_play_csrf``, which set the
# ``sw_play_csrf`` cookie on a FastAPI ``Response`` and returned its token.
# It had **zero production call sites** — nothing ever called it — while
# ``ViewerDTO``'s docstring asserted that "the SSR tier mints" the nonce.
# A docstring describing a mechanism nobody implemented is exactly what let
# the entry form ship with an empty ``_csrf`` that could never match, so the
# function is deleted rather than left as a plausible-looking spare part.
#
# The pages that need a pre-session nonce — the entry page now, login and
# signup in Tasks 19-21 — are all rendered by React Router in
# ``products/scheduler/entrant/``, so the mint lives there in
# ``app/lib/formCsrf.server.ts`` and nowhere else. That is a second
# implementation of a security primitive, which is a real hazard, so the
# derivation and this file's ``_FORM_CSRF_PREFIX`` are pinned against each
# other by ``tests/unit/test_form_csrf_cross_tier.py``: it reads the
# TypeScript source, extracts its constants, and recomputes the golden
# digests through them. Change the prefix on either side and it goes red.
#
# What stays here is the half the server owns: ``PLAY_CSRF_COOKIE`` (read by
# ``form_csrf_proves`` below, by ``require_form_csrf``, and by
# ``settings.csrf_relevant_cookie_names``) and ``form_csrf_token``. Nothing
# in the verification path changed, which is why R8-D needed no backend
# change to work at all.


# Channel two only reads a body it can cheaply understand. A JSON write
# has a header available to it and does not need this.
_URLENCODED = "application/x-www-form-urlencoded"


async def form_csrf_proves(request: Request) -> bool:
    """Does this write present a token derived from one of its own cookies?

    The second of two enumerated CSRF proof channels (R8-B). Returns
    ``False`` — never raises — on every path that cannot produce a proof,
    so the caller's ``and not`` composition stays readable and a
    malformed body is a refusal rather than a 500.

    **An operator cookie disables this channel outright.** Channel two
    exists for a surface that physically cannot attach a header; the
    operator SPA can, and does. Under R8-A both principals' cookies can
    ride the same origin, so without this line a token minted for the
    entrant tier would satisfy the check on an operator write. The bound
    is on the principal, not on the path — a path bound is the exemption
    this channel was built to delete.

    **``await request.body()`` before ``request.form()`` is load-bearing,
    not a warm-up.** A request stream is consumed once. ``Request.form()``
    on an urlencoded body feeds ``request.stream()`` straight into the
    parser, which sets ``_stream_consumed`` and never populates ``_body``;
    Starlette's ``BaseHTTPMiddleware`` then forwards whatever is left of
    the channel, which for a consumed stream is *nothing*. The route
    downstream calls ``await request.form()``, gets an empty ``FormData``,
    and answers as if the entrant had submitted a blank page — nothing
    raises and nothing logs, and a family's eight-player entry arrives as
    zero players. Reading ``body()`` first caches the bytes on ``_body``,
    ``stream()`` then yields that cached copy to the parser, and
    ``_CachedRequest.wrapped_receive`` replays the same ``_body``
    downstream as one complete ``http.request`` message. One buffer, read
    twice. Verified against Starlette 1.3.1 and pinned by a real
    multi-player submission in ``tests/test_form_csrf_channel.py`` —
    a two-field probe passes either way. Buffering costs no new memory
    ceiling: ``BodyLimitMiddleware`` is outermost and has already read and
    bounded these bytes.

    **Comparison is on bytes**, because ``secrets.compare_digest`` raises
    ``TypeError`` on a ``str`` carrying non-ASCII — one accented character
    in the hidden field would otherwise be a 500 any cross-site page could
    trigger against a browser holding an entrant cookie.
    """
    if settings.session_cookie_name in request.cookies:
        return False
    if not request.headers.get("content-type", "").startswith(_URLENCODED):
        return False

    # Entrant cookies only. The operator cookie is deliberately absent —
    # see the blast-radius paragraph above.
    expected = [
        form_csrf_token(secret).encode("ascii")
        for secret in (
            request.cookies.get(settings.entrant_session_cookie_name),
            request.cookies.get(PLAY_CSRF_COOKIE),
        )
        if secret
    ]
    if not expected:
        return False

    try:
        await request.body()
        form = await request.form()
    except Exception:
        # **Fail closed, and say why the catch is broad.** Everything this
        # can raise — a client that disconnected mid-body, a body that is
        # not the urlencoded it claimed to be — means the same thing here:
        # no proof was obtained. Returning ``False`` refuses; letting the
        # exception out would 500, and a 500 on the CSRF check is a worse
        # answer to a malformed request than a 403 is. Narrowing this to a
        # list of exception types would be a list that has to stay in step
        # with Starlette's parser, and the day it fell behind the failure
        # would be an unhandled exception in the security middleware.
        return False

    presented = str(form.get(FORM_FIELD) or "").encode("utf-8", "replace")
    return any(secrets.compare_digest(presented, token) for token in expected)
