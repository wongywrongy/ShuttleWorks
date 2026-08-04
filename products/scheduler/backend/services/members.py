"""Workspace membership mutations, guarding the last-owner invariant.

SP-CLOUD-3 Phase 1. SP-CLOUD-2 built a tenancy model you could enter
(create, invite, accept) but not exit: there was no way over HTTP to
remove a member, change their role, or hand the workspace to someone
else. This module is the write side of that gap.

**The invariant: a workspace can never be left with zero owners.** It is
enforced here, in the service layer, not in the UI — a UI guard is a
suggestion, and every one of these operations is reachable by anyone who
can send an HTTP request.

Transaction contract, matching ``services/solve_jobs.py``: **no function
here commits or rolls back.** The caller owns the transaction, so a route
can compose several of these with related writes atomically.

## Why the guard looks like this

The naive implementation — count the owners, then write if the count is
safe — is wrong on both dialects, for different reasons. Two concurrent
"demote the *other* owner" requests each observe two owners, each
believes itself legal, and together they strand the workspace.

- **Postgres** (READ COMMITTED) will not serialize them on its own: the
  two requests update *different rows*, so their row locks never
  conflict, and both commit. The fix is to lock the shared parent — the
  ``tournaments`` row — so membership mutations for one workspace queue
  up behind each other.
- **SQLite** permits a single writer, so the transactions do serialize,
  but a count read *before* the write transaction opened can already be
  stale. The fix is to re-check the count **inside** the writing
  statement, as a correlated subquery in its ``WHERE``, so the check and
  the write are one atomic operation.

Both mechanisms are applied together. On Postgres the subquery is
belt-and-braces; on SQLite ``with_for_update()`` is a documented no-op.
Neither is redundant on the dialect that needs it.

**The concurrency test was verified to fail without this lock.** With
``_lock_workspace`` stubbed to a no-op, the Postgres leg reports "left 0
owners" while SQLite still passes — which is exactly why the suite runs
on both dialects rather than the one that happens to serialize. See
``tests/unit/test_members_service.py::_run_interleaved`` for why a
barrier-synchronised test does *not* reproduce this.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from database.models import Tournament, TournamentMember

# Ordered least → most privileged. Kept here as the single definition;
# `app/dependencies.py` compares against the same vocabulary.
ROLES = ("viewer", "operator", "owner")
OWNER = "owner"


class MemberError(Exception):
    """Base for membership-mutation failures."""


class MemberNotFoundError(MemberError):
    """The target user is not a member of this workspace."""


class LastOwnerError(MemberError):
    """The operation would leave the workspace with no owner.

    Raised for remove, demote, and self-removal alike — every path that
    could strand a workspace answers with this one error, so the API can
    say the same thing however the caller got there.
    """


def get_role(
    session: Session, tournament_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[str]:
    """The user's role in this workspace, or ``None`` if not a member."""
    row = session.get(TournamentMember, (tournament_id, user_id))
    return row.role if row is not None else None


def _lock_workspace(session: Session, tournament_id: uuid.UUID) -> None:
    """Serialize membership mutations for one workspace.

    Locks the parent ``tournaments`` row. On Postgres this is what makes
    two mutations targeting *different* member rows contend; without it
    they proceed in parallel and the invariant is unenforceable. On
    SQLite ``with_for_update`` is ignored and the engine's writer lock
    does the same job.
    """
    session.execute(
        select(Tournament.id)
        .where(Tournament.id == tournament_id)
        .with_for_update()
    )


def _owner_count_subquery(tournament_id: uuid.UUID):
    """Scalar subquery counting the workspace's owners.

    Embedded in the ``WHERE`` of the writing statement rather than run
    beforehand, so the check cannot go stale between reading and writing.
    """
    return (
        select(func.count())
        .select_from(TournamentMember)
        .where(
            TournamentMember.tournament_id == tournament_id,
            TournamentMember.role == OWNER,
        )
        .scalar_subquery()
    )


def _require_member(
    session: Session, tournament_id: uuid.UUID, user_id: uuid.UUID
) -> str:
    role = get_role(session, tournament_id, user_id)
    if role is None:
        raise MemberNotFoundError(
            f"user {user_id} is not a member of workspace {tournament_id}"
        )
    return role


def set_role(
    session: Session,
    tournament_id: uuid.UUID,
    user_id: uuid.UUID,
    new_role: str,
) -> str:
    """Change a member's role. Returns the role actually stored.

    Refuses (``LastOwnerError``) when it would demote the only owner.
    Promotions and lateral moves are always safe.
    """
    if new_role not in ROLES:
        raise ValueError(f"unknown role: {new_role!r}")

    _lock_workspace(session, tournament_id)
    current = _require_member(session, tournament_id, user_id)
    if current == new_role:
        return new_role

    result = session.execute(
        update(TournamentMember)
        .where(
            TournamentMember.tournament_id == tournament_id,
            TournamentMember.user_id == user_id,
            # Demoting an owner is conditional on another owner existing.
            # Anything else is unconditional.
            (TournamentMember.role != OWNER) | (_owner_count_subquery(tournament_id) > 1),
        )
        .values(role=new_role)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise LastOwnerError(
            "cannot demote the last owner — a workspace must always have "
            "at least one owner"
        )
    session.expire_all()
    return new_role


def remove_member(
    session: Session, tournament_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Remove a member. Also the implementation of "leave".

    Self-removal deliberately shares this path: a sole owner leaving
    strands the workspace exactly as much as being removed does, so both
    hit the same guard rather than one of them being a back door.

    Removal takes effect immediately — ``require_tournament_access``
    reads membership live on every request and nothing caches it, so the
    removed user's next request 404s. Pinned by
    ``tests/test_member_management.py``.
    """
    _lock_workspace(session, tournament_id)
    _require_member(session, tournament_id, user_id)

    result = session.execute(
        delete(TournamentMember)
        .where(
            TournamentMember.tournament_id == tournament_id,
            TournamentMember.user_id == user_id,
            (TournamentMember.role != OWNER) | (_owner_count_subquery(tournament_id) > 1),
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise LastOwnerError(
            "cannot remove the last owner — a workspace must always have "
            "at least one owner"
        )
    session.expire_all()


def transfer_ownership(
    session: Session,
    tournament_id: uuid.UUID,
    from_user_id: uuid.UUID,
    to_user_id: uuid.UUID,
) -> None:
    """Hand the workspace to another member.

    A distinct operation rather than demote-then-promote: done in that
    order it passes through a zero-owner state, and done in the other it
    briefly grants two owners. Here the promotion happens first and the
    demotion second, inside one caller-owned transaction, so the
    workspace always has at least one owner at every point — including
    if the caller's transaction is rolled back midway.

    Transferring to yourself is a no-op rather than an error; it is what
    a double-submit looks like, and failing it would be surprising.
    """
    _lock_workspace(session, tournament_id)
    _require_member(session, tournament_id, from_user_id)
    _require_member(session, tournament_id, to_user_id)

    if from_user_id == to_user_id:
        return

    # Promote first — after this there are two owners, so the demotion
    # below cannot trip the last-owner guard.
    session.execute(
        update(TournamentMember)
        .where(
            TournamentMember.tournament_id == tournament_id,
            TournamentMember.user_id == to_user_id,
        )
        .values(role=OWNER)
        .execution_options(synchronize_session=False)
    )
    session.execute(
        update(TournamentMember)
        .where(
            TournamentMember.tournament_id == tournament_id,
            TournamentMember.user_id == from_user_id,
        )
        .values(role="operator")
        .execution_options(synchronize_session=False)
    )
    session.expire_all()
