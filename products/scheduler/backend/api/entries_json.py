"""The entrant tier's JSON surface (Phase 6, spec §4).

**What this module is.** ``api/entries_public.py`` calls itself throwaway
in its own first paragraph, and Phase 6 is where that is honoured: the
React Router 7 app in ``products/scheduler/entrant/`` renders the entrant
experience, and this module is the only thing it reads. The split is the
point of ruling R8-A — one origin, nginx routing ``/e/api/`` here and
``/e/{slug}`` to node, so a form post from the entrant page reaches
FastAPI **directly**. There is no deputy: node never relays a credential,
never forwards a ``Cookie``, and never manufactures the CSRF header
(spec §3).

**Everything the incumbent computed, this module reuses.** ``_resolve``,
``_entrants``, ``_entry_counts``, ``check_policy`` and
``compute_fee_total`` stay exactly where they are and are imported, not
re-derived. That is not tidiness: the total shown to the entrant IS the
total recorded (Seam B), the entrant list IS the strict two-column
projection (invariant I6), and a second implementation of either agrees
with the first until the day it does not.

**Registered without the app-wide auth dependency**, following the
``entries_public`` and ``display.public_router`` precedent. Each route
declares its own posture: the page projection and the config read are
public (and named in ``tests/test_auth_surface.py`` with the reason);
quote and submit declare ``get_current_entrant``, which has no bootstrap
fallback in either mode (submit through ``entrant_or_back_to_form``, which
changes the refusal's shape for a browser navigation and nothing else).

**Not workspace-path-scoped, deliberately.** The key is the
``entry_pages`` slug. A raw tournament UUID is never a public address —
the same rule the display routes hold — so these paths carry no
``tournament_id`` and the ``require_tournament_access`` seam does not
apply. ``_resolve``'s uniform 404 is the tenancy answer instead, and
``tests/test_tenant_isolation.py``'s sweep (derived from ``{tournament_id}``
in the path) is unaffected by design rather than by oversight.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select

from api.entries_public import (
    _entrants,
    _entry_counts,
    _event_is_open,
    _events,
    _is_age_bracketed,
    _lookup_event,
    _moment,
    _optional_entrant,
    _resolve,
)
from app.client_ip import client_ip
from app.config import settings
from app.dependencies import AuthEntrant, get_current_entrant
from app.error_codes import ErrorCode, http_error
from app.form_csrf import FORM_FIELD, PLAY_CSRF_COOKIE
from app.form_csrf import form_csrf_token as _form_csrf
from database.models import EntryPage, Org
from repositories import LocalRepository, get_repository
from services import auth as auth_service
from services import submissions as submission_service
from services.entry_fees import PlayerSelection, compute_fee_total, normalize_fee_schedule
from services.entry_form import parse_players
from services.entry_policy import check_policy

log = logging.getLogger("scheduler.api.entries_json")

# An HTML checkbox posts its value only when ticked, so presence is the
# signal; the values are what browsers and hand-rolled clients actually
# send. Mirrors ``api/entries_public._TICKED``, which §9 deletes with the
# module that owns it.
_TICKED = frozenset({"on", "true", "1", "yes"})

# ``/e/api`` — a sibling of ``/e/account``, both under the ``/e`` prefix
# nginx routes to FastAPI by longest match while ``/e/{slug}`` falls
# through to node. Four segments deep, so it cannot be shadowed by
# ``GET /e/{slug}``; registered before that router anyway, so the ordering
# is not load-bearing on a future path edit.
router = APIRouter(prefix="/e/api", tags=["entries-public"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- DTOs ----------------------------------------------------------------


class ViewerDTO(BaseModel):
    """Who is reading, as seen from THIS request's cookies — which is not
    the same thing as who is reading the page.

    ``formCsrf`` is empty for a signed-out reader because ``_form_csrf``
    derives it from the session cookie and there is none.

    **And on a server-rendered page it is ALWAYS empty, for every reader.**
    The RR7 tier fetches this projection from node, and node sends a frozen
    ``accept``-only allowlist (``app/lib/apiFetch.server.ts``) because it
    renders and never relays credentials. So ``_optional_entrant`` reads a
    cookie that was never sent, and ``signedIn`` is ``False`` and
    ``formCsrf`` is ``""`` for a signed-in entrant exactly as much as for a
    stranger. These two fields are meaningful only to a caller that sends
    its own cookies — a hydrated browser fetch — and a server renderer must
    not gate anything on them. It is pinned as a contract by
    ``tests/test_entrant_ssr_contract.py``.

    An earlier version of this docstring said the pre-session
    ``sw_play_csrf`` double-submit was something "the SSR tier mints".
    Nothing implemented that; ``issue_play_csrf`` had zero production call
    sites and has been deleted. Ruling R8-D made the claim true instead:
    the node loader mints the nonce on the SSR document response and
    renders its digest (``app/lib/formCsrf.server.ts``), which
    ``require_form_csrf`` below and ``app.form_csrf.form_csrf_proves``
    already accepted as a second candidate secret.
    """

    signedIn: bool = False
    email: Optional[str] = None
    formCsrf: str = ""


class EventDTO(BaseModel):
    id: str
    code: str
    discipline: str
    feeCents: Optional[int] = None
    genderConstraint: Optional[str] = None
    # Stated in UTC and saying so — an entry deadline read in the wrong
    # zone is a missed entry (``_moment``).
    opensAt: Optional[str] = None
    closesAt: Optional[str] = None
    withdrawsUntil: Optional[str] = None
    isOpen: bool
    # R12's birth-year trigger, computed server-side so the form and the
    # write agree about which events need a year.
    ageBracketed: bool
    entryCount: int


class EntrantRowDTO(BaseModel):
    """The strict projection (Q4/I6), and nothing else.

    One field, because ``_entrants`` SELECTs one column and answers one row
    per PERSON. Contact data is structurally absent rather than
    fetched-and-then-hidden, and adding a second field here would be the
    first half of undoing that.
    """

    name: str


class PageDTO(BaseModel):
    slug: str
    introText: Optional[str] = None
    regulationsText: Optional[str] = None
    regulationsVersion: int
    paymentInstructions: Optional[str] = None
    # String keys: this mirrors a JSON column, and a JSON object has no
    # integer keys. Read through ``normalize_fee_schedule`` so the card
    # cannot quote a tier the pricing drops.
    feeSchedule: Dict[str, int] = {}


class PolicyDTO(BaseModel):
    maxEventsPerPerson: Optional[int] = None
    disciplineCaps: Optional[dict] = None
    collectPhone: bool = False
    waiverRequired: bool = False


class TournamentDTO(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None


class NamedDTO(BaseModel):
    name: str


class VenueDTO(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None


class EntryPageProjection(BaseModel):
    """One loader, one call. The RR7 loader renders a whole entry page from
    this and makes no second request — meta and OG tags included (spec §7)."""

    tournament: TournamentDTO
    org: Optional[NamedDTO] = None
    venue: Optional[VenueDTO] = None
    page: PageDTO
    policy: PolicyDTO
    events: List[EventDTO]
    entrants: List[EntrantRowDTO]
    viewer: ViewerDTO


class EntrantConfigDTO(BaseModel):
    """The two values the entrant app cannot compute for itself.

    Small on purpose. This is a **publication** route, not a settings
    dump: everything on it is already public by nature (a Turnstile
    sitekey is rendered into every signup page; the auth mode is
    observable from whether an anonymous write is refused). Nothing that
    is secret, or that would become interesting in aggregate, belongs
    here — and the negative control in
    ``tests/test_entries_json_routes.py`` exists because the secret key
    sits one line away from the sitekey in ``app/config.py`` with a
    near-identical name.
    """

    turnstileSiteKey: str
    authMode: str


# ---- routes --------------------------------------------------------------


@router.get("/page/{slug}", response_model=EntryPageProjection)
def entry_page_projection(
    request: Request,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> EntryPageProjection:
    """Everything the entry page renders, in one public read.

    Public by design (Q4): a poster URL, not a capability URL. Reading it
    never requires an account; only the form inside it does. The
    information architecture is the incumbent's (R14 §6) — timeline,
    money, venue, organisation, events with counts, the entrant list —
    because it is proven and entrants already read it.
    """
    page, tournament = _resolve(repo, slug)
    entrant, token = _optional_entrant(request, repo)
    now = _utcnow()
    events = _events(repo, tournament.id)
    counts = _entry_counts(repo, tournament.id)
    org = (
        repo.session.get(Org, tournament.org_id)
        if tournament.org_id is not None
        else None
    )
    return EntryPageProjection(
        tournament=TournamentDTO(
            name=tournament.name,
            date=(
                str(tournament.tournament_date)
                if tournament.tournament_date
                else None
            ),
        ),
        org=NamedDTO(name=org.name) if org is not None and org.name else None,
        venue=(
            VenueDTO(name=page.venue_name, address=page.venue_address)
            if (page.venue_name or page.venue_address)
            else None
        ),
        page=PageDTO(
            slug=page.slug,
            introText=page.intro_text,
            regulationsText=page.regulations_text,
            regulationsVersion=page.regulations_version,
            paymentInstructions=page.payment_instructions,
            feeSchedule={
                str(count): cents
                for count, cents in sorted(
                    normalize_fee_schedule(page.fee_schedule).items()
                )
            },
        ),
        policy=PolicyDTO(
            maxEventsPerPerson=page.max_events_per_person,
            disciplineCaps=page.discipline_caps,
            collectPhone=page.collect_phone,
            waiverRequired=page.waiver_required,
        ),
        events=[
            EventDTO(
                id=str(ev.id),
                code=ev.code,
                discipline=ev.discipline,
                feeCents=ev.fee_cents,
                genderConstraint=ev.gender_constraint,
                opensAt=_moment(ev.opens_at) if ev.opens_at is not None else None,
                closesAt=_moment(ev.closes_at) if ev.closes_at is not None else None,
                withdrawsUntil=(
                    _moment(ev.withdraws_until)
                    if ev.withdraws_until is not None
                    else None
                ),
                isOpen=_event_is_open(ev, now),
                ageBracketed=_is_age_bracketed(ev),
                entryCount=counts.get(ev.id, 0),
            )
            for ev in events
        ],
        entrants=[EntrantRowDTO(name=name) for name in _entrants(repo, tournament.id)],
        viewer=ViewerDTO(
            signedIn=entrant is not None,
            email=entrant.email if entrant is not None else None,
            formCsrf=_form_csrf(token),
        ),
    )


@router.get("/config", response_model=EntrantConfigDTO)
def entrant_config() -> EntrantConfigDTO:
    """Public runtime configuration for the entrant app.

    Read by the RR7 signup route to render the Turnstile widget. The
    alternative — a second ``TURNSTILE_SITE_KEY`` env var on the node
    service — would be a second source of truth for a value whose *pair*
    (the secret) is validated only here, and a sitekey that drifts from
    its secret fails the challenge for every honest entrant while looking
    like a Cloudflare outage.

    No repository access and no session: this is configuration, not data,
    which is why it needs neither a slug nor a tenancy seam.
    """
    return EntrantConfigDTO(
        turnstileSiteKey=settings.turnstile_site_key,
        authMode=settings.auth_mode,
    )


class EntryPageListItemDTO(BaseModel):
    slug: str


@router.get("/pages", response_model=List[EntryPageListItemDTO])
def entry_page_list(
    repo: LocalRepository = Depends(get_repository),
) -> List[EntryPageListItemDTO]:
    """Every OPEN entry page's slug — the list Task 26's ``sitemap.xml``
    route crawls.

    **``is_open`` is the entire point of this route, not an incidental
    filter.** ``EntryPage.is_open`` (default ``False``) is what makes a page
    public at all — ``_resolve`` answers the same uniform 404 for a closed
    page as for an unknown slug. A list that ignored it would publish the
    addresses of unopened events into a crawlable sitemap: worse than the
    404, because it discloses that a workspace and its slug exist *before*
    the director has opened entries.

    Ordered by ``slug``, which carries its own unique index
    (``uq_entry_pages_slug``) — unlike a random-UUID primary key, two rows
    can never tie on it, so no second tiebreaker is needed for a stable
    order across SQLite and Postgres.
    """
    slugs = repo.session.scalars(
        select(EntryPage.slug)
        .where(EntryPage.is_open.is_(True))
        .order_by(EntryPage.slug)
    ).all()
    return [EntryPageListItemDTO(slug=slug) for slug in slugs]


# ---- POST /quote/{slug} ---------------------------------------------------


def require_form_csrf(request: Request, form) -> None:
    """Channel two, checked at the route (spec §3, R8-B).

    Checked **before anything is read out of the body**: this request
    carries a session cookie, so until the token is verified it is not
    known to have been sent deliberately. That ordering is the incumbent's
    (``api/entries_public.py``'s ``submit_entry``) and is preserved here
    verbatim — including reusing the SAME session-derived digest
    (``_form_csrf`` / ``app.form_csrf.form_csrf_token``), never a second
    derivation.

    This is a route-level check; the CSRF middleware's second channel
    (``app.form_csrf.form_csrf_proves``) is a separate, complementary
    guard — the middleware decides whether a cookie-carrying write may
    proceed at all, and this decides whether *this* form was minted for
    *this* session. Removing either leaves a hole, so both have their own
    negative controls.

    **Two candidate secrets, not one (Phase 6, Task 12).** The submit/quote
    callers always carry an entrant session (``get_current_entrant`` has no
    bootstrap fallback), so the session cookie alone used to be enough. The
    entrant auth routes (``api/entrants.py``) call this too, and signup/login
    are pre-session by construction — there is no session cookie yet, which
    is exactly what ``PLAY_CSRF_COOKIE`` exists to stand in for. **Nothing in
    Python mints that cookie**; the SSR tier does, in
    ``entrant/app/lib/formCsrf.server.ts`` (``mintFormCsrf``, ruling R8-D),
    and the obituary for the Python minter that used to be named here is
    at :119. Checking both, same as
    ``app.form_csrf.form_csrf_proves`` does, costs the session-gated callers
    nothing: they never carry a ``sw_play_csrf`` cookie, so that candidate is
    simply absent from ``expected`` for them.

    **Comparison is on bytes**, the same as ``app.form_csrf.form_csrf_proves``
    and for the same reason: ``secrets.compare_digest`` raises ``TypeError``
    on a ``str`` carrying non-ASCII, so one accented character in the hidden
    field is a 500 rather than the 403 below. Task 12 made this reachable
    pre-session by anyone with the poster URL, which is what turned a latent
    hazard into a free denial-of-service primitive. ``errors="replace"``
    cannot itself raise (a lone surrogate becomes ``?``) and cannot cause a
    false match either, because ``?`` never appears in a hex digest.
    """
    presented = str(form.get(FORM_FIELD) or "").encode("utf-8", "replace")
    expected = [
        token.encode("ascii")
        for token in (
            _form_csrf(request.cookies.get(settings.entrant_session_cookie_name) or ""),
            _form_csrf(request.cookies.get(PLAY_CSRF_COOKIE) or ""),
        )
        if token
    ]
    if not expected or not any(
        secrets.compare_digest(presented, token) for token in expected
    ):
        raise http_error(
            403,
            ErrorCode.AUTH_CSRF_REQUIRED,
            "This form has expired. Reload the entry page and try again.",
        )


class RefusalDTO(BaseModel):
    """A refusal the entrant can act on.

    ``code`` is stable wire vocabulary for a caller that wants to branch;
    ``message`` **contains the rule** — the number, or the discipline —
    because "your entry was refused" is not an answer someone can do
    anything with (R14 §4).
    """

    code: str
    message: str
    subjects: List[str] = []


class QuoteResponse(BaseModel):
    """What a basket costs, and whether it is allowed.

    Both, in one answer, deliberately: a quote that priced a basket policy
    would refuse is a number the entrant will never be charged, and a
    refusal with no price makes them re-tick to find out what a legal
    basket costs.
    """

    totalCents: Optional[int] = None
    feeBasis: dict = {}
    refusal: Optional[RefusalDTO] = None


def _resolve_selections(repo: LocalRepository, tournament_id, parsed: List[dict]):
    """``[(spec, [event, ...]), ...]`` for a parsed form, or a 400.

    The events must belong to *this* workspace and be open. One answer for
    "not ours", "does not exist" and "closed": a caller holding a real
    event id from another tenant learns nothing from posting it here.
    """
    now = _utcnow()
    resolved: List[tuple] = []
    for spec in parsed:
        events = []
        for raw_id in spec["events"]:
            event = _lookup_event(repo, tournament_id, raw_id)
            if event is None or not _event_is_open(event, now):
                raise http_error(
                    400, ErrorCode.INVALID_INPUT, "That event is not taking entries."
                )
            events.append(event)
        resolved.append((spec, events))
    return resolved


# The suffix of the entry page's second path (``entrant/app/routes.ts``).
# ``/e/{slug}/signed-in`` is the URL a completed sign-in lands on, and it is
# the ONLY thing that makes a sign-in legible on a tier that cannot read the
# session cookie. A recalculation that redirected to the bare page would
# silently retract that statement, so the variant the request came from is
# carried across the round trip. Two possible values, both written here —
# the flag on the way in is a presence test, never a path, so nothing an
# entrant posts can choose the target.
_SIGNED_IN_SUFFIX = "/signed-in"


def entrant_or_back_to_form(
    request: Request,
    repo: LocalRepository = Depends(get_repository),
) -> AuthEntrant:
    """``get_current_entrant``, but a browser navigation gets an answer it can read.

    Used by ``POST /submit/{slug}`` only — ``quote`` keeps the bare
    dependency; the reason is at that route's parameter.

    **What changed and what did not.** The identity decision is
    ``get_current_entrant``'s, unaltered — same table, same no-bootstrap
    rule, same 401 for every programmatic caller. This wrapper only changes
    the *shape* of the refusal for a caller that cannot read JSON.

    **Why it is needed (ruling R8-E).** The entry form is now rendered
    unconditionally: node's projection fetch is anonymous by construction,
    so the SSR page cannot know whether its reader is signed in and a gate
    on ``viewer.signedIn`` hid the form from everyone. Who may submit is
    therefore decided here, at the write, which the browser reaches
    directly with its cookies. But a native ``<form method=post>`` is a
    *navigation*: a 401 with a JSON body paints ``{"detail":{"code":...}}``
    across the window, which is not an outcome a human can act on.

    ``text/html`` in ``Accept`` means exactly that navigation — browsers
    send it on a form post and never on ``fetch(..., {headers: {}})`` — so
    those callers are sent back to the entry page carrying a refusal
    **code**, which ``app/lib/echo.ts``'s ``refusalText`` maps to fixed
    local copy. The same code-not-prose rule ``_echo_redirect`` argues for
    at length: this target is a shareable GET on the tournament's own host,
    so nothing an author of a URL writes may become a sentence on it.

    The typing is not carried back. A 303 re-issues as GET, so the posted
    body is dropped rather than round-tripped; the browser's own history
    restore is what returns the fields, and re-echoing a whole form body
    through a URL for a caller who has no account yet buys little for the
    header budget it spends. Stated because it is a cost, not an oversight.

    **Only a 401 is rewritten.** ``get_current_entrant`` raises nothing else
    today, so the narrowing changes no behaviour now — it bounds what this
    wrapper is allowed to claim later. The redirect it builds says exactly
    one thing, ``NOT_SIGNED_IN``, and the day that dependency grows a 403
    for an unverified or a locked account a bare ``except HTTPException``
    would dress that refusal as "this browser is not signed in": false, and
    unactionable, because signing in is not what fixes it. A refusal this
    wrapper has no copy for must reach the caller as itself.
    """
    try:
        return get_current_entrant(request, repo)
    except HTTPException as exc:
        slug = request.path_params.get("slug")
        if (
            exc.status_code == 401
            and slug
            and "text/html" in request.headers.get("accept", "")
        ):
            raise HTTPException(
                status_code=303,
                detail="Not signed in",
                headers={
                    "Location": (
                        f"/e/{quote(str(slug), safe='')}"
                        "?refusalCode=NOT_SIGNED_IN#enter"
                    )
                },
            ) from None
        raise


def _echo_redirect(request: Request, slug: str, total, refusal) -> RedirectResponse:
    """The unhydrated answer: **307** back to the form, so the typing rides
    in the BODY and never in a URL.

    A native ``<form method=post>`` cannot read JSON, so a browser that
    pressed "Update events and total" with no script must be *navigated*
    somewhere useful — and the entry page is node's, so the navigation is
    the only channel the two tiers share.

    **Why 307 and not 303 (the 2026-08-10 browser pass).** This used to
    answer 303 with the posted body reflected into the query string, and a
    real demo pass read the address bar back:
    ``/e/{slug}?playerName=Rin+Matsuda&club=Kingsway+BC&birthYear=2012&remarks=…``.
    A 303 re-issues as GET, so a form body can only survive it as a URL —
    and a URL is written into the browser's history, into every nginx
    access log, and into any intermediary's, none of which is scoped to
    hold an entrant's name, club or free-text notes. Age-bracketed events
    make ``birthYear`` mandatory (``_is_age_bracketed``), so that is
    personal data of MINORS in logs that were never designed to carry it.
    307 preserves the method and the body, so the browser re-posts the same
    fields to the page it came from and the query string carries only what
    the SERVER computed. Redacting field names would have been the smaller
    diff and the wrong fix: the typing has to survive the round trip (that
    is what the round trip is for), so it has to travel somewhere, and the
    only somewhere that is not a log line is the request body.

    The cost, stated because it is real: 307 is not POST/redirect/GET, so
    reloading the landing page re-posts and the browser asks. That is
    acceptable for THIS target and would not be for the receipt —
    ``quote_entry`` writes nothing, and the ``action`` this lands on
    (``entrant/app/routes/entry.tsx``) re-renders and writes nothing
    either, so a re-post is a re-render.

    ``totalCents`` still rides in the query string as **display**. It is
    not posted onward by the page that receives it, and the write path runs
    ``compute_fee_total`` again (:604), so an edited URL reaches no record.

    **The refusal is still echoed as a CODE, never as its message.** The
    landing URL remains addressable and therefore *shareable* — whatever it
    carries is rendered on the official entry page for whoever was sent it,
    which is not the same person who wrote it. A free-text ``?refusal=``
    would let a stranger put a plausible organiser warning on a page about
    money (no XSS is needed; the page escaping it faithfully is the
    problem). ``code`` is fixed server vocabulary from ``check_policy`` and
    ``subjects`` are its player keys, so the client picks the sentence
    (``app/lib/echo.ts``'s ``refusalText``) and nothing an author of a URL
    writes can become prose. Moving the body out of the query string does
    not relax that: it removes the only *other* channel free text had.

    Three keys, all server-authored, and no loop over the body at all —
    which is what makes the privacy property structural rather than a
    denylist somebody has to keep in step with the form.
    """
    echoed = []
    if total is not None:
        echoed.append(("totalCents", str(total)))
    if refusal is not None:
        echoed.append(("refusalCode", refusal.code))
        if refusal.subjects:
            echoed.append(("refusalSubjects", ",".join(refusal.subjects)))
    # Presence, not value: the flag chooses between two paths written above,
    # so a crafted `?signedIn=/evil` picks the same `/signed-in` any honest
    # form does. It rides on the quote URL rather than in the body because it
    # is transport — the submit post has no use for it.
    variant = _SIGNED_IN_SUFFIX if request.query_params.get("signedIn") else ""
    query = f"?{urlencode(echoed)}" if echoed else ""
    return RedirectResponse(
        url=f"/e/{quote(slug, safe='')}{variant}{query}#enter", status_code=307
    )


@router.post("/quote/{slug}", response_model=QuoteResponse)
async def quote_entry(
    request: Request,
    slug: str = Path(..., max_length=100),
    # **Not ``entrant_or_back_to_form``, deliberately.** That wrapper turns an
    # anonymous browser navigation into a 303 back to the entry page, which is
    # right for submit and is NOT this route's call to make: R8-C gated quote
    # precisely so it could not answer a caller-chosen basket, and
    # ``test_an_anonymous_browser_quote_is_still_refused`` pins that as a
    # 401/403. The redirect discloses no price and would arguably satisfy the
    # ruling, but relaxing a security control's assertion is a decision for
    # whoever owns R8-C, not a side effect of a UX fix. The cost is real and
    # named in the Task 18b report: an anonymous entrant who presses "Update
    # events and total" still sees a raw JSON 401.
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
):
    """R14's "Update events and total", as a route the RR7 form can call.

    **Session-gated (ruling R8-C)**, matching the incumbent's filter branch
    (``api/entries_public.py``'s ``action=filter``) rather than becoming a
    public fee oracle: it reads a director's price list against a
    caller-chosen basket, which is the shape of a scraper.

    It calls the **same** ``check_policy`` and ``compute_fee_total`` the
    write calls, over the same per-person grouping. That is not
    convenience — Seam B's invariant is that the total shown to the entrant
    IS the total recorded, and two implementations cannot promise that
    however carefully they are kept in step.

    Writes nothing, and does not spend the entry budget: the budget counts
    entries, and this is somebody still filling in a form.

    **Two answers, by ``Accept``.** A hydrated caller asks for JSON and gets
    ``QuoteResponse``. A native form post cannot read JSON at all — it is a
    navigation — so a browser ``Accept: text/html`` gets a **307** back to
    the entry page, which re-posts the entrant's own body there and leaves
    only the server's total in the query string (``_echo_redirect``). That
    is what keeps R14's "Update events and total" working with JavaScript
    disabled (spec §7) without node ever relaying a credential: the browser
    talks to this route directly, on one origin, and the RR7 page renders
    the body it is handed back.
    """
    page, tournament = _resolve(repo, slug)
    form = await request.form()
    require_form_csrf(request, form)

    resolved = _resolve_selections(repo, tournament.id, parse_players(form))
    grouped = [(str(i), events) for i, (_, events) in enumerate(resolved)]
    refusal = check_policy(page, grouped)
    total, basis = (
        compute_fee_total(
            page, [PlayerSelection(key, events) for key, events in grouped]
        )
        if grouped
        else (None, {})
    )
    # ``text/html`` in Accept means a navigation, not a fetch: browsers send
    # it on a native form post and never on `fetch(..., {headers: {}})`.
    if "text/html" in request.headers.get("accept", ""):
        return _echo_redirect(request, page.slug, total, refusal)
    return QuoteResponse(
        totalCents=total,
        feeBasis=basis,
        refusal=(
            None
            if refusal is None
            else RefusalDTO(
                code=refusal.code,
                message=refusal.message,
                subjects=list(refusal.subjects),
            )
        ),
    )


# ---- POST /submit/{slug} --------------------------------------------------


@router.post("/submit/{slug}")
async def submit_entry_json(
    request: Request,
    slug: str = Path(..., max_length=100),
    idempotency_key: Optional[str] = Header(
        None, alias="Idempotency-Key", max_length=64
    ),
    entrant: AuthEntrant = Depends(entrant_or_back_to_form),
    repo: LocalRepository = Depends(get_repository),
):
    """Record one submission. **The order of the guards is the contract**,
    and it is ``api/entries_public.submit_entry``'s verbatim.

    1. the entrant session (the dependency above — no bootstrap fallback);
    2. slug -> page -> tournament, or the uniform 404;
    3. the form CSRF token, before anything is read out of the body;
    4. the per-IP budget on its own ``entry:`` namespace, so an entry flood
       cannot lock a venue out of *signing in*;
    5. the acknowledgment, with the version agreed to recorded at that
       instant on the submission;
    6. entry policy, refused WITH THE RULE STATED;
    7-9. replay, flags and the write, all inside the submission service.

    **What is different from the incumbent, and only this.** The answer is
    a **303** to an RR7 receipt route instead of a rendered page: a
    POST/redirect/GET target means a reload never re-posts. And the
    ``action=filter`` branch is gone — it is ``POST /e/api/quote/{slug}``
    now, which is a better shape for the same act (it writes nothing and it
    said so only in a comment before).

    **The Idempotency-Key is read from the body as well as the header**,
    and the body is what makes it reachable. A native form cannot send a
    header, so until this phase the key was always NULL for a real entrant
    and ``UNIQUE (tournament_id, idempotency_key)`` guarded nothing they
    could hit. The key is minted in the loader that renders the form —
    not at submit, where a double-click mints two.

    The body is read as a raw form rather than declared as ``Form(...)``
    parameters because the payload is 1-N players each with 1-N events,
    which FastAPI's form binding cannot express.
    """
    page, tournament = _resolve(repo, slug)
    form = await request.form()

    # 3 — the form CSRF token, before the body is read for anything else.
    require_form_csrf(request, form)

    ip = client_ip(request)
    throttle_key = auth_service.entries_key(ip)

    # 4 — the per-IP budget. Turnstile guards signup, not this: a challenge
    # in front of a route that already requires an account would charge
    # every honest entrant a puzzle to slow down an attacker who has
    # already signed up.
    remaining = auth_service.throttle_check(repo.session, throttle_key)
    if remaining is not None:
        raise http_error(
            429,
            ErrorCode.AUTH_THROTTLED,
            "Too many entries from this connection — try again later",
            extra={"retryAfterSeconds": int(remaining) + 1},
        )

    def refuse(status: int, message: str):
        auth_service.throttle_record_entry(repo.session, throttle_key)
        repo.session.commit()
        return http_error(status, ErrorCode.INVALID_INPUT, message)

    # 5 — the acknowledgment. One given after the fact is not one.
    if str(form.get("acknowledged") or "").strip().lower() not in _TICKED:
        raise refuse(400, "Please accept the regulations before submitting.")

    parsed = parse_players(form)
    if not parsed:
        raise refuse(
            400, "Please give a player's name, their gender, and at least one event."
        )

    try:
        resolved = _resolve_selections(repo, tournament.id, parsed)
    except HTTPException:
        raise refuse(400, "That event is not taking entries.")

    grouped = [(str(i), events) for i, (_, events) in enumerate(resolved)]

    # 6 — entry policy, refused WITH THE RULE STATED (R14 §4).
    refusal = check_policy(page, grouped)
    if refusal is not None:
        raise refuse(400, refusal.message)

    # The fee, computed server-side in one place. The total shown to the
    # entrant IS the total recorded (Seam B) — never recomputed afterwards,
    # and computed by the same call POST /e/api/quote/{slug} makes.
    total, basis = compute_fee_total(
        page, [PlayerSelection(key, events) for key, events in grouped]
    )

    # The key: header first (a hydrated fetch), hidden field second (an
    # unhydrated native form, which cannot send a header at all). Bounded
    # to the column's 64 characters on both paths.
    key = idempotency_key or str(form.get("idempotencyKey") or "")[:64] or None

    # 7-9 — replay, flags and the write, all inside the submission service.
    result = submission_service.create_submission(
        repo.session,
        tournament_id=tournament.id,
        page=page,
        account_id=uuid.UUID(entrant.id),
        players=[
            submission_service.PlayerInput(
                full_name=spec["name"],
                gender=spec["gender"],
                club=spec["club"],
                birth_year=spec["birthYear"],
                remarks=spec["remarks"],
                events=events,
            )
            for spec, events in resolved
        ],
        fee_total_cents=total,
        fee_basis=basis,
        idempotency_key=key,
    )

    auth_service.throttle_record_entry(repo.session, throttle_key)
    repo.session.commit()
    # 303, not 302: the browser must re-issue as GET. A replay redirects to
    # the SAME receipt — a retrying client that saw a different answer would
    # conclude its first attempt had failed.
    #
    # The query string is what the receipt page can SAY. Node renders that
    # route and holds no entrant credential (spec §3), so it cannot read the
    # submission back to find the amount; the number has to travel in the
    # Location the server itself wrote. Display only, exactly as
    # ``_echo_redirect`` already carries it (:485-487) — nothing on the
    # receipt is posted onward and no record is derived from it, so an edited
    # URL misinforms only whoever edited it.
    #
    # ``result.replayed`` is deliberately NOT carried. It is true, and putting
    # it here would make a replay's Location differ from the original's — the
    # one thing the paragraph above and ``SubmissionResult.replayed``'s own
    # docstring both rule out, for the reason stated there.
    #
    # A tournament that priced nothing has not declared its entries free, so
    # the key is absent rather than ``0``: ``None`` stringified would read as a
    # total of "None", and a zero would be a claim about money nobody made.
    total_cents = result.submission.fee_total_cents
    query = "" if total_cents is None else f"?{urlencode({'totalCents': total_cents})}"
    return RedirectResponse(
        url=f"/e/{quote(page.slug, safe='')}/receipt/{result.submission.id}{query}",
        status_code=303,
    )
