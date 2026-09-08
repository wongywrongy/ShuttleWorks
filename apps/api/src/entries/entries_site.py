"""SP-P7's public-site projections: draws, player pages, schedule.

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
from datetime import timedelta
from typing import Dict, List, Literal, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from entries.entries import roster_id
from entries.entries_public import (
    _all_rows,
    _entrants,
    _get_record,
    _not_found,
    _resolve,
    _scalar_rows,
)
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
from shared.court_occupancy import CourtState, derive_court_states
from shared.schedule_slots import (
    add_minutes_wrapping,
    slot_day_offset,
    slot_time_from_start,
)
from shared.match_reference import bracket_identity, format_match_identity, meet_identity
from shared.sides import is_pair_discipline

router = APIRouter(prefix="/e/api/page/{slug}", tags=["entries-site"])

# Public, but no max-age (§5): these answers are identical for every reader
# (no viewer block, no cookies read), and the SSR tier re-fetches per
# document anyway — the header exists for intermediaries, not correctness.
# Audience and publication are revocable. Intermediaries may store the
# projection, but must revalidate before serving it after a visibility change.
_CACHE = "public, no-cache"


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
    return repo.execute_query(
        _scalar_rows,
        select(MeetEvent.id)
        .where(MeetEvent.tournament_id == tournament.id)
        .order_by(MeetEvent.id.asc()),
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
    #: Roster ids published because the DRAW they appear in is published —
    #: the imported/demo half of the directory (P6, 2026-09-08). They carry
    #: no Entries row, so they have no per-event entry gate: their whole
    #: publication is "this draw is public", which ``draws_published``
    #: already decided for every name on it. Empty for an entries-only
    #: workspace, which is why every gate below reads it explicitly rather
    #: than inferring membership from the absence of ``visible_events``.
    draw_people: frozenset[str] = frozenset()


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
    rows = repo.execute_query(
        _all_rows,
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
        .where(EntryPlayer.tournament_id == tournament_id),
    )
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


#: Roster-row keys that are ENTRY-BACKED and therefore already answer to the
#: Entries gates above. ``entries/entries.py::roster_id`` is the one place the
#: prefix is minted, so the read side DERIVES it rather than re-spelling it —
#: F-DM-05's deletion gate (`test_the_roster_id_prefix_has_exactly_one_definition`)
#: is what keeps that single definition honest.
_ENTRY_ROSTER_PREFIX = roster_id("")


def _bracket_roster_rows(tournament: Tournament) -> List[dict]:
    """The workspace's draw-roster rows, validated but not yet gated.

    Twin of ``_bracket_roster_names``, which answers the display question.
    This one answers the IDENTITY question, so it keeps the whole row —
    ``personId``/``personSource`` included where the importer wrote them.
    """
    out: List[dict] = []
    for row in (tournament.data or {}).get("bracketPlayers") or []:
        if not isinstance(row, dict):
            continue
        key, name = row.get("id"), row.get("name")
        if isinstance(key, str) and key and isinstance(name, str) and name.strip():
            out.append(row)
    return out


def _with_draw_roster(
    directory: PublicPersonDirectory,
    tournament: Tournament,
    draws_published: bool,
) -> PublicPersonDirectory:
    """Add the published draw's own roster people to the person directory.

    **This is the P6 fix for the identifier-space split.** The public players
    list has always MERGED roster-only people into the directory ("imported
    tournaments do not need a second, competing player list"), but it emitted
    them with ``identity.id = None`` — a published name with no address —
    while ``/players/{person_key}`` parsed an ``entry_players`` UUID. A
    bracket-seeded person therefore had a public name, a public draw, a public
    result and NO resolvable profile, and every person slot in an imported
    tournament rendered as a dead reference. One key space, decided here: a
    person's public key is their roster id, which is what every projection in
    this module already joins on, and which is ``entry-{uuid}`` exactly when
    the person came through Entries.

    Nothing new is disclosed. These names, clubs and results are already on
    the published draw; what changes is that the name can now be addressed.
    Entry-backed rows are untouched — a hidden, erased or opted-out person
    stays in ``hidden`` and keeps resolving to the generic dead token, which
    is why the roster tier explicitly skips every key the Entries pass
    already classified either way.
    """
    if not draws_published:
        return directory
    extra: Dict[str, PublicPersonIdentityDTO] = {}
    for row in _bracket_roster_rows(tournament):
        key = row["id"]
        if key.startswith(_ENTRY_ROSTER_PREFIX):
            # An entries-backed roster id answers to the Entries gates, full
            # stop. Publishing it here would route around an opt-out.
            continue
        if key in directory.identities or key in directory.hidden:
            continue
        extra[key] = PublicPersonIdentityDTO(id=key, name=row["name"].strip())
    if not extra:
        return directory
    merged = dict(directory.identities)
    merged.update(extra)
    return PublicPersonDirectory(
        identities=merged,
        hidden=directory.hidden,
        clubs=directory.clubs,
        visible_events=directory.visible_events,
        draw_people=frozenset(extra),
    )


def _directory(
    repo: LocalRepository, tournament: Tournament, page: EntryPage
) -> PublicPersonDirectory:
    """The one person directory every public projection of a page shares."""
    return _with_draw_roster(
        _public_identities(repo, tournament.id), tournament, bool(page.draws_published)
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
    event_alias: Optional[str] = None,
) -> PersonReferenceDTO:
    """Project one person reference, applying the per-event visibility gate.

    ``event_code`` and ``event_alias`` are the SAME event named two ways: a
    bracket event's raw id (``T029-MS``) and its public code (``MS``). An
    entry-backed person's ``visible_events`` may hold either spelling —
    ``entry_events.code`` on one side, ``bracket_event_id`` on the other —
    so a caller that passes only the raw id silently turns every eligible
    name in a namespaced draw into "Player not published", i.e. into an
    unlinkable name. ``_event_public_for_person`` and ``_event_public_club``
    already took both; this is the same rule, applied to the person.
    """
    if isinstance(identities, PublicPersonDirectory):
        visible = roster_key is not None and roster_key in identities.identities
        if visible and event_code is not None:
            event_events = identities.visible_events.get(roster_key, frozenset())
            visible = not event_events or (
                event_code in event_events
                or (event_alias is not None and event_alias in event_events)
            )
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
    event_alias: Optional[str] = None,
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
                    or _event_public_for_person(
                        identities, member, event_code, event_alias
                    )
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
                event_alias=event_alias,
            )
            for member in person_keys
        ]
    name = roster_names.get(participant.id) or getattr(participant, "name", None)
    roster_key = person_keys[0]
    return [
        _person_ref(
            roster_key,
            name=name,
            identities=identities,
            event_code=event_code,
            event_alias=event_alias,
        )
    ]


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
    if roster_key in identities.draw_people:
        # A draw-roster person has no Entries row and therefore no per-event
        # entry gate; their publication IS the published draw (see
        # ``_with_draw_roster``). Falling through to ``visible_events`` would
        # read an empty set and unpublish every imported name.
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
    """``dayStart`` + N minutes, wrapping midnight.

    Redirects to ``shared/schedule_slots.py`` (D10) — the single authority
    shared with ``workspace_signals.py`` and, transitively, the console's
    ``slotToTime`` — so the public page and the operator's schedule can
    never disagree about a start time.
    """
    return add_minutes_wrapping(day_start, minutes)


# ---- DTOs -----------------------------------------------------------------


class DrawProgressDTO(BaseModel):
    """How far a published draw has actually got — the Draws index's one
    progress fact (public-visual-fixes P6).

    The index used to describe a draw by its topology (format, size, round
    count, "Draw published · rounds to be scheduled"), which is derivable
    from the draw page and says nothing a reader wants to know. What they
    want is where play has reached, so this states exactly that and nothing
    else: ``complete``, or the earliest unfinished round plus how it stands
    (``in_play`` once one of its matches has a result, ``scheduled`` with a
    venue-local ``startTime`` when the grid places it, ``to_play``
    otherwise).

    Derived from RESULTS, so it is published only under
    ``results_published`` — the same gate the champions and
    ``remainingMatchCount`` on this card already sit behind.
    """

    state: str  # 'complete' | 'in_play' | 'scheduled' | 'to_play'
    #: Compact round vocabulary — ``R16``/``QF``/``SF``/``Final`` for a
    #: knockout, ``Round 3`` otherwise. Null only for ``complete``.
    roundLabel: Optional[str] = None
    #: Venue-local ``HH:MM`` of the earliest unplayed match of that round,
    #: when the schedule grid places one.
    startTime: Optional[str] = None


class DrawCardDTO(BaseModel):
    drawKey: str
    eventCode: str
    discipline: str
    kind: str  # the format tag: 'se' | 'rr' | 'de' | 'swiss' | 'compass' | 'monrad'
    size: int
    # Draw participant/team count; it can differ from registered entries.
    drawParticipantCount: int = 0
    hasConsolation: bool
    matchCoverage: "MatchCoverageDTO"
    recordScope: str
    topologyScope: str
    roundCount: int = 0
    champions: List[PersonReferenceDTO] = Field(default_factory=list)
    finalists: List["HonorDTO"] = Field(default_factory=list)
    remainingMatchCount: Optional[int] = None
    progress: Optional[DrawProgressDTO] = None
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


class PublicUnresolvedSideDTO(BaseModel):
    """Why a side has no (or an incomplete) resolved person — the public
    twin of ``shared/sides.py``'s ``UnresolvedSideDTO`` (match-card §2.1).

    Same field NAMES as the operator wire so one client model reads both
    tiers, with two deliberate differences:

    * ``reference`` carries the FORMATTED human match reference ("QF 3"),
      not a raw play-unit id. The public tier has no ``matchIdentity.ts`` to
      resolve one, so the reference and the legacy ``placeholder`` sentence
      are spelled by one function (``_feeder_reference``) off one locator —
      two spellings of one reference would be the D16 failure over again.
    * ``known`` is always EMPTY here. The side's own ``persons`` (or, on
      ``SideDTO``, the ``TeamDTO`` the client joins by ``participantKey``)
      is the known set, and it has already been through the publication and
      erasure gates in ``_participant_people``. Projecting the same people a
      second time would put two gated copies of one identity on one wire,
      free to diverge. The field is kept so the shape matches the contract
      and the operator wire.
    """

    kind: Literal[
        "bye",
        "pending_member",
        "winner_of",
        "loser_of",
        "withheld",
        "undetermined",
    ]
    known: List[PersonReferenceDTO] = Field(default_factory=list)
    missing: int = 0
    reference: Optional[str] = None


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
    # The discriminated reason (contract §2.1), beside — not instead of —
    # the legacy ``placeholder``/``bye`` pair: renderers switch on ``kind``
    # rather than inferring one from a sentence, and an older client that
    # only knows ``placeholder`` keeps working.
    unresolved: Optional[PublicUnresolvedSideDTO] = None


class NodeResultDTO(BaseModel):
    """Present only when ``results_published`` — its absence IS the gate."""

    winnerSide: Optional[str] = None  # 'A' | 'B' | None (double bye)
    # Sets mode: [[a, b], …]; None for winner-only results.
    score: Optional[List[List[int]]] = None
    walkover: bool = False


class MatchNodeDTO(BaseModel):
    nodeKey: str
    position: int  # 1-based within its round
    # The SHARED human match reference (state-and-formatting §6.1, "One
    # reference, both tiers") — the identical string the operator's match
    # list shows for this match, spelled by ``shared/match_reference.py``
    # from the coordinates the console formats from. ``shortReference``
    # drops the event code for a view whose event is already unambiguous
    # (a single draw: "R16·2 · 10:00 · Court 3"). Both are ``None`` when the
    # coordinates cannot name a match; a renderer then shows nothing rather
    # than falling back to a row number.
    reference: Optional[str] = None
    shortReference: Optional[str] = None
    sides: List[SideDTO]
    result: Optional[NodeResultDTO] = None
    # Venue-local naive strings; None until scheduled.
    scheduledTime: Optional[str] = None
    # The approved slot's venue-local CALENDAR DAY — the twin of
    # ``scheduledTime`` and the same value the schedule projection publishes
    # for this match (P7). ``playedOn`` below is the imported SOURCE record's
    # date, which is provenance, not the published schedule: a rescheduled or
    # live match keeps its source date while the approved slot moves, and a
    # card that shows the source date states a day the desk does not agree
    # with. ``None`` when the unit has no assignment.
    scheduledDate: Optional[str] = None
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


class HonorDTO(BaseModel):
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    club: Optional[str] = None


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
    """One ROUND STEP in a person's public draw path.

    A step, not a sentence: the entrant tier used to join these into
    "R32 → R16 → QF" prose with an arrow separator, which said nothing about
    who was played or how it went and read as a single unlabelled run-on to a
    screen reader. Each step now carries its own result, so the renderer can
    lay them out as structured rows (P6, 2026-09-08).

    ``outcome`` is ``None`` while the step is undecided OR while results are
    unpublished — the same gate ``score`` answers to, never inferred from the
    presence of a later round.
    """

    roundLabel: str
    opponents: List[PersonReferenceDTO] = Field(default_factory=list)
    outcome: Optional[Literal["won", "lost"]] = None
    #: Sets as ``[mine, theirs]`` pairs, in this person's side order — not the
    #: wire's A/B order, which is the draw's, not the reader's.
    score: Optional[List[List[int]]] = None
    #: The shared human match reference for this step, e.g. ``MS R32·11``.
    reference: Optional[str] = None


class PlayerMatchSideDTO(BaseModel):
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    placeholder: Optional[str] = None
    winner: bool = False
    seed: Optional[int] = None
    # Contract §2.1. ``persons`` and ``unresolved`` are NOT mutually
    # exclusive: a doubles side one player short carries the known person
    # AND ``pending_member``, which is the whole point — it is what stops a
    # half-formed pair rendering as an ordinary singles side.
    unresolved: Optional[PublicUnresolvedSideDTO] = None


class PlayerMatchDTO(BaseModel):
    eventCode: str
    roundLabel: Optional[str] = None
    sides: List[PlayerMatchSideDTO]
    # Present only when results are published AND the match is decided.
    score: Optional[List[List[int]]] = None
    decided: bool = False
    scheduledTime: Optional[str] = None
    # The approved slot's venue-local calendar day (P7) — see the identical
    # field on ``MatchNodeDTO``. ``playedOn`` is the source record's date and
    # must not be presented as the published schedule when this differs.
    scheduledDate: Optional[str] = None
    court: Optional[int] = None
    playedOn: Optional[str] = None
    localTime: Optional[str] = None
    courtLabel: Optional[str] = None
    # The SHARED human match reference (state-and-formatting §6.1, "One
    # reference, both tiers") — the identical string the operator's match
    # list shows for this match, spelled by ``shared/match_reference.py``
    # from the coordinates the console formats from. ``shortReference``
    # drops the event code for a view whose event is already unambiguous
    # (a single draw: "R16·2 · 10:00 · Court 3"). Both are ``None`` when the
    # coordinates cannot name a match; a renderer then shows nothing rather
    # than falling back to a row number.
    reference: Optional[str] = None
    shortReference: Optional[str] = None
    # ``None`` means the persisted status is unrecognised (contract §2.2);
    # never coerced to "scheduled" (D7).
    status: Optional[str] = None
    durationMinutes: Optional[int] = None
    updatedAt: Optional[str] = None
    # Match-card contract §2.3: publication is DATA, not styling, and it is
    # not recoverable from ``score is None`` — an unplayed match has no score
    # either. Without this the accessible summary said "Score not published"
    # over every future match on the calendar (V3-11-3). Only the SCORES half
    # is a per-match fact; ``personsPublished`` has no twin here because
    # person publication is gated PER PERSON and already arrives minted as a
    # dead ``PersonReferenceDTO`` (§2.3, ``_person_ref``).
    scoresPublished: bool = True


class PlayerHistoryEntryDTO(BaseModel):
    """One workspace in a person's public tournament history (profile v1).

    A history row is a LINK TARGET, not a summary: ``slug`` + ``playerKey``
    address that workspace's own person page, and ``eventCodes`` address its
    published draws. Every value here is copied from the other workspace's
    OWN public projection gates, so a row can never say more about a
    tournament than that tournament says about itself.
    """

    slug: str
    tournamentName: Optional[str] = None
    date: Optional[str] = None
    endDate: Optional[str] = None
    # ``entry_players.id`` in THAT workspace — a different row for the same
    # human, which is exactly what a tournament-scoped person key is.
    playerKey: str
    # True for the workspace whose page is being rendered. The current row is
    # kept in the list (so a person with no linked history still reads as a
    # history of one) and is never a link back to itself.
    current: bool = False
    eventCodes: List[str] = Field(default_factory=list)
    drawsPublished: bool = False
    resultsPublished: bool = False
    #: Per-event participation in THAT workspace, projected through that
    #: workspace's own gates (P6). Present only for the expanded rows — see
    #: ``_HISTORY_EXPANSION_LIMIT`` in ``_person_history``; the remaining
    #: rows stay pure link targets, which is what they always were.
    events: List[PlayerEventDTO] = Field(default_factory=list)
    #: True when this row was expanded and the events above are complete for
    #: it. False means "open the link to see the detail", never "no matches".
    expanded: bool = False


class PlayerPageDTO(BaseModel):
    person: PersonReferenceDTO
    club: Optional[str] = None
    events: List[PlayerEventDTO]
    matches: List[PlayerMatchDTO]
    # Profile v1 (public-visual-fixes P2): identity + tournament history.
    # Cross-tournament rows are joined on VERIFIED CANONICAL IDENTITY — the
    # entrant account that owns the ``entry_players`` row — never on a name
    # match across the estate. See ``_person_history``.
    history: List[PlayerHistoryEntryDTO] = Field(default_factory=list)


class ScheduleSideDTO(BaseModel):
    """Public side of a scheduled match; contact/account data is absent."""

    participantKey: Optional[str] = None
    persons: List[PersonReferenceDTO] = Field(default_factory=list)
    placeholder: Optional[str] = None
    unresolved: Optional[PublicUnresolvedSideDTO] = None


class ScheduleMatchDTO(BaseModel):
    matchKey: str
    source: Literal["bracket", "meet"]
    eventCode: str
    discipline: Optional[str] = None
    roundLabel: Optional[str] = None
    # ``None`` means the persisted status is unrecognised — the match is
    # omitted from state facets and rendered with no state chip (contract
    # §2.2); it is never coerced to ``scheduled`` (D7).
    status: Optional[
        Literal[
            "scheduled", "called", "live", "delayed", "completed", "walkover", "retired", "cancelled"
        ]
    ] = None
    scheduledDate: Optional[str] = None
    scheduledTime: Optional[str] = None
    court: Optional[int] = None
    sides: List[ScheduleSideDTO] = Field(default_factory=list)
    score: Optional[List[List[int]]] = None
    walkover: bool = False
    # The AUTHORITATIVE outcome (contract §3.5/§5.1 rule 3): which side won,
    # from the recorded result — never inferred from the ledger downstream.
    # The entrant schedule used to count games won and call the higher total
    # the winner, which retirement and walkover contradict outright.
    winnerSide: Optional[Literal["A", "B"]] = None
    updatedAt: Optional[str] = None
    # The SHARED human match reference (state-and-formatting §6.1, "One
    # reference, both tiers") — the identical string the operator's match
    # list shows for this match, spelled by ``shared/match_reference.py``
    # from the coordinates the console formats from. ``shortReference``
    # drops the event code for a view whose event is already unambiguous
    # (a single draw: "R16·2 · 10:00 · Court 3"). Both are ``None`` when the
    # coordinates cannot name a match; a renderer then shows nothing rather
    # than falling back to a row number.
    reference: Optional[str] = None
    shortReference: Optional[str] = None


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


@dataclass(frozen=True)
class _UnitRef:
    """One play unit's public coordinates, resolved once per event.

    ``reference``/``short_reference`` are the SHARED human match reference
    (state-and-formatting §6.1) — the identical string the operator's match
    list shows for this match, spelled by ``shared/match_reference.py`` off
    the same coordinates the console formats from. They are the only match
    label this tier publishes: ``Match {position}`` is deleted, and the
    per-surface ``"SF 1"`` speller that used to live in ``_feeder_reference``
    is gone with it.
    """

    segment_label: str
    short_round: str
    position: int
    reference: Optional[str]
    short_reference: Optional[str]


def _unit_locator(event, knockout: bool) -> Dict[str, _UnitRef]:
    """unit id → its public coordinates, including the shared reference.

    The ``segment`` coordinate handed to the identity authority is the
    segment's **id** (``W``/``L``/``GF``/``P5_8``), not its label: that is
    the value ``bracketLabels.ts`` formats from (``play_unit.segment``), and
    a label would spell a different string for the same match. A
    single-segment draw has no segment at all — ``_event_segments``'s
    synthetic ``MAIN`` shim stands for "no segment", exactly as the console's
    ``null`` does.
    """
    out: Dict[str, _UnitRef] = {}
    event_code = _event_public_code(event)
    draw_format = event.format
    for segment in _event_segments(event):
        total = len(segment.rounds)
        segment_id = None if segment.id == "MAIN" and not event.segments else segment.id
        for r_index, round_ids in enumerate(segment.rounds):
            short = _short_round(total, r_index, knockout)
            for position, unit_id in enumerate(round_ids, start=1):
                identity = bracket_identity(
                    event_code=event_code,
                    draw_format=draw_format,
                    round_index=r_index,
                    stage=short,
                    sequence=position,
                    segment=segment_id,
                )
                out[unit_id] = _UnitRef(
                    segment_label=segment.label,
                    short_round=short,
                    position=position,
                    reference=format_match_identity(identity),
                    short_reference=format_match_identity(identity, include_event=False),
                )
    return out


def _feeder_reference(slot, locator, *, feeder_id=None, take: Optional[str] = None):
    """``(kind, reference)`` for a feeder slot.

    The one place a feeder reference is spelled on the public tier. It
    replaced ``_placeholder`` outright rather than sitting beside it: two
    functions formatting the same reference off the same locator is exactly
    the drift D16 exists to prevent. ``_side`` builds both the discriminant
    and the legacy ``placeholder`` sentence from this one return value."""
    feeder_id = feeder_id if feeder_id is not None else slot.feeder_play_unit_id
    if feeder_id is None:
        return None
    take = take or ("Loser" if slot.feeder_take == "loser" else "Winner")
    kind = "loser_of" if take.lower() == "loser" else "winner_of"
    where = locator.get(feeder_id)
    if where is None:
        return kind, "an earlier match"
    # §6.1: the SHARED reference, not a locally spelled "QF 3". The draw page
    # this reaches has one event, so the event code is dropped (§6.1's
    # single-event rule) and the feeder reads "from QF2" beside a node
    # labelled "QF2".
    return kind, where.short_reference or f"{where.short_round}{where.position}"


def _pending_pair_keys(event) -> frozenset:
    """Participant keys in this draw that are a PAIR one member short.

    The public twin of ``bracket/brackets.py::_participant_side``'s rule, on
    the same two structural signals and with the same refusal to guess:

    * a TEAM row with ONE member id — a pair slot with a member missing
      outright. Not gated on the discipline: the TEAM type is itself the
      claim "this participant is a pair", and it is trustworthy where a
      free-text discipline ("Mixed Doubles") is not.
    * an ENTRY-BACKED lone person in a PAIR discipline — what the entries
      seam leaves behind when a partner invite is unaccepted.

    An imported or hand-added PLAYER row that happens to hold a whole pair
    under one name is left alone (see ``shared/sides.py``).
    """
    pair_event = is_pair_discipline(event.discipline, event.id)
    keys = set()
    for participant in event.participants:
        members = list(participant.members or [])
        if members:
            if len(members) == 1:
                keys.add(participant.id)
        elif pair_event and (participant.entryPlayerId or participant.sourceEntryId):
            keys.add(participant.id)
    return frozenset(keys)


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
    pending_keys: frozenset = frozenset(),
) -> SideDTO:
    """One side of a node. ``reveal_resolved`` is the results gate applied
    to advancement: when off, only structural placement may name a player —
    a side that got here by winning a recorded match is a result, and is
    projected back into the placeholder the slot held before advancement
    overwrote it (``_derivation``).

    ``pending_keys`` (``_pending_pair_keys``) is the set of participants that
    are a pair one member short; a resolved side keyed on one of them carries
    ``pending_member`` beside its persons rather than reading as singles.
    """
    feeder_node_key = slot.feeder_play_unit_id
    feeder_take = (
        "loser"
        if feeder_node_key is not None and slot.feeder_take == "loser"
        else ("winner" if feeder_node_key is not None else None)
    )

    def _resolved(participant_key: str) -> SideDTO:
        return SideDTO(
            participantKey=participant_key,
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
            unresolved=(
                PublicUnresolvedSideDTO(kind="pending_member", missing=1)
                if participant_key in pending_keys
                else None
            ),
        )

    def _feeder(kind_reference) -> SideDTO:
        kind, reference = kind_reference
        take = "Loser" if kind == "loser_of" else "Winner"
        return SideDTO(
            placeholder=f"{take} of {reference}",
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
            unresolved=PublicUnresolvedSideDTO(kind=kind, reference=reference),
        )

    if slot.participant_id == _BYE:
        return SideDTO(
            bye=True,
            feederNodeKey=feeder_node_key,
            feederTake=feeder_take,
            unresolved=PublicUnresolvedSideDTO(kind="bye"),
        )
    if slot.participant_id is not None:
        derived = _derivation(unit, units, results, slot.participant_id)
        if derived is not None:
            feeder_node_key, derived_take = derived
            feeder_take = derived_take.lower()
        if not reveal_resolved and derived is not None:
            dep_id, take = derived
            return _feeder(_feeder_reference(slot, locator, feeder_id=dep_id, take=take))
        return _resolved(slot.participant_id)
    if reveal_resolved and participant_ids:
        if participant_ids == [_BYE]:
            return SideDTO(
                bye=True,
                feederNodeKey=feeder_node_key,
                feederTake=feeder_take,
                unresolved=PublicUnresolvedSideDTO(kind="bye"),
            )
        # A resolved multi-member side is one participant (a pair) in this
        # model; the cached list is member ids only for teams, participant
        # ids otherwise — either way the FIRST id keys the lookup table the
        # tier joins against, and pairs are one participant row there.
        return _resolved(participant_ids[0])
    feeder = _feeder_reference(slot, locator)
    if feeder is not None:
        return _feeder(feeder)
    # Contract §6.2: no persons and no known reason is "To be decided" — the
    # legacy "TBD" string stays on ``placeholder`` for older clients, but the
    # discriminant is what a §6.1 renderer reads, and it never says TBD.
    return SideDTO(
        placeholder="TBD",
        feederNodeKey=feeder_node_key,
        feederTake=feeder_take,
        unresolved=PublicUnresolvedSideDTO(kind="undetermined"),
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
        people = _participant_people(
            participant, roster_names, identities, event_code, event_alias
        )
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
    first slot; ``interval_minutes`` is the grid.

    Redirects to ``shared/schedule_slots.py`` (D10).
    """
    if payload.start_time is None:
        return None
    base = payload.start_time
    return slot_time_from_start(base.hour, base.minute, slot_id, payload.interval_minutes)


def _slot_date(payload, slot_id: Optional[int], fallback: Optional[str]) -> Optional[str]:
    """Venue-local CALENDAR DAY for a bracket slot.

    ``_slot_time`` above wraps at midnight, so on its own it publishes a
    day-four semi-final as "13:00" on the tournament's start date. The plan's
    ``start_time`` names both the first slot's day and its time of day, so the
    day offset is derivable — and must be, or every match in a six-day
    tournament groups under one heading on the public schedule.
    """
    if payload.start_time is None or slot_id is None:
        return fallback
    base = payload.start_time
    offset = slot_day_offset(base.hour, base.minute, slot_id, payload.interval_minutes)
    return (base.date() + timedelta(days=offset)).isoformat()


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
        identities = _directory(repo, tournament, page)
        units, results, assignments = _bracket_indexes(payload)
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
                    drawParticipantCount=event.participant_count,
                    hasConsolation=_has_consolation(event),
                    roundCount=max((len(segment.rounds) for segment in _event_segments(event)), default=len(event.rounds)),
                    champions=champions,
                    finalists=finalist_honors,
                    remainingMatchCount=(
                        _remaining_match_count(event, units, results)
                        if page.results_published and not winner_key
                        else None
                    ),
                    progress=(
                        _draw_progress(event, units, results, assignments, payload)
                        if page.results_published
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
    pending_keys = _pending_pair_keys(event)
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
                unit_ref = locator.get(unit_id)
                matches.append(
                    MatchNodeDTO(
                        nodeKey=unit.id,
                        position=position,
                        reference=unit_ref.reference if unit_ref else None,
                        shortReference=unit_ref.short_reference if unit_ref else None,
                        sides=[
                            _side(
                                unit,
                                unit.side_a,
                                unit.slot_a,
                                locator,
                                units,
                                results,
                                results_on,
                                pending_keys,
                            ),
                            _side(
                                unit,
                                unit.side_b,
                                unit.slot_b,
                                locator,
                                units,
                                results,
                                results_on,
                                pending_keys,
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
                        scheduledDate=(
                            _slot_date(payload, assignment.slot_id, None)
                            if assignment is not None
                            else None
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
        drawParticipantCount=event.participant_count,
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
    identities = _directory(repo, tournament, page)
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
            # ONE authority for both public fields on this row. The club is
            # the second field the public search box matches on, so it is
            # published under exactly the gate the NAME is published under —
            # ``_public_identities``, which keeps only confirmed,
            # non-opted-out, non-erased people, per visible event. Reading
            # it instead off ``_entrants`` (a separate, wider desk query
            # that exists to COUNT the field) made the same row's two public
            # values answer to two different gates, which is the shape a
            # disclosure defect arrives in even when today's two gates agree.
            club=identities.clubs.get(player_id),
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


def _progress_round_label(total_rounds: int, index: int, knockout: bool) -> str:
    """The compact round word the Draws index shows: ``R16``/``QF``/``SF`` as
    on a match reference, but the full ``Final`` — "F in play" is not a
    sentence, and the index is prose, not a coordinate."""
    if not knockout:
        return _round_label(total_rounds, index, knockout)
    short = _short_round(total_rounds, index, knockout)
    return "Final" if short == "F" else short


def _draw_progress(event, units, results, assignments, payload) -> DrawProgressDTO:
    """Where play has actually reached in one published draw.

    Walks segments and rounds in order and stops at the first round holding
    an undecided, non-BYE match: that round IS the front of the draw. A round
    with some results is ``in_play``; one with none is ``scheduled`` when the
    grid gives its earliest unplayed match a start, and ``to_play``
    otherwise. Nothing undecided anywhere means the draw is ``complete``.
    """
    knockout = event.format in _KNOCKOUT_FORMATS
    for segment in _event_segments(event):
        total = len(segment.rounds)
        for index, round_ids in enumerate(segment.rounds):
            playable = [
                unit_id
                for unit_id in round_ids
                if unit_id in units
                and not (
                    _BYE in (units[unit_id].side_a or [])
                    or _BYE in (units[unit_id].side_b or [])
                )
            ]
            if not playable:
                continue
            undecided = [unit_id for unit_id in playable if unit_id not in results]
            if not undecided:
                continue
            label = _progress_round_label(total, index, knockout)
            if len(undecided) < len(playable):
                return DrawProgressDTO(state="in_play", roundLabel=label)
            starts = sorted(
                start
                for start in (
                    _slot_time(
                        payload,
                        assignments[unit_id].slot_id if unit_id in assignments else None,
                    )
                    for unit_id in undecided
                )
                if start
            )
            if starts:
                return DrawProgressDTO(
                    state="scheduled", roundLabel=label, startTime=starts[0]
                )
            return DrawProgressDTO(state="to_play", roundLabel=label)
    return DrawProgressDTO(state="complete")


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


def _canonical_person_key(account_id, full_name: Optional[str]) -> Optional[str]:
    """The one canonical identity a public profile may be joined on.

    An ``entry_players`` row is tournament-scoped by design, so a person's
    history has to be assembled from several rows. The join is the ENTRANT
    ACCOUNT — a verified credential someone actually holds — narrowed by the
    stored name, because one account legitimately owns several different
    people (a parent's two children, a club manager's eight players; the
    canonical fixture has both shapes deliberately). Account alone would
    merge a club's whole roster into one profile; a name alone would merge
    two strangers who share one. Neither half is sufficient and the pair is
    never derived from anything a reader typed.

    Returns ``None`` when there is nothing verified to join on, which
    collapses the history to the current tournament rather than guessing.
    """
    if account_id is None or not isinstance(full_name, str):
        return None
    name = _alphabetic_name_key(" ".join(full_name.split()))
    if not name:
        return None
    return f"{account_id}:{name}"


#: How many OTHER workspaces a profile expands into full per-event detail.
#: The rest stay link targets. Expansion costs one hydrated bracket per
#: workspace (served through ``bracket.response_cache``), so this is the line
#: between "a profile that shows a career" and "a public page that rebuilds
#: the estate on every read". Rows beyond it carry ``expanded=False``, which
#: the renderer must state as "open it", never as "nothing there".
_HISTORY_EXPANSION_LIMIT = 5


def _imported_person_correlation(row: dict) -> Optional[str]:
    """The cross-tournament identity of ONE imported draw-roster row.

    An ``entry_players`` row is tournament-scoped by design and an imported
    draw has no account behind it, so an imported person's identity is
    whatever the IMPORT declared it to be. Two declarations are honoured, in
    order:

    * ``personId`` — a real, dataset-issued player id written by the importer
      (the BWF fixture's ``P|player_id|player_name`` table, whose provenance
      is recorded in the seed manifest). Preferred whenever present.
    * the canonical stored NAME — the importer's own reviewed identity map,
      already applied on the way in (the fixture's ``playerAliases`` table
      resolves "Aaron CHIA" and "Aaron Chia" to one spelling before anything
      is stored), which is exactly the ``identityScope: source_local_name``
      the draw already publishes about itself.

    This is deliberately NOT a name-similarity match and never crosses into
    the entries spine: an entry-backed person keeps the account-verified join
    in ``_canonical_person_key`` and can never be merged into an imported
    one. Its limit is the import's own: two different humans who share one
    canonical name in one dataset are one person to that dataset, and the
    coverage report says so rather than the profile guessing otherwise.
    """
    person_id = row.get("personId")
    if isinstance(person_id, str) and person_id.strip():
        return f"id:{person_id.strip()}"
    name = row.get("name")
    if isinstance(name, str):
        key = _alphabetic_name_key(" ".join(name.split()))
        if key:
            return f"name:{key}"
    return None


def _entry_person_history_rows(
    repo: LocalRepository,
    person: EntryPlayer,
    tournament: Tournament,
) -> Dict[str, Tuple[PlayerHistoryEntryDTO, set]]:
    """Workspaces reachable from an ENTRY-BACKED person's verified account."""
    canonical = _canonical_person_key(person.account_id, person.full_name)
    if canonical is None:
        return {}
    rows = repo.execute_query(
        _all_rows,
        select(
            EntryPlayer.tournament_id,
            EntryPlayer.id,
            EntryPlayer.full_name,
            EntryEvent.code,
            EntryPage.slug,
            EntryPage.audience,
            EntryPage.draws_published,
            EntryPage.results_published,
            Tournament.name,
            Tournament.tournament_date,
            Tournament.tournament_end_date,
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
        .join(EntryPage, EntryPage.tournament_id == EntryPlayer.tournament_id)
        .join(Tournament, Tournament.id == EntryPlayer.tournament_id)
        .where(
            EntryPlayer.account_id == person.account_id,
            EntryPlayer.erased_at.is_(None),
            Entry.state == "confirmed",
            Entry.list_opt_out.is_(False),
            EntryPage.is_open.is_(True),
            EntryPage.entrants_published.is_(True),
        ),
    )
    out: Dict[str, Tuple[PlayerHistoryEntryDTO, set]] = {}
    for (
        tournament_id,
        player_id,
        full_name,
        event_code,
        slug,
        audience,
        draws_published,
        results_published,
        name,
        start_date,
        end_date,
    ) in rows:
        if _canonical_person_key(person.account_id, full_name) != canonical:
            continue
        current = tournament_id == tournament.id
        if not current and audience != "public":
            continue
        if not isinstance(slug, str) or not slug:
            continue
        key = str(tournament_id)
        row = out.get(key)
        if row is None:
            row = (
                PlayerHistoryEntryDTO(
                    slug=slug,
                    tournamentName=name,
                    date=start_date,
                    endDate=end_date,
                    playerKey=str(player_id),
                    current=current,
                    eventCodes=[],
                    drawsPublished=bool(draws_published),
                    resultsPublished=bool(results_published),
                ),
                set(),
            )
            out[key] = row
        if isinstance(event_code, str) and event_code:
            row[1].add(event_code)
    return out


def _imported_person_history_rows(
    repo: LocalRepository,
    tournament: Tournament,
    correlation: str,
) -> Dict[str, Tuple[PlayerHistoryEntryDTO, set]]:
    """Workspaces whose PUBLISHED DRAW roster carries the same person.

    One query, not one per workspace: every candidate page's gates are in the
    WHERE clause and the roster comparison happens in memory over the blobs
    that query already returned. A workspace whose draws are unpublished is
    absent — its roster is not public, so neither is the fact that this
    person is on it.
    """
    rows = repo.execute_query(
        _all_rows,
        select(
            Tournament.id,
            Tournament.name,
            Tournament.tournament_date,
            Tournament.tournament_end_date,
            Tournament.data,
            EntryPage.slug,
            EntryPage.audience,
            EntryPage.draws_published,
            EntryPage.results_published,
        )
        .select_from(Tournament)
        .join(EntryPage, EntryPage.tournament_id == Tournament.id)
        .where(
            # ``draws_published`` alone, deliberately: a draw-roster person's
            # publication IS the published draw (``_with_draw_roster``), and
            # that is also the flag ``player_page`` checks before serving
            # them. Requiring ``entrants_published`` here would hide a
            # workspace whose profile is nonetheless readable, which is the
            # opposite of the gate's purpose.
            EntryPage.is_open.is_(True),
            EntryPage.draws_published.is_(True),
        ),
    )
    out: Dict[str, Tuple[PlayerHistoryEntryDTO, set]] = {}
    for (
        tournament_id,
        name,
        start_date,
        end_date,
        data,
        slug,
        audience,
        draws_published,
        results_published,
    ) in rows:
        current = tournament_id == tournament.id
        if not current and audience != "public":
            continue
        if not isinstance(slug, str) or not slug:
            continue
        match_key: Optional[str] = None
        for roster_row in (data or {}).get("bracketPlayers") or []:
            if not isinstance(roster_row, dict):
                continue
            key = roster_row.get("id")
            if not isinstance(key, str) or key.startswith(_ENTRY_ROSTER_PREFIX):
                continue
            if _imported_person_correlation(roster_row) == correlation:
                match_key = key
                break
        if match_key is None:
            continue
        out[str(tournament_id)] = (
            PlayerHistoryEntryDTO(
                slug=slug,
                tournamentName=name,
                date=start_date,
                endDate=end_date,
                playerKey=match_key,
                current=current,
                eventCodes=[],
                drawsPublished=bool(draws_published),
                resultsPublished=bool(results_published),
            ),
            set(),
        )
    return out


def _expand_history_row(
    repo: LocalRepository,
    row: PlayerHistoryEntryDTO,
) -> None:
    """Fill one history row's per-event detail from ITS OWN workspace.

    Every gate is that workspace's: its page must still be open and
    published, its directory decides whether this person is linkable there,
    and its ``results_published`` decides whether any score appears. Nothing
    from the workspace being read leaks across.
    """
    try:
        page, other = _page(repo, row.slug)
    except HTTPException:
        # The page closed or went private between the listing query and now.
        # A row that can no longer be read is simply not expanded.
        return
    if not page.draws_published:
        # Everything expanded below is the DRAW's own record, so the draw's
        # own flag is the gate. Publication of the entrant list is a
        # different question and is answered where that list is served.
        return
    payload = _bracket(repo, other.id)
    if payload is None:
        return
    identities = _directory(repo, other, page)
    if row.playerKey not in identities.identities:
        return
    events = _person_draw_events(
        payload, other, identities, row.playerKey, bool(page.results_published)
    )
    row.events = events
    row.eventCodes = sorted({event.code for event in events} | set(row.eventCodes))
    row.expanded = True


def _person_history(
    repo: LocalRepository,
    tournament: Tournament,
    page: EntryPage,
    *,
    identity_key: str,
    person: Optional[EntryPlayer],
    identity: PublicPersonIdentityDTO,
) -> List[PlayerHistoryEntryDTO]:
    """This person's public tournament history, newest first.

    **Published and permitted only.** Every other workspace has to clear its
    own public gates before it appears here — an open, non-private entry page
    with ``entrants_published`` on, and either a confirmed, non-opted-out
    entry (the account-verified join) or a PUBLISHED DRAW carrying the same
    imported identity. Anything else is absent, not summarised: a row saying
    "played somewhere private" would leak the same fact the gate exists to
    withhold. Other workspaces must additionally be ``audience == "public"``;
    an *unlisted* page is reachable by its URL but is deliberately not
    discoverable, and a public profile linking to it would publish it.

    Two identity joins, never mixed (P6, 2026-09-08): an entry-backed person
    joins on the verified entrant ACCOUNT plus stored name
    (``_canonical_person_key``), and an imported draw-roster person joins on
    the import's own declared identity (``_imported_person_correlation``).
    Neither can pull in a row belonging to the other spine, so an anonymous
    imported name can never attach itself to somebody's account.

    The current workspace is always included (it is the page being read) and
    marked ``current``, so a person with no linked history still gets a
    complete, honest section rather than an empty one.
    """
    if person is not None:
        by_tournament = _entry_person_history_rows(repo, person, tournament)
    else:
        correlation = _imported_person_correlation(
            {"id": identity_key, "name": identity.name}
        )
        by_tournament = (
            _imported_person_history_rows(repo, tournament, correlation)
            if correlation
            else {}
        )
        for roster_row in _bracket_roster_rows(tournament):
            if roster_row["id"] != identity_key:
                continue
            better = _imported_person_correlation(roster_row)
            if better and better != correlation:
                by_tournament = _imported_person_history_rows(repo, tournament, better)
            break
    if str(tournament.id) not in by_tournament:
        # The page being read is always its own history entry, whatever the
        # join found — otherwise a person with one tournament reads as a
        # person with none.
        by_tournament[str(tournament.id)] = (
            PlayerHistoryEntryDTO(
                slug=page.slug,
                tournamentName=tournament.name,
                date=tournament.tournament_date,
                endDate=tournament.tournament_end_date,
                playerKey=identity_key if person is None else str(person.id),
                current=True,
                eventCodes=[],
                drawsPublished=bool(page.draws_published),
                resultsPublished=bool(page.results_published),
            ),
            set(),
        )
    for row, codes in by_tournament.values():
        row.eventCodes = sorted(codes)
    # Newest first, undated last, then a stable tiebreaker so two
    # same-day tournaments never swap between reads. Two passes rather than
    # an inverted sort key: the date descends while the name ascends.
    ordered = sorted(
        (row for row, _codes in by_tournament.values()),
        key=lambda row: (row.tournamentName or "", row.slug),
    )
    # ``reverse=True`` keeps equal keys in their existing (name) order, so
    # the date descends while the tiebreaker still ascends. An empty date
    # sorts last, which is where an undated workspace belongs.
    ordered.sort(key=lambda row: row.date or "", reverse=True)
    expanded = 0
    for row in ordered:
        if row.current or expanded >= _HISTORY_EXPANSION_LIMIT:
            continue
        _expand_history_row(repo, row)
        expanded += 1
    return ordered


def _draw_partner(
    participant,
    identity_key: str,
    roster_names: Dict[str, str],
    identities: PublicPersonDirectory | Dict[str, PublicPersonIdentityDTO],
    event_code: Optional[str],
    event_alias: Optional[str],
) -> Optional[PersonReferenceDTO]:
    """The other member of this person's pair, from the draw itself.

    ``member_ids`` is the authoritative pair composition (``shared/sides.py``)
    — never a split of the composite team label, which corrupts real names.
    Returns ``None`` for singles, for a pair one member short, and for a pair
    of more than two, all of which are honestly "no partner to name here".
    """
    members = [m for m in (participant.members or []) if m != identity_key]
    if len(members) != 1:
        return None
    return _person_ref(
        members[0],
        name=roster_names.get(members[0]),
        identities=identities,
        event_code=event_code,
        event_alias=event_alias,
    )


def _person_draw_events(
    payload,
    tournament: Tournament,
    identities: PublicPersonDirectory,
    identity_key: str,
    results_on: bool,
) -> List[PlayerEventDTO]:
    """One person's events, seeds, partners and ROUND STEPS in one bracket.

    Walks the already-hydrated payload in memory — no per-round and no
    per-opponent query (the draw N+1 trap this module has avoided since it
    was written). Every visibility decision is delegated: the per-event gate
    to ``_event_public_for_person``, each opponent name to ``_teams`` /
    ``_person_ref``, and the result to ``results_on``.

    Shared by the player page and by each expanded cross-tournament history
    row, so a person's record reads identically whichever tournament's page
    you are standing on.
    """
    out: List[PlayerEventDTO] = []
    units, results, _ = _bracket_indexes(payload)
    roster_names = _bracket_roster_names(tournament)
    for event in payload.events:
        public_event_code = _event_public_code(event)
        if not _event_public_for_person(
            identities, identity_key, public_event_code, event.id
        ):
            continue
        mine_participants = [
            p
            for p in event.participants
            if p.id == identity_key or identity_key in (p.members or [])
        ]
        if not mine_participants:
            continue
        mine = {p.id for p in mine_participants}
        knockout = event.format in _KNOCKOUT_FORMATS
        locator = _unit_locator(event, knockout)
        teams = {
            t.participantKey: t
            for t in _teams(
                event, identities.clubs, roster_names, identities, event.id
            )
        }
        path: List[PlayerDrawPathDTO] = []
        for segment in _event_segments(event):
            total = len(segment.rounds)
            for r_index, round_ids in enumerate(segment.rounds):
                opponents: List[PersonReferenceDTO] = []
                outcome: Optional[str] = None
                score: Optional[List[List[int]]] = None
                reference: Optional[str] = None
                for unit_id in round_ids:
                    unit = units.get(unit_id)
                    if unit is None:
                        continue
                    projected_sides = [
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
                    ]
                    projected_keys = [
                        side.participantKey
                        for side in projected_sides
                        if side.participantKey
                    ]
                    if not set(projected_keys) & mine:
                        continue
                    mine_side = 0 if projected_sides[0].participantKey in mine else 1
                    unit_ref = locator.get(unit_id)
                    reference = unit_ref.reference if unit_ref else reference
                    result = results.get(unit_id) if results_on else None
                    if result is not None and result.winner_side in ("A", "B"):
                        won = (result.winner_side == "A") == (mine_side == 0)
                        outcome = "won" if won else "lost"
                        rows = _score_rows(result.score)
                        if rows is not None:
                            # Reader order, not draw order: a step reads
                            # "21-18, 21-15" from THIS person's side.
                            score = (
                                rows
                                if mine_side == 0
                                else [list(reversed(pair)) for pair in rows]
                            )
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
                            PersonReferenceDTO(
                                identity=None, resolution="dead", label="Opponent TBD"
                            )
                        )
                if opponents:
                    path.append(
                        PlayerDrawPathDTO(
                            roundLabel=_round_label(total, r_index, knockout),
                            opponents=opponents,
                            outcome=outcome,
                            score=score,
                            reference=reference,
                        )
                    )
        out.append(
            PlayerEventDTO(
                code=public_event_code,
                discipline=event.discipline,
                partner=_draw_partner(
                    mine_participants[0],
                    identity_key,
                    roster_names,
                    identities,
                    public_event_code,
                    event.id,
                ),
                seed=next((p.seed for p in mine_participants), None),
                drawPath=path,
            )
        )
    out.sort(key=lambda row: (row.code, row.discipline))
    return out


@router.get("/players/{person_key}", response_model=PlayerPageDTO)
def player_page(
    response: Response,
    slug: str = Path(..., max_length=100),
    # 100, not 64: the key space is the ROSTER id (``_with_draw_roster``),
    # which is ``entry-{uuid}`` for an entrant and the importer's own
    # ``player-{sha256}`` for a draw-roster person — 71 characters, which
    # this route used to reject with a 422 before it could even look.
    person_key: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> PlayerPageDTO:
    """One person's tournament: events, draw paths, and matches.

    Discoverability rides ``entrants_published`` (§4) — with the list
    unpublished, a person page answers the uniform 404 like everything
    else unpublished. An ENTRY-BACKED person must additionally hold a
    CONFIRMED entry: pending submissions never appear publicly (§3.2), on
    their page-of-one no less than on the list.

    Two key spellings reach here and both are the SAME key space (P6):
    ``entry_players.id`` — the bare UUID the entrant tier has always used —
    and a draw-roster id, which is what the players list emits for an
    imported tournament. Whichever arrives, it resolves to one roster key
    and every projection below joins on that.
    """
    page, tournament = _page(repo, slug)
    if not page.entrants_published and not page.draws_published:
        # The person DIRECTORY is published by either flag (``players_index``
        # says so), and a profile is one row of it. Which flag applies to
        # THIS person is decided below, per spine: an entrant needs
        # ``entrants_published``, a draw-roster person needs the draw.
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

    person: Optional[EntryPlayer] = None
    person_id: Optional[uuid.UUID] = None
    entries: List[Entry] = []
    try:
        person_id = uuid.UUID(person_key)
    except (ValueError, AttributeError, TypeError):
        person_id = None

    if person_id is not None:
        if not page.entrants_published:
            raise _not_found()
        person = repo.execute_query(
            _get_record, EntryPlayer, (tournament.id, person_id)
        )
        if person is None or person.erased_at is not None:
            raise _not_found()
        entries = list(
            repo.execute_query(
                _scalar_rows,
                select(Entry).where(
                    Entry.tournament_id == tournament.id,
                    Entry.entry_player_id == person_id,
                    Entry.state == "confirmed",
                    Entry.list_opt_out.is_(False),
                ),
            )
        )
        if not entries:
            raise _not_found()
        identity_key = roster_id(person_id)
    else:
        identity_key = person_key
        if identity_key not in identities.draw_people:
            # Not a UUID and not a published draw-roster key: the same
            # uniform 404 an unknown entrant gets. No spelling of an
            # unpublished person is ever confirmed here.
            raise _not_found()

    if identity_key not in identities.identities:
        raise _not_found()
    identity = identities.identities[identity_key]
    page_updated_at = tournament.updated_at.isoformat() if tournament.updated_at else None

    events_by_id = {
        ev.id: ev
        for ev in repo.execute_query(
            _scalar_rows,
            select(EntryEvent).where(
                EntryEvent.tournament_id == tournament.id
            ),
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
            for pe in repo.execute_query(
                _scalar_rows,
                select(Entry).where(
                    Entry.tournament_id == tournament.id,
                    Entry.id.in_(partner_ids),
                    Entry.state == "confirmed",
                ),
            )
        }
        partner_player_ids = {
            pe.entry_player_id for pe in partner_entries.values() if pe.entry_player_id is not None
        }
        partner_players = (
            {
                p.id: p
                for p in repo.execute_query(
                    _scalar_rows,
                    select(EntryPlayer).where(
                        EntryPlayer.tournament_id == tournament.id,
                        EntryPlayer.id.in_(partner_player_ids),
                        EntryPlayer.erased_at.is_(None),
                    ),
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
    # ONE join key for every projection below. It is ``entry-{uuid}`` for an
    # entrant and the importer's roster id for a draw-roster person; the
    # bracket, the draw path and the meet blob all store this same value.
    roster_id_str = identity_key
    matches: List[PlayerMatchDTO] = []

    # ---- bracket-origin matches --------------------------------------
    operational_courts = runtime.courts
    if payload is not None and page.draws_published:
        roster_names = _bracket_roster_names(tournament)
        units, results, assignments = _bracket_indexes(payload)
        for event in payload.events:
            public_event_code = _event_public_code(event)
            if not _event_public_for_person(
                identities, identity_key, public_event_code, event.id
            ):
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
            pending_keys = _pending_pair_keys(event)
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
                                pending_keys,
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
                                    unresolved=projected.unresolved,
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
                        unit_ref = locator.get(unit_id)
                        matches.append(
                            PlayerMatchDTO(
                                eventCode=_event_public_code(event),
                                roundLabel=_round_label(total, r_index, knockout),
                                reference=unit_ref.reference if unit_ref else None,
                                shortReference=(
                                    unit_ref.short_reference if unit_ref else None
                                ),
                                sides=sides,
                                score=_score_rows(result.score) if result else None,
                                decided=decided,
                                scheduledTime=_slot_time(
                                    payload,
                                    assignment.slot_id if assignment else None,
                                ),
                                scheduledDate=(
                                    _slot_date(payload, assignment.slot_id, None)
                                    if assignment is not None
                                    else None
                                ),
                                court=operational_courts.get(unit_id),
                                playedOn=unit.played_on,
                                localTime=unit.local_time,
                                courtLabel=unit.court_label,
                                status=match_status,
                                scoresPublished=results_on,
                                durationMinutes=(
                                    assignment.duration_slots * payload.interval_minutes
                                    if assignment is not None
                                    else None
                                ),
                                updatedAt=page_updated_at,
                            )
                        )

    # The person's events, seeds and structured draw path, from the
    # already-hydrated bracket. One helper because the SAME projection now
    # serves this page and every expanded cross-tournament history row.
    draw_events = (
        _person_draw_events(payload, tournament, identities, identity_key, results_on)
        if payload is not None and page.draws_published
        else []
    )
    draw_events_by_code = {row.code: row for row in draw_events}

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

    # An entry-backed person's events come from what they ENTERED (the desk
    # is the authority on that, and it knows about an event with no draw
    # yet); a draw-roster person has no entry, so the draw is the only
    # record there is. Either way the seed, the path and — where the desk
    # has no accepted partner — the pair composition come from the draw.
    if player_events:
        events = [
            PlayerEventDTO(
                code=code,
                discipline=discipline,
                partner=partner or (
                    draw_events_by_code[code].partner if code in draw_events_by_code else None
                ),
                seed=draw_events_by_code[code].seed if code in draw_events_by_code else None,
                drawPath=(
                    draw_events_by_code[code].drawPath if code in draw_events_by_code else []
                ),
            )
            for code, discipline, partner in player_events
        ]
    else:
        events = draw_events

    history = _person_history(
        repo,
        tournament,
        page,
        identity_key=identity_key,
        person=person,
        identity=identity,
    )
    for row in history:
        if not row.current:
            continue
        # The current row is not expanded (its detail IS the page above), but
        # it must still name the events it covers, or the one row a reader
        # can check against what they are looking at reads as the emptiest.
        row.eventCodes = sorted({event.code for event in events} | set(row.eventCodes))

    return PlayerPageDTO(
        person=PersonReferenceDTO(
            identity=identity,
            resolution="resolved",
            label=None,
        ),
        club=identities.clubs.get(identity_key),
        events=events,
        matches=matches,
        history=history,
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
        # See ``_meet_schedule_matches``: the stored rank IS the console's
        # meet identity, handed to the shared authority whole (§6.1).
        meet_ref = meet_identity(event_code=event_rank)
        out.matches.append(
            PlayerMatchDTO(
                eventCode=event_rank,
                roundLabel=None,
                reference=format_match_identity(meet_ref),
                shortReference=format_match_identity(meet_ref, include_event=False),
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
                # Same D7/D8 fix as ``_meet_public_status``: never coerce an
                # unrecognised status to "scheduled", and never upgrade
                # "called" to "live" — results-off hides scores, not state.
                status=(
                    "completed" if finished
                    else _meet_public_status(state.status if state is not None else "scheduled")
                ),
                scoresPublished=results_on,
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


@dataclass(frozen=True)
class _LiveClaim:
    """Adapter satisfying ``shared.court_occupancy``'s ``OccupancyMatch``
    protocol for a currently-running bracket court assignment. A bracket
    assignment has no ``MatchStatus`` of its own — "currently playing" is
    expressed here as "started, not yet ended, not finished" — so every
    claim this module hands to the authority is pre-filtered to that
    condition and reported as the canonical ``"playing"`` status."""

    id: str
    status: str
    court_id: Optional[int]


def _merge_live_bracket_courts(courts: Dict[str, int], assignments) -> None:
    """Add only currently running, Operations-owned bracket court claims.

    The persisted bracket plan contains future placements too; those are not
    an authoritative live court until Operations starts the assignment. A
    materialized Match court remains authoritative.

    Court disputes (two or more current claims on one physical court) are
    derived by the one authority, ``shared.court_occupancy`` — this module
    keeps no conflict detector of its own (contract §4, D1). Per ruling C2,
    a dispute withholds only the court field for the claiming units; the
    match rows themselves are untouched here and stay in the public
    projection either way (the withheld unit simply has no ``courts`` entry
    for the match loop above to read).
    """
    claims: List[_LiveClaim] = []
    court_by_unit: Dict[str, int] = {}
    fallback: Dict[str, int] = {}
    for assignment in assignments:
        unit_id = assignment.play_unit_id
        court_id = assignment.court_id
        if (
            not unit_id
            or court_id is None
            or assignment.actual_start_slot is None
            or assignment.actual_end_slot is not None
            or assignment.finished
        ):
            continue
        effective = courts.get(unit_id, court_id)
        claims.append(_LiveClaim(id=unit_id, status="playing", court_id=effective))
        court_by_unit[unit_id] = effective
        if unit_id not in courts:
            fallback[unit_id] = court_id

    states: Dict[int, CourtState] = derive_court_states(claims)
    disputed_courts = {court for court, state in states.items() if state == "disputed"}
    conflicts = {
        unit_id for unit_id, court in court_by_unit.items() if court in disputed_courts
    }
    for unit_id, court_id in fallback.items():
        if unit_id not in conflicts:
            courts[unit_id] = court_id
    for unit_id in conflicts:
        courts.pop(unit_id, None)


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
    directory = _directory(repo, tournament, page)
    courts: Dict[str, int] = {}
    states: Dict[str, object] = {}
    bracket_revisions: List[Tuple[str, int, str]] = []
    bracket_results: List[Tuple[str, str, str, bool, str]] = []
    meet_labels: Dict[str, str] = {}
    meet_event_keys: Dict[str, str] = {}
    if page.draws_published:
        match_rows = repo.execute_query(
            _scalar_rows,
            select(Match).where(Match.tournament_id == tournament.id),
        )
        courts = {
            row.id: row.court_id
            for row in match_rows
            if row.court_id is not None
        }
        state_rows = repo.match_states.list_for_tournament(tournament.id)
        states = {row.match_id: row for row in state_rows}
        if bracket_payload is not None:
            _merge_live_bracket_courts(courts, bracket_payload.assignments)
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
                            row.court_id,
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
                for row in repo.execute_query(
                    _scalar_rows,
                    select(BracketMatch).where(
                        BracketMatch.tournament_id == tournament.id
                    ),
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
                for row in repo.execute_query(
                    _scalar_rows,
                    select(BracketResult).where(
                        BracketResult.tournament_id == tournament.id
                    ),
                )
            ]
        if tournament.kind == "meet":
            for row in repo.execute_query(
                _scalar_rows,
                select(MeetEvent).where(
                    MeetEvent.tournament_id == tournament.id
                ),
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
        pending_keys = _pending_pair_keys(event)
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
                            unit, cached, slot, locator, units, results, results_on,
                            pending_keys,
                        )
                        team = teams.get(projected.participantKey) if projected.participantKey else None
                        sides.append(
                            ScheduleSideDTO(
                                participantKey=projected.participantKey,
                                persons=team.persons if team else [],
                                placeholder=("Bye" if projected.bye else projected.placeholder),
                                unresolved=projected.unresolved,
                            )
                        )
                    slot_id = assignment.slot_id if assignment else None
                    scheduled = _slot_time(payload, slot_id)
                    unit_ref = locator.get(unit_id)
                    out.append(ScheduleMatchDTO(
                        matchKey=f"{event.id}:{unit.id}",
                        reference=unit_ref.reference if unit_ref else None,
                        shortReference=unit_ref.short_reference if unit_ref else None,
                        source="bracket",
                        eventCode=_event_public_code(event),
                        discipline=event.discipline,
                        roundLabel=label,
                        status=state,
                        scheduledDate=(
                            _slot_date(payload, slot_id, tournament_date) if scheduled else None
                        ),
                        scheduledTime=scheduled,
                        court=operational_courts.get(unit_id),
                        sides=sides,
                        score=_score_rows(result.score) if result is not None and results_on else None,
                        walkover=bool(result.walkover) if result is not None and results_on else False,
                        winnerSide=(
                            result.winner_side
                            if result is not None and result.winner_side in ("A", "B")
                            else None
                        ),
                        updatedAt=updated_at,
                    ))
    return out


def _meet_public_status(raw_state: Optional[str]) -> Optional[str]:
    """Map a persisted (or legacy) Meet match status to the public wire status.

    Two rules from contract §9.1, fixed here (D7, D8):

    - **Never coerce an unrecognised status to ``scheduled``.** An unknown
      value yields ``None`` — the caller omits the match from state facets
      and renders no state chip (§2.2). This is the mechanism that used to
      let a cancelled match reappear as an upcoming one.
    - **``called`` must not be published as ``live``,** and results-off must
      not synthesise a play state at all: turning results off hides scores,
      not match progression, so this mapping does not consult the
      results-publication flag. Only the score/ledger is gated by it,
      downstream in the caller.
    """
    if raw_state == "playing":
        return "live"
    if raw_state == "finished":
        return "completed"
    if raw_state in {"retired", "called", "delayed", "cancelled", "scheduled"}:
        return raw_state
    return None


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
        state = _meet_public_status(raw_state)
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
        # Meet's authoritative outcome IS the recorded final score on a
        # FINISHED match — there is no separate winner column (``MatchState``)
        # — so it is decided here, once, rather than by every renderer
        # counting games (§5.1 rule 3). An unfinished match has no winner,
        # whatever the running score says.
        winner_side = None
        if state == "completed" and score:
            if score[0][0] > score[0][1]:
                winner_side = "A"
            elif score[0][1] > score[0][0]:
                winner_side = "B"
        # Meet's stored ``eventRank`` ("MS1") already IS the console's meet
        # identity — ``formatMatchIdentity`` reassembles exactly
        # ``{event_code}{position}`` — so it is handed to the authority whole
        # rather than decomposed and rebuilt. A meet match never appears in a
        # single-event draw view, so it publishes no short spelling.
        identity = meet_identity(event_code=event_code)
        event_discipline = labels.get(event_code)
        out.append(
            ScheduleMatchDTO(
                matchKey=f"meet:{match_id}",
                source="meet",
                eventCode=event_code,
                reference=format_match_identity(identity),
                shortReference=format_match_identity(identity, include_event=False),
                winnerSide=winner_side,
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
    # Public readers need the live queue immediately, even when the event's
    # bracket contains many future-round placeholders.  Apply this ordering
    # to the complete filtered result set before slicing a page: a live match
    # beyond page one must still be the first thing a spectator sees. Within
    # each state group retain deterministic tournament chronology and the
    # stable match key as a final tie-breaker.
    def schedule_order(item: ScheduleMatchDTO) -> tuple[int, bool, str, bool, str, str]:
        state_rank = (
            0 if item.status == "live" else
            2 if item.status in {"completed", "walkover", "retired", "cancelled"} else 1
        )
        return (
            state_rank,
            item.scheduledDate is None,
            item.scheduledDate or "",
            item.scheduledTime is None,
            item.scheduledTime or "",
            item.matchKey,
        )

    matches.sort(key=schedule_order)

    day_counts: Dict[str, int] = {}
    for item in facets_source:
        if item.scheduledDate:
            day_counts[item.scheduledDate] = day_counts.get(item.scheduledDate, 0) + 1
    facets = ScheduleFacetsDTO(
        days=[ScheduleDayFacetDTO(day=value, count=day_counts[value]) for value in sorted(day_counts)],
        events=sorted({m.eventCode for m in facets_source if m.eventCode}),
        courts=sorted({m.court for m in facets_source if m.court is not None}),
        # An unrecognised status is omitted here (contract §2.2) — a
        # spectator cannot filter by a state that was never coerced into
        # existence.
        states=sorted({m.status for m in facets_source if m.status is not None}),
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
