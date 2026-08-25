"""Seam A — commit confirmed entries onto the workspace roster.

The Entries design spec (`docs/history/superpowers/specs/2026-08-06-entries-design.md`)
§5 states the contract; this module is its implementation. In one sentence:
**every ``confirmed`` entry with no ``committed_player_id`` becomes a roster
player, exactly once, without disturbing anything already there.**

Three properties are worth reading before changing anything here.

**It is re-runnable, not one-shot (Q3).** BWF separates the entry deadline
from the withdrawal deadline and directors handle late entries as routine
work, so a one-shot commit would push them straight back to editing the
roster by hand — the workflow Entries exists to remove. Re-running is
therefore normal operation, and idempotency is a correctness requirement
rather than a nicety.

**It refuses instead of guessing.** An entry whose ``entry_events.code``
has no meaning in this workspace is skipped and *reported*, never mapped
onto the nearest-looking thing. Same for a bracket entry pointing at a draw
that is already generated or started. Invariant I4: software flags,
operators decide.

**It writes the blob defensively, because the CAS underneath it is weaker
than it looks.** ``upsert_data``'s compare-and-swap re-reads through
``session.get``, which answers from the identity map — and ``SessionLocal``
sets ``expire_on_commit=False``. So a competing write from *another*
session is invisible to it unless this caller expires its own snapshot
first. That is characterized (and logged as debt) in
``tests/test_concurrent_state_writes.py::test_a_stale_session_snapshot_defeats_the_cas_entirely``
with its negative control. Hence ``_expire`` being called twice per
attempt: once before reading, and once immediately before writing so the
guard's own re-read is forced to hit the database. Removing either call
does not fail loudly — it fails as a lost update.

**Transaction contract** matches ``solve_rail/solve_jobs.py`` and
``identity/members.py`` in spirit but not in letter: the repository methods
this calls (``commit_tournament_state``, ``add_participants``) commit on
their own, so this module cannot pretend the caller owns the transaction.
It commits the back-references itself, after the roster write, and the
crash window between the two is closed by adoption rather than by a
transaction — see ``_adoptable``.
"""
from __future__ import annotations

import copy
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.schemas import BracketPlayerDTO, PlayerDTO
from db.models import Entry, EntryEvent
from repositories.local import LocalRepository
# Resolved at raise/except time, not bound at import time — and imported
# from the repository rather than re-derived, so the two cannot drift.
# ``core.exceptions`` can be wiped and re-imported mid-suite (several test
# modules purge backend packages at collection), leaving several
# ``ConflictError`` classes alive at once; a module-level
# ``from core.exceptions import ConflictError`` here binds one of them and
# then silently fails to catch the other. That is not hypothetical — it is
# how this line came to look like this: the seam's retry tests passed in
# isolation and failed in the full run, with the conflict escaping the
# except clause.
from repositories.local import _conflict_error_class

log = logging.getLogger("scheduler.entries")

# How many times a blob write may be re-attempted before the seam gives up
# and reports the entries as conflicted. Bounded on purpose: an unbounded
# retry against a workspace someone is actively editing is a spin, and a
# spin inside a request is worse than a reported failure the operator can
# retry by clicking the button again.
MAX_ATTEMPTS = 5

# Draw states that must not take a late entrant. A generated draw already
# has a match tree, so an added participant would be in the roster and
# absent from the bracket; a started one has results. Neither is the seam's
# call to make — it reports and lets the operator re-generate.
_LOCKED_DRAW_STATUSES = frozenset({"generated", "started"})

_COMMITTABLE_STATE = "confirmed"


class SkipReason:
    """Stable reason codes for a per-entry skip.

    Plain string constants rather than an ``Enum``: these cross an HTTP
    boundary into a desk UI that renders them, so they are wire vocabulary,
    and an ``Enum`` would only add a ``.value`` at every serialization
    point. Renaming one is a contract change.
    """

    UNMAPPABLE_EVENT = "UNMAPPABLE_EVENT"
    DRAW_NOT_EDITABLE = "DRAW_NOT_EDITABLE"
    STATE_CONFLICT = "STATE_CONFLICT"
    INVALID_PLAYER = "INVALID_PLAYER"


@dataclass(frozen=True)
class CommittedEntry:
    entry_id: str
    player_id: str


@dataclass(frozen=True)
class SkippedEntry:
    entry_id: str
    reason: str


@dataclass
class CommitResult:
    """Per-entry outcome. Partial success is the expected shape, not an
    error path — spec §5: "partial success is reported per-entry, not
    rolled back wholesale"."""

    committed: list[CommittedEntry] = field(default_factory=list)
    skipped: list[SkippedEntry] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "committed": [
                {"id": c.entry_id, "playerId": c.player_id} for c in self.committed
            ],
            "skipped": [{"id": s.entry_id, "reason": s.reason} for s in self.skipped],
        }


# ---- public entry point --------------------------------------------------


def commit_entries(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    *,
    entry_event_id: Optional[uuid.UUID] = None,
    max_attempts: int = MAX_ATTEMPTS,
) -> CommitResult:
    """Materialize this workspace's committable entries onto its roster.

    ``entry_event_id`` narrows the run to one entry event (spec §5's
    "optional event filter"). Raises ``KeyError`` if the workspace does not
    exist — the routes resolve tenancy before calling, so that is a bug
    rather than a user-facing case.
    """
    tournament = repo.tournaments.get_by_id(tournament_id)
    if tournament is None:
        raise KeyError(tournament_id)

    candidates = _candidates(repo.session, tournament_id, entry_event_id)
    if not candidates:
        return CommitResult()

    events = {
        row.id: row
        for row in repo.session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id == tournament_id)
        )
    }

    if (tournament.kind or "meet") == "bracket":
        return _commit_bracket(repo, tournament_id, candidates, events, max_attempts)
    return _commit_meet(repo, tournament_id, candidates, events, max_attempts)


# ---- shared plumbing -----------------------------------------------------


def _candidates(
    session: Session,
    tournament_id: uuid.UUID,
    entry_event_id: Optional[uuid.UUID],
) -> list[Entry]:
    """Confirmed entries not yet on the roster, oldest submission first.

    ``submitted_at`` alone ties non-deterministically across SQLite and
    Postgres, so ``id`` is the tiebreaker — the house rule for every list
    query. Ascending rather than descending because commit order becomes
    roster order, and first-come-first-listed is the honest one.
    """
    stmt = select(Entry).where(
        Entry.tournament_id == tournament_id,
        Entry.state == _COMMITTABLE_STATE,
        Entry.committed_player_id.is_(None),
    )
    if entry_event_id is not None:
        stmt = stmt.where(Entry.entry_event_id == entry_event_id)
    return list(
        session.scalars(stmt.order_by(Entry.submitted_at.asc(), Entry.id.asc()))
    )


def _expire(session: Session) -> None:
    """Drop this session's snapshot so the next read hits the database.

    ``rollback()`` ends the read transaction (SQLite in WAL mode holds a
    snapshot for its duration); ``expire_all()`` drops the identity map's
    cached attribute values so ``session.get`` reloads instead of
    answering from memory. Both are needed: the module docstring explains
    what breaks without them.
    """
    session.rollback()
    session.expire_all()


def roster_id(person_id) -> str:
    """The one place the ``entry-{uuid}`` roster/participant id is spelled.

    F-DM-05: this prefix was the ONLY storage link from the people spine to
    the competition spine, and it was minted here and independently
    re-derived in three other modules - so renaming it orphaned every
    public player page silently, in three directions at once.

    It survives P4 as a legacy READ path and as the participant PK
    (R-DM-7(a) forbids a re-key). What replaces it as the *identity* is
    ``bracket_participants.entry_player_id`` - a real, constrained key.
    This function is where the string dies when that day comes.
    """
    return f"entry-{person_id}"


def team_id(person_ids: tuple[uuid.UUID, uuid.UUID]) -> str:
    """The deterministic participant id for a seam-built doubles pair.

    Deterministic for the same reason ``_player_id`` is: this seam is
    RE-RUNNABLE by design (module docstring, spec Q3), and a partially
    applied run has to be recognizable on the next one. A random id would
    make every re-run mint a second team for the same two people.

    Not ``roster_id`` of anything: a team is not a person and must never
    collide with one. Not the console's ``{eventId}-T{n}`` either - that
    numbering depends on how many teams already exist, which is exactly
    the kind of position-dependence a re-runnable seam cannot have. The
    two person UUIDs in member order are 78 characters, inside
    ``BracketParticipant.id``'s String(100) and inside ``Identifier``.
    """
    return f"team-{person_ids[0]}-{person_ids[1]}"


def team_name(name_a: str, name_b: str) -> str:
    """The backend's one pair-label mint.

    ``bracket_participants.name`` is NOT NULL, so a team needs a label and
    P5 therefore ADDS a mint rather than deleting one - the design doc's
    "-> 0" deletion gate for the minting direction is unachievable while
    director manual pairing stays (R-DM-4's ruling note). What P5 can
    honestly deliver is that nothing has to DECODE this label: for a
    seam-built team ``member_ids`` carries the two ``entry-{uuid}`` roster
    ids, so membership is data. Deleting the decode
    (``bracketMigration.ts:41-53``'s split-and-zip) is P6's, per the design
    doc's own text.

    The separator matches the console's two mint sites
    (``ParticipantPicker`` and ``BracketPlayerFields``) so one draw does
    not render two spellings of the same idea.
    """
    return f"{name_a} / {name_b}"


def _player_id(entry: Entry) -> str:
    """Deterministic roster id for the PERSON this entry enters.

    Keyed on ``entry_player_id``, not on the entry. A roster row is a human
    — ``EntryPlayer``'s own docstring says so ("three events for one child
    must not carry three copies of one sentence, **because the commit seam
    writes it onto a roster player**") — and one person routinely holds
    several entries, one per event. Keying on the entry made the seam emit
    one roster row per (person x event): the Lewisville demo workspace read
    "42 players" for 23 people, and the same fan-out reached the public
    entrant list.

    Deterministic rather than random so that a partially-applied commit is
    recognizable on the next run. 42 characters, inside ``Identifier``'s
    100. ``entry_player_id`` is nullable only while the R13 narrowing is in
    flight, so the entry id remains the fallback key.
    """
    return roster_id(entry.entry_player_id or entry.id)


def _adoptable(roster: list, entry: Entry) -> Optional[str]:
    """The id of a roster player this entry should be attached to.

    Two ways to match, because the seam's identity is the PERSON while its
    crash-recovery marker is per-entry:

    - the person's deterministic id (``_player_id``) is already on the
      roster. That is the ordinary case for a person's second and later
      events, and it also covers the crash window below;
    - a row carries this entry's own ``sourceEntryId``. Rows written by a
      build that keyed on the entry have such an id, so re-running against
      an older roster adopts instead of duplicating.

    The crash window: the seam commits in two steps — the roster write,
    then the back-references — because the repository methods commit on
    their own. A crash between them leaves a player with ``sourceEntryId``
    set and an entry with ``committed_player_id`` unset. Re-running must
    adopt that player rather than add a second one, which is why
    ``sourceEntryId`` lives on the roster player and not only in the
    entries table.
    """
    wanted_id = _player_id(entry)
    wanted_source = str(entry.id)
    for player in roster:
        if not isinstance(player, dict):
            continue
        player_id = player.get("id")
        if not isinstance(player_id, str):
            continue
        if player_id == wanted_id or player.get("sourceEntryId") == wanted_source:
            return player_id
    return None


def _write_back_references(
    session: Session, pairs: list[tuple[Entry, str]]
) -> list[CommittedEntry]:
    """The other half of the back-reference pair (spec Q3).

    Written after the roster, in its own commit, because the repository
    methods above commit on their own — this module cannot wrap them in one
    transaction. The window that opens is closed by ``_adoptable`` rather
    than by rollback.
    """
    for entry, player_id in pairs:
        entry.committed_player_id = player_id
    session.commit()
    if pairs:
        log.info("entries: committed %d entries to the roster", len(pairs))
    return [CommittedEntry(str(e.id), pid) for e, pid in pairs]


# ---- Meet ----------------------------------------------------------------


def _commit_meet(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
    max_attempts: int,
) -> CommitResult:
    """Fetch-modify-retry against the versioned state blob.

    The whole document is read, mutated and written back — never just the
    ``players`` section. ``commit_tournament_state`` merges exactly one
    server-managed key (``bracket_session``) and nothing else, so a partial
    payload silently erases every section it omits. Pinned by
    ``test_the_merge_list_is_exactly_bracket_session_and_nothing_else``.
    """
    session = repo.session
    planned: list[tuple[Entry, str]] = []
    skipped: list[SkippedEntry] = []

    for _attempt in range(max_attempts):
        _expire(session)
        row = repo.tournaments.get_by_id(tournament_id)
        if row is None:  # pragma: no cover — resolved by the caller
            raise KeyError(tournament_id)
        seen = row.state_version or 0
        document = copy.deepcopy(row.data or {})

        planned, skipped, mutated = _plan_meet(document, candidates, events)
        if not mutated:
            # Nothing to write: either everything was skipped, or every
            # candidate was adopted from a previous partial run. Writing
            # anyway would bump the version for no reason and make a
            # genuine no-op indistinguishable from work.
            break

        _expire(session)  # force the CAS's own re-read to hit the database
        try:
            repo.commit_tournament_state(
                tournament_id, document, expected_version=seen
            )
        except _conflict_error_class():
            log.info(
                "entries: state_version conflict committing to %s, refetching",
                tournament_id,
            )
            continue
        break
    else:
        # Retries exhausted. The entries stay uncommitted and say so; the
        # operator can run it again once the other writer is done.
        return CommitResult(
            skipped=skipped
            + [
                SkippedEntry(str(entry.id), SkipReason.STATE_CONFLICT)
                for entry, _ in planned
            ]
        )

    return CommitResult(
        committed=_write_back_references(session, planned), skipped=skipped
    )


def _plan_meet(
    document: dict,
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
) -> tuple[list[tuple[Entry, str]], list[SkippedEntry], bool]:
    """Mutate ``document`` in place; return (planned, skipped, mutated).

    Recomputed from scratch on every attempt, because the document it is
    planning against is a different one each time.
    """
    players = list(document.get("players") or [])
    groups = list(document.get("groups") or [])
    group_ids = {
        g.get("id") for g in groups if isinstance(g, dict) and g.get("id")
    }
    vocabulary = _rank_vocabulary(document)

    planned: list[tuple[Entry, str]] = []
    skipped: list[SkippedEntry] = []
    mutated = False

    for entry in candidates:
        event = events.get(entry.entry_event_id)
        if event is None or (vocabulary and event.code not in vocabulary):
            skipped.append(SkippedEntry(str(entry.id), SkipReason.UNMAPPABLE_EVENT))
            continue

        adopted = _adoptable(players, entry)
        if adopted is not None:
            # The person is already on the roster from an earlier event.
            # ``ranks[]`` is where a meet player carries the events they
            # are in, so this entry extends that list rather than minting a
            # second player under the same name. Never removes a rank: the
            # operator's own edits to this row are not this seam's to undo.
            row = next(
                (p for p in players if isinstance(p, dict) and p.get("id") == adopted),
                None,
            )
            if row is not None and event.code not in (row.get("ranks") or []):
                row["ranks"] = [*(row.get("ranks") or []), event.code]
                mutated = True
            planned.append((entry, adopted))
            continue

        payload = {
            "id": _player_id(entry),
            "name": entry.player_name,
            # REQUIRED on PlayerDTO, and an entry has no school. The event
            # code is the only grouping the entry actually carries, and it
            # is already the value in ranks[] — so the default is a
            # restatement of known data rather than an invention. The
            # matching group row is created below; a player pointing at a
            # group that does not exist is invisible in a roster rendered
            # by group.
            "groupId": event.code,
            "ranks": [event.code],
            "availability": [],
            "sourceEntryId": str(entry.id),
            "entryPlayerId": str(entry.entry_player_id) if entry.entry_player_id else None,
        }
        if entry.remarks:
            payload["remarks"] = entry.remarks
        if not _valid(PlayerDTO, payload, entry):
            skipped.append(SkippedEntry(str(entry.id), SkipReason.INVALID_PLAYER))
            continue

        players.append(payload)
        if event.code not in group_ids:
            groups.append({"id": event.code, "name": event.code})
            group_ids.add(event.code)
        planned.append((entry, payload["id"]))
        mutated = True

    if mutated:
        document["players"] = players
        document["groups"] = groups
    return planned, skipped, mutated


def _rank_vocabulary(document: dict) -> set[str]:
    """The rank codes this workspace has declared, if any.

    Meet expresses divisions through ``PlayerDTO.ranks[]`` and declares the
    set in ``config.rankCounts``. An entry event whose code is absent from
    a *declared* vocabulary is unmappable, and mapping it onto the nearest
    match would be a guess. An **empty or missing** vocabulary declares
    nothing to contradict, so it accepts — refusing there would make the
    seam unusable on a workspace whose configuration has not been filled in
    yet, which is exactly when public entries arrive.
    """
    config = document.get("config")
    counts = config.get("rankCounts") if isinstance(config, dict) else None
    if not isinstance(counts, dict):
        return set()
    return {str(code) for code in counts}


def _valid(model, payload: dict, entry: Entry) -> bool:
    """Whether the roster payload satisfies the DTO the operator app reads.

    Writing a player the DTO rejects would poison the blob: the next
    ``GET /state`` fails validation for everyone, over one entrant's
    over-long remark. Refusing one entry is the smaller failure.
    """
    try:
        model.model_validate(payload)
    except ValidationError:
        log.warning(
            "entries: entry %s does not project onto %s; skipping",
            entry.id,
            model.__name__,
        )
        return False
    return True


# ---- Bracket -------------------------------------------------------------


def _commit_bracket(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
    max_attempts: int,
) -> CommitResult:
    """Participants first-class, roster blob alongside.

    Two destinations, because Bracket keeps them apart: the draw's entrant
    list is ``bracket_participants`` rows, while remarks and the
    availability windows the operator actually edits live in
    ``tournaments.data.bracketPlayers`` (``BracketPlayerDTO``). An entrant
    that landed in only one of them would be either invisible to the draw
    or unreachable from the roster editor, so the seam writes both.

    The blob goes first and under the same CAS contract as the Meet path;
    the participant rows follow, additively, through ``add_participants``.
    """
    session = repo.session
    planned: list[tuple[Entry, str]] = []
    skipped: list[SkippedEntry] = []
    inserts: dict[str, list[dict]] = {}

    for _attempt in range(max_attempts):
        _expire(session)
        row = repo.tournaments.get_by_id(tournament_id)
        if row is None:  # pragma: no cover — resolved by the caller
            raise KeyError(tournament_id)
        seen = row.state_version or 0
        document = copy.deepcopy(row.data or {})

        planned, skipped, inserts, mutated = _plan_bracket(
            repo, tournament_id, document, candidates, events
        )
        if not mutated:
            break

        _expire(session)  # force the CAS's own re-read to hit the database
        try:
            repo.commit_tournament_state(
                tournament_id, document, expected_version=seen
            )
        except _conflict_error_class():
            log.info(
                "entries: state_version conflict on the bracket roster of %s",
                tournament_id,
            )
            continue
        break
    else:
        return CommitResult(
            skipped=skipped
            + [
                SkippedEntry(str(entry.id), SkipReason.STATE_CONFLICT)
                for entry, _ in planned
            ]
        )

    for event_id, participants in inserts.items():
        repo.brackets.add_participants(tournament_id, event_id, participants)

    return CommitResult(
        committed=_write_back_references(session, planned), skipped=skipped
    )


def _bracket_payload(entry: Entry, player_id: str) -> dict:
    """The ``bracketPlayers`` blob row for one PERSON.

    Extracted so the pair branch can ask "would the OTHER half's payload
    validate?" before emitting a team — the loop only ever validates the
    entry it is currently on, and the nominator is processed first.
    ``player_id`` is a parameter because the loop's own id may be an
    adopted one rather than ``_player_id(entry)``.
    """
    payload = {
        "id": player_id,
        "name": entry.player_name,
        "availability": [],
        "sourceEntryId": str(entry.id),
        "entryPlayerId": str(entry.entry_player_id) if entry.entry_player_id else None,
    }
    if entry.remarks:
        payload["remarks"] = entry.remarks
    return payload


def _pair_batch(
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
) -> dict[uuid.UUID, Entry]:
    """Entry id -> its partner entry, for the pairs this run may build.

    R-DM-4(a): a pair is built only from the mutual key the intake chain
    already wrote, never from matching names. That is the whole reason
    this is safe where the incumbent products' name matching is not - and
    it is the same "auto-link what is certain, flag the rest" shape as the
    2026-08-23 minting ruling (see R-DM-4's rationale).

    Every leg of the predicate is a REFUSAL to pair, never a decision to
    un-pair: a candidate that fails any of them commits exactly as it does
    today, as a singleton, and the director pairs it by hand (the ruled
    manual path stays). The legs:

    1. both halves are in THIS run's candidate list - so both are
       ``confirmed`` and neither is on the roster yet;
    2. the link is MUTUAL. It is mutual by write convention only (F-DM-12:
       no FK, nothing detects a half-written link), so the seam checks
       rather than trusts, and logs when it finds one;
    3. both carry ``partner_accepted_at`` - a nomination is not a pair;
    4. the event takes pairs, asked through the backend's ONE answer
       (``partners.is_doubles``, F-DM-13);
    5. both halves sit in the SAME entry event. True by construction
       (``partners.accept()`` copies ``entry_event_id`` onto the half it
       builds) and checked anyway, because the participant list a team is
       inserted into is per bracket event: two halves in different events
       would put one team in two draws.

    The remaining two legs cannot live here. Whether a half's payload
    validates and whether it is already in the draw are both answered
    against per-event state the caller loads lazily inside its loop, so
    they are checked there, before the team is emitted.

    Member order is the nominator first: earlier ``submitted_at``, ``id``
    as the tiebreaker for the same reason ``_candidates`` uses it. Order
    is load-bearing twice over - it fixes ``team_id`` so a re-run is
    idempotent, and it fixes which half's person key the row carries.
    """
    from entries.partners import is_doubles

    by_id = {entry.id: entry for entry in candidates}
    pairs: dict[uuid.UUID, Entry] = {}
    for entry in candidates:
        partner_id = entry.partner_entry_id
        if partner_id is None or entry.id in pairs:
            continue
        partner = by_id.get(partner_id)
        if partner is None:
            continue
        if partner.partner_entry_id != entry.id:
            log.warning(
                "entries: one-directional partner link between %s and %s; "
                "committing both as singletons (F-DM-12)",
                entry.id,
                partner_id,
            )
            continue
        if entry.partner_accepted_at is None or partner.partner_accepted_at is None:
            continue
        if partner.entry_event_id != entry.entry_event_id:
            continue
        event = events.get(entry.entry_event_id)
        if event is None or not is_doubles(event):
            continue
        first, second = sorted(
            (entry, partner), key=lambda e: (e.submitted_at, e.id)
        )
        pairs[first.id] = second
        pairs[second.id] = first
    return pairs


def _plan_bracket(
    repo: LocalRepository,
    tournament_id: uuid.UUID,
    document: dict,
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
) -> tuple[list[tuple[Entry, str]], list[SkippedEntry], dict[str, list[dict]], bool]:
    roster = list(document.get("bracketPlayers") or [])
    planned: list[tuple[Entry, str]] = []
    skipped: list[SkippedEntry] = []
    inserts: dict[str, list[dict]] = {}
    existing_ids: dict[str, set[str]] = {}
    pairs = _pair_batch(candidates, events)
    mutated = False

    for entry in candidates:
        event = events.get(entry.entry_event_id)
        if event is None or not event.bracket_event_id:
            skipped.append(SkippedEntry(str(entry.id), SkipReason.UNMAPPABLE_EVENT))
            continue
        draw = repo.brackets.get_event(tournament_id, event.bracket_event_id)
        if draw is None:
            # A dangling pointer: ``entry_events.bracket_event_id`` carries
            # no FK on purpose (a composite FK would have to cascade, so
            # rebuilding a draw would delete the entry configuration and
            # every entry under it). The spec already makes an unmappable
            # event a reported skip, so the dangling case is handled, not
            # exceptional.
            skipped.append(SkippedEntry(str(entry.id), SkipReason.UNMAPPABLE_EVENT))
            continue
        if (draw.status or "draft") in _LOCKED_DRAW_STATUSES:
            skipped.append(SkippedEntry(str(entry.id), SkipReason.DRAW_NOT_EDITABLE))
            continue

        adopted = _adoptable(roster, entry)
        participant_id = adopted or _player_id(entry)

        if event.bracket_event_id not in existing_ids:
            existing_ids[event.bracket_event_id] = {
                p.id
                for p in repo.brackets.list_participants(
                    tournament_id, event.bracket_event_id
                )
            }

        payload = _bracket_payload(entry, participant_id)
        if not _valid(BracketPlayerDTO, payload, entry):
            skipped.append(SkippedEntry(str(entry.id), SkipReason.INVALID_PLAYER))
            continue

        if adopted is None:
            roster.append(payload)
            mutated = True

        in_draw = existing_ids[event.bracket_event_id]
        partner = pairs.get(entry.id)
        if partner is not None:
            partner_seat = _adoptable(roster, partner) or _player_id(partner)
            if not (
                # Leg 6: BOTH payloads must project onto the roster DTO. The
                # loop validates one entry at a time and the nominator runs
                # first, so without this the team could name a member whose
                # own iteration is about to be skipped.
                _valid(BracketPlayerDTO, _bracket_payload(partner, partner_seat), partner)
                # Leg 7: neither half may already be in this draw. A
                # hand-added PLAYER row for one of them is the director's, and
                # removing it to make room for a team is not the seam's call
                # (I4).
                and participant_id not in in_draw
                and partner_seat not in in_draw
            ):
                partner = None  # fall through to the singleton insert

        if partner is not None:
            # R-DM-4(a): ONE participant for the pair. The roster blob
            # above still carries both humans - remarks and availability
            # are per-person - so this is the only place the two collapse.
            members = sorted(
                (entry, partner), key=lambda e: (e.submitted_at, e.id)
            )
            person_ids = tuple(m.entry_player_id or m.id for m in members)
            insert = {
                "id": team_id(person_ids),
                "name": team_name(members[0].player_name, members[1].player_name),
                "type": "TEAM",
                # ``roster_id`` of each person, which is what the roster
                # blob keys its rows by and what the console's own
                # hand-built teams put here. Both person keys are therefore
                # recoverable from this list, which is why the row carrying
                # only members[0]'s typed key (P4's ruled shape) loses
                # nothing.
                "member_ids": [roster_id(pid) for pid in person_ids],
                "entry_player_id": members[0].entry_player_id,
                "seed": None,
                "meta": {
                    "sourceEntryId": str(members[0].id),
                    "partnerSourceEntryId": str(members[1].id),
                },
            }
        else:
            insert = {
                "id": participant_id,
                "name": entry.player_name,
                "type": "PLAYER",
                "member_ids": [],
                # R-DM-2(a): the constrained half of the link. ``id``
                # above is still the ``entry-{uuid}`` string and stays
                # the PK (R-DM-7(a) — no re-key); this is the key
                # anything joining a draw appearance to a human should
                # use from now on.
                "entry_player_id": entry.entry_player_id,
                "seed": None,
                "meta": {"sourceEntryId": str(entry.id)},
            }
        # Keyed on the INSERT's id, so the pair's second half is a no-op on
        # this run and the whole pair a no-op on the next one.
        if insert["id"] not in in_draw:
            inserts.setdefault(event.bracket_event_id, []).append(insert)
            in_draw.add(insert["id"])
        # The back-reference is to this person's own roster row, never to
        # the team: both halves keep their own.
        planned.append((entry, participant_id))

    if mutated:
        document["bracketPlayers"] = roster
    return planned, skipped, inserts, mutated
