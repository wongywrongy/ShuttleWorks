"""The four competition graphs (state machines v2, S-3).

The definitions live in :mod:`core.state_machines` with the other six, because
the exporter reads one registry and that module must stay free of domain
imports. What lives here is what a definition cannot be: the wrappers that move
a real row and write its history in the caller's transaction, and the mapping
from "this is the status the service computed" to "this is the act that
happened", which is the whole point of having a graph at all.

**Nothing here commits**, matching ``competition/service.py`` and
``entries/lifecycle.py``.

**Three competition paths are deliberately not routed through here**: roster
import (``roster.py``), checkpoint restore (``checkpoint.py``) and the derived
projection (``projection.py``). The transaction contract already excludes
snapshots, imports and bulk resets; each of those reshapes whole events at once
and carries its own audit rows. The derivation appendix in the v2 plan says so
per path, so that "not modelled" stays a decision rather than an omission.
"""

from __future__ import annotations

from core.state_machine import TransitionError, apply
from core.state_machines import COMPETITION_EVENT, DRAW_INSTANCE, UNIT, UNIT_MEMBERSHIP

__all__ = [
    "COMPETITION_EVENT",
    "DRAW_INSTANCE",
    "UNIT",
    "UNIT_MEMBERSHIP",
    "set_unit_status",
    "withdraw_member",
    "set_draw_status",
    "transition",
]


def _error(exc: TransitionError):
    from competition.service import CompetitionError

    return CompetitionError(exc.code, exc.message)


def event_between(machine, current: str, target: str) -> str:
    """The one event that moves ``current`` to ``target`` in ``machine``.

    Services compute a status and then say "make it so"; the graph is what
    turns that back into a named act. An ambiguous or absent edge is a
    refusal, not a silent assignment — a status the graph cannot explain is
    exactly the drift ADR 0029 is about.
    """
    matches = {t.event for t in machine.transitions if current in t.from_states and t.to == target}
    if len(matches) != 1:
        raise _error(
            TransitionError(
                "INVALID_TRANSITION",
                f"Cannot move {machine.name} from '{current}' to '{target}'",
            )
        )
    return matches.pop()


def transition(machine, row, event: str, *, session, actor: str | None = None,
               actor_id=None, reason=None, detail=None, source_state: str | None = None):
    """Apply ``event`` to ``row`` and add its history row. Never commits.

    ``actor`` defaults to the actor the definition declares, because for these
    four graphs the act determines the actor: a roster settling is always the
    system's, a unit withdrawal always the director's.

    ``source_state`` is the claim adapter. ``withdraw_competition_unit`` parks
    the unit in ``pending`` to satisfy the roster trigger before emptying it;
    that parking is a precondition, not an act, and the history has to name the
    state the withdrawal actually started from.
    """
    current = source_state if source_state is not None else getattr(row, machine.state_attribute)
    subject = row
    if source_state is not None and getattr(row, machine.state_attribute) != source_state:
        from types import SimpleNamespace

        subject = SimpleNamespace(id=row.id, tournament_id=row.tournament_id,
                                  status=current, __tablename__=row.__tablename__)
    try:
        record = apply(machine, subject, event, actor or machine.edge(current, event).actor,
                       guards={}, session=session, actor_id=actor_id, reason=reason, detail=detail)
    except TransitionError as exc:
        raise _error(exc) from exc
    if subject is not row:
        setattr(row, machine.state_attribute, getattr(subject, machine.state_attribute))
    if session is not None:
        record.persist(session)
    return record


def set_unit_status(session, unit, target: str, *, event: str | None = None,
                    actor_id=None, source_state: str | None = None):
    """Move a competition unit to ``target``; a no-op when it is already there.

    Idempotent by design: ``settle_unit`` runs after every roster edit and most
    of those leave the unit where it was. A no-op writes no history, matching
    the refusal/no-op rule the engine already states.
    """
    current = source_state if source_state is not None else unit.status
    if current == target:
        return None
    return transition(UNIT, unit, event or event_between(UNIT, current, target),
                      session=session, actor_id=actor_id, source_state=source_state)


def withdraw_member(session, member, *, actor_id=None):
    """``active → withdrawn`` for one membership; a no-op if already withdrawn."""
    if member.status == "withdrawn":
        return None
    return transition(UNIT_MEMBERSHIP, member, "withdraw", session=session, actor_id=actor_id)


def set_draw_status(session, draw, target: str, *, actor_id=None):
    """Mirror the bracket event's status onto its current draw revision."""
    if draw.status == target:
        return None
    return transition(DRAW_INSTANCE, draw, event_between(DRAW_INSTANCE, draw.status, target),
                      session=session, actor_id=actor_id)
