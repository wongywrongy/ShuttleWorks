"""SP-P7's public-site projections: draws, seeds, winners, player pages.

``/e/api/page/{slug}/…`` — slug-resolved like everything public (the
uniform 404 of ``entries_public._resolve``; a raw tournament UUID is never
a public key), gated by the ``entry_pages`` publication flags (§4), and
**projected, never passed through**: every DTO below is an explicit
allow-list built field by field, and result data is stripped at the source
when ``results_published`` is off — including *resolved advancement*, which
is result data wearing a structural costume (a semifinal side that names a
player says who won the quarterfinal).

The data source for draw structure is the bracket module's own serialized
session (``_hydrate_session`` → ``_serialize_session``, through its
short-TTL ``response_cache``) — the same read the operator surface and the
Display board consume, so the public tier cannot drift from what the draw
actually is. Meet workspaces have no draws; their matches reach the player
page from the state blob + ``match_states``, the Display precedent.

Wall-clock times are VENUE-LOCAL by construction (a slot grid starting at
``dayStart`` means that time at the venue) and are projected as naive
``HH:MM`` / ``YYYY-MM-DDTHH:MM`` strings — deliberately not ``_moment``'s
UTC-stamped format, because stamping a zone nobody recorded would be
confidently wrong (the 2026-08-10 defect class).
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from entries.entries import roster_id
from entries.entries_public import _entrants, _not_found, _resolve
from db.models import (
    Entry,
    EntryEvent,
    EntryPage,
    EntryPlayer,
    Match,
    BracketMatch,
    BracketResult,
    MeetEvent,
    Tournament,
)
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/e/api/page/{slug}", tags=["entries-site"])

# Short public max-age (§5): these answers are identical for every reader
# (no viewer block, no cookies read), and the SSR tier re-fetches per
# document anyway — the header exists for intermediaries, not correctness.
_CACHE = "public, max-age=30"


# ---- shared plumbing ------------------------------------------------------


def _page(repo: LocalRepository, slug: str) -> Tuple[EntryPage, Tournament]:
    return _resolve(repo, slug)


def _bracket(repo: LocalRepository, tournament_id):
    """The serialized bracket session (TournamentOut) or None.

    Imported inside the function exactly like ``display.display`` does — the
    brackets module is heavy and this keeps the import graph acyclic.
    Served through the same short-TTL cache as every other reader.
    """
    from bracket.brackets import _hydrate_session, _serialize_session
    from bracket import response_cache

    cached = response_cache.get(tournament_id)
    if cached is not None:
        return cached
    session = _hydrate_session(repo, tournament_id)
    if session is None:
        return None
    payload = _serialize_session(session)
    response_cache.put(tournament_id, payload)
    return payload


def _meet_divisions(repo: LocalRepository, tournament: Tournament) -> List[str]:
    """The workspace's declared Meet divisions (``meet_events.id``), ordered.

    F-DM-33: without this, a Meet workspace's draws index is the SAME BYTES
    as a bracket workspace that has no events yet - ``_hydrate_session``
    returns ``None`` for both, the comprehension below falls to its ``else
    []``, and the public tier renders one "No draws yet." for two unrelated
    states. A Meet workspace has never created a ``bracket_events`` row and
    never will; with ``meet_events`` it can finally say what it does have.

    **Gated on ``tournaments.kind``, and on nothing else (ruling P7b-14).**
    The rows alone will not do: ``meet_events`` is derived from
    ``config.rankCounts`` for every workspace that carries one - Task 1 kept
    the derivation module-agnostic on purpose - and the console store seeds
    five division codes into every fresh workspace's blob, which the first
    autosave persists. So a bracket workspace really can hold division rows
    nobody configured.

    **``workspace_modules`` will not do either, and that is the ruled part.**
    R-DM-10: ``kind`` is the single DOMAIN authority (CHECK-constrained since
    P7a); ``workspace_modules`` governs UI enablement only. "This is played
    as a meet" is a domain claim, so it answers to ``kind``. Keying it off
    module state would also have made a one-PATCH UI toggle (``available ->
    enabled`` on ``meet``, which a bracket director might do just to look at
    the module) publish "Played as a meet" on a bracket event's public page -
    exactly the falsehood this gate exists to prevent, reachable from the
    control plane. Toggling a module now changes nothing public at all.

    No query: ``_page`` already resolved the row.
    """
    if tournament.kind != "meet":
        return []
    return list(
        repo.session.scalars(
            select(MeetEvent.id)
            .where(MeetEvent.tournament_id == tournament.id)
            .order_by(MeetEvent.id.asc())
        )
    )


def _bracket_roster_names(tournament: Tournament) -> Dict[str, str]:
    """Canonical bracket-roster id → public display name.

    Historical pairs carry member ids on the draw participant. Those ids are
    the only sound way to recover two individual names: splitting a team
    label on ``/`` corrupts real names and invents identity structure. Invalid
    or unnamed blob rows stay absent and are counted by the Players projection
    instead of leaking an id as though it were a name.
    """
    out: Dict[str, str] = {}
    for row in (tournament.data or {}).get("bracketPlayers") or []:
        if not isinstance(row, dict):
            continue
        key, name = row.get("id"), row.get("name")
        if isinstance(key, str) and key and isinstance(name, str) and name.strip():
            out[key] = name.strip()
    return out


@dataclass(frozen=True)
class PublicPersonDirectory:
    """The one batched, privacy-aware person projection for a tournament.

    ``identities`` contains only confirmed, non-opted-out, non-erased people.
    ``hidden`` deliberately remembers entry-backed ids which have no visible
    event.  That distinction matters: an imported draw name is safe to show
    as dead text, while an erased/opted-out entry must not fall back to the
    bracket blob's copied name.  ``clubs`` follows the same visibility gate.
    """

    identities: Dict[str, PublicPersonIdentityDTO]
    hidden: frozenset[str]
    clubs: Dict[str, Optional[str]]
    visible_events: Dict[str, frozenset[str]]


def _public_identities(repo: LocalRepository, tournament_id) -> PublicPersonDirectory:
    """Batch the Entries → bracket identity join for one public document.

    The bracket's roster key is deliberately retained as a structural key;
    the persisted ``EntryPlayer.id`` is the only value that may become a
    person URL.  This one query is shared by each projection's complete
    document and avoids a lookup per node/side (the common draw N+1 trap).
    Erased and fully hidden rows are retained only as non-linkable keys, so
    historical references degrade to a generic dead token instead of
    falling back to a copied bracket name.
    """
    rows = repo.session.execute(
        select(
            EntryPlayer.id,
            EntryPlayer.full_name,
            EntryPlayer.club,
            EntryEvent.code,
            EntryEvent.bracket_event_id,
            EntryEvent.meet_event_id,
            Entry.state,
            Entry.list_opt_out,
            EntryPlayer.erased_at,
        )
        .select_from(EntryPlayer)
        .join(
            Entry,
            (Entry.tournament_id == EntryPlayer.tournament_id)
            & (Entry.entry_player_id == EntryPlayer.id),
        )
        .outerjoin(
            EntryEvent,
            (EntryEvent.tournament_id == Entry.tournament_id)
            & (EntryEvent.id == Entry.entry_event_id),
        )
        .where(
            EntryPlayer.tournament_id == tournament_id,
        )
    ).all()
    identities: Dict[str, PublicPersonIdentityDTO] = {}
    hidden: set[str] = set()
    clubs: Dict[str, Optional[str]] = {}
    visible_events: Dict[str, set[str]] = {}
    for (
        player_id,
        name,
        club,
        event_code,
        bracket_event_id,
        meet_event_id,
        state,
        opted_out,
        erased_at,
    ) in rows:
        key = roster_id(player_id)
        visible = (
            erased_at is None
            and state == "confirmed"
            and not opted_out
            and isinstance(name, str)
            and bool(name.strip())
        )
        if visible:
            identities.setdefault(
                key, PublicPersonIdentityDTO(id=str(player_id), name=name.strip())
            )
            if isinstance(event_code, str):
                visible_events.setdefault(key, set()).add(event_code)
            if isinstance(bracket_event_id, str) and bracket_event_id:
                visible_events.setdefault(key, set()).add(bracket_event_id)
            if isinstance(meet_event_id, str) and meet_event_id:
                visible_events.setdefault(key, set()).add(meet_event_id)
            # A club is an expressly public field, but only on a visible
            # event.  Keep the first stable non-empty value if events differ.
            if key not in clubs or clubs[key] is None:
                clubs[key] = club.strip() if isinstance(club, str) and club.strip() else None
        else:
            hidden.add(key)
    hidden.difference_update(identities)
    return PublicPersonDirectory(
        identities=identities,
        hidden=frozenset(hidden),
        clubs=clubs,
        visible_events={key: frozenset(values) for key, values in visible_events.items()},
    )


def _dead_person(name: str) -> PersonReferenceDTO:
    """A display-only imported name; it must not be focusable or linkable."""
    return PersonReferenceDTO(
        identity=PublicPersonIdentityDTO(id=None, name=name),
        resolution="dead",
        label=None,
    )


def _visible_event_scope(
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    roster_key: str,
    primary: str,
    alias: Optional[str] = None,
) -> str:
    """Choose the stored visible-event key without parsing a rank string."""
    if not isinstance(identities, PublicPersonDirectory):
        return primary
    allowed = identities.visible_events.get(roster_key, frozenset())
    if primary in allowed:
        return primary
    if alias is not None and alias in allowed:
        return alias
    return primary


def _person_ref(
    roster_key: Optional[str],
    *,
    name: Optional[str],
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    label: Optional[str] = None,
    event_code: Optional[str] = None,
) -> PersonReferenceDTO:
    if isinstance(identities, PublicPersonDirectory):
        visible = roster_key is not None and roster_key in identities.identities
        if visible and event_code is not None:
            event_events = identities.visible_events.get(roster_key, frozenset())
            visible = not event_events or event_code in event_events
        if visible:
            return PersonReferenceDTO(identity=identities.identities[roster_key], resolution="resolved")
        if roster_key is not None and (
            roster_key in identities.hidden or roster_key in identities.identities
        ):
            return PersonReferenceDTO(identity=None, resolution="dead", label="Player not published")
    elif roster_key is not None and roster_key in identities:
        return PersonReferenceDTO(identity=identities[roster_key], resolution="resolved")
    if name:
        return _dead_person(name)
    return PersonReferenceDTO(identity=None, resolution="dead", label=label or "TBD")


def _participant_person_keys(participant) -> List[str]:
    """Canonical person keys carried by one event-scoped participant."""
    if participant.members:
        return list(participant.members)
    entry_player_id = getattr(participant, "entryPlayerId", None)
    return [roster_id(entry_player_id) if entry_player_id else participant.id]


def _participant_people(
    participant,
    roster_names: Dict[str, str],
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    event_code: Optional[str] = None,
) -> List[PersonReferenceDTO]:
    """Resolve participant people without inventing or leaking identities.

    Imported pair records sometimes contain only a partial member mapping. In
    that case the source label is the only honest public identity: rendering a
    missing token beside one resolved member would turn one pair into two
    invented person records. Entry-backed hidden people are different. Their
    copied source label may contain private identity data, so those members
    must continue to resolve independently to the generic unpublished token.
    """
    person_keys = _participant_person_keys(participant)
    if participant.members:
        privacy_protected = False
        fully_resolved = True
        for member in person_keys:
            if isinstance(identities, PublicPersonDirectory):
                visible_identity = member in identities.identities and (
                    event_code is None
                    or _event_public_for_person(identities, member, event_code)
                )
                privacy_protected = privacy_protected or (
                    member in identities.hidden
                    or (member in identities.identities and not visible_identity)
                )
            else:
                visible_identity = member in identities
            if member not in roster_names and not visible_identity:
                fully_resolved = False

        source_name = getattr(participant, "name", None)
        if not fully_resolved and not privacy_protected and source_name:
            return [_dead_person(source_name)]

        # ``members`` is the authoritative pair composition. Resolve each
        # member independently so a hidden/erased member becomes the generic
        # dead reference instead of leaking through a composite pair label.
        return [
            _person_ref(
                member,
                name=roster_names.get(member),
                identities=identities,
                event_code=event_code,
            )
            for member in person_keys
        ]
    name = roster_names.get(participant.id) or getattr(participant, "name", None)
    roster_key = person_keys[0]
    return [_person_ref(roster_key, name=name, identities=identities, event_code=event_code)]


def _event_public_for_person(
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    roster_key: str,
    event_code: Optional[str],
    event_alias: Optional[str] = None,
) -> bool:
    """Return whether an entry-backed person is public in this event.

    Imported draw-only people are not members of the directory and remain
    display-only dead references under R-U1.
    """
    if not isinstance(identities, PublicPersonDirectory):
        return True
    if roster_key not in identities.identities and roster_key not in identities.hidden:
        return True
    allowed = identities.visible_events.get(roster_key, frozenset())
    return bool(
        (event_code is not None and event_code in allowed)
        or (event_alias is not None and event_alias in allowed)
    )


def _event_public_club(
    roster_key: str,
    clubs: Dict[str, Optional[str]],
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    event_code: Optional[str],
    event_alias: Optional[str] = None,
) -> Optional[str]:
    if not _event_public_for_person(
        identities, roster_key, event_code, event_alias
    ):
        return None
    return clubs.get(roster_key)


def _alphabetic_name_key(name: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", name).casefold()
        if not unicodedata.combining(char)
    )


def _hhmm_plus(day_start: str, minutes: int) -> str:
    """``dayStart`` + N minutes, wrapping midnight — mirrors the frontend's
    ``slotToTime`` (lib/time.ts) so the public page and the operator's
    schedule can never disagree about a start time."""
    h, m = day_start.split(":")
    total = (int(h) * 60 + int(m) + minutes) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


# ---- DTOs -----------------------------------------------------------------


class DrawCardDTO(BaseModel):
    drawKey: str
    eventCode: str
    discipline: str
    kind: str  # the format tag: 'se' | 'rr' | 'de' | 'swiss' | 'compass' | 'monrad'
    size: int
    hasConsolation: bool
    matchCoverage: "MatchCoverageDTO"
    recordScope: str
    topologyScope: str
    roundCount: int = 0
    champions: List[PersonReferenceDTO] = Field(default_factory=list)
    finalists: List["HonorDTO"] = Field(default_factory=list)
    remainingMatchCount: Optional[int] = None
    historical: bool = False
    sourceUrl: Optional[str] = None


class DrawsIndexDTO(BaseModel):
    published: bool
    resultsPublished: bool
    draws: List[DrawCardDTO] = []
    #: Meet division codes ("MS", "XD"), empty for anything that is not a
    #: Meet workspace. NOT draw cards: a division has no bracket, no
    #: ``/draws/{key}`` document to link to, and no participant count -
    #: ``slot_count`` is lineup positions, not entries. It is the reason an
    #: empty ``draws`` list is empty (F-DM-33), stated in the vocabulary the
    #: entity already uses (``db.models.MeetEvent``).
    divisions: List[str] = []


class PublicPersonIdentityDTO(BaseModel):
    """The only public representation of a persisted tournament person.

    ``id`` is intentionally nullable: imported draw rows and placeholders have
    no ``entry_players`` row and therefore must never acquire a name-derived
    link.  ``name`` is copied from the authoritative player row (or from the
    imported draw roster when no row exists), never assembled by a caller.
    """

    id: Optional[str] = None
    name: str


class PersonReferenceDTO(BaseModel):
    """A person or structural token used by public projections.

    ``resolution`` is explicit so clients do not infer linkability from the
    presence of a label.  ``identity`` is absent for non-person tokens such as
    ``Bye`` and feeder placeholders.
    """

    identity: Optional[PublicPersonIdentityDTO] = None
    resolution: Literal["resolved", "dead"] = "dead"
    label: Optional[str] = None


class TeamDTO(BaseModel):
    """One participant of a draw — the lookup table match nodes reference,
    so a pair's names travel once, not once per round they survive."""

    participantKey: str
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    club: Optional[str] = None
    seed: Optional[int] = None


class DrawPlayerDTO(BaseModel):
    """One person in the public tournament directory.

    ``playerKey`` is the stable row identity. ``personKey`` exists only when
    the person came through Entries and therefore has a real public player
    page; imported/demo roster people remain useful directory rows without
    pretending to own an account-backed identity.
    """

    playerKey: str
    person: PersonReferenceDTO
    club: Optional[str] = None
    eventCodes: List[str]


class PlayersDTO(BaseModel):
    published: bool
    players: List[DrawPlayerDTO] = []
    referencedPlayerCount: int = 0
    missingNameCount: int = 0


class MatchCoverageDTO(BaseModel):
    imported: int
    expected: Optional[int] = None
    missing: Optional[int] = None


class SideDTO(BaseModel):
    participantKey: Optional[str] = None
    # "Winner of QF 3" / "Loser of R1 5" when the slot is fed by another
    # match; "Bye" for the BYE sentinel; None with a participantKey set.
    placeholder: Optional[str] = None
    bye: bool = False
    # Structural edge metadata for the progressively enhanced connector
    # layer. It is safe with results hidden: the same feeder relationship is
    # already stated by ``placeholder``. Historical independent match rows
    # have no invented feeder and therefore leave both fields absent.
    feederNodeKey: Optional[str] = None
    feederTake: Optional[Literal["winner", "loser"]] = None


class NodeResultDTO(BaseModel):
    """Present only when ``results_published`` — its absence IS the gate."""

    winnerSide: Optional[str] = None  # 'A' | 'B' | None (double bye)
    # Sets mode: [[a, b], …]; None for winner-only results.
    score: Optional[List[List[int]]] = None
    walkover: bool = False


class MatchNodeDTO(BaseModel):
    nodeKey: str
    position: int  # 1-based within its round
    sides: List[SideDTO]
    result: Optional[NodeResultDTO] = None
    # Venue-local naive strings; None until scheduled.
    scheduledTime: Optional[str] = None
    court: Optional[int] = None
    playedOn: Optional[str] = None
    localTime: Optional[str] = None
    courtLabel: Optional[str] = None
    sourceUrl: Optional[str] = None
    sourceRef: Optional[str] = None


class RoundDTO(BaseModel):
    label: str
    matches: List[MatchNodeDTO]


class SegmentDTO(BaseModel):
    id: str
    label: str
    rounds: List[RoundDTO]


class StandingRowDTO(BaseModel):
    position: int
    participantKey: str
    played: int
    wins: int
    losses: int
    gamesWon: int
    gamesLost: int
    pointsWon: int
    pointsLost: int
    # Plain W/L history values in play order (§3.4's History column).
    history: List[str] = []


class DrawDetailDTO(BaseModel):
    drawKey: str
    eventCode: str
    discipline: str
    kind: str
    size: int
    resultsPublished: bool
    matchCoverage: MatchCoverageDTO
    recordScope: str
    topologyScope: str
    historical: bool = False
    sourceUrl: Optional[str] = None
    identityScope: Optional[str] = None
    teams: List[TeamDTO]
    segments: List[SegmentDTO]
    # RR/Swiss only, and only when results are published.
    standings: Optional[List[StandingRowDTO]] = None


class SeedLineDTO(BaseModel):
    seed: int
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    club: Optional[str] = None


class SeedsEventDTO(BaseModel):
    eventCode: str
    discipline: str
    seeds: List[SeedLineDTO]


class SeedsDTO(BaseModel):
    published: bool
    events: List[SeedsEventDTO] = []


class HonorDTO(BaseModel):
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    club: Optional[str] = None


class WinnersEventDTO(BaseModel):
    eventCode: str
    discipline: str
    decided: bool
    winner: Optional[HonorDTO] = None
    runnerUp: Optional[HonorDTO] = None
    semifinalists: List[HonorDTO] = []
    finalScore: Optional[List[List[int]]] = None
    finalists: List[HonorDTO] = []


class WinnersDTO(BaseModel):
    published: bool
    events: List[WinnersEventDTO] = []


class PlayerEventDTO(BaseModel):
    code: str
    discipline: str
    # §3.3 "CXD with Prashant Vurikiti" — the ACCEPTED doubles partner's
    # name, or None. Gated three ways before it can appear: the pairing is
    # accepted (a nomination is a claim about somebody else), the partner's
    # own entry is confirmed (pending people never appear publicly, on a
    # partner line no less than on the list), and the partner has not opted
    # out of publication or been erased. Never the nominated EMAIL, which
    # lives on the entry precisely so it is never projected.
    partner: Optional[PersonReferenceDTO] = None
    seed: Optional[int] = None
    drawPath: List["PlayerDrawPathDTO"] = Field(default_factory=list)


class PlayerDrawPathDTO(BaseModel):
    """One round in a person's public draw path."""

    roundLabel: str
    opponents: List[PersonReferenceDTO] = Field(default_factory=list)


class PlayerMatchSideDTO(BaseModel):
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    placeholder: Optional[str] = None
    winner: bool = False
    seed: Optional[int] = None


class PlayerMatchDTO(BaseModel):
    eventCode: str
    roundLabel: Optional[str] = None
    sides: List[PlayerMatchSideDTO]
    # Present only when results are published AND the match is decided.
    score: Optional[List[List[int]]] = None
    decided: bool = False
    scheduledTime: Optional[str] = None
    court: Optional[int] = None
    playedOn: Optional[str] = None
    localTime: Optional[str] = None
    courtLabel: Optional[str] = None
    status: str = "scheduled"
    durationMinutes: Optional[int] = None
    updatedAt: Optional[str] = None


class PlayerPageDTO(BaseModel):
    person: PersonReferenceDTO
    club: Optional[str] = None
    events: List[PlayerEventDTO]
    matches: List[PlayerMatchDTO]


class ScheduleSideDTO(BaseModel):
    """Public side of a scheduled match; contact/account data is absent."""

    participantKey: Optional[str] = None
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    placeholder: Optional[str] = None


class ScheduleMatchDTO(BaseModel):
    matchKey: str
    source: Literal["bracket", "meet"]
    eventCode: str
    discipline: Optional[str] = None
    roundLabel: Optional[str] = None
    status: Literal[
        "scheduled", "called", "live", "delayed", "completed", "walkover", "retired", "cancelled"
    ] = "scheduled"
    scheduledDate: Optional[str] = None
    scheduledTime: Optional[str] = None
    court: Optional[int] = None
    sides: List[ScheduleSideDTO] = Field(default_factory=list)
    score: Optional[List[List[int]]] = None
    walkover: bool = False
    updatedAt: Optional[str] = None


class ScheduleDayFacetDTO(BaseModel):
    day: str
    count: int


class ScheduleFacetsDTO(BaseModel):
    days: List[ScheduleDayFacetDTO] = []
    events: List[str] = []
    courts: List[int] = []
    states: List[str] = []


class ScheduleMatchesDTO(BaseModel):
    published: bool
    items: List[ScheduleMatchDTO] = []
    facets: ScheduleFacetsDTO = Field(default_factory=ScheduleFacetsDTO)
    page: int = 1
    pageSize: int = 25
    total: int = 0
    timeZone: str = "UTC"
    updatedAt: Optional[str] = None
    revision: str = ""


@dataclass(frozen=True)
class ScheduleRuntimeSnapshot:
    """One read model shared by schedule, player and bracket projections.

    The operations rows are intentionally absent when the schedule is not
    published.  Besides avoiding needless work, this is a privacy gate: a
    caller cannot accidentally make an unpublished page's ETag depend on a
    private live-ops write.  ``revision`` covers every public value sourced
    by the snapshot, including court publication and person visibility.
    """

    directory: PublicPersonDirectory
    courts: Dict[str, int]
    states: Dict[str, object]
    bracket_revisions: List[Tuple[str, int, str]]
    bracket_results: List[Tuple[str, str, str, bool, str]]
    meet_labels: Dict[str, str]
    meet_event_keys: Dict[str, str]
    revision: str


# ---- knockout round vocabulary -------------------------------------------


def _round_label(total_rounds: int, index: int, knockout: bool) -> str:
    if not knockout:
        return f"Round {index + 1}"
    remaining = total_rounds - index
    if remaining == 1:
        return "Final"
    if remaining == 2:
        return "Semifinals"
    if remaining == 3:
        return "Quarterfinals"
    return f"Round of {2**remaining}"


def _short_round(total_rounds: int, index: int, knockout: bool) -> str:
    if not knockout:
        return f"R{index + 1}"
    remaining = total_rounds - index
    if remaining == 1:
        return "F"
    if remaining == 2:
        return "SF"
    if remaining == 3:
        return "QF"
    return f"R{2**remaining}"


_KNOCKOUT_FORMATS = {"se", "de", "compass", "monrad"}


# ---- the bracket-payload projection helpers ------------------------------

_BYE = "BYE"


def _event_segments(event) -> List:
    """The event's segments, or a single synthetic one from its top-level
    rounds — so every format walks the same shape."""
    if event.segments:
        return sorted(event.segments, key=lambda s: s.order)

    class _Main:  # noqa: N801 - tiny local shim, not a public class
        id = "MAIN"
        label = ""
        rounds = event.rounds

    return [_Main()]


def _unit_locator(event, knockout: bool) -> Dict[str, Tuple[str, str, int]]:
    """unit id → (segment label, short round label, 1-based position) — what
    a "Winner of QF 3" placeholder is made of."""
    out: Dict[str, Tuple[str, str, int]] = {}
    for segment in _event_segments(event):
        total = len(segment.rounds)
        for r_index, round_ids in enumerate(segment.rounds):
            short = _short_round(total, r_index, knockout)
            for position, unit_id in enumerate(round_ids, start=1):
                out[unit_id] = (segment.label, short, position)
    return out


def _placeholder(slot, locator) -> Optional[str]:
    if slot.feeder_play_unit_id is None:
        return None
    where = locator.get(slot.feeder_play_unit_id)
    take = "Loser" if slot.feeder_take == "loser" else "Winner"
    if where is None:
        return f"{take} of an earlier match"
    segment_label, short, position = where
    prefix = f"{segment_label} " if segment_label else ""
    return f"{take} of {prefix}{short} {position}"


def _derivation(unit, units, results, participant_id: str):
    """Did this participant reach ``unit`` by winning or losing one of its
    resulted dependencies? → (feeder unit id, "Winner"|"Loser") or None.

    Needed because advancement REPLACES the feeder slot with a plain
    participant slot (``advancement.py``): once a semifinal is recorded,
    the final's slot looks structural while actually being a result. The
    membership test is sound for bracket formats — a participant appears
    in a unit's dependency only by having played it, and a structurally
    placed side never played the feeder it sits beside.
    """
    for dep_id in unit.dependencies or []:
        dep = units.get(dep_id)
        result = results.get(dep_id)
        if dep is None or result is None or result.winner_side not in ("A", "B"):
            continue
        side_a = set(dep.side_a or [])
        side_b = set(dep.side_b or [])
        if participant_id not in side_a and participant_id not in side_b:
            continue
        won = (result.winner_side == "A") == (participant_id in side_a)
        return dep_id, ("Winner" if won else "Loser")
    return None


def _side(
    unit,
    participant_ids: Optional[List[str]],
    slot,
    locator,
    units,
    results,
    reveal_resolved: bool,
) -> SideDTO:
    """One side of a node. ``reveal_resolved`` is the results gate applied
    to advancement: when off, only structural placement may name a player —
    a side that got here by winning a recorded match is a result, and is
    projected back into the placeholder the slot held before advancement
    overwrote it (``_derivation``)."""
    feeder_node_key = slot.feeder_play_unit_id
    feeder_take = (
        "loser"
        if feeder_node_key is not None and slot.feeder_take == "loser"
        else ("winner" if feeder_node_key is not None else None)
    )
    if slot.participant_id == _BYE:
        return SideDTO(
            bye=True,
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
        )
    if slot.participant_id is not None:
        derived = _derivation(unit, units, results, slot.participant_id)
        if derived is not None:
            feeder_node_key, derived_take = derived
            feeder_take = derived_take.lower()
        if not reveal_resolved:
            if derived is not None:
                dep_id, take = derived
                where = locator.get(dep_id)
                if where is None:
                    return SideDTO(
                        placeholder=f"{take} of an earlier match",
                        feederNodeKey=feeder_node_key,
                        feederTake=feeder_take,
                    )
                segment_label, short, position = where
                prefix = f"{segment_label} " if segment_label else ""
                return SideDTO(
                    placeholder=f"{take} of {prefix}{short} {position}",
                    feederNodeKey=feeder_node_key,
                    feederTake=feeder_take,
                )
        return SideDTO(
            participantKey=slot.participant_id,
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
        )
    if reveal_resolved and participant_ids:
        if participant_ids == [_BYE]:
            return SideDTO(
                bye=True,
                feederNodeKey=feeder_node_key,
                feederTake=feeder_take,
            )
        # A resolved multi-member side is one participant (a pair) in this
        # model; the cached list is member ids only for teams, participant
        # ids otherwise — either way the FIRST id keys the lookup table the
        # tier joins against, and pairs are one participant row there.
        return SideDTO(
            participantKey=participant_ids[0],
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
        )
    placeholder = _placeholder(slot, locator)
    return SideDTO(
        placeholder=placeholder or "TBD",
        feederNodeKey=feeder_node_key,
        feederTake=feeder_take,
    )


def _teams(
    event,
    clubs: Dict[str, Optional[str]],
    roster_names: Optional[Dict[str, str]] = None,
    identities: Optional[PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO]] = None,
    event_code: Optional[str] = None,
) -> List[TeamDTO]:
    roster_names = roster_names or {}
    identities = identities or {}
    out = []
    event_alias = _event_public_code(event)
    for participant in event.participants:
        people = _participant_people(participant, roster_names, identities, event_code)
        person_keys = _participant_person_keys(participant)
        club = _event_public_club(
            person_keys[0],
            clubs,
            identities,
            event_code,
            event_alias,
        )
        if len(person_keys) > 1 and club is None:
            for member in person_keys[1:]:
                club = _event_public_club(
                    member,
                    clubs,
                    identities,
                    event_code,
                    event_alias,
                )
                if club is not None:
                    break
        out.append(
            TeamDTO(
                participantKey=participant.id,
                persons=people,
                club=club,
                seed=participant.seed,
            )
        )
    return out


def _history(event, results_by_unit, participant_key: str) -> List[str]:
    """W/L pills in play order — walk the event's rounds in order and read
    this participant's decided units."""
    pills: List[str] = []
    for segment in _event_segments(event):
        for round_ids in segment.rounds:
            for unit_id in round_ids:
                entry = results_by_unit.get(unit_id)
                if entry is None:
                    continue
                unit, result = entry
                side_a = unit.side_a or []
                side_b = unit.side_b or []
                if participant_key in side_a:
                    on_a = True
                elif participant_key in side_b:
                    on_a = False
                else:
                    continue
                if result.winner_side == "NONE":
                    continue
                won = (result.winner_side == "A") == on_a
                pills.append("W" if won else "L")
    return pills


def _score_rows(score: Optional[dict]) -> Optional[List[List[int]]]:
    """The Sets-mode blob, reduced to bare number pairs — the projection
    publishes scores, never the blob's own shape (which is free-form)."""
    if not isinstance(score, dict):
        return None
    sets = score.get("sets")
    if not isinstance(sets, list):
        return None
    rows = []
    for one in sets:
        if not isinstance(one, dict):
            continue
        a, b = one.get("sideA"), one.get("sideB")
        if isinstance(a, int) and isinstance(b, int):
            rows.append([a, b])
    return rows or None


def _bracket_indexes(payload):
    units = {u.id: u for u in payload.play_units}
    results = {r.play_unit_id: r for r in payload.results}
    assignments = {a.play_unit_id: a for a in payload.assignments}
    return units, results, assignments


def _slot_time(payload, slot_id: Optional[int]) -> Optional[str]:
    """Venue-local start for a bracket slot. ``start_time`` names the day's
    first slot; ``interval_minutes`` is the grid."""
    if slot_id is None or payload.start_time is None:
        return None
    minutes = slot_id * payload.interval_minutes
    base = payload.start_time
    return _hhmm_plus(f"{base.hour:02d}:{base.minute:02d}", minutes)


def _event_or_404(payload, draw_key: str):
    for event in payload.events:
        if event.id == draw_key:
            return event
    raise _not_found()


def _has_consolation(event) -> bool:
    if event.segments and len(event.segments) > 1:
        return True
    return False


_RECORD_SCOPES = {"full_draw", "completed_matches_only", "finals_only"}


def _event_record_scope(event) -> str:
    raw = (event.config or {}).get("record_scope")
    return raw if raw in _RECORD_SCOPES else "full_draw"


def _event_topology_scope(event) -> str:
    raw = (event.config or {}).get("topology_scope")
    if raw in {"none", "proven_winner_advancement"}:
        return raw
    return "full_draw" if _event_record_scope(event) == "full_draw" else "none"


def _event_public_code(event) -> str:
    """The short public event code, never an importer namespace.

    Bracket event ids are operator-owned and may legitimately be ``MS1`` or
    ``T027-MS``.  The discipline is the public category when it is a compact
    code; otherwise the id remains the only non-invented label available.
    """
    canonical = {"MS", "WS", "MD", "WD", "XD"}
    discipline = event.discipline
    if discipline in canonical:
        return discipline
    suffix = event.id.rsplit("-", 1)[-1]
    if suffix in canonical:
        return suffix
    if isinstance(discipline, str) and discipline.strip():
        return discipline.strip()
    return "Event"


def _event_match_coverage(event) -> MatchCoverageDTO:
    config = event.config or {}
    observed = sum(
        len(round_ids) for segment in _event_segments(event) for round_ids in segment.rounds
    )
    configured_imported = config.get("imported_match_count")
    imported = (
        configured_imported
        if isinstance(configured_imported, int) and configured_imported >= 0
        else observed
    )
    expected: Optional[int] = None
    configured_expected = config.get("expected_match_count")
    if isinstance(configured_expected, int) and configured_expected >= 0:
        expected = configured_expected
    # For an ordinary single-elimination main draw, N entries imply N-1
    # deciding match positions. Historical/imported formats provide their own
    # expected count because group stages and partial topologies do not.
    elif (
        _event_record_scope(event) == "full_draw"
        and event.format == "se"
        and isinstance(event.bracket_size, int)
    ):
        expected = max(event.bracket_size - 1, 0)
    return MatchCoverageDTO(
        imported=imported,
        expected=expected,
        missing=max(expected - imported, 0) if expected is not None else None,
    )


def _safe_public_url(raw) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    parsed = urlparse(raw)
    return raw if parsed.scheme in {"http", "https"} and parsed.netloc else None


def _public_source_url(event) -> Optional[str]:
    return _safe_public_url((event.config or {}).get("source_url"))


def _event_projection_meta(event) -> dict:
    config = event.config or {}
    return {
        "matchCoverage": _event_match_coverage(event),
        "recordScope": _event_record_scope(event),
        "topologyScope": _event_topology_scope(event),
        "historical": bool(config.get("historical")),
        "sourceUrl": _public_source_url(event),
    }


# ---- routes ---------------------------------------------------------------


@router.get("/draws", response_model=DrawsIndexDTO)
def draws_index(
    response: Response,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> DrawsIndexDTO:
    page, tournament = _page(repo, slug)
    response.headers["Cache-Control"] = _CACHE
    if not page.draws_published:
        return DrawsIndexDTO(published=False, resultsPublished=False)

    payload = _bracket(repo, tournament.id)
    draws = []
    if payload is not None:
        identities = _public_identities(repo, tournament.id)
        units, results, _ = _bracket_indexes(payload)
        roster_names = _bracket_roster_names(tournament)
        for event in payload.events:
            champions: List[PersonReferenceDTO] = []
            finalist_honors: List[HonorDTO] = []
            winner_key = None
            if page.results_published:
                winner_key, _, _ = _event_winner(event, units, results)
                teams = {
                    t.participantKey: t
                    for t in _teams(
                        event,
                        identities.clubs,
                        roster_names,
                        identities,
                        event.id,
                    )
                }
                final_unit = _event_final_unit(event, units)
                finalist_honors = _finalist_honors(final_unit, teams)
                if winner_key:
                    team = teams.get(winner_key)
                    champions = team.persons if team is not None else []
            draws.append(
                DrawCardDTO(
                    drawKey=event.id,
                    eventCode=_event_public_code(event),
                    discipline=event.discipline,
                    kind=event.format,
                    size=event.bracket_size or event.participant_count,
                    hasConsolation=_has_consolation(event),
                    roundCount=max((len(segment.rounds) for segment in _event_segments(event)), default=len(event.rounds)),
                    champions=champions,
                    finalists=finalist_honors,
                    remainingMatchCount=(
                        _remaining_match_count(event, units, results)
                        if page.results_published and not winner_key
                        else None
                    ),
                    **_event_projection_meta(event),
                )
            )
    return DrawsIndexDTO(
        published=True,
        resultsPublished=bool(page.results_published),
        draws=draws,
        divisions=_meet_divisions(repo, tournament),
    )


@router.get("/draws/{draw_key}", response_model=DrawDetailDTO)
def draw_detail(
    response: Response,
    slug: str = Path(..., max_length=100),
    draw_key: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> DrawDetailDTO:
    page, tournament = _page(repo, slug)
    if not page.draws_published:
        # Uniform with an unknown draw: an unpublished tier has no draw
        # keyspace to enumerate.
        raise _not_found()
    payload = _bracket(repo, tournament.id)
    if payload is None:
        raise _not_found()
    event = _event_or_404(payload, draw_key)
    response.headers["Cache-Control"] = _CACHE

    results_on = bool(page.results_published)
    knockout = event.format in _KNOCKOUT_FORMATS
    units, results, assignments = _bracket_indexes(payload)
    locator = _unit_locator(event, knockout)
    roster_names = _bracket_roster_names(tournament)
    runtime = _schedule_runtime_snapshot(
        repo,
        tournament,
        page,
        bracket_payload=payload,
    )
    identities = runtime.directory
    operational_courts = runtime.courts

    segments_out: List[SegmentDTO] = []
    for segment in _event_segments(event):
        total = len(segment.rounds)
        rounds_out = []
        for r_index, round_ids in enumerate(segment.rounds):
            matches = []
            for position, unit_id in enumerate(round_ids, start=1):
                unit = units.get(unit_id)
                if unit is None:
                    continue
                assignment = assignments.get(unit_id)
                result = results.get(unit_id) if results_on else None
                matches.append(
                    MatchNodeDTO(
                        nodeKey=unit.id,
                        position=position,
                        sides=[
                            _side(
                                unit,
                                unit.side_a,
                                unit.slot_a,
                                locator,
                                units,
                                results,
                                results_on,
                            ),
                            _side(
                                unit,
                                unit.side_b,
                                unit.slot_b,
                                locator,
                                units,
                                results,
                                results_on,
                            ),
                        ],
                        result=(
                            NodeResultDTO(
                                winnerSide=(
                                    result.winner_side if result.winner_side in ("A", "B") else None
                                ),
                                score=_score_rows(result.score),
                                walkover=bool(result.walkover),
                            )
                            if result is not None
                            else None
                        ),
                        scheduledTime=_slot_time(
                            payload, assignment.slot_id if assignment else None
                        ),
                        court=operational_courts.get(unit.id),
                        playedOn=unit.played_on,
                        localTime=unit.local_time,
                        courtLabel=unit.court_label,
                        sourceUrl=_safe_public_url(unit.source_url),
                        sourceRef=unit.source_ref,
                    )
                )
            historical_labels = event.config.get("round_labels") if event.config else None
            label = (
                historical_labels[r_index]
                if isinstance(historical_labels, list)
                and r_index < len(historical_labels)
                and isinstance(historical_labels[r_index], str)
                else _round_label(total, r_index, knockout)
            )
            rounds_out.append(RoundDTO(label=label, matches=matches))
        segments_out.append(
            SegmentDTO(
                id=segment.id,
                label=segment.label or ("Draw" if knockout else ""),
                rounds=rounds_out,
            )
        )

    standings = None
    if results_on and event.standings:
        results_by_unit = {
            unit_id: (units[unit_id], result)
            for unit_id, result in ((r.play_unit_id, r) for r in payload.results)
            if unit_id in units
        }
        standings = [
            StandingRowDTO(
                position=row.position,
                participantKey=row.participant_id,
                played=row.played,
                wins=row.wins,
                losses=row.losses,
                gamesWon=row.games_won,
                gamesLost=row.games_lost,
                pointsWon=row.points_won,
                pointsLost=row.points_lost,
                history=_history(event, results_by_unit, row.participant_id),
            )
            for row in event.standings
        ]

    return DrawDetailDTO(
        drawKey=event.id,
        eventCode=_event_public_code(event),
        discipline=event.discipline,
        kind=event.format,
        size=event.bracket_size or event.participant_count,
        resultsPublished=results_on,
        **_event_projection_meta(event),
        identityScope=(event.config or {}).get("identity_scope"),
        teams=_teams(
            event,
            identities.clubs,
            roster_names,
            identities,
            event.id,
        ),
        segments=segments_out,
        standings=standings,
    )


@router.get("/players", response_model=PlayersDTO)
def players_index(
    response: Response,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> PlayersDTO:
    """The one public player directory for entries and published draws.

    Confirmed entrants retain their existing profile identity.  Once draws
    are published, roster-only people are merged into that same directory so
    imported/demo tournaments do not need a second, competing player list.
    """
    page, tournament = _page(repo, slug)
    response.headers["Cache-Control"] = _CACHE
    if not page.draws_published and not page.entrants_published:
        return PlayersDTO(published=False)

    entrant_rows = list(_entrants(repo, tournament.id)) if page.entrants_published else []
    identities = _public_identities(repo, tournament.id)
    entrants_by_roster_id = {
        roster_id(person_id): {
            "personKey": str(person_id),
            "name": name,
            "club": club,
            "eventCodes": set(codes),
        }
        for person_id, name, club, codes in entrant_rows
    }

    events_by_player: Dict[str, set[str]] = {}
    payload = _bracket(repo, tournament.id) if page.draws_published else None
    if payload is not None:
        for event in payload.events:
            code = _event_public_code(event)
            for participant in event.participants:
                for player_id in _participant_person_keys(participant):
                    if not _event_public_for_person(
                        identities,
                        player_id,
                        event.id,
                        code,
                    ):
                        continue
                    events_by_player.setdefault(player_id, set()).add(code)

    # A confirmed entrant can exist before a draw, or can be omitted from a
    # draw after withdrawal.  It remains part of the published directory.
    for player_id, entrant in entrants_by_roster_id.items():
        events_by_player.setdefault(player_id, set()).update(entrant["eventCodes"])

    roster_names = _bracket_roster_names(tournament)
    players = [
        DrawPlayerDTO(
            playerKey=player_id,
            person=_person_ref(
                player_id,
                name=(entrants_by_roster_id.get(player_id) or {}).get("name")
                or roster_names.get(player_id),
                identities=identities,
            ),
            club=(entrants_by_roster_id.get(player_id) or {}).get("club"),
            eventCodes=sorted(event_codes),
        )
        for player_id, event_codes in events_by_player.items()
        if player_id in roster_names or player_id in entrants_by_roster_id
    ]
    players.sort(
        key=lambda row: (
            _alphabetic_name_key(row.person.identity.name if row.person.identity else row.person.label or ""),
            row.person.identity.name if row.person.identity else row.person.label or "",
            row.playerKey,
        )
    )
    return PlayersDTO(
        published=True,
        players=players,
        referencedPlayerCount=len(events_by_player),
        missingNameCount=len(events_by_player) - len(players),
    )


@router.get("/seeds", response_model=SeedsDTO)
def seeds(
    response: Response,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> SeedsDTO:
    """Seeds are draw facts (§3.5) — gated by ``draws_published``."""
    page, tournament = _page(repo, slug)
    response.headers["Cache-Control"] = _CACHE
    if not page.draws_published:
        return SeedsDTO(published=False)
    payload = _bracket(repo, tournament.id)
    if payload is None:
        return SeedsDTO(published=True)

    roster_names = _bracket_roster_names(tournament)
    identities = _public_identities(repo, tournament.id)
    events_out = []
    for event in payload.events:
        seeded = sorted(
            (p for p in event.participants if p.seed is not None),
            key=lambda p: p.seed,
        )
        if not seeded:
            continue
        events_out.append(
            SeedsEventDTO(
                eventCode=_event_public_code(event),
                discipline=event.discipline,
                seeds=[
                    SeedLineDTO(
                        seed=p.seed,
                        persons=_participant_people(
                            p,
                            roster_names,
                            identities,
                            event.id,
                        ),
                        club=_event_public_club(
                            _participant_person_keys(p)[0],
                            identities.clubs,
                            identities,
                            event.id,
                            _event_public_code(event),
                        )
                        or next(
                            (
                                _event_public_club(
                                    m,
                                    identities.clubs,
                                    identities,
                                    event.id,
                                    _event_public_code(event),
                                )
                                for m in _participant_person_keys(p)[1:]
                                if _event_public_club(
                                    m,
                                    identities.clubs,
                                    identities,
                                    event.id,
                                    _event_public_code(event),
                                )
                            ),
                            None,
                        ),
                    )
                    for p in seeded
                ],
            )
        )
    return SeedsDTO(published=True, events=events_out)


def _honor(payload_team: Optional[TeamDTO]) -> Optional[HonorDTO]:
    if payload_team is None:
        return None
    return HonorDTO(persons=payload_team.persons, club=payload_team.club)


def _finalist_honors(final_unit, teams: Dict[str, TeamDTO]) -> List[HonorDTO]:
    """Keep final sides grouped, especially for doubles.

    ``finalParticipants`` flattened four doubles players into one list and
    made the public page unable to express who was playing whom.  Each side
    is one HonorDTO, with its two PersonRefs retained in order.
    """
    if final_unit is None:
        return []
    out: List[HonorDTO] = []
    for side in (final_unit.side_a or [], final_unit.side_b or []):
        persons: List[PersonReferenceDTO] = []
        club: Optional[str] = None
        for key in side:
            if key == _BYE:
                continue
            team = teams.get(key)
            if team is None:
                continue
            persons.extend(team.persons)
            club = club or team.club
        if persons:
            out.append(HonorDTO(persons=persons, club=club))
    return out


def _remaining_match_count(event, units, results) -> int:
    """Count unresolved match positions without treating BYEs as matches."""
    unit_ids = {
        unit_id
        for segment in _event_segments(event)
        for round_ids in segment.rounds
        for unit_id in round_ids
    }
    return sum(
        1
        for unit_id in unit_ids
        if unit_id not in results
        and unit_id in units
        and not (
            _BYE in (units[unit_id].side_a or [])
            or _BYE in (units[unit_id].side_b or [])
        )
    )


@router.get("/winners", response_model=WinnersDTO)
def winners(
    response: Response,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> WinnersDTO:
    """Winner and runner-up per event as results complete (§3.6) — result
    data, so gated by ``results_published``. Partial state is fine: an
    undecided event reports ``decided: false``."""
    page, tournament = _page(repo, slug)
    response.headers["Cache-Control"] = _CACHE
    if not page.results_published:
        return WinnersDTO(published=False)
    payload = _bracket(repo, tournament.id)
    if payload is None:
        return WinnersDTO(published=True)

    roster_names = _bracket_roster_names(tournament)
    identities = _public_identities(repo, tournament.id)
    units, results, _ = _bracket_indexes(payload)
    events_out = []
    for event in payload.events:
        teams = {
            t.participantKey: t
            for t in _teams(
                event,
                identities.clubs,
                roster_names,
                identities,
                event.id,
            )
        }
        entry = _event_winner(event, units, results)
        winner_key, runner_key, semi_keys = entry
        final_unit = _event_final_unit(event, units)
        final_result = results.get(final_unit.id) if final_unit is not None else None
        events_out.append(
            WinnersEventDTO(
                eventCode=_event_public_code(event),
                discipline=event.discipline,
                decided=winner_key is not None,
                winner=_honor(teams.get(winner_key)) if winner_key else None,
                runnerUp=_honor(teams.get(runner_key)) if runner_key else None,
                semifinalists=[
                    honor
                    for honor in (_honor(teams.get(k)) for k in semi_keys)
                    if honor is not None
                ],
                finalScore=_score_rows(final_result.score) if final_result is not None else None,
                finalists=_finalist_honors(final_unit, teams),
            )
        )
    return WinnersDTO(published=True, events=events_out)


def _decided_sides(unit, result) -> Optional[Tuple[str, str]]:
    """(winner participant, loser participant) of a decided two-side unit —
    None while unresolved or on a NONE result."""
    if result is None or result.winner_side not in ("A", "B"):
        return None
    side_a = [p for p in (unit.side_a or []) if p != _BYE]
    side_b = [p for p in (unit.side_b or []) if p != _BYE]
    if not side_a or not side_b:
        return None
    if result.winner_side == "A":
        return side_a[0], side_b[0]
    return side_b[0], side_a[0]


def _event_winner(event, units, results):
    """(winner, runner-up, semifinalists) participant keys for one event.

    Round robin (and Swiss): standings positions 1 and 2 — the §3.6 rule,
    same math as the table. Knockout: the deciding segment's final.

    # ponytail: the deciding segment is found by a positions/[GF]/last
    # heuristic that covers se and de; compass/monrad plate winners are a
    # follow-up (they decide positions 1-2 in a named segment this already
    # finds when ``positions`` says so).
    """
    if event.format not in _KNOCKOUT_FORMATS:
        if not event.standings:
            return None, None, []
        by_position = {row.position: row.participant_id for row in event.standings}
        # Undecided until every unit has a result — a mid-tournament rank 1
        # is a lead, not a winner.
        all_units = [uid for segment in _event_segments(event) for r in segment.rounds for uid in r]
        if any(uid not in results for uid in all_units):
            return None, None, []
        return by_position.get(1), by_position.get(2), []

    segments = _event_segments(event)
    deciding = None
    for segment in segments:
        positions = getattr(segment, "positions", None)
        if positions and 1 in range(positions[0], positions[-1] + 1):
            deciding = segment
            break
    if deciding is None:
        by_id = {segment.id: segment for segment in segments}
        deciding = by_id.get("GF") or by_id.get("W") or segments[0]

    if not deciding.rounds:
        return None, None, []
    final_ids = deciding.rounds[-1]
    if len(final_ids) != 1:
        return None, None, []
    final_unit = units.get(final_ids[0])
    if final_unit is None:
        return None, None, []
    decided = _decided_sides(final_unit, results.get(final_unit.id))
    if decided is None:
        return None, None, []
    winner_key, runner_key = decided

    semi_keys: List[str] = []
    if len(deciding.rounds) >= 2:
        for unit_id in deciding.rounds[-2]:
            unit = units.get(unit_id)
            if unit is None:
                continue
            pair = _decided_sides(unit, results.get(unit_id))
            if pair is not None:
                semi_keys.append(pair[1])  # the SF loser
    return winner_key, runner_key, semi_keys


def _event_final_unit(event, units):
    """Return the structural final unit for a result/finalist projection."""
    if event.format not in _KNOCKOUT_FORMATS:
        return None
    segments = _event_segments(event)
    deciding = None
    for segment in segments:
        positions = getattr(segment, "positions", None)
        if positions and 1 in range(positions[0], positions[-1] + 1):
            deciding = segment
            break
    if deciding is None:
        deciding = next((s for s in segments if s.id in {"GF", "W"}), segments[0] if segments else None)
    if deciding is None or not deciding.rounds or len(deciding.rounds[-1]) != 1:
        return None
    return units.get(deciding.rounds[-1][0])


# ---- the player page (§3.3) ----------------------------------------------


@router.get("/players/{person_key}", response_model=PlayerPageDTO)
def player_page(
    response: Response,
    slug: str = Path(..., max_length=100),
    person_key: str = Path(..., max_length=64),
    repo: LocalRepository = Depends(get_repository),
) -> PlayerPageDTO:
    """One person's tournament: events, draw paths, and matches.

    Discoverability rides ``entrants_published`` (§4) — with the list
    unpublished, a person page answers the uniform 404 like everything
    else unpublished. The person must hold a CONFIRMED entry: pending
    submissions never appear publicly (§3.2), on their page-of-one no less
    than on the list.
    """
    page, tournament = _page(repo, slug)
    if not page.entrants_published:
        raise _not_found()
    try:
        person_id = uuid.UUID(person_key)
    except (ValueError, AttributeError, TypeError):
        raise _not_found()

    person = repo.session.get(EntryPlayer, (tournament.id, person_id))
    if person is None or person.erased_at is not None:
        raise _not_found()
    entries = list(
        repo.session.scalars(
            select(Entry).where(
                Entry.tournament_id == tournament.id,
                Entry.entry_player_id == person_id,
                Entry.state == "confirmed",
                Entry.list_opt_out.is_(False),
            )
        )
    )
    if not entries:
        raise _not_found()
    response.headers["Cache-Control"] = _CACHE
    payload = _bracket(repo, tournament.id) if page.draws_published else None
    runtime = _schedule_runtime_snapshot(
        repo,
        tournament,
        page,
        bracket_payload=payload,
    )
    identities = runtime.directory
    identity_key = roster_id(person_id)
    if identity_key not in identities.identities:
        raise _not_found()
    page_updated_at = tournament.updated_at.isoformat() if tournament.updated_at else None

    events_by_id = {
        ev.id: ev
        for ev in repo.session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id == tournament.id)
        )
    }

    # ---- accepted doubles partners (E3 → §3.3) -------------------------
    # Batched: one SELECT for the partner entries, one for their players —
    # never per-line (the N+1 precedent). See PlayerEventDTO for the gates.
    partner_ids = [
        e.partner_entry_id
        for e in entries
        if e.partner_entry_id is not None and e.partner_accepted_at is not None
    ]
    partner_ref_by_event: dict = {}
    if partner_ids:
        partner_entries = {
            pe.id: pe
            for pe in repo.session.scalars(
                select(Entry).where(
                    Entry.tournament_id == tournament.id,
                    Entry.id.in_(partner_ids),
                    Entry.state == "confirmed",
                )
            )
        }
        partner_player_ids = {
            pe.entry_player_id for pe in partner_entries.values() if pe.entry_player_id is not None
        }
        partner_players = (
            {
                p.id: p
                for p in repo.session.scalars(
                    select(EntryPlayer).where(
                        EntryPlayer.tournament_id == tournament.id,
                        EntryPlayer.id.in_(partner_player_ids),
                        EntryPlayer.erased_at.is_(None),
                    )
                )
            }
            if partner_player_ids
            else {}
        )
        for e in entries:
            pe = partner_entries.get(e.partner_entry_id)
            if pe is None or pe.list_opt_out:
                continue
            partner = partner_players.get(pe.entry_player_id)
            if partner is not None:
                partner_ref_by_event[e.entry_event_id] = _person_ref(
                    roster_id(partner.id), name=partner.full_name, identities=identities
                )

    player_events_by_code = {
        event.code: (event.code, event.discipline, partner_ref_by_event.get(event.id))
        for event in (events_by_id.get(e.entry_event_id) for e in entries)
        if event is not None
    }
    player_events = sorted(player_events_by_code.values(), key=lambda row: (row[0], row[1]))

    results_on = bool(page.results_published)
    roster_id_str = roster_id(person_id)
    matches: List[PlayerMatchDTO] = []

    # ---- bracket-origin matches --------------------------------------
    operational_courts = runtime.courts
    if payload is not None and page.draws_published:
        roster_names = _bracket_roster_names(tournament)
        units, results, assignments = _bracket_indexes(payload)
        for event in payload.events:
            public_event_code = _event_public_code(event)
            visible_event_keys = identities.visible_events.get(identity_key, frozenset())
            if event.id not in visible_event_keys and public_event_code not in visible_event_keys:
                continue
            mine = {
                p.id
                for p in event.participants
                if p.id == roster_id_str or roster_id_str in (p.members or [])
            }
            if not mine:
                continue
            knockout = event.format in _KNOCKOUT_FORMATS
            locator = _unit_locator(event, knockout)
            teams = {
                t.participantKey: t
                for t in _teams(
                    event,
                    identities.clubs,
                    roster_names,
                    identities,
                    event.id,
                )
            }
            for segment in _event_segments(event):
                total = len(segment.rounds)
                for r_index, round_ids in enumerate(segment.rounds):
                    for unit_id in round_ids:
                        unit = units.get(unit_id)
                        if unit is None:
                            continue
                        result = results.get(unit_id) if results_on else None
                        decided = result is not None and result.winner_side in (
                            "A",
                            "B",
                        )
                        sides = []
                        projected_keys = set()
                        for cached, slot, side_tag in (
                            (unit.side_a, unit.slot_a, "A"),
                            (unit.side_b, unit.slot_b, "B"),
                        ):
                            projected = _side(
                                unit,
                                cached,
                                slot,
                                locator,
                                units,
                                results,
                                results_on,
                            )
                            if projected.participantKey:
                                projected_keys.add(projected.participantKey)
                            team = (
                                teams.get(projected.participantKey)
                                if projected.participantKey
                                else None
                            )
                            sides.append(
                                PlayerMatchSideDTO(
                                    persons=team.persons if team else [],
                                    placeholder=("Bye" if projected.bye else projected.placeholder),
                                    winner=bool(decided and result.winner_side == side_tag),
                                    seed=team.seed if team else None,
                                )
                            )
                        # Involvement AS THE PUBLIC VIEW KNOWS IT: the same
                        # redaction that hides advancement from the tree
                        # hides this person's redacted appearances from
                        # their own public page — anything else would leak
                        # the result through the match list's mere growth.
                        if not projected_keys & mine:
                            continue
                        assignment = assignments.get(unit_id)
                        match_status = (
                            "walkover" if result is not None and result.walkover
                            else "completed" if decided
                            else "live" if assignment is not None and assignment.actual_start_slot is not None
                            else "scheduled"
                        )
                        matches.append(
                            PlayerMatchDTO(
                                eventCode=_event_public_code(event),
                                roundLabel=_round_label(total, r_index, knockout),
                                sides=sides,
                                score=_score_rows(result.score) if result else None,
                                decided=decided,
                                scheduledTime=_slot_time(
                                    payload,
                                    assignment.slot_id if assignment else None,
                                ),
                                court=operational_courts.get(unit_id),
                                playedOn=unit.played_on,
                                localTime=unit.local_time,
                                courtLabel=unit.court_label,
                                status=match_status,
                                durationMinutes=(
                                    assignment.duration_slots * payload.interval_minutes
                                    if assignment is not None
                                    else None
                                ),
                                updatedAt=page_updated_at,
                            )
                        )

    # Build the person's draw path from the already-hydrated bracket. This
    # walks in-memory units (no per-round or per-opponent queries) and keeps
    # the same results gate as the match projection.
    event_details: Dict[str, Tuple[Optional[int], List[PlayerDrawPathDTO]]] = {}
    if payload is not None and page.draws_published:
        path_units, path_results, _ = _bracket_indexes(payload)
        path_roster_names = _bracket_roster_names(tournament)
        for event in payload.events:
            public_event_code = _event_public_code(event)
            visible_event_keys = identities.visible_events.get(identity_key, frozenset())
            if event.id not in visible_event_keys and public_event_code not in visible_event_keys:
                continue
            mine = {
                p.id
                for p in event.participants
                if p.id == roster_id_str or roster_id_str in (p.members or [])
            }
            if not mine:
                continue
            knockout = event.format in _KNOCKOUT_FORMATS
            locator = _unit_locator(event, knockout)
            teams = {
                t.participantKey: t
                for t in _teams(
                    event,
                    identities.clubs,
                    path_roster_names,
                    identities,
                    event.id,
                )
            }
            seed = next(
                (p.seed for p in event.participants if p.id in mine or roster_id_str in (p.members or [])),
                None,
            )
            path: List[PlayerDrawPathDTO] = []
            for segment in _event_segments(event):
                total = len(segment.rounds)
                for r_index, round_ids in enumerate(segment.rounds):
                    opponents: List[PersonReferenceDTO] = []
                    for unit_id in round_ids:
                        unit = path_units.get(unit_id)
                        if unit is None:
                            continue
                        projected_sides = [
                            _side(
                                unit,
                                unit.side_a,
                                unit.slot_a,
                                locator,
                                path_units,
                                path_results,
                                results_on,
                            ),
                            _side(
                                unit,
                                unit.side_b,
                                unit.slot_b,
                                locator,
                                path_units,
                                path_results,
                                results_on,
                            ),
                        ]
                        projected_keys = [
                            side.participantKey for side in projected_sides if side.participantKey
                        ]
                        if not set(projected_keys) & mine:
                            continue
                        mine_side = 0 if projected_sides[0].participantKey in mine else 1
                        opponent_side = projected_sides[1 - mine_side]
                        opponent_key = opponent_side.participantKey
                        if opponent_key is None:
                            if opponent_side.placeholder:
                                opponents.append(
                                    PersonReferenceDTO(
                                        identity=None,
                                        resolution="dead",
                                        label=opponent_side.placeholder,
                                    )
                                )
                            continue
                        team = teams.get(opponent_key)
                        if team is not None:
                            opponents.extend(team.persons)
                        else:
                            opponents.append(
                                PersonReferenceDTO(identity=None, resolution="dead", label="Opponent TBD")
                            )
                    if opponents:
                        path.append(
                            PlayerDrawPathDTO(
                                roundLabel=_round_label(total, r_index, knockout),
                                opponents=opponents,
                            )
                        )
            event_details[public_event_code] = (seed, path)

    # ---- meet-origin matches -----------------------------------------
    meet = _meet_matches(
        repo,
        tournament,
        roster_id_str,
        results_on,
        identities,
        states=runtime.states,
        operational_courts=runtime.courts,
        meet_event_keys=runtime.meet_event_keys,
    )
    matches.extend(meet.matches)

    return PlayerPageDTO(
        person=PersonReferenceDTO(
            identity=PublicPersonIdentityDTO(id=str(person.id), name=person.full_name),
            resolution="resolved",
            label=None,
        ),
        club=identities.clubs.get(identity_key),
        events=[
            PlayerEventDTO(
                code=code,
                discipline=discipline,
                partner=partner,
                seed=event_details.get(code, (None, []))[0],
                drawPath=event_details.get(code, (None, []))[1],
            )
            for code, discipline, partner in player_events
        ],
        matches=matches,
    )


class _MeetMatches:
    def __init__(self):
        self.matches: List[PlayerMatchDTO] = []


def _meet_matches(
    repo: LocalRepository,
    tournament: Tournament,
    target_roster_id: str,
    results_on: bool,
    identities: Optional[PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO]] = None,
    *,
    states: Optional[Dict[str, object]] = None,
    operational_courts: Optional[Dict[str, int]] = None,
    meet_event_keys: Optional[Dict[str, str]] = None,
) -> _MeetMatches:
    """The Meet half: matches from the state blob, scores from
    ``match_states`` — the Display board's exact sources, projected down to
    the player's own rows. Meet matches are pre-resolved (lineup, not
    advancement), so structure leaks no results; scores and finishes are
    the gated half."""
    out = _MeetMatches()
    identities = identities or {}
    data = tournament.data or {}
    players = {p.get("id"): p for p in data.get("players", []) if isinstance(p, dict)}
    if target_roster_id not in players:
        return out

    config = data.get("config") or {}
    day_start = config.get("dayStart")
    interval = config.get("intervalMinutes")
    schedule = data.get("schedule") or {}
    assignments = {
        a.get("matchId"): a for a in schedule.get("assignments", []) if isinstance(a, dict)
    }
    states = states or {}
    operational_courts = operational_courts or {}
    meet_event_keys = meet_event_keys or {}

    def people_for(ids, event_key: str, event_rank: str):
        refs = []
        for pid in ids or []:
            player = players.get(pid)
            name = player.get("name") if player else None
            # Meet's player row carries the typed Entries provenance when it
            # came from a person. Prefer that over interpreting the opaque
            # roster id; hand-entered rows remain dead references.
            entry_id = player.get("entryPlayerId") if player else None
            key = roster_id(entry_id) if entry_id else pid
            scope = _visible_event_scope(identities, key, event_key, event_rank)
            refs.append(
                _person_ref(
                    key,
                    name=name,
                    identities=identities,
                    event_code=scope,
                )
            )
        return refs

    for match in data.get("matches", []):
        if not isinstance(match, dict):
            continue
        side_a = match.get("sideA") or []
        side_b = match.get("sideB") or []
        if target_roster_id not in side_a and target_roster_id not in side_b:
            continue
        event_rank = match.get("eventRank") or ""
        event_key = meet_event_keys.get(event_rank, event_rank)
        if isinstance(identities, PublicPersonDirectory):
            visible = identities.visible_events.get(target_roster_id, frozenset())
            if event_key not in visible and event_rank not in visible:
                continue
        state = states.get(match.get("id"))
        finished = (
            results_on
            and state is not None
            and state.status == "finished"
            and state.score_side_a is not None
            and state.score_side_b is not None
        )
        winner_a = bool(finished and state.score_side_a > state.score_side_b)
        winner_b = bool(finished and state.score_side_b > state.score_side_a)
        assignment = assignments.get(match.get("id"))
        scheduled = None
        if (
            assignment is not None
            and isinstance(day_start, str)
            and isinstance(interval, int)
            and isinstance(assignment.get("slotId"), int)
        ):
            scheduled = _hhmm_plus(day_start, assignment["slotId"] * interval)
        out.matches.append(
            PlayerMatchDTO(
                eventCode=event_rank,
                roundLabel=None,
                sides=[
                    PlayerMatchSideDTO(
                        persons=people_for(side_a, event_key, event_rank),
                        winner=winner_a,
                    ),
                    PlayerMatchSideDTO(
                        persons=people_for(side_b, event_key, event_rank),
                        winner=winner_b,
                    ),
                ],
                score=([[state.score_side_a, state.score_side_b]] if finished else None),
                decided=finished,
                scheduledTime=scheduled,
                court=operational_courts.get(match.get("id")),
                playedOn=None,
                localTime=None,
                courtLabel=None,
                status=(
                    "completed" if finished
                    else "live" if state is not None and state.status in {"playing", "called"}
                    else "scheduled"
                ),
                durationMinutes=(
                    int(assignment.get("durationSlots", 1)) * interval
                    if assignment is not None and isinstance(interval, int)
                    else None
                ),
                updatedAt=(tournament.updated_at.isoformat() if tournament.updated_at else None),
            )
        )
    return out


# ---- schedule / live projection ------------------------------------------


def _schedule_runtime_snapshot(
    repo: LocalRepository,
    tournament: Tournament,
    page: EntryPage,
    *,
    bracket_payload=None,
) -> ScheduleRuntimeSnapshot:
    """Materialize all schedule dependencies in bounded, batched reads.

    This is deliberately the sole source for both the schedule ETag and its
    projections.  In particular, court assignments come from Operations'
    ``matches.court_id`` rows rather than the planning blob.  A court change
    therefore changes the revision immediately instead of being hidden behind
    a stale 304 response.
    """
    directory = _public_identities(repo, tournament.id)
    courts: Dict[str, int] = {}
    states: Dict[str, object] = {}
    bracket_revisions: List[Tuple[str, int, str]] = []
    bracket_results: List[Tuple[str, str, str, bool, str]] = []
    meet_labels: Dict[str, str] = {}
    meet_event_keys: Dict[str, str] = {}
    if page.draws_published:
        match_rows = list(
            repo.session.scalars(select(Match).where(Match.tournament_id == tournament.id))
        )
        courts = {
            row.id: row.court_id
            for row in match_rows
            if row.court_id is not None
        }
        state_rows = repo.match_states.list_for_tournament(tournament.id)
        states = {row.match_id: row for row in state_rows}
        if bracket_payload is not None:
            bracket_revisions = [
                (
                    row.id,
                    row.version,
                    json.dumps(
                        [
                            row.played_on,
                            row.local_time,
                            row.court_label,
                            row.source_url,
                            row.source_ref,
                        ],
                        separators=(",", ":"),
                    ),
                )
                for row in bracket_payload.play_units
            ]
            bracket_revisions.extend(
                (
                    f"assignment:{row.play_unit_id}",
                    0,
                    json.dumps(
                        [
                            row.slot_id,
                            row.duration_slots,
                            row.actual_start_slot,
                            row.actual_end_slot,
                            row.started,
                            row.finished,
                        ],
                        separators=(",", ":"),
                    ),
                )
                for row in bracket_payload.assignments
            )
            bracket_results = [
                (
                    row.play_unit_id,
                    row.winner_side,
                    json.dumps(row.score, sort_keys=True, separators=(",", ":"))
                    if row.score is not None
                    else "",
                    bool(row.walkover),
                    row.reason or "",
                )
                for row in bracket_payload.results
            ]
        else:
            bracket_revisions = [
                (row.id, row.version, row.updated_at.isoformat() if row.updated_at else "")
                for row in repo.session.scalars(
                    select(BracketMatch).where(BracketMatch.tournament_id == tournament.id)
                )
            ]
            bracket_results = [
                (
                    f"{row.bracket_event_id}:{row.bracket_match_id}",
                    row.winner_side,
                    json.dumps(row.score, sort_keys=True, separators=(",", ":"))
                    if row.score is not None
                    else "",
                    bool(row.walkover),
                    row.reason or "",
                )
                for row in repo.session.scalars(
                    select(BracketResult).where(BracketResult.tournament_id == tournament.id)
                )
            ]
        if tournament.kind == "meet":
            for row in repo.session.scalars(
                select(MeetEvent).where(MeetEvent.tournament_id == tournament.id)
            ):
                meet_labels[row.id] = row.label
                meet_event_keys[row.id] = row.id
                for position in range(1, row.slot_count + 1):
                    meet_labels[f"{row.id}{position}"] = row.label
                    meet_event_keys[f"{row.id}{position}"] = row.id

    identity_fingerprint = {
        "visible": sorted(
            (
                key,
                identity.id,
                identity.name,
                directory.clubs.get(key),
                sorted(directory.visible_events.get(key, frozenset())),
            )
            for key, identity in directory.identities.items()
        ),
        "hidden": sorted(directory.hidden),
    }
    source = {
        "stateVersion": tournament.state_version,
        "updatedAt": tournament.updated_at.isoformat() if tournament.updated_at else "",
        "pageUpdatedAt": page.updated_at.isoformat() if page.updated_at else "",
        "flags": [bool(page.draws_published), bool(page.results_published)],
        "courts": sorted(courts.items()),
        "matchStates": sorted(
            (
                row.match_id,
                row.status,
                row.score_side_a,
                row.score_side_b,
                row.updated_at.isoformat() if row.updated_at else "",
            )
            for row in states.values()
        ),
        "bracket": sorted(bracket_revisions),
        "bracketResults": sorted(bracket_results),
        "meetLabels": sorted(meet_labels.items()),
        "meetEventKeys": sorted(meet_event_keys.items()),
        "identities": identity_fingerprint,
    }
    revision = hashlib.sha256(
        json.dumps(source, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:24]
    return ScheduleRuntimeSnapshot(
        directory=directory,
        courts=courts,
        states=states,
        bracket_revisions=bracket_revisions,
        bracket_results=bracket_results,
        meet_labels=meet_labels,
        meet_event_keys=meet_event_keys,
        revision=revision,
    )


def _revision_for_schedule(repo: LocalRepository, tournament: Tournament, page: EntryPage) -> str:
    """Compatibility seam for callers that only need the public token."""
    return _schedule_runtime_snapshot(repo, tournament, page).revision


def _bracket_schedule_matches(
    payload,
    *,
    results_on: bool,
    tournament_date: Optional[str],
    updated_at: Optional[str],
    roster_names: Optional[Dict[str, str]] = None,
    identities: Optional[PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO]] = None,
    operational_courts: Optional[Dict[str, int]] = None,
) -> List[ScheduleMatchDTO]:
    units, results, assignments = _bracket_indexes(payload)
    roster_names = roster_names or {}
    identities = identities or {}
    operational_courts = operational_courts or {}
    clubs = identities.clubs if isinstance(identities, PublicPersonDirectory) else {}
    out: List[ScheduleMatchDTO] = []
    for event in payload.events:
        teams = {
            t.participantKey: t
            for t in _teams(
                event,
                clubs,
                roster_names,
                identities,
                event.id,
            )
        }
        knockout = event.format in _KNOCKOUT_FORMATS
        locator = _unit_locator(event, knockout)
        segments = _event_segments(event)
        for segment in segments:
            total = len(segment.rounds)
            for r_index, round_ids in enumerate(segment.rounds):
                label = _round_label(total, r_index, knockout)
                for unit_id in round_ids:
                    unit = units.get(unit_id)
                    if unit is None:
                        continue
                    assignment = assignments.get(unit_id)
                    result = results.get(unit_id) if results_on else None
                    started = bool(assignment and assignment.actual_start_slot is not None)
                    if result is not None and results_on:
                        state = "walkover" if result.walkover else (
                            "retired" if result.reason == "retired" else "completed"
                        )
                    elif started:
                        state = "live"
                    else:
                        state = "scheduled"
                    sides: List[ScheduleSideDTO] = []
                    for cached, slot in ((unit.side_a, unit.slot_a), (unit.side_b, unit.slot_b)):
                        projected = _side(
                            unit, cached, slot, locator, units, results, results_on
                        )
                        team = teams.get(projected.participantKey) if projected.participantKey else None
                        sides.append(
                            ScheduleSideDTO(
                                participantKey=projected.participantKey,
                                persons=team.persons if team else [],
                                placeholder=("Bye" if projected.bye else projected.placeholder),
                            )
                        )
                    scheduled = _slot_time(payload, assignment.slot_id if assignment else None)
                    out.append(ScheduleMatchDTO(
                        matchKey=f"{event.id}:{unit.id}",
                        source="bracket",
                        eventCode=_event_public_code(event),
                        discipline=event.discipline,
                        roundLabel=label,
                        status=state,
                        scheduledDate=tournament_date if scheduled else None,
                        scheduledTime=scheduled,
                        court=operational_courts.get(unit_id),
                        sides=sides,
                        score=_score_rows(result.score) if result is not None and results_on else None,
                        walkover=bool(result.walkover) if result is not None and results_on else False,
                        updatedAt=updated_at,
                    ))
    return out


def _meet_schedule_matches(
    tournament: Tournament,
    *,
    results_on: bool,
    tournament_date: Optional[str],
    updated_at: Optional[str],
    identities: Optional[PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO]] = None,
    states: Optional[Dict[str, object]] = None,
    operational_courts: Optional[Dict[str, int]] = None,
    meet_labels: Optional[Dict[str, str]] = None,
    meet_event_keys: Optional[Dict[str, str]] = None,
) -> List[ScheduleMatchDTO]:
    data = tournament.data or {}
    identities = identities or {}
    players = {
        p.get("id"): p
        for p in data.get("players", [])
        if isinstance(p, dict) and isinstance(p.get("id"), str)
    }
    config = data.get("config") or {}
    day_start = config.get("dayStart")
    interval = config.get("intervalMinutes")
    assignments = {
        a.get("matchId"): a
        for a in ((data.get("schedule") or {}).get("assignments") or [])
        if isinstance(a, dict)
    }
    states = states or {}
    # ``schedule.assignments`` is the planning document.  A court is public
    # only after Operations has materialized that assignment on the Match
    # row; planned slot/time remains useful before then.
    operational_courts = operational_courts or {}
    # F-UNI-23: materialize the configured division→position identities from
    # stored MeetEvent fields in the existing batched read. Public schedule
    # projection can then look up `U101` directly without parsing an opaque
    # rank string (and numeric division codes remain unambiguous).
    labels: dict[str, str] = meet_labels or {}
    event_keys = meet_event_keys or {}
    out: List[ScheduleMatchDTO] = []
    for match in data.get("matches", []):
        if not isinstance(match, dict) or not isinstance(match.get("id"), str):
            continue
        match_id = match["id"]
        state_row = states.get(match_id)
        raw_state = state_row.status if state_row is not None else "scheduled"
        if results_on:
            state = {
                "playing": "live",
                "finished": "completed",
                "retired": "retired",
            }.get(raw_state, raw_state if raw_state in {"called", "delayed", "cancelled"} else "scheduled")
        else:
            state = "live" if raw_state in {"playing", "called"} else "scheduled"
        assignment = assignments.get(match_id)
        scheduled = None
        if assignment and isinstance(day_start, str) and isinstance(interval, int) and isinstance(assignment.get("slotId"), int):
            scheduled = _hhmm_plus(day_start, assignment["slotId"] * interval)

        event_code = match.get("eventRank") or ""
        event_key = event_keys.get(event_code, event_code)

        def people_for(ids):
            refs = []
            for pid in ids or []:
                player = players.get(pid)
                name = player.get("name") if player else None
                entry_id = player.get("entryPlayerId") if player else None
                key = roster_id(entry_id) if entry_id else pid
                scope = _visible_event_scope(identities, key, event_key, event_code)
                refs.append(
                    _person_ref(
                        key,
                        name=name,
                        identities=identities,
                        event_code=scope,
                    )
                )
            return refs

        score = None
        if results_on and state_row is not None and state_row.score_side_a is not None and state_row.score_side_b is not None:
            score = [[state_row.score_side_a, state_row.score_side_b]]
        event_discipline = labels.get(event_code)
        out.append(
            ScheduleMatchDTO(
                matchKey=f"meet:{match_id}",
                source="meet",
                eventCode=event_code,
                discipline=event_discipline,
                status=state,
                scheduledDate=tournament_date if scheduled else None,
                scheduledTime=scheduled,
                court=operational_courts.get(match_id),
                sides=[
                    ScheduleSideDTO(persons=people_for(match.get("sideA"))),
                    ScheduleSideDTO(persons=people_for(match.get("sideB"))),
                ],
                score=score,
                updatedAt=updated_at,
            )
        )
    return out


@router.get("/matches", response_model=ScheduleMatchesDTO)
def schedule_matches(
    request: Request,
    response: Response,
    slug: str = Path(..., max_length=100),
    day: Optional[str] = Query(default=None, max_length=32),
    event: Optional[str] = Query(default=None, max_length=100),
    player: Optional[str] = Query(default=None, max_length=120),
    court: Optional[int] = Query(default=None, ge=0),
    state: Optional[str] = Query(default=None, max_length=20),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    repo: LocalRepository = Depends(get_repository),
) -> ScheduleMatchesDTO:
    """Unified, publication-gated Schedule / Live projection."""
    entry_page, tournament = _page(repo, slug)
    updated_at = tournament.updated_at.isoformat() if tournament.updated_at else None
    payload = _bracket(repo, tournament.id) if entry_page.draws_published else None
    runtime = _schedule_runtime_snapshot(
        repo,
        tournament,
        entry_page,
        bracket_payload=payload,
    )
    revision = runtime.revision
    response.headers["Cache-Control"] = _CACHE
    response.headers["ETag"] = f'"{revision}"'
    if request.headers.get("If-None-Match") in {revision, f'"{revision}"'}:
        return Response(status_code=304, headers={"ETag": f'"{revision}"'})  # type: ignore[return-value]
    if not entry_page.draws_published:
        return ScheduleMatchesDTO(
            published=False,
            timeZone=getattr(tournament, "time_zone", None) or "UTC",
            updatedAt=updated_at,
            revision=revision,
            page=page,
            pageSize=page_size,
        )

    matches: List[ScheduleMatchDTO] = []
    identities = runtime.directory
    if payload is not None:
        matches.extend(
            _bracket_schedule_matches(
                payload,
                results_on=bool(entry_page.results_published),
                tournament_date=tournament.tournament_date,
                updated_at=updated_at,
                roster_names=_bracket_roster_names(tournament),
                identities=identities,
                operational_courts=runtime.courts,
            )
        )
    if tournament.kind == "meet":
        matches.extend(
            _meet_schedule_matches(
                tournament,
                results_on=bool(entry_page.results_published),
                tournament_date=tournament.tournament_date,
                updated_at=updated_at,
                identities=identities,
                states=runtime.states,
                operational_courts=runtime.courts,
                meet_labels=runtime.meet_labels,
                meet_event_keys=runtime.meet_event_keys,
            )
        )

    def contains_player(item: ScheduleMatchDTO) -> bool:
        if not player:
            return True
        needle = player.casefold()
        return any(
            needle in ref.identity.name.casefold()
            for side in item.sides
            for ref in side.persons
            if ref.identity is not None
        ) or any(player == side.participantKey for side in item.sides if side.participantKey)

    facets_source = list(matches)
    if day:
        matches = [m for m in matches if m.scheduledDate == day]
    if event:
        matches = [m for m in matches if m.eventCode.casefold() == event.casefold()]
    if player:
        matches = [m for m in matches if contains_player(m)]
    if court is not None:
        matches = [m for m in matches if m.court == court]
    if state:
        matches = [m for m in matches if m.status == state]
    matches.sort(key=lambda m: (m.scheduledDate is None, m.scheduledDate or "", m.scheduledTime is None, m.scheduledTime or "", m.matchKey))

    day_counts: Dict[str, int] = {}
    for item in facets_source:
        if item.scheduledDate:
            day_counts[item.scheduledDate] = day_counts.get(item.scheduledDate, 0) + 1
    facets = ScheduleFacetsDTO(
        days=[ScheduleDayFacetDTO(day=value, count=day_counts[value]) for value in sorted(day_counts)],
        events=sorted({m.eventCode for m in facets_source if m.eventCode}),
        courts=sorted({m.court for m in facets_source if m.court is not None}),
        states=sorted({m.status for m in facets_source}),
    )
    total = len(matches)
    start = (page - 1) * page_size
    return ScheduleMatchesDTO(
        published=True,
        items=matches[start : start + page_size],
        facets=facets,
        page=page,
        pageSize=page_size,
        total=total,
        timeZone=getattr(tournament, "time_zone", None) or "UTC",
        updatedAt=updated_at,
        revision=revision,
    )
