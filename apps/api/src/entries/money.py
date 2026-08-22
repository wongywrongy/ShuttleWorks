"""Manual payment, at the level that was actually paid (E5, Phase 10).

**The submission is the unit, and that is R13/R14 rather than convenience.**
A form act covering three events for two children is *one* agreement, one
computed total and one transfer — the entrant pays once, the director sees
one amount arrive, and the `submissions` row is where that total already
lives. Marking three entries paid individually would invent three payments
that never happened, and the first question anyone asked ("did they pay?")
would have three answers.

**Payment clears exactly one pending reason and never confirms an entry**
(invariant I4). This is the invariant most likely to be eroded by a
well-meaning edit — an operator marking a payment obviously *wants* the entry
to go through — so it is structural here: nothing in this module writes
`state`. Confirmation stays the operator's separate, deliberate act, made
against whatever else the entry is carrying.

**Q8's boundary is untouched.** v1 records a payment somebody made elsewhere;
it processes nothing. When Stripe eventually lands, its webhook clears the
same reason through the same function, and everything downstream is unchanged
— which is the whole point of putting the boundary here rather than at the
route.

Nothing here commits; callers own the transaction boundary.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Entry, Submission
from entries import lifecycle

#: The reason an unpaid submission's entries carry. Re-exported from the
#: lifecycle vocabulary rather than respelled — one list, one truth.
AWAITING_PAYMENT = lifecycle.AWAITING_PAYMENT


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def owes_payment(fee_total_cents: Optional[int]) -> bool:
    """Does this act owe money?

    ``None`` is not zero and neither is a lie: a tournament that configured
    no prices has not declared its entries free, so an act with no quote owes
    nothing *that we know of* and must not be flagged as unpaid. A real
    ``0`` — a free event priced deliberately — likewise owes nothing.
    """
    return bool(fee_total_cents)


def entries_of(session: Session, submission: Submission) -> list[Entry]:
    """Every entry under one act, in a stable order."""
    return list(
        session.scalars(
            select(Entry)
            .where(
                Entry.tournament_id == submission.tournament_id,
                Entry.submission_id == submission.id,
            )
            .order_by(Entry.submitted_at.asc(), Entry.id.asc())
        )
    )


def mark_paid(
    session: Session, submission: Submission, *, note: Optional[str] = None
) -> list[Entry]:
    """Record that this act was paid. Returns the entries whose reason cleared.

    Idempotent: marking an already-paid act paid again refreshes nothing and
    is not an error. An operator pressing twice, or two operators pressing at
    once on a busy desk, is a thing that happens — and the second press
    finding a timestamp already there is the correct outcome, not a conflict
    to explain.

    **Does not touch `state`.** See the module docstring.
    """
    if submission.paid_at is None:
        submission.paid_at = _utcnow()
    if note is not None:
        submission.payment_note = note.strip()[:2000] or None

    cleared: list[Entry] = []
    for entry in entries_of(session, submission):
        reasons = list(entry.pending_reasons or [])
        if AWAITING_PAYMENT in reasons:
            entry.pending_reasons = [r for r in reasons if r != AWAITING_PAYMENT]
            cleared.append(entry)
    return cleared


def mark_unpaid(session: Session, submission: Submission) -> list[Entry]:
    """Undo a payment record. Returns the entries that regained the reason.

    An operator marks the wrong act paid; this is how they take it back. The
    reason returns only where the act **owes** money — un-marking a free act
    must not invent a debt that never existed.

    Like `mark_paid`, it does not touch `state`: an entry confirmed while the
    payment was recorded stays confirmed. Whether to un-confirm is a judgement
    with consequences on a roster, and it belongs to the operator through the
    ordinary desk actions rather than as a side effect of correcting a note.
    """
    submission.paid_at = None
    if not owes_payment(submission.fee_total_cents):
        return []

    flagged: list[Entry] = []
    for entry in entries_of(session, submission):
        if entry.state not in lifecycle.LIVE_STATES:
            continue
        reasons = list(entry.pending_reasons or [])
        if AWAITING_PAYMENT not in reasons:
            entry.pending_reasons = [*reasons, AWAITING_PAYMENT]
            flagged.append(entry)
    return flagged


def initial_reasons(fee_total_cents: Optional[int]) -> list[str]:
    """The payment reason a freshly submitted entry starts with, if any.

    Called by the write path so an entry that owes money says so from the
    moment it exists. Before E5 the reason was vocabulary nothing produced,
    which is why `UNPAID_ENTRIES` (E4) could never fire.
    """
    return [AWAITING_PAYMENT] if owes_payment(fee_total_cents) else []


def unpaid_submission_ids(
    session: Session, tournament_id: uuid.UUID
) -> Sequence[uuid.UUID]:
    """Acts in this workspace that owe money and have not paid.

    The desk's filter. Reads `paid_at` rather than the entries' reasons: the
    payment is a property of the act, and deriving it back from the entries
    would let a hand-edited reason list disagree with the record.
    """
    return list(
        session.scalars(
            select(Submission.id).where(
                Submission.tournament_id == tournament_id,
                Submission.paid_at.is_(None),
                Submission.fee_total_cents.is_not(None),
                Submission.fee_total_cents > 0,
            )
        )
    )
