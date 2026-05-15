"""Match state machine — transitions, locked-status helpers.

The transition table is the backbone of the conflict detection layer.
Every status change goes through :func:`assert_valid_transition`
before SQL is touched; the function raises :class:`ConflictError`
when the transition is not in :data:`VALID_TRANSITIONS`, and the
route boundary translates the exception into HTTP 409.

The legacy ``api/match_state.py`` module holds route handlers + DTOs
for the existing ``match_states`` table; this services module is the
new state-machine layer the architecture-adjustment arc adds. They
coexist intentionally — see ``docs/changes/2026-05-13.md``.

ConflictError resolution
------------------------
The class is fetched from ``sys.modules`` at raise time rather than
imported once at module load. Several legacy test modules run
``del sys.modules['app.exceptions']`` at their own load time, which
strands stale cached references in any module that did
``from app.exceptions import ConflictError`` earlier. The runtime
lookup guarantees we always raise the *currently canonical* class —
the same one ``pytest.raises`` resolves on the test side.
"""
from __future__ import annotations

import sys
import uuid
from typing import TYPE_CHECKING, Iterable, List, Set, Union

from database.models import MatchStatus

if TYPE_CHECKING:
    from repositories.local import LocalRepository
    from scheduler_core.domain.models import LockedAssignment


def _conflict_error_class():
    """Resolve ``app.exceptions.ConflictError`` against current sys.modules."""
    mod = sys.modules.get("app.exceptions")
    if mod is None:
        from app import exceptions as mod  # noqa: F811
    return mod.ConflictError


VALID_TRANSITIONS: dict[MatchStatus, list[MatchStatus]] = {
    MatchStatus.SCHEDULED: [MatchStatus.CALLED],
    MatchStatus.CALLED: [MatchStatus.PLAYING, MatchStatus.SCHEDULED],
    MatchStatus.PLAYING: [MatchStatus.FINISHED, MatchStatus.RETIRED],
    MatchStatus.FINISHED: [],
    MatchStatus.RETIRED: [],
}


LOCKED_STATUSES: Set[MatchStatus] = {
    MatchStatus.CALLED,
    MatchStatus.PLAYING,
    MatchStatus.FINISHED,
    MatchStatus.RETIRED,
}


_StatusLike = Union[MatchStatus, str]


def _coerce(status: _StatusLike) -> MatchStatus:
    """Accept either ``MatchStatus`` or a raw string; normalise to enum."""
    if isinstance(status, MatchStatus):
        return status
    try:
        return MatchStatus(status)
    except ValueError as exc:
        # Unknown statuses are treated as transition conflicts so the
        # caller can react the same way they would for a forbidden
        # transition. Surfacing them as ValueError leaks the enum's
        # internals to the route layer.
        raise _conflict_error_class()(
            match_id="<unknown>",
            current_status=str(status),
            attempted_status=None,
            message=f"Unknown match status: {status!r}",
        ) from exc


def assert_valid_transition(
    match_id: str,
    current: _StatusLike,
    next_status: _StatusLike,
) -> None:
    """Raise :class:`ConflictError` if the transition is not permitted.

    Strict per the prompt's specification — same-state transitions
    (e.g. ``CALLED → CALLED``) are *not* in ``VALID_TRANSITIONS`` and
    do raise. Callers that legitimately want to re-assert the current
    status (e.g. a PUT route receiving a payload whose status equals
    what the row already has) must short-circuit *before* calling
    this function. See ``api/match_state.py::update_match_state`` for
    the canonical pattern.
    """
    current_enum = _coerce(current)
    next_enum = _coerce(next_status)
    if next_enum not in VALID_TRANSITIONS[current_enum]:
        raise _conflict_error_class()(
            match_id=match_id,
            current_status=current_enum.value,
            attempted_status=next_enum.value,
            message=(
                f"Cannot transition match {match_id} from "
                f"'{current_enum.value}' to '{next_enum.value}'"
            ),
        )


def is_locked(status: _StatusLike) -> bool:
    """True iff the match status pins court + time_slot for the solver."""
    return _coerce(status) in LOCKED_STATUSES


def locked_status_values() -> list[str]:
    """String values of every locked status — convenient for SQL ``IN`` clauses."""
    return [s.value for s in LOCKED_STATUSES]


def all_valid_transitions_for(current: _StatusLike) -> Iterable[MatchStatus]:
    """List the legal next-states from ``current`` (empty for terminal states)."""
    return VALID_TRANSITIONS[_coerce(current)]


def build_locked_assignments(
    repo: "LocalRepository",
    tournament_id: uuid.UUID,
) -> List["LockedAssignment"]:
    """Query the ``matches`` table for every row in ``LOCKED_STATUSES``
    and convert to ``LockedAssignment`` rows the solver consumes.

    Rows whose ``court_id`` or ``time_slot`` is still null (locked but
    not yet assigned by the solver) are skipped — there's nothing for
    the solver to pin them to. The solver's
    ``_add_locked_constraints`` method also tolerates match_ids that
    don't appear in the solve scope (slice-bounded repair), so the
    helper can return a superset without breaking downstream solves.
    """
    from scheduler_core.domain.models import LockedAssignment

    rows = repo.matches.get_by_statuses(tournament_id, LOCKED_STATUSES)
    out: List[LockedAssignment] = []
    for row in rows:
        if row.court_id is None or row.time_slot is None:
            continue
        out.append(
            LockedAssignment(
                match_id=row.id,
                court_id=row.court_id,
                time_slot=row.time_slot,
            )
        )
    return out
