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
fallback in either mode.

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
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel

from api.entries_public import (
    _entrants,
    _entry_counts,
    _event_is_open,
    _events,
    _form_csrf,
    _is_age_bracketed,
    _moment,
    _optional_entrant,
    _resolve,
)
from database.models import Org
from repositories import LocalRepository, get_repository
from services.entry_fees import normalize_fee_schedule

log = logging.getLogger("scheduler.api.entries_json")

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
    """Who is reading, and what they need to post with.

    ``formCsrf`` is empty for a signed-out reader because ``_form_csrf``
    derives it from the session cookie and there is none. That is not a
    gap: a signed-out reader has nothing to submit, and the pre-session
    login/signup channel is the separate ``sw_play_csrf`` double-submit
    (spec §3), which the SSR tier mints and Task 12 checks.
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
    """The strict two-column projection (Q4/I6), and nothing else.

    Two fields, because ``_entrants`` SELECTs two columns. Contact data is
    structurally absent rather than fetched-and-then-hidden, and adding a
    third field here would be the first half of undoing that.
    """

    name: str
    eventId: str


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
        entrants=[
            EntrantRowDTO(name=name, eventId=str(event_id))
            for name, event_id in _entrants(repo, tournament.id)
        ],
        viewer=ViewerDTO(
            signedIn=entrant is not None,
            email=entrant.email if entrant is not None else None,
            formCsrf=_form_csrf(token),
        ),
    )
