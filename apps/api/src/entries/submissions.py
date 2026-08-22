"""One form act, recorded once (ruling R13; spec Seam B).

The unit this module owns is the **submission**: one entrant, one
acknowledgment, one retry key, one fee total — and one ``entries`` row per
(player, event) selection underneath it. Before R13 the unit was the entry,
which worked only while a form act covered exactly one event; a 1–N-event
act has no home on an entry for its acceptance record, its retry key or its
computed total, so those would either duplicate across N rows or have to be
reconstructed later by grouping on a timestamp.

**Replay returns the original submission and all of its entries.** Never a
partial re-creation, and never a second submission. That is the whole point
of the key: a form re-posted on a flaky connection is a *mechanical*
failure with mechanical semantics — hand back what the first post created.
Two entrants legitimately entering the same event is a different thing
entirely and is not a collision at all (Q12; no natural key is unique at
any level).

**The lookup is scoped to the workspace AND to the account, always**
(ruling D4, carried up a level; narrowed to the principal by SP-PROGRAM-1
Phase 6 §4). The submit route is reachable by anyone holding a public slug,
so resolving a client-supplied key globally would let an outsider probe
another tenant's keyspace and learn that some other workspace used the same
key. Tenant scope alone was enough only while no real key ever arrived — a
native HTML form cannot send a header, so the key was NULL for every real
entrant — and Phase 6 makes keys flow, at which point a *guessed* key
resolves to another entrant's submission and hands the guesser their
receipt. The account is part of the identity of the retry, not a filter
applied to it, and the unique index moved with the lookup for a mechanical
reason: the ``IntegrityError`` recovery below re-reads with the caller's
account and re-raises on a miss, so an index wider than the lookup would
turn a foreign key into an unhandled 500.

The same narrowing governs reading an act back **by id** —
``find_for_account`` — because the 303 the persist path answers with names
a submission id in a ``Location`` header. Closing the replay door alone
would leave the identical disclosure standing behind the receipt route.

**The race is handled by re-reading, not by 409.** Two identical posts in
flight both miss the lookup and one wins the unique index. Answering 409 to
the loser would be a correct-looking error to a client that did nothing
wrong — so the loser re-reads and receives the winner's submission, which
is what it asked for in the first place. A *different* account presenting
the same key is not that case and is not told anything either: it gets a
fresh act, because a conflict status would be the existence oracle D4
narrowed the index to prevent.

**Acceptance is recorded at that moment, on the submission** (Q11): the
timestamp *and* the version agreed to. "They agreed to something at some
point" is not a record, and a version resolved later is a different
document than the one they read.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.models import Entry, EntryPlayer, Submission
from entries import lifecycle
from entries.entry_policy import NEEDS_REVIEW, gender_flags

log = logging.getLogger("scheduler.entries")

# Ruling D1's condition has flipped as of E2 (program Phase 7). It read:
# *while no verification machinery exists*, land in ``pending``, because
# ``unverified``'s only exit is the verification transition and an entry
# parked there could never reach the roster. The machinery exists now —
# ``entries.lifecycle.promote_verified_entries`` is that exit — so the
# landing state is a function of the account rather than a constant.
#
# Kept as a name for the verified case, because the shipped callers and
# tests that assert "a submission lands in pending" are asserting something
# that is still true for a verified account, which is the normal one.
LANDING_STATE = lifecycle.PENDING

# States a prior entry must be in to raise the soft duplicate flag. A
# resubmission after a withdrawal is a correction, not a double-submit.
_LIVE_STATES = frozenset({"pending", "confirmed", "waitlisted"})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class PlayerInput:
    """One human and the events they are being entered into.

    A value object rather than an ORM row on purpose: the caller has parsed
    a form and has not yet earned the right to write anything, and building
    the persistent objects here keeps "what the entrant typed" and "what we
    stored" from being the same mutable thing.
    """

    full_name: str
    gender: str
    club: Optional[str] = None
    birth_year: Optional[int] = None
    remarks: Optional[str] = None
    events: Sequence[Any] = ()


@dataclass
class SubmissionResult:
    submission: Submission
    entries: list[Entry] = field(default_factory=list)
    players: list[EntryPlayer] = field(default_factory=list)
    # True when this call returned an existing act rather than creating one.
    # The caller renders the same success page either way — a replay that
    # looked different would tell a retrying client it had failed.
    replayed: bool = False


# ---- lookups -------------------------------------------------------------


def find_by_idempotency_key(
    session: Session,
    tournament_id: uuid.UUID,
    key: str,
    account_id: uuid.UUID,
) -> Optional[Submission]:
    """Ruling D4, narrowed to the principal (Phase 6 §4)."""
    return session.execute(
        select(Submission).where(
            Submission.tournament_id == tournament_id,
            Submission.account_id == account_id,
            Submission.idempotency_key == key,
        )
    ).scalar_one_or_none()


def entries_for(
    session: Session, tournament_id: uuid.UUID, submission_id: uuid.UUID
) -> list[Entry]:
    """Every entry of one act, in a stable order.

    ``submitted_at`` alone ties non-deterministically across SQLite and
    Postgres — the entries of one act are written in the same tick by
    definition — so ``id`` is the tiebreaker, per the house rule.
    """
    return list(
        session.scalars(
            select(Entry)
            .where(
                Entry.tournament_id == tournament_id,
                Entry.submission_id == submission_id,
            )
            .order_by(Entry.submitted_at.asc(), Entry.id.asc())
        )
    )


def replay(
    session: Session,
    tournament_id: uuid.UUID,
    key: Optional[str],
    account_id: uuid.UUID,
) -> Optional[SubmissionResult]:
    """The original act, whole, or ``None`` if this key is new *to this
    account* here."""
    if not key:
        return None
    existing = find_by_idempotency_key(session, tournament_id, key, account_id)
    if existing is None:
        return None
    return SubmissionResult(
        submission=existing,
        entries=entries_for(session, tournament_id, existing.id),
        replayed=True,
    )


def find_for_account(
    session: Session,
    tournament_id: uuid.UUID,
    submission_id: uuid.UUID,
    account_id: uuid.UUID,
) -> Optional[SubmissionResult]:
    """One act, by id, **for the account that made it** — or ``None``.

    The receipt door. The persist path answers ``303`` with
    ``/e/{slug}/receipt/{submission_id}``, so a submission id travels in a
    ``Location`` header and then sits in an address bar: it is a handle,
    never a capability. Whoever writes the receipt loader must read through
    this function, because it is the only read that returns one act by id
    and there is no way to call it without naming the account — scoping a
    loader is then not something that can be forgotten, only something that
    can be deliberately routed around.

    Same shape as ``replay`` on purpose (``replayed=True``): a receipt is a
    re-display of an act that already happened, so the caller renders it
    with the same code path that rendered it the first time.
    """
    existing = session.execute(
        select(Submission).where(
            Submission.tournament_id == tournament_id,
            Submission.account_id == account_id,
            Submission.id == submission_id,
        )
    ).scalar_one_or_none()
    if existing is None:
        return None
    return SubmissionResult(
        submission=existing,
        entries=entries_for(session, tournament_id, existing.id),
        replayed=True,
    )


def looks_duplicate(
    session: Session,
    tournament_id: uuid.UUID,
    event_id: uuid.UUID,
    full_name: str,
) -> bool:
    """R7's soft flag, retargeted by R13 onto the player level.

    Same event **and** same player name, across submissions. The conjunction
    is what smells like a double-submit; either half alone does not — one
    account legitimately enters the same event for two different children,
    and two unrelated people share a name often enough at a club. Even then
    the answer is a flag an operator resolves, never a 409 (invariant I4).

    R7 spelled the second half as "same normalized email"; the account
    level made that both wrong and unnecessary — wrong because one account
    is *expected* to appear repeatedly, unnecessary because the player is
    now a row rather than a repeated string.
    """
    hit = session.execute(
        select(Entry.id)
        .join(
            EntryPlayer,
            (EntryPlayer.tournament_id == Entry.tournament_id)
            & (EntryPlayer.id == Entry.entry_player_id),
        )
        .where(
            Entry.tournament_id == tournament_id,
            Entry.entry_event_id == event_id,
            Entry.state.in_(_LIVE_STATES),
            func.lower(EntryPlayer.full_name) == full_name.strip().lower(),
        )
        .limit(1)
    ).first()
    return hit is not None


# ---- the write -----------------------------------------------------------


def create_submission(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    page: Any,
    account_id: uuid.UUID,
    players: Sequence[PlayerInput],
    fee_total_cents: Optional[int],
    fee_basis: Optional[dict],
    idempotency_key: Optional[str] = None,
    email_verified: bool = True,
) -> SubmissionResult:
    """Record one act: a submission, its players, and one entry per event.

    ``fee_total_cents`` and ``fee_basis`` come from
    ``entries.entry_fees.compute_fee_total`` and are stored as computed —
    the total the entrant was shown **is** the total recorded (Seam B), so
    this function deliberately does not recompute anything.

    A replay of ``idempotency_key`` is answered before any write. The same
    key arriving concurrently is answered after the unique index refuses
    the second insert: re-read and return the winner.
    """
    replayed = replay(session, tournament_id, idempotency_key, account_id)
    if replayed is not None:
        return replayed

    try:
        return _write(
            session,
            tournament_id=tournament_id,
            page=page,
            account_id=account_id,
            players=players,
            fee_total_cents=fee_total_cents,
            fee_basis=fee_basis,
            idempotency_key=idempotency_key,
            email_verified=email_verified,
        )
    except IntegrityError:
        # The other half of the retry race — see the module docstring. The
        # index can refuse at the flush that inserts the submission, before
        # any entry exists, so the whole write is inside this guard rather
        # than only its commit.
        session.rollback()
        winner = replay(session, tournament_id, idempotency_key, account_id)
        if winner is None:
            raise
        log.info(
            "entries: idempotency race on %s resolved to submission %s",
            tournament_id,
            winner.submission.id,
        )
        return winner


def _write(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    page: Any,
    account_id: uuid.UUID,
    players: Sequence[PlayerInput],
    fee_total_cents: Optional[int],
    fee_basis: Optional[dict],
    idempotency_key: Optional[str],
    email_verified: bool = True,
) -> SubmissionResult:
    now = _utcnow()
    submission = Submission(
        tournament_id=tournament_id,
        account_id=account_id,
        idempotency_key=idempotency_key or None,
        # Q11: recorded at this instant, with the version they read.
        regulations_accepted_at=now,
        regulations_version_accepted=getattr(page, "regulations_version", None),
        fee_total_cents=fee_total_cents,
        fee_basis=fee_basis,
    )
    session.add(submission)
    session.flush()

    created_players: list[EntryPlayer] = []
    created_entries: list[Entry] = []
    per_player_fee = _per_player_fee(fee_basis)

    for index, spec in enumerate(players):
        player = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account_id,
            full_name=spec.full_name.strip(),
            gender=spec.gender.strip(),
            club=(spec.club or "").strip() or None,
            birth_year=spec.birth_year,
            remarks=(spec.remarks or "").strip() or None,
        )
        session.add(player)
        session.flush()
        created_players.append(player)

        events = _distinct(spec.events)
        priced = per_player_fee[index] if index < len(per_player_fee) else None
        shares = _split(priced, len(events))
        landing = lifecycle.landing_state(email_verified=email_verified)
        for share, event in zip(shares, events):
            reasons = list(gender_flags(spec.gender, event))
            if looks_duplicate(session, tournament_id, event.id, spec.full_name):
                reasons.append(NEEDS_REVIEW)
            # The cap is read PER ENTRY and inside the loop, not once for
            # the act: a family entering three children into a draw with two
            # places left must fill both and queue the third, and a count
            # taken before the loop would either take all three or none.
            # ``session.flush()`` below each add is what makes the next
            # iteration's count include the row just written.
            state = landing
            if lifecycle.at_cap(session, tournament_id, event):
                # I4: a queue position, not a decision. Nobody is refused,
                # the entry is not rejected, and an operator can promote it
                # the moment somebody withdraws.
                state = lifecycle.WAITLISTED
                reasons.append(lifecycle.OVER_CAP)
            entry = Entry(
                tournament_id=tournament_id,
                entry_event_id=event.id,
                submission_id=submission.id,
                entry_player_id=player.id,
                state=state,
                pending_reasons=reasons,
                fee_cents=share,
            )
            session.add(entry)
            session.flush()
            created_entries.append(entry)

    session.commit()
    return SubmissionResult(
        submission=submission, entries=created_entries, players=created_players
    )


# ---- internals -----------------------------------------------------------


def _distinct(events: Sequence[Any]) -> list[Any]:
    """One person's events, de-duplicated, order preserved.

    A double-selected event is a form slip. Writing it twice would create
    two entries in one event for one player — which is precisely what the
    soft duplicate flag exists to *ask about*, so manufacturing it here
    would be the software generating its own attention flags.
    """
    seen: set = set()
    out: list[Any] = []
    for event in events:
        if event.id in seen:
            continue
        seen.add(event.id)
        out.append(event)
    return out


def _per_player_fee(fee_basis: Optional[dict]) -> list[Optional[int]]:
    """Each person's price out of the fee basis, **in the order it was
    computed** — which is the order of the ``players`` this function's caller
    was handed, because both lists are built from one parse in one pass.

    Positional rather than keyed on ``row["key"]``, which is what it read
    before. The key is a LABEL the caller chooses (``compute_fee_total`` says
    so: "a player row's id, or a form index while the row does not exist
    yet"), and pairing on it silently assumed one particular choice — that it
    is this list's own index, as a string. The entry route's keys are the
    entrant's form BLOCK indices, so the moment an empty block was dropped
    every share behind the gap missed its row and came back ``None``: entries
    written with no fee against a submission that has a total.
    """
    if not isinstance(fee_basis, dict):
        return []
    return [
        row.get("cents")
        for row in fee_basis.get("players") or []
        if isinstance(row, dict)
    ]


def _split(cents: Optional[int], event_count: int) -> list[Optional[int]]:
    """One person's price, spread across their entries.

    Nullable and genuinely approximate, because tiered pricing prices the
    **person** and not the event (Q14 §1): there is no true per-event price
    when three events cost 6000 together. The submission's
    ``fee_total_cents`` is the number that means something; these are a
    convenience for a desk that wants to show a row.

    The remainder lands on the **first** entry rather than being dropped or
    repeated, so the components sum back to the person's price exactly —
    a set of components that does not add up is worse than no components.
    """
    if cents is None or event_count <= 0:
        return [None] * max(event_count, 0)
    base = cents // event_count
    shares = [base] * event_count
    shares[0] += cents - base * event_count
    return shares
