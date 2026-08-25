"""``GET /e/api/me/entries`` — the signed-in entrant's own record (SP-P7 §3.1).

The first authenticated *read* on the play tier. It is deliberately NOT
gated by the publication flags (§4): an entrant always sees their own
submissions and entries — publication governs what strangers see, and this
route answers no stranger (``get_current_entrant`` 401s a bare request).
The exception the spec carves out — per-event result badges respect
``results_published`` — lands with the results projection, which is where
badges become computable at all.

**Scope: the submissions this account made.** R13's ``account_id`` on the
player level ("who may act for this player") could later widen this to
entries created for your player by someone else's act — E3's partner flow
is the case that will want it. Until that exists, the honest answer is the
acts you performed, which is also the set the receipt pages already showed
you.

**One card per tournament, not per submission.** A parent who submitted
twice covering two children holds one relationship with that tournament —
one desk to pay at — so ``feeTotalCents`` is the sum of their submission
snapshots (Seam B: snapshots are summed, never recomputed) and the lines
under it are every entry across those acts.

Money renders here and on the entry form/receipt only — never on public
tournament pages (SP-P7 §3.1, Kyle's mockup-review ruling).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select, tuple_

from entries.entries import roster_id
from entries.entries_public import _moment_iso
from core.dependencies import AuthEntrant, get_current_entrant
from core.error_codes import ErrorCode, http_error
from db.models import (
    EntrantAccount,
    Entry,
    EntryEvent,
    EntryPage,
    EntryPlayer,
    Org,
    Submission,
    Tournament,
)
from entries import lifecycle, retention
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/e/api/me", tags=["entries-me"])


# ---- DTOs (explicit allow-lists, SP-P7 §5) --------------------------------


class MyEntryLineDTO(BaseModel):
    """One event line on a card. ``state`` is the entrant-facing vocabulary
    (``_entry_state``), not the raw desk state — the desk's ``pending`` vs
    ``waitlisted`` distinction is an operator's queue, not a promise made to
    the entrant."""

    eventCode: str
    discipline: str
    playerName: str
    # The player-page address for "View my results" (§3.1) — the same
    # person-in-tournament key the public tier uses. Own-data only: every
    # line on this card is a player this account entered.
    personKey: str
    state: str
    # E2: the id the withdraw route takes, and whether the entrant may use
    # it right now. Both are needed on the READ because the surface renders
    # from this projection alone — a client that had to derive "can I still
    # withdraw" from a deadline it was not given would either guess or ask,
    # and a second copy of the rule is how the button and the route end up
    # disagreeing about whether entries are still open.
    entryId: str
    canWithdraw: bool = False
    # "Winner" | "Runner-up" | "Semifinalist" — the §3.1 carve-out's one
    # publication-gated field: present only while the workspace has
    # ``results_published`` on, absent again the moment it goes off.
    resultBadge: Optional[str] = None
    # §3.1 "event lines with partner names" — the ACCEPTED doubles partner,
    # or None. Acceptance is the own-view's whole gate (playing doubles
    # together is mutual visibility); the name, never the nominated email.
    partnerName: Optional[str] = None


class MyTournamentCardDTO(BaseModel):
    slug: Optional[str] = None
    tournamentName: Optional[str] = None
    orgName: Optional[str] = None
    # The tournament's own public gates, echoed so the card can decide
    # which of its links exist: "View my results" points at a player page
    # that answers only while ``entrantsPublished`` (§4), and a link to a
    # uniform 404 is worse than no link.
    entrantsPublished: bool = False
    resultsPublished: bool = False
    # The workspace's ISO date string, verbatim (the TournamentDTO.date
    # argument: no instant exists to project, so none is manufactured).
    date: Optional[str] = None
    venueName: Optional[str] = None
    status: str
    # The summed submission snapshots, in cents. None when no submission
    # carried a quote (a page with no pricing configured).
    feeTotalCents: Optional[int] = None
    # ISO instant of the most recent submission — the card's recency.
    submittedAt: str
    events: List[MyEntryLineDTO]


class MyEntriesDTO(BaseModel):
    tournaments: List[MyTournamentCardDTO]
    # E2: the account's own verification state, so the page can say why the
    # withdraw controls are inert instead of rendering buttons that 403.
    emailVerified: bool = False


# ---- pure derivations (unit-tested directly) ------------------------------

# Raw entry state → what the entrant is told. Withdrawn and rejected pass
# through (the card renders them as a plain gray chip, no pricing);
# ``unverified`` reads as awaiting to its own account — it is their act,
# parked on their own verification.
_ENTRY_STATE = {
    "pending": "awaiting",
    "waitlisted": "awaiting",
    "unverified": "awaiting",
    "confirmed": "entered",
    "withdrawn": "withdrawn",
    "rejected": "rejected",
}


def _entry_state(raw: str) -> str:
    # An unknown future state reads as awaiting rather than crashing the
    # one page an entrant has — the same fail-calm posture as the page
    # projection's fee normalization.
    return _ENTRY_STATE.get(raw, "awaiting")


def _badges_for(repo: LocalRepository, tournament_id) -> Dict[str, Dict[str, str]]:
    """bracket event id → {participant key → badge}, for one workspace.

    Reuses the winners projection's derivation (``entries_site``) so the
    badge on an entrant's own card and the public Winners tab can never
    disagree about who won. Called only when ``results_published`` — the
    gate lives at the call site, so an off flag means this never runs.
    """
    from entries.entries_site import _bracket, _bracket_indexes, _event_winner

    payload = _bracket(repo, tournament_id)
    if payload is None:
        return {}
    units, results, _ = _bracket_indexes(payload)
    out: Dict[str, Dict[str, str]] = {}
    for event in payload.events:
        winner_key, runner_key, semi_keys = _event_winner(event, units, results)
        badges: Dict[str, str] = {}
        for key in semi_keys:
            badges[key] = "Semifinalist"
        if runner_key:
            badges[runner_key] = "Runner-up"
        if winner_key:
            badges[winner_key] = "Winner"
        if badges:
            # Key by both the event id and the participant's members, so a
            # doubles entrant finds their pair's badge by their own roster id.
            expanded: Dict[str, str] = dict(badges)
            for participant in event.participants:
                if participant.id in badges and participant.members:
                    for member in participant.members:
                        expanded[member] = badges[participant.id]
            out[event.id] = expanded
    return out


def _can_withdraw(entry, event) -> bool:
    """Would the withdraw route accept this entry right now?

    Asks the state machine instead of restating its two rules. The value is
    advisory — the route checks again, because a projection rendered a
    minute ago is not authorization — but it has to agree, or the page grows
    buttons that always fail and an entrant learns to distrust them.
    """
    try:
        lifecycle.assert_withdrawable(entry, event)
    except lifecycle.LifecycleError:
        return False
    return True


def _card_status(entry_states: List[str], date_iso: Optional[str], today_iso: str) -> str:
    """The §3.1 lifecycle: Played beats Entered beats Awaiting.

    ``played`` is keyed on the tournament date having passed — the spec's
    literal rule. Date comparison is ISO-string comparison in UTC; a date
    has no zone, so "passed" flips within hours of the venue's own
    midnight, which is the precision the spec asks for.

    A card whose live entries are all gone (withdrawn/rejected) is
    ``withdrawn`` — "awaiting confirmation" would name a decision nobody
    is waiting on.
    """
    if date_iso and date_iso < today_iso:
        return "played"
    live = [s for s in entry_states if s in ("awaiting", "entered")]
    if not live:
        return "withdrawn"
    if all(s == "entered" for s in live):
        return "entered"
    return "awaiting"


# ---- the route ------------------------------------------------------------


@router.get("/entries", response_model=MyEntriesDTO)
def my_entries(
    response: Response,
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
) -> MyEntriesDTO:
    """Every tournament this account has submitted to, newest first.

    Batched throughout — one query per table, whatever the account's
    history (the N+1 precedent this codebase has already paid for once).
    The entries query rides ``Entry``'s ``lazy="joined"`` player
    relationship, so the player names arrive on the same round-trip.
    """
    # Personal data on a public path prefix: caches must not keep it, and
    # nothing about it is shareable between users.
    response.headers["Cache-Control"] = "private, no-store"

    session = repo.session
    account_id = uuid.UUID(entrant.id)

    submissions = list(
        session.scalars(
            select(Submission).where(Submission.account_id == account_id)
        )
    )
    if not submissions:
        # Verified is still reported on the empty answer: an entrant who has
        # signed up but not entered yet is exactly who needs to be told to
        # confirm their address.
        return MyEntriesDTO(
            tournaments=[], emailVerified=bool(entrant.email_verified)
        )

    tids = {s.tournament_id for s in submissions}
    sub_ids = {s.id for s in submissions}

    entries = list(
        session.scalars(
            select(Entry).where(
                Entry.tournament_id.in_(tids), Entry.submission_id.in_(sub_ids)
            )
        )
    )
    events: Dict[tuple, EntryEvent] = {
        (ev.tournament_id, ev.id): ev
        for ev in session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id.in_(tids))
        )
    }

    # ---- accepted doubles partners (E3 → §3.1) --------------------------
    # The OWN view's gate is acceptance alone: playing doubles together IS
    # mutual visibility, so a partner who accepted needs no publication flag
    # to appear on their partner's card. (The public player page applies the
    # stricter set — confirmed, not opted out.) Batched: the partner's entry
    # belongs to a DIFFERENT account, so it is not in ``entries`` above —
    # two SELECTs total, never per-line. Erased partners drop out (D7).
    partner_pairs = [
        (e.tournament_id, e.partner_entry_id)
        for e in entries
        if e.partner_entry_id is not None and e.partner_accepted_at is not None
    ]
    partner_name_by_entry: Dict[uuid.UUID, str] = {}
    if partner_pairs:
        partner_entries = {
            (pe.tournament_id, pe.id): pe
            for pe in session.scalars(
                select(Entry).where(
                    tuple_(Entry.tournament_id, Entry.id).in_(partner_pairs)
                )
            )
        }
        player_keys = {
            (pe.tournament_id, pe.entry_player_id)
            for pe in partner_entries.values()
            if pe.entry_player_id is not None
        }
        partner_players = (
            {
                (p.tournament_id, p.id): p
                for p in session.scalars(
                    select(EntryPlayer).where(
                        tuple_(EntryPlayer.tournament_id, EntryPlayer.id).in_(
                            player_keys
                        ),
                        EntryPlayer.erased_at.is_(None),
                    )
                )
            }
            if player_keys
            else {}
        )
        for e in entries:
            if e.partner_entry_id is None or e.partner_accepted_at is None:
                continue
            pe = partner_entries.get((e.tournament_id, e.partner_entry_id))
            if pe is None:
                continue
            partner = partner_players.get((pe.tournament_id, pe.entry_player_id))
            if partner is not None:
                partner_name_by_entry[e.id] = partner.full_name
    tournaments = {
        t.id: t
        for t in session.scalars(select(Tournament).where(Tournament.id.in_(tids)))
    }
    pages = {
        p.tournament_id: p
        for p in session.scalars(
            select(EntryPage).where(EntryPage.tournament_id.in_(tids))
        )
    }
    org_ids = {
        t.org_id for t in tournaments.values() if t.org_id is not None
    }
    orgs = (
        {o.id: o for o in session.scalars(select(Org).where(Org.id.in_(org_ids)))}
        if org_ids
        else {}
    )

    today_iso = datetime.now(timezone.utc).date().isoformat()
    cards: List[MyTournamentCardDTO] = []
    for tid in tids:
        tournament = tournaments.get(tid)
        page = pages.get(tid)
        own_subs = [s for s in submissions if s.tournament_id == tid]
        own_entries = [e for e in entries if e.tournament_id == tid]

        badges = (
            _badges_for(repo, tid)
            if page is not None and page.results_published
            else {}
        )
        lines = []
        for entry in own_entries:
            event = events.get((tid, entry.entry_event_id))
            event_badges = (
                badges.get(event.bracket_event_id or event.code, {})
                if event is not None
                else {}
            )
            lines.append(
                MyEntryLineDTO(
                    eventCode=event.code if event else "?",
                    discipline=event.discipline if event else "",
                    playerName=entry.player_name or "",
                    personKey=str(entry.entry_player_id or ""),
                    state=_entry_state(entry.state),
                    entryId=str(entry.id),
                    # The route's own predicate, asked rather than
                    # re-implemented: ``assert_withdrawable`` holds the live-
                    # state rule AND the ``withdraws_until`` deadline, so a
                    # button that renders here is one the route will accept.
                    canWithdraw=_can_withdraw(entry, event),
                    resultBadge=event_badges.get(roster_id(entry.entry_player_id)),
                    partnerName=partner_name_by_entry.get(entry.id),
                )
            )
        lines.sort(key=lambda line: (line.playerName, line.eventCode))

        quotes = [
            s.fee_total_cents for s in own_subs if s.fee_total_cents is not None
        ]
        date_iso = (
            str(tournament.tournament_date)
            if tournament is not None and tournament.tournament_date
            else None
        )
        org = (
            orgs.get(tournament.org_id)
            if tournament is not None and tournament.org_id
            else None
        )
        cards.append(
            MyTournamentCardDTO(
                slug=page.slug if page is not None else None,
                tournamentName=tournament.name if tournament is not None else None,
                orgName=org.name if org is not None else None,
                entrantsPublished=bool(page.entrants_published)
                if page is not None
                else False,
                resultsPublished=bool(page.results_published)
                if page is not None
                else False,
                date=date_iso,
                venueName=page.venue_name if page is not None else None,
                status=_card_status([line.state for line in lines], date_iso, today_iso),
                feeTotalCents=sum(quotes) if quotes else None,
                submittedAt=_moment_iso(max(s.submitted_at for s in own_subs)),
                events=lines,
            )
        )

    # Newest first: by tournament date (ISO strings order lexically; a
    # dateless workspace sorts last), then by the act's own recency.
    cards.sort(key=lambda c: (c.date or "", c.submittedAt), reverse=True)
    return MyEntriesDTO(tournaments=cards, emailVerified=bool(entrant.email_verified))


# ---- the entrant's own writes (E2, program Phase 7) -----------------------
#
# The transitions R10 moved off the retired capability link and onto the
# account. Both of them are ONE route: withdrawing and withdrawing-and-erasing
# differ by a flag, not by an endpoint, because they are the same transition
# with a second act attached — and two endpoints would be two places to get
# the ownership check right.


class WithdrawRequest(BaseModel):
    """``erase`` is the GDPR half and it defaults OFF.

    Not a StrictModel and not required: the form posts ``erase=on`` or omits
    the field entirely, and a JSON caller may send neither. What matters is
    the default — a withdrawal that erased by accident would destroy the
    entrant's name on a routine "I can't make it", and the desk would lose
    who withdrew.
    """

    erase: bool = False


class WithdrawResultDTO(BaseModel):
    state: str
    erased: bool


def _own_entry(repo: LocalRepository, entrant: AuthEntrant, entry_id: str) -> Entry:
    """Resolve one entry, or answer the uniform 404.

    **Scoped by the account's own submissions**, not by a tournament id the
    caller supplies. That is the important half: taking a workspace id from
    the request would make this route probe-able across tenants, and the
    ownership check would be doing all the work. Here a stranger's entry id
    simply is not in the result set, so the failure is a lookup miss rather
    than a permission decision.

    404 rather than 403 on a foreign entry, matching
    ``require_tournament_access``'s uniform answer: "not yours" and "not
    there" must be indistinguishable, or the route confirms the existence of
    entries the caller cannot see.
    """
    try:
        wanted = uuid.UUID(entry_id)
    except (ValueError, TypeError):
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, "No such entry")

    account_id = uuid.UUID(entrant.id)
    submission_ids = list(
        repo.session.scalars(
            select(Submission.id).where(Submission.account_id == account_id)
        )
    )
    entry = (
        repo.session.scalars(
            select(Entry).where(
                Entry.id == wanted, Entry.submission_id.in_(submission_ids)
            )
        ).first()
        if submission_ids
        else None
    )
    if entry is None:
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, "No such entry")
    return entry


@router.post("/entries/{entry_id}/withdraw", response_model=WithdrawResultDTO)
def withdraw_entry(
    entry_id: str,
    body: WithdrawRequest = WithdrawRequest(),
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
) -> WithdrawResultDTO:
    """The entrant withdraws their own entry; optionally erases the player.

    **A verified account is required** (spec §6's account-requirement
    column). Withdrawal and erasure are the two irreversible things an
    entrant can do, and an unverified account is one that has not yet shown
    it controls the address it claims — so anyone who guessed an address
    during signup could otherwise cancel the real owner's entries.

    The deadline, the live-state rule and the erasure scrub all live in
    ``entries.lifecycle``; this route resolves the entry, checks the
    principal, and turns a ``LifecycleError`` into an HTTP answer. It
    deliberately holds no rule of its own — a second copy of the withdrawal
    deadline is how the desk and the public surface end up disagreeing about
    when entries closed.
    """
    if not entrant.email_verified:
        raise http_error(
            403,
            ErrorCode.ENTRY_ACCOUNT_UNVERIFIED,
            "Confirm your email address before changing your entries.",
        )

    entry = _own_entry(repo, entrant, entry_id)
    event = repo.session.get(
        EntryEvent, (entry.tournament_id, entry.entry_event_id)
    )
    try:
        lifecycle.withdraw(repo.session, entry, event, erase=bool(body.erase))
    except lifecycle.LifecycleError as exc:
        repo.session.rollback()
        raise http_error(
            409,
            ErrorCode.ENTRY_INVALID_STATE,
            exc.message,
            extra={"reason": exc.code},
        )

    repo.session.commit()
    return WithdrawResultDTO(state=entry.state, erased=bool(body.erase))


# ---- the account's own data (E5, program Phase 10 — spec Q10) -------------
#
# **Both rights ride the account, which is R10's single largest practical
# benefit.** R1's model had no accounts, so "export my data" and "delete my
# account" had nothing to hang on and the erasure path was a capability link
# the entrant had to still possess. One login now serves both, and serves the
# entry and the person with one mechanism.


class ExportedPlayerDTO(BaseModel):
    """A person this account entered, as they are stored."""

    fullName: str
    gender: str
    club: Optional[str] = None
    birthYear: Optional[int] = None
    remarks: Optional[str] = None
    erasedAt: Optional[str] = None


class ExportedEntryDTO(BaseModel):
    tournamentName: Optional[str] = None
    eventCode: str
    playerName: str
    state: str
    submittedAt: str
    withdrawnAt: Optional[str] = None


class ExportedSubmissionDTO(BaseModel):
    tournamentName: Optional[str] = None
    submittedAt: str
    feeTotalCents: Optional[int] = None
    paidAt: Optional[str] = None
    regulationsAcceptedAt: Optional[str] = None
    regulationsVersionAccepted: Optional[int] = None


class AccountExportDTO(BaseModel):
    """Everything this account holds, in one document (Q10).

    **A projection of what is stored, not a summary of it.** An export whose
    author decided what was interesting would be answering a different
    question than the one the right to portability asks. What is deliberately
    absent is what is not the entrant's: other people's entries, the
    director's notes, and anything derived about the tournament rather than
    about them.

    The password hash and the session tokens are absent for the obvious
    reason — they are credentials, not personal data, and exporting them
    would hand a copy of the account to whoever reads the file.
    """

    email: str
    displayName: Optional[str] = None
    phone: Optional[str] = None
    emailVerified: bool = False
    createdAt: str
    players: List[ExportedPlayerDTO] = []
    submissions: List[ExportedSubmissionDTO] = []
    entries: List[ExportedEntryDTO] = []


class AccountErasedDTO(BaseModel):
    """What erasure did, stated so the entrant can check it.

    Both numbers, always. "Your data was erased" is not an answer somebody
    can verify; "3 player records erased, 2 submissions kept without your
    details" says exactly what happened to what.
    """

    playersErased: int
    submissionsKept: int


@router.get("/export", response_model=AccountExportDTO)
def export_my_account(
    response: Response,
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
) -> AccountExportDTO:
    """Everything this account holds (Q10 — the portability half).

    Session-gated and scoped to the caller's own account, by construction:
    every query below filters on ``account_id`` and there is no parameter
    through which another account could be named.
    """
    response.headers["Cache-Control"] = "private, no-store"
    session = repo.session
    account_id = uuid.UUID(entrant.id)

    account = session.get(EntrantAccount, account_id)
    if account is None:
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, "No such account")

    players = list(
        session.scalars(
            select(EntryPlayer).where(EntryPlayer.account_id == account_id)
        )
    )
    submissions = list(
        session.scalars(
            select(Submission).where(Submission.account_id == account_id)
        )
    )
    sub_ids = {s.id for s in submissions}
    entries = (
        list(
            session.scalars(
                select(Entry).where(Entry.submission_id.in_(sub_ids))
            )
        )
        if sub_ids
        else []
    )

    tids = {s.tournament_id for s in submissions}
    names = (
        {
            t.id: t.name
            for t in session.scalars(select(Tournament).where(Tournament.id.in_(tids)))
        }
        if tids
        else {}
    )
    events = (
        {
            (ev.tournament_id, ev.id): ev
            for ev in session.scalars(
                select(EntryEvent).where(EntryEvent.tournament_id.in_(tids))
            )
        }
        if tids
        else {}
    )

    return AccountExportDTO(
        email=account.email,
        displayName=account.display_name,
        phone=account.phone,
        emailVerified=bool(account.email_verified),
        createdAt=_moment_iso(account.created_at),
        players=[
            ExportedPlayerDTO(
                fullName=p.full_name,
                gender=p.gender,
                club=p.club,
                birthYear=p.birth_year,
                remarks=p.remarks,
                erasedAt=_moment_iso(p.erased_at) if p.erased_at else None,
            )
            for p in players
        ],
        submissions=[
            ExportedSubmissionDTO(
                tournamentName=names.get(s.tournament_id),
                submittedAt=_moment_iso(s.submitted_at),
                feeTotalCents=s.fee_total_cents,
                paidAt=_moment_iso(s.paid_at) if s.paid_at else None,
                regulationsAcceptedAt=(
                    _moment_iso(s.regulations_accepted_at)
                    if s.regulations_accepted_at
                    else None
                ),
                regulationsVersionAccepted=s.regulations_version_accepted,
            )
            for s in submissions
        ],
        entries=[
            ExportedEntryDTO(
                tournamentName=names.get(e.tournament_id),
                eventCode=(
                    events[(e.tournament_id, e.entry_event_id)].code
                    if (e.tournament_id, e.entry_event_id) in events
                    else "?"
                ),
                playerName=e.player_name or "",
                state=e.state,
                submittedAt=_moment_iso(e.submitted_at),
                withdrawnAt=_moment_iso(e.withdrawn_at) if e.withdrawn_at else None,
            )
            for e in entries
        ],
    )


@router.post("/erase", response_model=AccountErasedDTO)
def erase_my_account(
    entrant: AuthEntrant = Depends(get_current_entrant),
    repo: LocalRepository = Depends(get_repository),
) -> AccountErasedDTO:
    """Erase this person: their account's PII and every player they entered.

    **A scrub, not a DELETE** — owner ruling D7. ``submissions.account_id``
    and ``entry_players.account_id`` cascade from ``entrant_accounts``, so
    deleting the row would take every submission and entry with it, including
    entries a director confirmed, put on a roster and built a draw around. The
    right being exercised is to stop being a person in those records; the
    record of what happened is the director's.

    A **verified** account is required, on E2's reasoning: this is the most
    irreversible thing the surface offers, and an unverified account has not
    shown it controls the address it claims — so a guessed address must not be
    able to erase the real owner.

    The session is destroyed by the scrub (every session is revoked), so the
    caller is signed out by the act itself. There is no way back in: the
    password hash is cleared, and the address that would receive a reset link
    is gone.
    """
    if not entrant.email_verified:
        raise http_error(
            403,
            ErrorCode.ENTRY_ACCOUNT_UNVERIFIED,
            "Confirm your email address before erasing your account.",
        )

    account = repo.session.get(EntrantAccount, uuid.UUID(entrant.id))
    if account is None:
        raise http_error(404, ErrorCode.ENTRY_NOT_FOUND, "No such account")

    erased, kept = retention.erase_account_data(repo.session, account)
    repo.session.commit()
    return AccountErasedDTO(playersErased=erased, submissionsKept=kept)

