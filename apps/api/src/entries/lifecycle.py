"""The entry lifecycle state machine (E2, program Phase 7 — spec §6).

Until this module, the machine in the spec's §6 diagram existed as one
transition: ``pending → confirmed``, written inline in the operator desk
route. Everything else was vocabulary — states the schema could hold and
nothing could reach. This is the rest of it, in one file, because a state
machine spread across the routes that trigger it is a state machine nobody
can read.

**The transition table is the spec's, verbatim, and the actor column is
load-bearing.** Three transitions are the operator's alone (confirm,
reject, promote), two are the entrant's (withdraw, withdraw-and-erase), two
are automatic (waitlist at cap, and the promotion from ``unverified`` when
the account verifies). "Automatic" here never means *consequential*:
invariant I4 says no software decides an outcome, and auto-waitlisting is
the exact case the invariant was written around — it is a **queue
position**, not a rejection, it is always operator-reversible, and it
refuses nobody.

**Why refusals are exceptions and not booleans.** Every guard below raises
``LifecycleError`` carrying a code *and the reason in a sentence*. The
entrant-facing ones ("entries for this event closed to withdrawals on
12 August") are read by a human who has to decide what to do next, and the
operator-facing ones are read by someone who needs to know why a button
they can see did not work. A boolean return would push that sentence into
every call site, which is how two call sites end up disagreeing about what
the rule was.

**Erasure, ruling D7 (owner, 2026-08-21): scrub the person, keep the
record.** ``withdraw(..., erase=True)`` overwrites the player's name, club
and remarks and stamps ``erased_at``; the submission, its entries, their
states and the fee history all survive. The entrant's right is to stop
being in the director's records as a *person*; the director's records of
*what happened* are not the entrant's to delete. The alternative shapes and
why they lost are in the migration ``w7c2d8e0f5a6``.

**Nothing here commits.** Callers own the transaction boundary, matching
``identity/auth``, ``identity/entrants`` and ``solve_rail/solve_jobs``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.models import Entry, EntryEvent, EntryPlayer, Submission

# ---- the vocabulary ---------------------------------------------------

UNVERIFIED = "unverified"
PENDING = "pending"
WAITLISTED = "waitlisted"
CONFIRMED = "confirmed"
REJECTED = "rejected"
WITHDRAWN = "withdrawn"

#: States an entry can still move out of — the spec's "any live state" in
#: the withdrawal row. ``rejected`` is absent deliberately: an operator has
#: already decided, and re-opening that by a public route would let an
#: entrant overturn a decision by pressing a button.
LIVE_STATES = frozenset({UNVERIFIED, PENDING, WAITLISTED, CONFIRMED})

#: The pending reason an auto-waitlisted entry carries, so the desk can say
#: *why* an entry is queued rather than leaving the state to imply it.
OVER_CAP = "over_cap"

#: Set by E5's manual payment marking (Phase 10); named here because the
#: reason vocabulary is one list and a second home for one string is how
#: two spellings of ``awaiting_payment`` end up shipping.
AWAITING_PAYMENT = "awaiting_payment"

#: E3 (Phase 8). Same reason as above.
AWAITING_PARTNER = "awaiting_partner"

#: The text a scrubbed player row carries. A tombstone rather than an empty
#: string: ``""`` renders as a blank cell that reads like a bug, and NULL is
#: refused by ``full_name``'s NOT NULL — which is correct, because the row
#: still describes an entry that happened.
ERASED_NAME = "(erased)"


class LifecycleError(Exception):
    """A refused transition, with the reason a human needs.

    ``code`` is stable wire vocabulary; ``message`` is the sentence. Both,
    always — see the module docstring.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; re-attach UTC before comparing."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# ---- intake: where a new entry lands ----------------------------------


def landing_state(*, email_verified: bool) -> str:
    """The state a freshly submitted entry starts in (spec §6, ruling D1).

    D1 said: while no verification machinery exists, land in ``pending``,
    because ``unverified``'s only exit is the verification transition and an
    entry parked there could never reach the roster. **The machinery exists
    as of this phase**, so the ruling's own condition flips and an
    unverified account's entries land in ``unverified`` — reachable now,
    because ``promote_verified_entries`` below is the exit.

    Verified accounts are unaffected, which is most of them: verification is
    a one-time act per account, not per entry.
    """
    return PENDING if email_verified else UNVERIFIED


def promote_verified_entries(session: Session, account_id: uuid.UUID) -> int:
    """``unverified → pending`` for every entry this account ever made.

    R10's "one verification covers every entry that account ever makes",
    executed. Runs on the verification transition, so an entrant who
    submitted three times before clicking the link finds all three moving
    together rather than having to resubmit.

    Returns the number promoted, which is what the route logs — a
    verification that promoted nothing is a normal case (already-verified
    account, or an account that has not entered yet) and not an error.
    """
    promoted = 0
    for entry in _entries_of(session, account_id, states=(UNVERIFIED,)):
        entry.state = PENDING
        promoted += 1
    return promoted


def _entries_of(
    session: Session, account_id: uuid.UUID, *, states: Sequence[str]
) -> list[Entry]:
    """This account's entries in the given states, across every workspace.

    Two queries rather than a join, because the account owns the
    **submission** and the entry hangs off it — ``entries`` carries no
    ``account_id`` and giving it one would be a second answer to "whose is
    this", which is the question R13 spent a schema reshape making
    single-valued. The submission id set is small by construction: it is
    one person's entry history.
    """
    submission_ids = list(
        session.scalars(
            select(Submission.id).where(Submission.account_id == account_id)
        )
    )
    if not submission_ids:
        return []
    return list(
        session.scalars(
            select(Entry).where(
                Entry.submission_id.in_(submission_ids),
                Entry.state.in_(list(states)),
            )
        )
    )


def at_cap(session: Session, tournament_id: uuid.UUID, event: Any) -> bool:
    """Is this event full? (spec §6, "→ waitlisted, automatic, at cap".)

    Counts the entries that are *holding a place*: ``LIVE_STATES`` minus
    the waitlist itself. A waitlisted entry must not count toward the cap —
    if it did, the first person queued would raise the bar for the second,
    and an event capped at 16 with 4 queued would look full at 12.

    No cap configured means never full. ``cap = 0`` means full immediately,
    which is a director closing an event without deleting it and is a
    legitimate thing to express.
    """
    cap = getattr(event, "cap", None)
    if cap is None:
        return False
    holding = session.scalar(
        select(func.count())
        .select_from(Entry)
        .where(
            Entry.tournament_id == tournament_id,
            Entry.entry_event_id == event.id,
            Entry.state.in_([UNVERIFIED, PENDING, CONFIRMED]),
        )
    )
    return int(holding or 0) >= int(cap)


# ---- the entrant's transitions ----------------------------------------


def assert_withdrawable(entry: Entry, event: Optional[EntryEvent]) -> None:
    """Raise unless this entry may be withdrawn by its entrant, right now.

    Two guards, and they refuse for different reasons:

    - **State.** Already withdrawn is a no-op the caller should not present
      as an action; rejected is an operator's decision (see ``LIVE_STATES``).
    - **The withdrawal deadline** (``withdraws_until``, ruling R14 §3).
      Separate from ``closes_at`` because organisers use the gap — Badminton
      Ontario closes entries on the Tuesday and takes withdrawals until the
      Wednesday. A NULL deadline means the director set none, and the
      software does not invent one.

    After the deadline the entrant is not stuck, they are just not
    self-serve: an operator can still withdraw them at the desk, which is
    the same answer the incumbent gives and the reason this refusal names
    the date rather than saying no.
    """
    if entry.state not in LIVE_STATES:
        raise LifecycleError(
            "ENTRY_NOT_LIVE",
            "That entry has already been withdrawn or decided.",
        )
    deadline = getattr(event, "withdraws_until", None) if event is not None else None
    if deadline is not None and _aware(deadline) <= _utcnow():
        raise LifecycleError(
            "WITHDRAWAL_CLOSED",
            "The withdrawal deadline for this event has passed. "
            "Contact the organiser to withdraw.",
        )


def withdraw(
    session: Session,
    entry: Entry,
    event: Optional[EntryEvent],
    *,
    erase: bool = False,
    by_operator: bool = False,
) -> Entry:
    """Move a live entry to ``withdrawn``; optionally erase the person.

    ``by_operator`` skips the deadline guard and nothing else. That is not a
    loophole — it is the deadline's stated escape hatch, and it is the shape
    invariant I4 asks for: the software prevents the entrant's accident, the
    operator decides the exception.

    **A committed entry is NOT un-committed here** (ruling R3). If the seam
    has already written this entry onto the roster, ``committed_player_id``
    stays set and the roster is left exactly as it is. The withdrawal
    becomes a *signal* — an operator has a scheduled player who is no longer
    entered, and a machine silently pulling them out of a built draw is the
    kind of automatic consequence I4 forbids. ``committed_and_withdrawn``
    below is what the attention code reads.
    """
    if by_operator:
        if entry.state not in LIVE_STATES:
            raise LifecycleError(
                "ENTRY_NOT_LIVE",
                "That entry has already been withdrawn or decided.",
            )
    else:
        assert_withdrawable(entry, event)

    entry.state = WITHDRAWN
    entry.withdrawn_at = _utcnow()
    if erase:
        erase_player(session, entry)
    return entry


def erase_player(session: Session, entry: Entry) -> Optional[EntryPlayer]:
    """Scrub the human behind an entry (ruling D7). Returns the row scrubbed.

    **Erases the player, not the entry** — see the module docstring. The
    scrub covers every field on ``entry_players`` that describes a person:
    the name, the club, the free-text remarks, and ``birth_year``, which is
    an eligibility field but is still a fact about a human.

    ``account_id`` survives, and that is deliberate: it is a foreign key to
    a row this function does not touch, and breaking it would orphan the
    entry from the act that created it. The address behind that key is
    erased by *account* deletion (Phase 10), which is a different request
    with a different scope — erasing one child's entry must not delete the
    parent's account.

    **Idempotent.** A second call finds ``erased_at`` set and does nothing,
    so a double-submitted form cannot overwrite the tombstone with a second
    identical tombstone and a fresher timestamp.
    """
    player = entry.player
    if player is None or player.erased_at is not None:
        return player
    player.full_name = ERASED_NAME
    player.club = None
    player.remarks = None
    player.birth_year = None
    player.erased_at = _utcnow()
    return player


def committed_and_withdrawn(entries: Iterable[Entry]) -> list[Entry]:
    """The entries a director has to reconcile by hand (E4's attention code).

    Derived, not stored: an entry is in this set when the commit seam wrote
    it onto the roster (``committed_player_id``) and it was withdrawn
    afterwards. A stored flag would be a third place the same fact lives and
    the first one to go stale.
    """
    return [
        entry
        for entry in entries
        if entry.committed_player_id and entry.state == WITHDRAWN
    ]


# ---- the operator's transitions ---------------------------------------


def reject(entry: Entry, *, note: Optional[str] = None) -> Entry:
    """``pending | waitlisted → rejected``. Operator only, terminal.

    Rejecting a *confirmed* entry is refused: that entry may already be on
    the roster and in a draw, and the honest operation there is a
    withdrawal, which says what actually happens to the player rather than
    pretending the entry was never accepted.
    """
    if entry.state not in (PENDING, WAITLISTED, UNVERIFIED):
        raise LifecycleError(
            "ENTRY_NOT_REJECTABLE",
            "Only an entry still awaiting a decision can be rejected. "
            "Withdraw a confirmed entry instead.",
        )
    entry.state = REJECTED
    return entry


def promote(entry: Entry) -> Entry:
    """``waitlisted → pending``. Operator only.

    **To pending, never straight to confirmed.** The spec's diagram allows
    "pending/confirmed" and this implementation takes the narrow half on
    purpose: promotion off a waitlist is the operator saying *a place opened*,
    which is a different act from *this entry is accepted*. Landing in
    pending means the confirm still happens, deliberately, through the same
    button and the same rules as every other confirmation — including
    whatever pending reasons the entry is still carrying.

    The ``over_cap`` reason is cleared here, because it is no longer true.
    Anything else the entry carries (a gender flag, a duplicate suspicion)
    survives: those are unrelated judgements and a promotion does not
    resolve them.
    """
    if entry.state != WAITLISTED:
        raise LifecycleError(
            "ENTRY_NOT_WAITLISTED",
            "Only a waitlisted entry can be promoted.",
        )
    entry.state = PENDING
    entry.pending_reasons = [
        reason for reason in (entry.pending_reasons or []) if reason != OVER_CAP
    ]
    return entry


def assert_confirmable(entry: Entry) -> None:
    """Raise unless ``pending → confirmed`` is legal for this entry.

    Ruling D1's guard, lifted out of the desk route so the machine states
    its own rules. ``waitlisted`` is refused with its own message because
    "confirm" on a queued entry is a real thing an operator will try, and
    the answer — promote first — is actionable.
    """
    if entry.state == WAITLISTED:
        raise LifecycleError(
            "ENTRY_WAITLISTED",
            "That entry is on the waitlist. Promote it first, then confirm.",
        )
    if entry.state == UNVERIFIED:
        raise LifecycleError(
            "ENTRY_UNVERIFIED",
            "That entrant has not confirmed their email address yet.",
        )
    if entry.state != PENDING:
        raise LifecycleError(
            "ENTRY_NOT_PENDING",
            "Only a pending entry can be confirmed.",
        )


def owned_by(entry: Entry, account_id: uuid.UUID) -> bool:
    """Did this account perform the act that created this entry?

    The authorization predicate for every entrant-facing transition. It
    reads the SUBMISSION's account, not the player's: ``entry_players``
    also carries an ``account_id`` ("who may act for this player"), and
    E3 will make the two legitimately differ when a partner's entry hangs
    off someone else's act. Until that exists, answering from the act is
    the narrower and therefore safer of the two.
    """
    submission = entry.submission
    return submission is not None and submission.account_id == account_id


def live_entries_for(session: Session, account_id: uuid.UUID) -> Sequence[Entry]:
    """Every still-live entry this account submitted, any workspace.

    Used by account-level erasure (Phase 10) and by the my-entries surface
    to decide which lines can offer a withdraw action at all.
    """
    return _entries_of(session, account_id, states=sorted(LIVE_STATES))
