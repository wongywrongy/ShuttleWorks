"""The Entries facts the control plane reads (E4, program Phase 9 — spec Q9).

**Why this lives in ``shared/`` and not in ``entries/``.** Two modules need
it and neither may name the other: the persistence layer builds it from
grouped queries, and ``workspaces/workspace_signals.py`` derives the phase
and the attention codes from it — and the import-linter contract "Workspaces
names only Bracket, Identity, Meet and Operations" forbids a
``workspaces -> entries`` edge. That contract is not an obstacle here, it is
a description of the right answer: the *lifecycle* of an entry is Entries'
business, the *shape of a workspace's entries* is a fact about the
workspace, and this module is the second thing with no opinion about the
first. It follows ``shared/``'s rule literally — it names no domain, imports
no domain, and reads its inputs structurally (``getattr``), so it will
compile against anything with the right attributes.

**Everything here is pure and every number is COUNTED, never inferred.**
``build_entries_facts`` takes rows and returns a frozen record; the phase
and the six codes are derived from that record by pure functions in
``workspace_signals``. Nothing in this file queries, and nothing decides —
which is what lets the whole Q9 vocabulary be unit-tested against literals
rather than against a database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

# The entry states this module reasons about. Spelled here rather than
# imported from ``entries.lifecycle`` because importing it would be the
# ``shared -> entries`` edge the module docstring exists to avoid — and
# because these five strings are wire vocabulary that the database already
# stores, not a rule. ``tests/backend/unit/test_entries_signals.py`` asserts
# the two spellings agree, so the duplication cannot drift silently.
_UNVERIFIED = "unverified"
_PENDING = "pending"
_WAITLISTED = "waitlisted"
_CONFIRMED = "confirmed"
_WITHDRAWN = "withdrawn"

_AWAITING_PARTNER = "awaiting_partner"
_AWAITING_PAYMENT = "awaiting_payment"
_PAIR_CONFLICT = "pair_conflict"

#: States that occupy a place in an event, for the cap comparison. The
#: waitlist is excluded for the reason ``entries.lifecycle.at_cap`` gives:
#: a queued entry must not raise the bar for the next one.
_HOLDING = frozenset({_UNVERIFIED, _PENDING, _CONFIRMED})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes; re-attach UTC before comparing."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


@dataclass(frozen=True)
class EntriesFacts:
    """One workspace's entries, counted.

    Present only for a workspace that HAS an entry page. Absent is a
    meaningful answer — no page, no entries phase, no entries attention —
    and is why the repository returns a sparse map rather than a record per
    workspace.
    """

    #: The director has opened the page. Not the same as an event being open:
    #: a page can be open while every event's window has closed.
    page_open: bool = False
    #: Any event currently inside its own opens/closes window.
    any_event_open: bool = False
    #: The earliest close still in the future, for "closing soon". None when
    #: nothing is open or nothing has a close date.
    next_close_at: Optional[datetime] = None
    #: True once every dated event's close has passed. Undated events never
    #: close, so a workspace with one is never "closed" — which is correct:
    #: the director has not said when entries stop.
    entries_closed: bool = False

    total: int = 0
    #: Live states, individually — the review surface needs the breakdown and
    #: a single "open entries" number would have to be re-derived to get it.
    pending: int = 0
    waitlisted: int = 0
    confirmed: int = 0
    #: ``confirmed`` entries the commit seam has not written to a roster.
    uncommitted_confirmed: int = 0
    #: Entries whose named partner has not accepted.
    awaiting_partner: int = 0
    #: Entries an operator must disambiguate (both halves of each pair).
    pair_conflicts: int = 0
    #: ``confirmed`` entries still carrying ``awaiting_payment``.
    unpaid_confirmed: int = 0
    #: Entries the seam committed and that were then withdrawn (ruling R3 —
    #: the roster is deliberately NOT rewound, so this is a job for a human).
    committed_then_withdrawn: int = 0
    #: Event codes that are at cap AND have somebody queued behind them.
    at_cap_with_waitlist: tuple = field(default_factory=tuple)


def build_entries_facts(
    *, page: Any, events: Sequence[Any], entries: Sequence[Any], now: Optional[datetime] = None
) -> EntriesFacts:
    """Count one workspace's entries. Pure; ``now`` is injectable for tests."""
    moment = now or _utcnow()

    open_events = [ev for ev in events if _event_is_open(ev, moment)]
    closes = [
        _aware(getattr(ev, "closes_at", None))
        for ev in events
        if getattr(ev, "closes_at", None) is not None
    ]
    future_closes = [c for c in closes if c is not None and c > moment]
    # Closed only when EVERY event has a close date and all of them have
    # passed. An undated event has no close, so a workspace holding one is
    # never "entries closed" — the director simply has not said when.
    entries_closed = (
        bool(events)
        and len(closes) == len(events)
        and not future_closes
    )

    by_event_holding: dict[Any, int] = {}
    by_event_waitlisted: dict[Any, int] = {}
    pending = waitlisted = confirmed = 0
    uncommitted = awaiting_partner = conflicts = unpaid = withdrew_after_commit = 0

    for entry in entries:
        state = str(getattr(entry, "state", "") or "")
        reasons = list(getattr(entry, "pending_reasons", None) or [])
        event_id = getattr(entry, "entry_event_id", None)

        if state in _HOLDING:
            by_event_holding[event_id] = by_event_holding.get(event_id, 0) + 1
        if state == _WAITLISTED:
            by_event_waitlisted[event_id] = by_event_waitlisted.get(event_id, 0) + 1
            waitlisted += 1
        elif state == _PENDING:
            pending += 1
        elif state == _CONFIRMED:
            confirmed += 1
            if not getattr(entry, "committed_player_id", None):
                uncommitted += 1
            if _AWAITING_PAYMENT in reasons:
                unpaid += 1
        elif state == _WITHDRAWN and getattr(entry, "committed_player_id", None):
            withdrew_after_commit += 1

        # Flags are counted across every LIVE state, not only pending: a
        # waitlisted entry with an unresolved pair is still an unresolved
        # pair, and it becomes the operator's problem the moment it is
        # promoted rather than at some later point nobody is watching.
        if state in (_UNVERIFIED, _PENDING, _WAITLISTED, _CONFIRMED):
            if _AWAITING_PARTNER in reasons:
                awaiting_partner += 1
            if _PAIR_CONFLICT in reasons:
                conflicts += 1

    at_cap = tuple(
        sorted(
            str(getattr(ev, "code", "") or "")
            for ev in events
            if getattr(ev, "cap", None) is not None
            and by_event_holding.get(getattr(ev, "id", None), 0)
            >= int(getattr(ev, "cap") or 0)
            and by_event_waitlisted.get(getattr(ev, "id", None), 0) > 0
        )
    )

    return EntriesFacts(
        page_open=bool(getattr(page, "is_open", False)),
        any_event_open=bool(open_events),
        next_close_at=min(future_closes) if future_closes else None,
        entries_closed=entries_closed,
        total=len(entries),
        pending=pending,
        waitlisted=waitlisted,
        confirmed=confirmed,
        uncommitted_confirmed=uncommitted,
        awaiting_partner=awaiting_partner,
        pair_conflicts=conflicts,
        unpaid_confirmed=unpaid,
        committed_then_withdrawn=withdrew_after_commit,
        at_cap_with_waitlist=at_cap,
    )


def _event_is_open(event: Any, moment: datetime) -> bool:
    """Inside the event's own window.

    A missing bound is an OPEN bound in both directions — no ``opens_at``
    means it has always been open, no ``closes_at`` means it has not closed.
    That is the same reading ``entries/entries_public._event_is_open`` takes
    for the public page, and the two agreeing is what stops the Hub saying
    "entries open" over a page that refuses submissions.
    """
    opens = _aware(getattr(event, "opens_at", None))
    closes = _aware(getattr(event, "closes_at", None))
    if opens is not None and moment < opens:
        return False
    if closes is not None and moment >= closes:
        return False
    return True
