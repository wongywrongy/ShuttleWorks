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
from sqlalchemy import select

from api.entries_public import _moment_iso
from app.dependencies import AuthEntrant, get_current_entrant
from database.models import Entry, EntryEvent, EntryPage, Org, Submission, Tournament
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
    # "Winner" | "Runner-up" | "Semifinalist" — the §3.1 carve-out's one
    # publication-gated field: present only while the workspace has
    # ``results_published`` on, absent again the moment it goes off.
    resultBadge: Optional[str] = None


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
    from api.entries_site import _bracket, _bracket_indexes, _event_winner

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
        return MyEntriesDTO(tournaments=[])

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
                    resultBadge=event_badges.get(f"entry-{entry.entry_player_id}"),
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
    return MyEntriesDTO(tournaments=cards)
