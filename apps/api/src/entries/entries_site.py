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

import unicodedata
import uuid
from typing import Dict, List, Literal, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel
from sqlalchemy import select

from entries.entries import roster_id
from entries.entries_public import _not_found, _resolve
from db.models import (
    Entry,
    EntryEvent,
    EntryPage,
    EntryPlayer,
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


def _clubs_by_roster_id(repo: LocalRepository, tournament_id) -> Dict[str, Optional[str]]:
    """``entry-{entry_player_id}`` → club, for every entered person.

    The commit seam's deterministic roster id (``entries/entries._player_id``)
    is the join between an entered human and their roster/participant
    appearances. A participant that never came through Entries simply is
    not in this map and renders club-less — calm, not wrong.
    """
    rows = repo.session.execute(
        select(EntryPlayer.id, EntryPlayer.club).where(EntryPlayer.tournament_id == tournament_id)
    ).all()
    return {roster_id(pid): club for pid, club in rows}


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


def _participant_names(participant, roster_names: Dict[str, str]) -> List[str]:
    """Resolve a draw participant without parsing its presentation label."""
    if participant.members:
        resolved = [roster_names[m] for m in participant.members if m in roster_names]
        # Partial member resolution would display a one-person doubles side.
        # Keep the unsplit source label in that case: honest and reversible.
        if len(resolved) == len(participant.members):
            return resolved
    roster_name = roster_names.get(participant.id)
    return [roster_name or participant.name]


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


class TeamDTO(BaseModel):
    """One participant of a draw — the lookup table match nodes reference,
    so a pair's names travel once, not once per round they survive."""

    participantKey: str
    names: List[str]
    club: Optional[str] = None
    seed: Optional[int] = None


class DrawPlayerDTO(BaseModel):
    """One real roster person referenced by at least one published draw.

    ``playerKey`` is only a stable row identity. It is deliberately not an
    Entries person key and the public tier never turns it into a profile URL.
    Historical source-name identities cannot safely claim that relationship.
    """

    playerKey: str
    name: str
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
    # W/L pills in play order (§3.4's History column).
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
    names: List[str]
    club: Optional[str] = None


class SeedsEventDTO(BaseModel):
    eventCode: str
    discipline: str
    seeds: List[SeedLineDTO]


class SeedsDTO(BaseModel):
    published: bool
    events: List[SeedsEventDTO] = []


class HonorDTO(BaseModel):
    names: List[str]
    club: Optional[str] = None


class WinnersEventDTO(BaseModel):
    eventCode: str
    discipline: str
    decided: bool
    winner: Optional[HonorDTO] = None
    runnerUp: Optional[HonorDTO] = None
    semifinalists: List[HonorDTO] = []


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
    partnerName: Optional[str] = None


class PlayerMatchSideDTO(BaseModel):
    names: List[str]
    placeholder: Optional[str] = None
    winner: bool = False


class PlayerMatchDTO(BaseModel):
    eventCode: str
    roundLabel: Optional[str] = None
    sides: List[PlayerMatchSideDTO]
    # Present only when results are published AND the match is decided.
    score: Optional[List[List[int]]] = None
    decided: bool = False
    scheduledTime: Optional[str] = None
    court: Optional[int] = None


class PlayerRecordDTO(BaseModel):
    played: int
    wins: int
    losses: int


class PlayerPageDTO(BaseModel):
    personKey: str
    name: str
    club: Optional[str] = None
    events: List[PlayerEventDTO]
    # None when results are unpublished — a 0-0 record would be a claim.
    record: Optional[PlayerRecordDTO] = None
    matches: List[PlayerMatchDTO]


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
) -> List[TeamDTO]:
    roster_names = roster_names or {}
    out = []
    for participant in event.participants:
        names = _participant_names(participant, roster_names)
        club = clubs.get(participant.id)
        if participant.members and club is None:
            for member in participant.members:
                club = clubs.get(member)
                if club is not None:
                    break
        out.append(
            TeamDTO(
                participantKey=participant.id,
                names=names,
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
    draws = (
        [
            DrawCardDTO(
                drawKey=event.id,
                eventCode=event.id,
                discipline=event.discipline,
                kind=event.format,
                size=event.bracket_size or event.participant_count,
                hasConsolation=_has_consolation(event),
                **_event_projection_meta(event),
            )
            for event in payload.events
        ]
        if payload is not None
        else []
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
    clubs = _clubs_by_roster_id(repo, tournament.id)
    roster_names = _bracket_roster_names(tournament)

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
                        court=assignment.court_id if assignment else None,
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
        eventCode=event.id,
        discipline=event.discipline,
        kind=event.format,
        size=event.bracket_size or event.participant_count,
        resultsPublished=results_on,
        **_event_projection_meta(event),
        identityScope=(event.config or {}).get("identity_scope"),
        teams=_teams(event, clubs, roster_names),
        segments=segments_out,
        standings=standings,
    )


@router.get("/players", response_model=PlayersDTO)
def players_index(
    response: Response,
    slug: str = Path(..., max_length=100),
    repo: LocalRepository = Depends(get_repository),
) -> PlayersDTO:
    """Every named roster person referenced by the published draws.

    This is a draw-roster index, not an Entries directory. It therefore uses
    ``draws_published`` as its only publication gate, reads names solely from
    ``tournaments.data.bracketPlayers``, and never manufactures a profile URL
    from a source-local roster key.
    """
    page, tournament = _page(repo, slug)
    response.headers["Cache-Control"] = _CACHE
    if not page.draws_published:
        return PlayersDTO(published=False)

    payload = _bracket(repo, tournament.id)
    if payload is None:
        return PlayersDTO(published=True)

    roster_names = _bracket_roster_names(tournament)
    events_by_player: Dict[str, set[str]] = {}
    for event in payload.events:
        for participant in event.participants:
            player_ids = participant.members or [participant.id]
            for player_id in player_ids:
                events_by_player.setdefault(player_id, set()).add(event.id)

    players = [
        DrawPlayerDTO(
            playerKey=player_id,
            name=roster_names[player_id],
            eventCodes=sorted(event_codes),
        )
        for player_id, event_codes in events_by_player.items()
        if player_id in roster_names
    ]
    players.sort(key=lambda row: (_alphabetic_name_key(row.name), row.name, row.playerKey))
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

    clubs = _clubs_by_roster_id(repo, tournament.id)
    roster_names = _bracket_roster_names(tournament)
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
                eventCode=event.id,
                discipline=event.discipline,
                seeds=[
                    SeedLineDTO(
                        seed=p.seed,
                        names=_participant_names(p, roster_names),
                        club=clubs.get(p.id)
                        or next(
                            (clubs[m] for m in (p.members or []) if m in clubs and clubs[m]),
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
    return HonorDTO(names=payload_team.names, club=payload_team.club)


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

    clubs = _clubs_by_roster_id(repo, tournament.id)
    roster_names = _bracket_roster_names(tournament)
    units, results, _ = _bracket_indexes(payload)
    events_out = []
    for event in payload.events:
        teams = {t.participantKey: t for t in _teams(event, clubs, roster_names)}
        entry = _event_winner(event, units, results)
        winner_key, runner_key, semi_keys = entry
        events_out.append(
            WinnersEventDTO(
                eventCode=event.id,
                discipline=event.discipline,
                decided=winner_key is not None,
                winner=_honor(teams.get(winner_key)) if winner_key else None,
                runnerUp=_honor(teams.get(runner_key)) if runner_key else None,
                semifinalists=[
                    honor
                    for honor in (_honor(teams.get(k)) for k in semi_keys)
                    if honor is not None
                ],
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


# ---- the player page (§3.3) ----------------------------------------------


@router.get("/players/{person_key}", response_model=PlayerPageDTO)
def player_page(
    response: Response,
    slug: str = Path(..., max_length=100),
    person_key: str = Path(..., max_length=64),
    repo: LocalRepository = Depends(get_repository),
) -> PlayerPageDTO:
    """One person's tournament: events, matches, record.

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
    if person is None:
        raise _not_found()
    entries = list(
        repo.session.scalars(
            select(Entry).where(
                Entry.tournament_id == tournament.id,
                Entry.entry_player_id == person_id,
                Entry.state == "confirmed",
            )
        )
    )
    if not entries:
        raise _not_found()
    response.headers["Cache-Control"] = _CACHE

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
    partner_name_by_event: dict = {}
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
                partner_name_by_event[e.entry_event_id] = partner.full_name

    player_events = sorted(
        {
            (event.code, event.discipline, partner_name_by_event.get(event.id))
            for event in (events_by_id.get(e.entry_event_id) for e in entries)
            if event is not None
        },
        key=lambda row: (row[0], row[1]),
    )

    results_on = bool(page.results_published)
    roster_id_str = roster_id(person_id)
    matches: List[PlayerMatchDTO] = []
    wins = losses = 0

    # ---- bracket-origin matches --------------------------------------
    payload = _bracket(repo, tournament.id)
    if payload is not None and page.draws_published:
        roster_names = _bracket_roster_names(tournament)
        units, results, assignments = _bracket_indexes(payload)
        for event in payload.events:
            mine = {
                p.id
                for p in event.participants
                if p.id == roster_id_str or roster_id_str in (p.members or [])
            }
            if not mine:
                continue
            knockout = event.format in _KNOCKOUT_FORMATS
            locator = _unit_locator(event, knockout)
            teams = {t.participantKey: t for t in _teams(event, {}, roster_names)}
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
                                    names=team.names if team else [],
                                    placeholder=("Bye" if projected.bye else projected.placeholder),
                                    winner=bool(decided and result.winner_side == side_tag),
                                )
                            )
                        # Involvement AS THE PUBLIC VIEW KNOWS IT: the same
                        # redaction that hides advancement from the tree
                        # hides this person's redacted appearances from
                        # their own public page — anything else would leak
                        # the result through the match list's mere growth.
                        if not projected_keys & mine:
                            continue
                        if decided:
                            my_side = "A" if (set(unit.side_a or []) & mine) else "B"
                            if result.winner_side == my_side:
                                wins += 1
                            else:
                                losses += 1
                        assignment = assignments.get(unit_id)
                        matches.append(
                            PlayerMatchDTO(
                                eventCode=event.id,
                                roundLabel=_round_label(total, r_index, knockout),
                                sides=sides,
                                score=_score_rows(result.score) if result else None,
                                decided=decided,
                                scheduledTime=_slot_time(
                                    payload,
                                    assignment.slot_id if assignment else None,
                                ),
                                court=assignment.court_id if assignment else None,
                            )
                        )

    # ---- meet-origin matches -----------------------------------------
    meet = _meet_matches(repo, tournament, roster_id_str, results_on)
    matches.extend(meet.matches)
    wins += meet.wins
    losses += meet.losses

    return PlayerPageDTO(
        personKey=str(person_id),
        name=person.full_name,
        club=person.club,
        events=[
            PlayerEventDTO(code=code, discipline=discipline, partnerName=partner)
            for code, discipline, partner in player_events
        ],
        record=(
            PlayerRecordDTO(played=wins + losses, wins=wins, losses=losses) if results_on else None
        ),
        matches=matches,
    )


class _MeetMatches:
    def __init__(self):
        self.matches: List[PlayerMatchDTO] = []
        self.wins = 0
        self.losses = 0


def _meet_matches(
    repo: LocalRepository, tournament: Tournament, roster_id: str, results_on: bool
) -> _MeetMatches:
    """The Meet half: matches from the state blob, scores from
    ``match_states`` — the Display board's exact sources, projected down to
    the player's own rows. Meet matches are pre-resolved (lineup, not
    advancement), so structure leaks no results; scores and finishes are
    the gated half."""
    out = _MeetMatches()
    data = tournament.data or {}
    players = {p.get("id"): p for p in data.get("players", []) if isinstance(p, dict)}
    if roster_id not in players:
        return out

    config = data.get("config") or {}
    day_start = config.get("dayStart")
    interval = config.get("intervalMinutes")
    schedule = data.get("schedule") or {}
    assignments = {
        a.get("matchId"): a for a in schedule.get("assignments", []) if isinstance(a, dict)
    }
    states = (
        {row.match_id: row for row in repo.match_states.list_for_tournament(tournament.id)}
        if results_on
        else {}
    )

    def names_for(ids):
        return [
            players[pid]["name"]
            for pid in (ids or [])
            if pid in players and players[pid].get("name")
        ]

    for match in data.get("matches", []):
        if not isinstance(match, dict):
            continue
        side_a = match.get("sideA") or []
        side_b = match.get("sideB") or []
        if roster_id not in side_a and roster_id not in side_b:
            continue
        state = states.get(match.get("id"))
        finished = (
            state is not None
            and state.status == "finished"
            and state.score_side_a is not None
            and state.score_side_b is not None
        )
        winner_a = bool(finished and state.score_side_a > state.score_side_b)
        winner_b = bool(finished and state.score_side_b > state.score_side_a)
        if finished:
            on_a = roster_id in side_a
            if (winner_a and on_a) or (winner_b and not on_a):
                out.wins += 1
            elif winner_a or winner_b:
                out.losses += 1
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
                eventCode=match.get("eventRank") or "",
                roundLabel=None,
                sides=[
                    PlayerMatchSideDTO(names=names_for(side_a), winner=winner_a),
                    PlayerMatchSideDTO(names=names_for(side_b), winner=winner_b),
                ],
                score=([[state.score_side_a, state.score_side_b]] if finished else None),
                decided=finished,
                scheduledTime=scheduled,
                court=(
                    assignment.get("courtId")
                    if assignment is not None and isinstance(assignment.get("courtId"), int)
                    else None
                ),
            )
        )
    return out
