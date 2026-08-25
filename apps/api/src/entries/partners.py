"""Doubles: nomination, the invite, acceptance, and the conflict flag
(E3, program Phase 8 — spec Q6 as amended by R10).

**The design point, stated once because everything below follows from it:
an invite is not a capability.** R1 gave the partner "their own capability
link", which made a mailed URL an authenticator for mutating somebody's
entry. R10 retired that pattern product-wide. What replaces it is the shape
the tree already runs for operators (``identity/invites.py``): a **public
preview** that says who invited you and to what, and an **acceptance that
requires a logged-in principal**. The invite *drives account creation*; it
never mutates an entry on its own. Somebody who forwards their invite mail
gives away the right to be asked, not the right to act.

**What acceptance produces.** The nominator submits their own half and names
a partner by address. Acceptance creates the partner's OWN player and entry,
under the partner's OWN submission, and links the two entries mutually. That
is more than bookkeeping:

- the partner's name and gender come from the partner, who knows them — the
  nominator would be guessing, and R12 makes gender required precisely
  because event eligibility depends on it;
- ``entry_players.account_id`` on the partner's half is the partner's, so
  "who may act for this player" is true rather than nearly true, and the
  withdraw path from E2 works for them without a special case;
- R14 prices the PERSON, so a per-person entry is what the fee model already
  assumes.

**Unpartnered is not over-cap, and keeping them apart is the point.**
Pickleball Brackets auto-parks unpartnered teams on the waitlist, which
conflates a partner problem with a capacity problem — an entrant then cannot
tell whether they need to find a partner or wait for a place. Here an
unpartnered entry is ``pending`` with ``awaiting_partner``; over-cap is
``waitlisted`` with ``over_cap``; an entry can carry both, and each says what
to do about itself.

**Conflicts are flagged, never resolved.** If the person you named is already
paired with somebody else in the same event, BOTH entries get
``pair_conflict`` and an operator sorts it out (invariant I4). The software
cannot know which pairing is the mistake, and guessing would silently break a
pair that had already agreed.

Nothing here commits; callers own the transaction boundary.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from db.models import Entry, Submission
from entries import lifecycle
from identity.auth import _hash_token, normalize_email

#: Set on an entry whose named partner has not accepted yet. Cleared on
#: acceptance — the entry then stands on its own merits like any other
#: pending one.
AWAITING_PARTNER = lifecycle.AWAITING_PARTNER

#: Both halves of an ambiguous pairing carry this. An operator resolves it.
PAIR_CONFLICT = "pair_conflict"

_TOKEN_BYTES = 32


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def is_doubles(event: Any) -> bool:
    """Does this event take pairs? The one place the string is compared."""
    return str(getattr(event, "entry_type", "") or "").lower() == "doubles"


def invite_ttl_days() -> float:
    """How long a partner has to accept.

    Reuses ``invite_ttl_days`` — the operator invite's budget — rather than
    inventing a second knob. The two are the same kind of thing (a mailed
    link to a person who must then create or use an account) and a second
    setting is a second thing to configure wrong.
    """
    return float(settings.invite_ttl_days)


def nominate(session: Session, entry: Entry, email: str) -> Optional[str]:
    """Name a partner on this entry and mint their invite. Returns the token.

    Returns ``None`` — and marks nothing — for an address that is not an
    address. A malformed partner email is not worth refusing a whole
    submission over: the entry stands as an unpartnered ``pending`` one, the
    reason says so, and the entrant can be sent a fresh invite from the desk.
    That is the same posture ``parse_year`` takes on an optional field, and
    the opposite of the one ``check_policy`` takes on a stated rule.
    """
    try:
        normalized = normalize_email(email)
    except Exception:
        return None

    token = secrets.token_urlsafe(_TOKEN_BYTES)
    entry.partner_email = normalized
    entry.partner_invite_hash = _hash_token(token)
    entry.partner_invite_expires_at = _utcnow() + timedelta(days=invite_ttl_days())
    entry.pending_reasons = _with(entry.pending_reasons, AWAITING_PARTNER)
    return token


def resolve(session: Session, token: str) -> Optional[Entry]:
    """Token -> the entry that mailed it, or ``None``.

    One answer for unknown, expired and already-accepted, for the reason
    every other token consumer in this codebase gives: a caller who could
    tell them apart could confirm that a forwarded link had once been real.

    Already-accepted is included in that set deliberately. An invite is
    spent by the first principal who accepts it, so a second holder of the
    same URL learns nothing and can do nothing.
    """
    if not token:
        return None
    entry = session.scalars(
        select(Entry).where(Entry.partner_invite_hash == _hash_token(token))
    ).first()
    if entry is None or entry.partner_accepted_at is not None:
        return None
    if entry.partner_invite_expires_at is None:
        return None
    if _aware(entry.partner_invite_expires_at) <= _utcnow():
        return None
    # An invite to an entry that is no longer live is dead with it: the
    # nominator withdrew, or an operator rejected it, and accepting would
    # attach a partner to something nobody is playing.
    if entry.state not in lifecycle.LIVE_STATES:
        return None
    return entry


def conflicting(session: Session, entry: Entry, email: str) -> list[Entry]:
    """Entries in the same event that are already paired with this address.

    "Already paired" means *nominated or accepted by somebody else* — an
    entry that merely happens to belong to the named person is not a
    conflict, because entering a doubles event and being invited into it are
    different acts and one person can legitimately do both while they sort
    out who they are playing with.
    """
    try:
        normalized = normalize_email(email)
    except Exception:
        return []
    rows = session.scalars(
        select(Entry).where(
            Entry.tournament_id == entry.tournament_id,
            Entry.entry_event_id == entry.entry_event_id,
            Entry.partner_email == normalized,
            Entry.state.in_(sorted(lifecycle.LIVE_STATES)),
        )
    )
    return [row for row in rows if row.id != entry.id]


def flag_conflict(*entries: Entry) -> None:
    """Mark every entry in an ambiguous pairing. Never resolves one."""
    for entry in entries:
        entry.pending_reasons = _with(entry.pending_reasons, PAIR_CONFLICT)


def accept(
    session: Session,
    entry: Entry,
    *,
    account_id: uuid.UUID,
    full_name: str,
    gender: str,
    club: Optional[str] = None,
    remarks: Optional[str] = None,
    birth_year: Optional[int] = None,
    fee_total_cents: Optional[int] = None,
    fee_basis: Optional[dict] = None,
) -> Entry:
    """The invited principal accepts: build their half and link the pair.

    The caller has already resolved the token and established WHO is
    accepting (an entrant session). This function performs the write, and
    the order matters only in that both halves must end up pointing at each
    other — a one-directional link would leave whichever half a reader holds
    unable to find the other.

    ``partner_email`` on the new half is the nominator's address, so the
    relationship reads correctly from either side.

    **The nominator's ``awaiting_partner`` is cleared here and nothing else
    about their entry is touched.** Acceptance answers the partner question;
    it does not confirm an entry, clear a cap, or resolve a conflict flag.
    Those are separate judgements with separate owners.

    ``birth_year`` is the R-DM-1 discriminator: with it, ``adopt_or_mint``
    can recognize a person this account already entered.
    """
    # Local import: ``submissions`` imports this module at top level, so a
    # module-level import here would be a cycle.
    from entries.submissions import PlayerInput, adopt_or_mint

    partner_player, _ = adopt_or_mint(
        session,
        entry.tournament_id,
        account_id,
        PlayerInput(
            full_name=full_name.strip()[:200],
            gender=gender.strip()[:20],
            club=(club or "").strip()[:200] or None,
            remarks=(remarks or "").strip()[:2000] or None,
            birth_year=birth_year,
        ),
    )
    partner_submission = Submission(
        tournament_id=entry.tournament_id,
        account_id=account_id,
        fee_total_cents=fee_total_cents,
        fee_basis=fee_basis,
        # The partner agreed to the regulations at the moment they accepted,
        # against the version live then — the same record Q11 requires of
        # every other submission, because this one IS a submission.
        regulations_accepted_at=_utcnow(),
    )
    session.add(partner_submission)
    session.flush()

    partner_entry = Entry(
        tournament_id=entry.tournament_id,
        entry_event_id=entry.entry_event_id,
        submission_id=partner_submission.id,
        entry_player_id=partner_player.id,
        # Lands in the same state its nominator is in, minus the partner
        # question. Not ``confirmed``: an operator confirms entries, and a
        # partner accepting is not an operator.
        state=lifecycle.PENDING,
        pending_reasons=[],
        partner_entry_id=entry.id,
        partner_email=entry.contact_email,
        partner_accepted_at=_utcnow(),
    )
    session.add(partner_entry)
    session.flush()

    entry.partner_entry_id = partner_entry.id
    entry.partner_accepted_at = _utcnow()
    entry.pending_reasons = _without(entry.pending_reasons, AWAITING_PARTNER)
    # The token is spent. Clearing the hash is what makes acceptance
    # single-use rather than merely idempotent-looking.
    entry.partner_invite_hash = None
    entry.partner_invite_expires_at = None

    # A conflict discovered only now — somebody else accepted first, or the
    # named address entered on their own in the meantime — flags both halves
    # rather than refusing the acceptance. Refusing would leave a person who
    # did exactly what they were asked to do with nothing, over a situation
    # they did not create.
    others = [
        row
        for row in conflicting(session, partner_entry, entry.contact_email or "")
        if row.id != entry.id
    ]
    if others:
        flag_conflict(entry, partner_entry, *others)

    return partner_entry


def regulations_version_of(page: Any) -> Optional[int]:
    """The version an acceptance records. Read through a helper so the
    attribute name lives in one place beside its two other readers."""
    return getattr(page, "regulations_version", None)


# ---- reason-list helpers -------------------------------------------------
#
# ``pending_reasons`` is a JSON list, so it is replaced rather than mutated:
# SQLAlchemy does not track in-place edits to a plain JSON column, and an
# ``.append`` that never reaches the database is the kind of bug that shows
# up as "the flag disappears when you reload".


def _with(reasons: Optional[Sequence[str]], code: str) -> list[str]:
    current = list(reasons or [])
    return current if code in current else [*current, code]


def _without(reasons: Optional[Sequence[str]], code: str) -> list[str]:
    return [reason for reason in (reasons or []) if reason != code]
