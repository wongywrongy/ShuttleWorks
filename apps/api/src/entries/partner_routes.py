"""The doubles partner invite's two routes (E3, program Phase 8).

The shape is ``identity/invites.py``'s, applied to a member of the public
rather than to a director, because ruling R10 says so and because it is the
right shape:

- ``GET /e/api/partner-invites/{token}`` — **public preview.** Somebody who
  has just been mailed a link has no account yet; requiring one before they
  can even see what they are being asked would make the flow start with an
  unexplained sign-up wall.
- ``POST /e/api/partner-invites/{token}/accept`` — **requires an entrant
  session.** Acceptance is an act by a principal, not a property of holding
  a URL. This is the whole difference between an invite and a capability
  token, and it is the difference R10 retired the capability path to get.

**What the preview may say, and what it may not.** It names the inviter, the
tournament and the event — the three things the recipient needs in order to
decide, and all three of which the inviter already knew and chose to share
with them. It does **not** echo the invited address back: the route is
unauthenticated, so an echoed address would let anyone holding a forwarded
link confirm who it was sent to. It does not name the fee, the other
entrants, or anything about the workspace beyond its name.

**One answer for every dead invite** (unknown, expired, already accepted,
attached to a withdrawn entry): a uniform 404. ``partners.resolve`` returns
``None`` for all four and offers this module no way to ask which, which is
deliberate — a caller that could tell "expired" from "never existed" could
confirm that a leaked link had once been real.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Path, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import select

from core.dependencies import AuthEntrant, get_current_entrant
from core.error_codes import ErrorCode, http_error
from core.limits import Name, StrictModel
from db.models import EntryEvent, EntryPage, Tournament
from entries import partners as partner_service
from entries.entries_json import require_form_csrf
from entries.entries_public import _event_is_open, _is_age_bracketed, _utcnow
from entries.entry_fees import PlayerSelection, compute_fee_total
from entries.entry_form import parse_year
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/e/api/partner-invites", tags=["entries-partners"])


class PartnerInviteDTO(BaseModel):
    """What an unauthenticated holder of the link is told. See the module
    docstring for what is deliberately absent."""

    tournamentName: Optional[str] = None
    # The public page's slug, so the preview can link to the tournament the
    # recipient is being invited into rather than dead-ending.
    slug: Optional[str] = None
    eventCode: str
    discipline: str
    # The inviter's display name, or their address when they set none. The
    # recipient was mailed by this person and already has it.
    invitedBy: str
    askBirthYear: bool = False


class PartnerAcceptRequest(StrictModel):
    """The accepting principal describes THEMSELVES.

    Their name and gender come from them rather than from the nominator,
    who would be guessing. R12 makes gender required because event
    eligibility depends on it, and guessing somebody's is worse than asking.
    """

    fullName: Name
    gender: Name
    club: Optional[Name] = None
    remarks: Optional[Name] = None
    # R-DM-1 (ii): the identity discriminator, string-typed and parsed by
    # parse_year - an unparseable year is dropped, not refused, exactly as
    # the entry form treats it.
    birthYear: Optional[Name] = None


class PartnerAcceptedDTO(BaseModel):
    entryId: str
    eventCode: str
    state: str


# ---- the unhydrated form path ------------------------------------------
#
# The entrant tier ships no client JS, so the accept page posts a native
# form. That cannot send the ``X-ShuttleWorks-CSRF`` header the middleware
# requires of a cookie-carrying write, which is exactly what the
# ``sw_play_csrf`` double-submit exists to stand in for — the same
# arrangement ``identity/entrants_routes.py`` uses for signup and login, and
# reusing ``require_form_csrf`` means one CSRF story rather than two.

_FORM_CONTENT_TYPES = frozenset(
    {"application/x-www-form-urlencoded", "multipart/form-data"}
)

# Carried by the form and stripped before the model is built: proof of
# intent and a destination are properties of the POST, not of a person.
_TRANSPORT_FIELDS = frozenset({"_csrf", "next", "token"})

# Where a form acceptance sends the browser. Node-owned GETs, one per
# outcome, on the same one-page-per-outcome principle as the account flows.
_ACCEPTED_PAGE = "/e/partner/accepted"
_FAILED_PAGE = "/e/partner/failed"


def is_form_post(request: Request) -> bool:
    return (
        (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        in _FORM_CONTENT_TYPES
    )


async def accept_body(request: Request) -> PartnerAcceptRequest:
    """The accept payload, from JSON or from a native form post.

    A dependency rather than a route change so the route stays ``def`` and
    keeps running in the threadpool.
    """
    if not is_form_post(request):
        try:
            data = await request.json()
        except ValueError as exc:
            raise RequestValidationError(
                [
                    {
                        "type": "json_invalid",
                        "loc": ("body", 0),
                        "msg": "JSON decode error",
                        "input": {},
                        "ctx": {"error": str(exc)},
                    }
                ]
            ) from exc
        data = data if isinstance(data, dict) else {}
    else:
        form = await request.form()
        require_form_csrf(request, form)
        data = {
            key: str(value)
            for key, value in form.multi_items()
            if key not in _TRANSPORT_FIELDS
            # An optional text box posts "" when left blank; a JSON caller
            # omits the key. Dropping the blanks is transport parity, so one
            # acceptance does not read differently for having come from a
            # form.
            and str(value) != ""
        }
    try:
        return PartnerAcceptRequest(**data)
    except ValidationError as exc:
        raise RequestValidationError(
            [{**error, "loc": ("body", *error["loc"])} for error in exc.errors()]
        ) from exc


def _dead() -> Exception:
    """The one answer every unusable invite gets."""
    return http_error(
        404,
        ErrorCode.ENTRY_NOT_FOUND,
        "That invitation is no longer available.",
    )


def _preview_context(session, token: str):
    entry = partner_service.resolve(session, token)
    if entry is None:
        return None
    event = session.get(
        EntryEvent, (entry.tournament_id, entry.entry_event_id)
    )
    tournament = session.get(Tournament, entry.tournament_id)
    page = session.get(EntryPage, entry.tournament_id)
    events = session.scalars(
        select(EntryEvent).where(
            EntryEvent.tournament_id == entry.tournament_id
        )
    ).all()
    return entry, event, tournament, page, events


def _accept_context(session, token: str):
    entry = partner_service.resolve(session, token)
    if entry is None:
        return None
    from sync.service import tournament_is_checked_out

    checked_out = tournament_is_checked_out(session, entry.tournament_id)
    event = session.get(
        EntryEvent, (entry.tournament_id, entry.entry_event_id)
    )
    page = session.get(EntryPage, entry.tournament_id)
    return entry, checked_out, event, page


@router.get("/{token}", response_model=PartnerInviteDTO)
def preview_partner_invite(
    token: str = Path(..., max_length=200),
    repo: LocalRepository = Depends(get_repository),
) -> PartnerInviteDTO:
    """Public, unauthenticated: what am I being asked?

    ``max_length`` on the path parameter rather than trust: this is an
    unauthenticated route and the value reaches a hash function, so an
    unbounded segment would be free work for anyone who wanted to send some.
    """
    context = repo.execute_query(_preview_context, token)
    if context is None:
        raise _dead()
    entry, event, tournament, page, events = context
    # Parity with the entry page (apps/entrant/app/routes/enter.tsx:377),
    # which asks over OPEN events only. The page is the authority: it is
    # the surface that collects the year, and an invite that asks for one
    # the nominator's own form never collected is a question with no
    # answer behind it. Carried from SP-DM-3 P3.
    now = _utcnow()
    ask_birth_year = any(
        _is_age_bracketed(ev) for ev in events if _event_is_open(ev, now)
    )
    return PartnerInviteDTO(
        tournamentName=tournament.name if tournament is not None else None,
        slug=page.slug if page is not None else None,
        eventCode=event.code if event is not None else "",
        discipline=event.discipline if event is not None else "",
        # ``contact_name`` already falls back to the address when an account
        # set no display name — the honest answer is what we actually know.
        invitedBy=entry.contact_name or "Someone",
        askBirthYear=ask_birth_year,
    )


@router.post(
    "/{token}/accept",
    response_model=None,
    responses={
        200: {"model": PartnerAcceptedDTO},
        303: {"description": "Form post: redirect to the outcome page"},
    },
)
def accept_partner_invite(
    request: Request,
    # **The principal is resolved BEFORE the body is parsed, and the
    # declaration order is what does it.** FastAPI resolves dependencies in
    # the order they appear, so with the body first an anonymous caller who
    # posted nothing got a 422 describing the fields this route wants —
    # which is a route that validates for strangers and authenticates
    # afterwards. Caught by `test_auth_surface`'s anonymous sweep, which
    # counts 401/403/404 as refusals and 422 as an answer.
    entrant: AuthEntrant = Depends(get_current_entrant),
    body: PartnerAcceptRequest = Depends(accept_body),
    token: str = Path(..., max_length=200),
    repo: LocalRepository = Depends(get_repository),
):
    """Accept as the signed-in entrant: build my half and link the pair.

    **No check that the session's address matches the invited one, and that
    is deliberate.** People are mailed at one address and hold an account at
    another; a club secretary forwards an invite to the player it is
    actually for. The invite's security property is possession of an
    unguessable token plus *being a principal at all* — tying acceptance to
    the typed address would break the ordinary case to defend against
    someone who already has the token.

    A **verified** account is required, on the same reasoning E2 applies to
    withdrawal: this creates a record in somebody's name and attaches it to
    a stranger's entry, and an unverified account has not shown it controls
    the address it claims.
    """
    if not entrant.email_verified:
        if is_form_post(request):
            return RedirectResponse(
                url=_FAILED_PAGE, status_code=status.HTTP_303_SEE_OTHER
            )
        raise http_error(
            403,
            ErrorCode.ENTRY_ACCOUNT_UNVERIFIED,
            "Confirm your email address before accepting an invitation.",
        )

    context = repo.execute_query(_accept_context, token)
    if context is None:
        if is_form_post(request):
            return RedirectResponse(
                url=_FAILED_PAGE, status_code=status.HTTP_303_SEE_OTHER
            )
        raise _dead()

    # Accepting an invite creates a new Submission for the partner.  It is
    # therefore subject to the same checkout freeze as the ordinary entrant
    # form; otherwise the cloud could acknowledge a partner row that was not
    # present in the event node's imported checkpoint.
    # ``_accept_context`` resolves this through ``tournament_is_checked_out``
    # before any acceptance write is staged.
    entry, checked_out, event, page = context
    if checked_out:
        raise http_error(
            409,
            ErrorCode.EVENT_CHECKED_OUT,
            "Entries are closed while this tournament is checked out to an event node.",
        )

    if event is None or page is None:
        raise _dead()

    # Priced through the same function the entry form quotes with, over this
    # one event: R14 prices the PERSON, and the accepting partner is a
    # person entering one event. A second pricing path would be a second
    # answer to "what does this cost".
    total, basis = compute_fee_total(
        page, [PlayerSelection(key="partner", events=[event])]
    )

    partner_entry = repo.execute_transaction(
        partner_service.accept,
        entry,
        account_id=uuid.UUID(entrant.id),
        full_name=body.fullName,
        gender=body.gender,
        club=body.club,
        remarks=body.remarks,
        birth_year=parse_year(body.birthYear or ""),
        fee_total_cents=total,
        fee_basis=basis,
    )
    if is_form_post(request):
        return RedirectResponse(
            url=_ACCEPTED_PAGE, status_code=status.HTTP_303_SEE_OTHER
        )
    return PartnerAcceptedDTO(
        entryId=str(partner_entry.id),
        eventCode=event.code,
        state=partner_entry.state,
    )
