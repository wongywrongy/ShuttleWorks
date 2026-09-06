"""The structured-side wire contract — package 10a (v3 consolidated plan).

Mirrors ``entries/entries_site.py::PersonReferenceDTO`` in shape (an ``id`` +
``name`` reference plus an explicit "why is this not a resolved name" union),
but is a SEPARATE module: the operator wire has no publication gate, and
``shared/`` may not import a domain package (``entries``) per the API's
import-linter contracts. If the two shapes ever need to converge, that is a
decision for whichever package owns publication next — not an import.

``MatchSideDTO`` is the discriminated model the match-card contract
(docs/reference/contracts/match-card.md §2.1) calls ``Side``: 0..n resolved
persons plus an optional ``unresolved`` reason, not mutually exclusive with
``persons`` (a doubles side with one confirmed member is
``persons=[A], unresolved=pending_member(known=[A], missing=1)``).

Per-member resolution (package 29, retiring V3-10-1). ``bracket_participants``
stores only the COMPOSITE team name for a doubles participant
(``entries.py::team_name``, e.g. "Ana Silva / Ben Ito"), but it also stores
``member_ids`` — the roster ids of the two humans, written by the entries
seam for a seam-built pair and by ``ParticipantPicker`` for a hand-entered
one. ``roster_display_names`` reads the SAME roster blob (the workspace ``data``
document's ``bracketPlayers`` list) the public tier already resolves pairs
through (``entries_site.py::_bracket_roster_names``), so a bracket doubles
pair now emits TWO ``PersonRefDTO`` entries with no schema change, no
``entry-{uuid}`` decode and no cross-domain import: the resolver lives here,
in the kernel, and both ``bracket`` and ``entries`` may import it. Where a
member id has no roster row the composite name is still the only honest
label and is emitted as one ``PersonRefDTO``, exactly as before.

``pending_member`` (package 29, retiring V3-10-2) is emitted from two
structural signals, never inferred from a name:

* a TEAM participant carrying exactly ONE member id — a pair slot with a
  member missing outright; and
* an ENTRY-BACKED PLAYER participant in a doubles draw — the entries seam
  drops an entrant whose partner invite is not accepted into the draw as a
  singleton for the director to pair by hand (``entries.py::_pair_batch``
  leg 3: "both carry ``partner_accepted_at`` - a nomination is not a pair"),
  so a lone entry-backed person in an MD/WD/XD draw IS a side one player
  short. An imported or hand-added PLAYER row is deliberately excluded: a
  historical importer may legitimately store a whole pair under one PLAYER
  name, and claiming "partner to be confirmed" over it would be a false
  statement about someone else's draw.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

UnresolvedKind = Literal[
    "bye",
    "pending_member",
    "winner_of",
    "loser_of",
    "withheld",
    "undetermined",
]


class PersonRefDTO(BaseModel):
    """One resolved (or dead) person reference on the operator wire.

    Unlike the public ``PersonReferenceDTO`` there is no publication gate
    here — the operator always sees the stored name. ``id`` is the
    roster/participant key the side's ``participantKey`` also carries;
    it is optional because a legacy or hand-entered name may have none.
    """

    id: Optional[str] = None
    name: str


class UnresolvedSideDTO(BaseModel):
    """Why a side has no (or an incomplete) resolved person.

    One flat model rather than six ``kind``-tagged classes: the frontend
    switches on ``kind`` exactly as the match-card contract's
    ``UnresolvedSide`` union describes, and Pydantic serializes the unused
    fields as absent (they carry ``None``/empty defaults), so the wire shape
    for each kind matches the union member the contract names.

    ``reference`` (for ``winner_of`` / ``loser_of``) is the RAW machine id of
    the feeder play unit, not a formatted human reference — the console's
    ``matchIdentity.ts`` / ``bracketLabels.ts`` stay the one authority for
    that spelling (state-and-formatting §6.3, D16) and resolve this id to
    "Winner of QF1" themselves, exactly as they already do for
    ``slot.feeder_play_unit_id`` today.
    """

    kind: UnresolvedKind
    known: List[PersonRefDTO] = Field(default_factory=list)
    missing: int = 0
    reference: Optional[str] = None


class MatchSideDTO(BaseModel):
    """One side of a match — the operator-wire twin of the public ``Side``.

    ``persons`` and ``unresolved`` are NOT mutually exclusive (match-card
    contract §2.1): a partially-known doubles side carries both — see
    ``team_side`` and the ``pending_member`` note in the module docstring.
    """

    persons: List[PersonRefDTO] = Field(default_factory=list)
    unresolved: Optional[UnresolvedSideDTO] = None
    seed: Optional[int] = None
    participantKey: Optional[str] = None


def bye_side() -> MatchSideDTO:
    return MatchSideDTO(unresolved=UnresolvedSideDTO(kind="bye"))


def undetermined_side() -> MatchSideDTO:
    return MatchSideDTO(unresolved=UnresolvedSideDTO(kind="undetermined"))


def winner_of_side(play_unit_id: str, *, loser: bool = False) -> MatchSideDTO:
    return MatchSideDTO(
        unresolved=UnresolvedSideDTO(
            kind="loser_of" if loser else "winner_of",
            reference=play_unit_id,
        )
    )


def resolved_side(
    *, id: Optional[str], name: str, seed: Optional[int] = None
) -> MatchSideDTO:
    return MatchSideDTO(
        persons=[PersonRefDTO(id=id, name=name)],
        seed=seed,
        participantKey=id,
    )


def team_side(
    persons: List[PersonRefDTO],
    *,
    seed: Optional[int] = None,
    participant_key: Optional[str] = None,
    missing: int = 0,
) -> MatchSideDTO:
    """A side of one or more resolved persons, optionally one short.

    ``missing > 0`` attaches the ``pending_member`` reason WITHOUT removing
    the known persons — match-card §2.1's "not mutually exclusive" rule, and
    the only shape that lets a renderer print the known name *and* "partner
    to be confirmed" without inventing a second person.
    """
    unresolved = (
        UnresolvedSideDTO(kind="pending_member", known=list(persons), missing=missing)
        if missing > 0
        else None
    )
    return MatchSideDTO(
        persons=list(persons),
        unresolved=unresolved,
        seed=seed,
        participantKey=participant_key,
    )


# ---------------------------------------------------------------------------
# Roster-name resolution and the pair-discipline test.
#
# Both live in the kernel deliberately: ``bracket`` and ``entries`` each need
# them and neither may import the other (the API's per-domain-independence
# import contracts). Neither reads a table — they take the caller's already
# loaded workspace ``data`` document and a plain discipline code.
# ---------------------------------------------------------------------------

#: Draws whose participants are PAIRS: the three canonical doubles codes
#: plus the two junior spellings the meet side uses (``BD``/``GD``).
PAIR_DISCIPLINES = frozenset({"MD", "WD", "XD", "BD", "GD"})


def is_pair_discipline(discipline: Optional[str], event_id: Optional[str] = None) -> bool:
    """True when a draw's participants are pairs rather than individuals.

    Mirrors ``entries_site.py::_event_public_code``'s fallback: bracket event
    ids are operator-owned and a draw's discipline is sometimes only legible
    from the id's trailing code (``T027-MD``). Anything else — a free-text
    discipline, ``GEN`` — is NOT a pair draw, because guessing one would put
    "partner to be confirmed" under a singles player's name.
    """
    if isinstance(discipline, str) and discipline.strip().upper() in PAIR_DISCIPLINES:
        return True
    if isinstance(event_id, str) and event_id:
        return event_id.rsplit("-", 1)[-1].strip().upper() in PAIR_DISCIPLINES
    return False


def roster_display_names(data_blob: Optional[dict]) -> dict:
    """Bracket-roster id → display name, from the workspace ``data`` blob.

    The one sound way to recover two individual names from a pair: the
    participant's ``member_ids`` are roster ids and this is the roster.
    Splitting the composite team label on ``' / '`` corrupts real names and
    invents identity structure (D15) — that round trip is deleted, not
    standardised. Malformed or unnamed rows stay ABSENT rather than leaking
    an id as though it were a name.

    Twin of ``entries_site.py::_bracket_roster_names``, which applies the
    public tier's extra privacy gates on top of the same blob.
    """
    out: dict = {}
    for row in (data_blob or {}).get("bracketPlayers") or []:
        if not isinstance(row, dict):
            continue
        key, name = row.get("id"), row.get("name")
        if isinstance(key, str) and key and isinstance(name, str) and name.strip():
            out[key] = name.strip()
    return out
