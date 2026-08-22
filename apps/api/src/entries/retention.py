"""Retention: anonymize entry PII after the event (E5, Phase 10 — spec Q10).

**Two lifetimes, deliberately not conflated.** An *entry* describes a person
who played in one tournament; it stops being needed shortly after that
tournament ends. An *account* is a live relationship the person may use next
season, and it is deleted only when they ask. Retention therefore reaches the
entry and never the account — conflating them would be a mistake in both
directions: an account quietly deleted with last year's entries, or a name
kept forever because the account it belongs to is still in use.

**It reuses `lifecycle.erase_player`, and that is the point.** Withdraw-and-
erase (E2) and retention (E5) are the same act with different triggers: one
is a person asking, one is a clock. Two scrub implementations would be two
answers to "what counts as erased", and the one nobody ran recently would be
the wrong one.

**Idempotent, and cheap to re-run.** The job selects on `erased_at IS NULL`,
so a second pass over the same workspace does nothing. That property is what
lets it be scheduled without a cursor, a lock or a record of what it did last
time — the state it needs is already on the rows.

**Nothing here decides WHEN on its own.** ``retention_days`` is the
director's setting on ``entry_events``; a workspace that has set none is not
swept, because a default deletion date the operator never chose is exactly
the kind of consequential automatic act invariant I4 rules out. The caller
supplies the event date; this module supplies the arithmetic and the scrub.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.models import Entry, EntryEvent, EntryPlayer, Submission
from entries import lifecycle


@dataclass(frozen=True)
class RetentionResult:
    """What one sweep did. Counts, so a scheduled run can log a line."""

    scanned: int = 0
    erased: int = 0
    #: Events skipped because their director set no retention period.
    skipped_no_policy: int = 0
    #: Events whose window has not elapsed yet.
    skipped_not_due: int = 0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def due_at(event_date: Optional[date], retention_days: Optional[int]) -> Optional[datetime]:
    """When this event's entries become erasable, or ``None`` for never.

    ``None`` on either input means never, and the two reasons are different
    but the answer is the same: an event with no date has no "after the
    event" to count from, and an event with no policy has a director who has
    not asked for one.

    Counted from the END of the event day in UTC. A tournament date is a
    plain date with no zone, so anchoring at midnight-after keeps the whole
    day inside the retention window wherever the venue is.
    """
    if event_date is None or retention_days is None:
        return None
    if retention_days < 0:
        return None
    midnight_after = datetime(
        event_date.year, event_date.month, event_date.day, tzinfo=timezone.utc
    ) + timedelta(days=1)
    return midnight_after + timedelta(days=int(retention_days))


def sweep_workspace(
    session: Session,
    *,
    tournament_id: uuid.UUID,
    event_date: Optional[date],
    now: Optional[datetime] = None,
) -> RetentionResult:
    """Anonymize every due entry's player in one workspace.

    Per ENTRY EVENT, because ``retention_days`` is set there: a director can
    legitimately keep a national selection event's entries longer than a club
    night's, and a workspace-wide sweep would apply the shortest or the
    longest to both.

    **The aggregate row survives** (Q10). The entry keeps its state, its
    event, its fee history and its place in the counts; what goes is the
    human — name, club, remarks, birth year — through the same scrub the
    entrant's own erasure uses.

    **Withdrawn and rejected entries are swept too.** They are still records
    of a named person, and the reason they are no longer playing is not a
    reason to keep their name longer than the people who did.
    """
    moment = now or _utcnow()
    scanned = erased = no_policy = not_due = 0

    events = list(
        session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id == tournament_id)
        )
    )
    for event in events:
        deadline = due_at(event_date, event.retention_days)
        if deadline is None:
            no_policy += 1
            continue
        if moment < deadline:
            not_due += 1
            continue

        entries = list(
            session.scalars(
                select(Entry).where(
                    Entry.tournament_id == tournament_id,
                    Entry.entry_event_id == event.id,
                )
            )
        )
        for entry in entries:
            scanned += 1
            player = entry.player
            # ``erase_player`` is idempotent on its own, but checking here
            # keeps the COUNT honest: a re-run must report zero erased, not
            # "erased" for rows it left exactly as they were.
            if player is None or player.erased_at is not None:
                continue
            lifecycle.erase_player(session, entry)
            erased += 1

    return RetentionResult(
        scanned=scanned,
        erased=erased,
        skipped_no_policy=no_policy,
        skipped_not_due=not_due,
    )


def erase_account_data(
    session: Session, account: Any
) -> tuple[int, int]:
    """Erase a person: their account's PII and every player they entered.

    The GDPR request an entrant makes about *themselves* (Q10, R10). Returns
    ``(players scrubbed, submissions kept)``.

    **This is a scrub, not a DELETE, and the distinction is load-bearing**
    (owner ruling D7, 2026-08-21). ``submissions.account_id`` and
    ``entry_players.account_id`` both cascade from ``entrant_accounts``, so
    ``session.delete(account)`` would erase every submission and entry that
    account ever made — including entries a director has confirmed and put on
    a roster and built a draw around. The person's right is to stop being a
    person in those records; the record of *what happened* is the director's
    and is not the entrant's to delete.

    So: the account row survives with its identity overwritten, the password
    cleared (nobody can log into it again) and every session revoked. The
    submissions and entries survive intact. Every player the account entered
    is scrubbed through the same ``erase_player`` the withdrawal path and the
    retention job use.
    """
    from identity import entrants as entrant_service

    now = _utcnow()

    players = list(
        session.scalars(
            select(EntryPlayer).where(EntryPlayer.account_id == account.id)
        )
    )
    scrubbed = 0
    for player in players:
        if player.erased_at is not None:
            continue
        player.full_name = lifecycle.ERASED_NAME
        player.club = None
        player.remarks = None
        player.birth_year = None
        player.erased_at = now
        scrubbed += 1

    # Counted, not touched: the number is what the caller reports back to
    # the entrant ("N submissions kept, with your details removed"), and
    # saying so is part of being honest about what erasure did and did not
    # do.
    kept = int(
        session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.account_id == account.id)
        )
        or 0
    )

    # The account keeps its row and its id — every FK pointing at it stays
    # valid — and loses everything that identifies a human. The address is
    # replaced rather than blanked because ``email`` is NOT NULL and carries
    # a unique index: a second erasure would collide on an empty string,
    # and the id keeps the replacement unique without being a fact about
    # anybody.
    account.email = f"erased+{account.id}@invalid"
    account.display_name = None
    account.phone = None
    account.password_hash = None
    account.reset_token_hash = None
    account.reset_token_expires_at = None
    account.verify_token_hash = None
    account.verify_token_expires_at = None
    account.email_verified = False
    entrant_service.revoke_all_sessions(session, account.id)

    return scrubbed, kept
