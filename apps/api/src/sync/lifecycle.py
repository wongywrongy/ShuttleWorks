"""History for the two sync graphs (state machines v2, SMV2-3).

`sync_quarantine.status` and `tournament_authority_epochs.state` each had a
CHECK constraint and transition code and no registered machine, which left
S-3's acceptance criterion — every CHECK state appears in exactly one machine —
unmeetable. Both are behaviour-preserving: the states written and the order they
are written in are exactly what the services already did.

`tournament_authority_transitions` is not replaced. It records *authority*
evidence — who authorized, on which device, against what proof — and stays the
protocol's audit trail. The lifecycle row records the same move in the one
vocabulary every other subject uses, which is what makes "show me everything
that happened to this workspace" one query instead of nine.

Nothing here commits.
"""

from __future__ import annotations

from core.state_machine import apply
from core.state_machines import AUTHORITY_EPOCH, SYNC_QUARANTINE


class _EpochSubject:
    """An epoch row addressed by one id.

    `tournament_authority_epochs` is keyed by (tournament_id, epoch), and the
    history table addresses a subject by a single string. Writes to `state`
    pass straight through, so the engine mutates the real row.
    """

    __tablename__ = "tournament_authority_epochs"

    def __init__(self, row) -> None:
        object.__setattr__(self, "_row", row)
        object.__setattr__(self, "id", f"{row.tournament_id}:{row.epoch}")
        object.__setattr__(self, "tournament_id", row.tournament_id)
        object.__setattr__(self, "state", row.state)

    def __setattr__(self, name: str, value) -> None:
        object.__setattr__(self, name, value)
        if name == "state":
            self._row.state = value


def transition_authority(session, authority, event: str, *, actor_id=None, reason=None,
                         detail=None):
    """Move an authority epoch and record it. Callers have already guarded."""
    record = apply(AUTHORITY_EPOCH, _EpochSubject(authority), event, "operator", guards={},
                   session=session, actor_id=actor_id, reason=reason, detail=detail)
    record.persist(session)
    return record


def resolve_quarantine(session, quarantine, *, actor_id=None, reason=None):
    """``open → resolved``. The rejected envelope itself stays immutable."""
    record = apply(SYNC_QUARANTINE, quarantine, "resolve", "operator", guards={},
                   session=session, actor_id=actor_id, reason=reason)
    record.persist(session)
    return record
