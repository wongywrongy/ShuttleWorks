"""The operator's Entries desk (SP-E1-1, spec §5 + ruling D1).

Three workspace-scoped routes. Everything public — the slug page, the
submit endpoint, the entrant's capability link — is a separate surface and
a separate slice; nothing in this module is reachable without a session.

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

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import EntryCommitResultDTO, EntryDeskRowDTO
from database.models import Entry, EntryEvent
from repositories import LocalRepository, get_repository
from services.entries import commit_entries

router = APIRouter(prefix="/tournaments", tags=["entries"])

# The only lifecycle transition E1 ships (ruling D1).
_CONFIRMABLE_FROM = "pending"


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
    """The desk list: newest submission first.

    ``submitted_at`` is this table's created_at. It alone ties
    non-deterministically across SQLite and Postgres — several entries can
    genuinely land in the same tick — so ``id`` is the tiebreaker, per the
    house rule for every list query. Without it the same page reorders
    between reads and an operator loses their place mid-review.
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
