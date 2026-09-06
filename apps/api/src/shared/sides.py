"""The structured-side wire contract — package 10a (v3 consolidated plan).

Mirrors ``entries/entries_site.py::PersonReferenceDTO`` in shape (an ``id`` +
``name`` reference plus an explicit "why is this not a resolved name" union),
but is a SEPARATE module: the operator wire has no publication gate, and
``shared/`` may not import a domain package (``entries``) per the API's
import-linter contracts. If the two shapes ever need to converge, that is a
decision for whichever package owns publication next — not an import.

``SideDTO`` is the discriminated model the match-card contract
(docs/reference/contracts/match-card.md §2.1) calls ``Side``: 0..n resolved
persons plus an optional ``unresolved`` reason, not mutually exclusive with
``persons`` (a doubles side with one confirmed member is
``persons=[A], unresolved=pending_member(known=[A], missing=1)``).

Coverage note (debt, see docs/reference/debt-log.md): the bracket engine
persists only the COMPOSITE team name for a doubles participant
(``entries.py::team_name``, e.g. "Ana Silva / Ben Ito") — individual member
NAMES are not stored anywhere in ``bracket_participants`` today, only member
IDS (``BracketParticipant.member_ids``). ``build_bracket_side`` therefore
emits a bracket doubles pair as ONE ``PersonRefDTO`` carrying the composite
name, not two stacked entries — true one-line-per-partner stacking for a
BRACKET doubles side needs a schema change to persist per-member names and is
out of package 10's scope. The MEET engine has no such gap: its wire already
carries individual player ids the console resolves against the roster, so a
meet doubles side gets full per-person fidelity from the console-side
formatter alone (`platform/domain/sides.ts`), no backend change needed.

Likewise, ``pending_member`` (an incomplete doubles pair) is not emitted by
``build_bracket_side`` today: the bracket wire has no signal that a
participant is a KNOWN-INCOMPLETE pair (as opposed to simply unseeded or a
bye) — that distinction is not modelled anywhere upstream. Logged as debt;
the discriminated union already reserves the ``pending_member`` kind so a
future package can populate it without a second wire change.
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


class SideDTO(BaseModel):
    """One side of a match — the operator-wire twin of the public ``Side``.

    ``persons`` and ``unresolved`` are NOT mutually exclusive (match-card
    contract §2.1): a partially-known doubles side would carry both, once a
    future package can populate ``pending_member`` (see module docstring).
    """

    persons: List[PersonRefDTO] = Field(default_factory=list)
    unresolved: Optional[UnresolvedSideDTO] = None
    seed: Optional[int] = None
    participantKey: Optional[str] = None


def bye_side() -> SideDTO:
    return SideDTO(unresolved=UnresolvedSideDTO(kind="bye"))


def undetermined_side() -> SideDTO:
    return SideDTO(unresolved=UnresolvedSideDTO(kind="undetermined"))


def winner_of_side(play_unit_id: str, *, loser: bool = False) -> SideDTO:
    return SideDTO(
        unresolved=UnresolvedSideDTO(
            kind="loser_of" if loser else "winner_of",
            reference=play_unit_id,
        )
    )


def resolved_side(
    *, id: Optional[str], name: str, seed: Optional[int] = None
) -> SideDTO:
    return SideDTO(
        persons=[PersonRefDTO(id=id, name=name)],
        seed=seed,
        participantKey=id,
    )
