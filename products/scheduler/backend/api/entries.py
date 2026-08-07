"""The operator's Entries desk and its minimal configuration surface
(SP-E1-1, spec §5 + ruling D1).

Five workspace-scoped routes. Everything public — the slug page, the
submit endpoint, the entrant's capability link — is a separate surface and
a separate slice; nothing in this module is reachable without a session.

**The two configuration routes** (``PUT .../entry-page``,
``POST .../entry-events``) exist because until they did, no API route
could create an ``entry_pages`` or ``entry_events`` row at all: both were
reachable only by writing to the database by hand. That is tolerable in a
test fixture and not tolerable in the walkthrough, which is required to
seed "through real paths" — a demo that proves the pipe works while
stepping around the API for the first two rows proves less than it looks
like it does.

They are the minimum that lets an entry page exist without a SQL client,
and deliberately no more: no list, no delete, no event update. An
operator configuration UI is a later slice with its own design, and
routes added now against no caller would be guesses shipped as contract.

**Why ``confirm`` exists in E1 at all.** Phase D of the plan says "no
confirm/reject/promote UI", and read literally that leaves the walking
skeleton unable to walk: E1 ships no email verification, so an entry lands
directly in ``pending`` (D1), and Seam A commits only ``confirmed`` — so
the pipe would dead-end one step before the roster. Ruling D1 reads that
line as "no full lifecycle-management UI" and carves out this one
transition. Reject, promote and withdraw stay E2.

**Path-param naming is load-bearing.** ``tournament_id`` is spelled exactly
that way because ``require_tournament_access`` binds to it and
``tests/test_tenant_isolation.py`` derives its probe set from it. A route
here named ``workspace_id`` would silently leave the tenancy suite.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import (
    EntryCommitResultDTO,
    EntryDeskRowDTO,
    EntryEventCreateDTO,
    EntryEventDTO,
    EntryPageDTO,
    EntryPageUpsertDTO,
)
from database.models import Entry, EntryEvent, EntryPage
from repositories import LocalRepository, get_repository
from services.entries import commit_entries

router = APIRouter(prefix="/tournaments", tags=["entries"])

# The only lifecycle transition E1 ships (ruling D1).
_CONFIRMABLE_FROM = "pending"

# The slug alphabet, deliberately narrower than a URL path segment allows.
#
# It ends up on a poster, is typed on a phone, and is read aloud at a club
# night, so the constraints that matter are human ones: no case (nobody
# reproduces capitals from a printed page reliably, and the lookup is
# exact), no spaces or underscores (invisible or lost in a line break), no
# separators that could change the shape of the route it lives on. Three
# characters is the floor because a one- or two-character public namespace
# is enumerable in an afternoon; sixty is a ceiling nobody meets by
# accident. Conservative on purpose — widening an accepted alphabet later
# is additive, narrowing it breaks every printed poster.
_SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")


def _event_codes(repo: LocalRepository, tournament_id: uuid.UUID) -> dict:
    """``entry_event_id → code`` for one workspace.

    One query for the whole desk rather than one per row: an entries desk
    has few events and many entries, so the N+1 would be entirely on the
    wrong side of that ratio.
    """
    return {
        row.id: row.code
        for row in repo.session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id == tournament_id)
        )
    }


def _get_entry(
    repo: LocalRepository, tournament_id: uuid.UUID, entry_id: uuid.UUID
) -> Entry:
    """Fetch one entry **within this workspace**, or 404.

    Scoped by the composite primary key, so an id that is perfectly valid
    in another workspace is not found here. The caller is already a member
    of this workspace (the route dependency saw to that), so there is no
    existence secret left to keep and the error can be specific.
    """
    row = repo.session.get(Entry, (tournament_id, entry_id))
    if row is None:
        raise http_error(
            404, ErrorCode.ENTRY_NOT_FOUND, f"entry not found: {entry_id}"
        )
    return row


@router.get(
    "/{tournament_id}/entries",
    response_model=List[EntryDeskRowDTO],
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_entries(
    tournament_id: uuid.UUID = Path(...),
    state: Optional[str] = Query(
        None, description="Filter to one lifecycle state (spec §6)."
    ),
    repo: LocalRepository = Depends(get_repository),
):
    """The desk list: newest submission first, each row naming its act.

    ``submitted_at`` is this table's created_at. It alone ties
    non-deterministically across SQLite and Postgres — several entries can
    genuinely land in the same tick — so ``id`` is the tiebreaker, per the
    house rule for every list query. Without it the same page reorders
    between reads and an operator loses their place mid-review.

    **Submission grouping (R13), and why it costs no extra query.** Each
    row carries the submission that produced it, with the submitting
    account and the act's fee total, so the desk can show "these four
    entries arrived on one form" instead of leaving an operator to group by
    eye on a repeated email address. Both hops are declared ``lazy="joined"``
    on the models — ``Entry.submission`` and ``Submission.account`` — so
    this is still **one** SELECT with two joins, batched by the database
    rather than by a second round trip per page. A colocated test counts
    the statements, because that property is a loader-configuration
    decision one edit away from becoming an N+1 nobody notices until a desk
    has four hundred rows on it.
    """
    stmt = select(Entry).where(Entry.tournament_id == tournament_id)
    if state:
        stmt = stmt.where(Entry.state == state)
    rows = repo.session.scalars(
        stmt.order_by(Entry.submitted_at.desc(), Entry.id.desc())
    )
    codes = _event_codes(repo, tournament_id)
    return [
        EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id))
        for row in rows
    ]


@router.post(
    "/{tournament_id}/entries/commit",
    response_model=EntryCommitResultDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def commit_entries_route(
    tournament_id: uuid.UUID = Path(...),
    entry_event_id: Optional[uuid.UUID] = Query(
        None, description="Commit only this entry event (spec §5's event filter)."
    ),
    repo: LocalRepository = Depends(get_repository),
):
    """Run Seam A and return the per-entry summary.

    Safe to press twice: the seam is idempotent by design (Q3 — entries
    reopen, late arrivals are routine), so a double-click commits nothing
    twice and answers with an empty ``committed`` list.

    Declared **before** the ``{entry_id}`` route below only for reading
    order; ``/entries/commit`` and ``/entries/{entry_id}/confirm`` are
    different depths and cannot shadow each other.
    """
    result = commit_entries(repo, tournament_id, entry_event_id=entry_event_id)
    return EntryCommitResultDTO(**result.as_dict())


@router.post(
    "/{tournament_id}/entries/{entry_id}/confirm",
    response_model=EntryDeskRowDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def confirm_entry(
    tournament_id: uuid.UUID = Path(...),
    entry_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """``pending → confirmed`` — the operator's decision, made explicit.

    A wrong starting state is a 409 rather than a silent success. Confirming
    an already-confirmed entry is harmless in itself, but it means the
    operator is looking at a screen that disagrees with the database, and
    answering 200 would leave them believing they had just done something.
    """
    row = _get_entry(repo, tournament_id, entry_id)
    if row.state != _CONFIRMABLE_FROM:
        raise http_error(
            409,
            ErrorCode.ENTRY_INVALID_STATE,
            f"entry is {row.state!r}; only {_CONFIRMABLE_FROM!r} entries "
            "can be confirmed",
        )
    row.state = "confirmed"
    repo.session.commit()
    codes = _event_codes(repo, tournament_id)
    return EntryDeskRowDTO.from_row(row, event_code=codes.get(row.entry_event_id))


# ---- configuration: the entry page and its events -----------------------


def _parse_moment(value: Optional[str], field: str) -> Optional[datetime]:
    """ISO-8601 → datetime, or a 400 naming the field.

    Pydantic would coerce a ``datetime`` for us, but it answers 422 with a
    validation blob; these two fields are the ones an operator hand-types
    most often, so the answer says which of them was unreadable.
    """
    if value is None or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            f"{field} is not an ISO-8601 timestamp: {value!r}",
        )


@router.put(
    "/{tournament_id}/entry-page",
    response_model=EntryPageDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def upsert_entry_page(
    body: EntryPageUpsertDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Create or replace this workspace's entry page.

    One row per workspace — the table's primary key *is* ``tournament_id``
    — so PUT is the honest verb and there is nothing for a POST to create
    a second of.

    ``regulations_version`` bumps only when ``regulationsText`` actually
    changes (Q11.4). Every entry records the version it accepted, so a
    bump on every save would silently invalidate every acknowledgment on
    file the next time an operator fixed a typo in the intro paragraph.
    """
    slug = body.slug.strip()
    if not _SLUG_RE.match(slug):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            "slug must be 3-60 characters of lowercase letters, digits and "
            f"hyphens: {body.slug!r}",
        )

    # Slugs are globally unique — the slug alone resolves the public page,
    # with no workspace in the URL. Checked explicitly so the answer names
    # the field; the IntegrityError below is the race's backstop, not the
    # normal path. Neither answer says which workspace holds it: the
    # namespace is public, the workspaces behind it are not.
    taken = repo.session.execute(
        select(EntryPage.tournament_id).where(
            EntryPage.slug == slug,
            EntryPage.tournament_id != tournament_id,
        )
    ).first()
    if taken is not None:
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )

    row = repo.session.get(EntryPage, tournament_id)
    if row is None:
        row = EntryPage(tournament_id=tournament_id, regulations_version=1)
        repo.session.add(row)
    elif (row.regulations_text or "") != (body.regulationsText or ""):
        row.regulations_version = (row.regulations_version or 1) + 1

    row.slug = slug
    row.is_open = body.isOpen
    row.intro_text = body.introText
    row.regulations_text = body.regulationsText
    row.waiver_required = body.waiverRequired

    try:
        repo.session.commit()
    except IntegrityError:
        # Two workspaces claiming one slug in the same instant. The unique
        # index is the arbiter; the loser gets the same answer it would
        # have got a millisecond earlier.
        repo.session.rollback()
        raise http_error(
            409,
            ErrorCode.ENTRY_PAGE_SLUG_TAKEN,
            f"the slug {slug!r} is already in use",
        )
    repo.session.refresh(row)
    return EntryPageDTO.from_row(row)


@router.post(
    "/{tournament_id}/entry-events",
    response_model=EntryEventDTO,
    status_code=201,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def create_entry_event(
    body: EntryEventCreateDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Add one entry-facing event to this workspace.

    ``code`` is the pivot the commit seam maps onto Meet's ``ranks[]`` or a
    bracket event, so a blank one is an entry that can never be committed —
    refused here rather than discovered at commit time, where the seam
    would (correctly) skip-and-report it and the operator would have to
    work out why.

    No uniqueness on ``code``: two events can legitimately share one — a
    workspace running the same discipline in two age bands maps both onto
    the same rank — and the desk shows the discipline alongside.
    """
    code = body.code.strip()
    if not code:
        raise http_error(400, ErrorCode.INVALID_INPUT, "code must not be empty")
    discipline = body.discipline.strip()
    if not discipline:
        raise http_error(400, ErrorCode.INVALID_INPUT, "discipline must not be empty")

    row = EntryEvent(
        tournament_id=tournament_id,
        code=code,
        discipline=discipline,
        entry_type=body.entryType,
        bracket_event_id=body.bracketEventId,
        cap=body.cap,
        fee_cents=body.feeCents,
        opens_at=_parse_moment(body.opensAt, "opensAt"),
        closes_at=_parse_moment(body.closesAt, "closesAt"),
    )
    repo.session.add(row)
    repo.session.commit()
    repo.session.refresh(row)
    return EntryEventDTO.from_row(row)
