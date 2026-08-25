"""Public spectator display — capability-token projection (SP-CLOUD-2).

Rule 8 made deliberate: the display link is a real capability URL. The
public ``/display/{token}/*`` routes are the ONLY unauthenticated data
plane in the app, and they serve a *projection* — exactly the fields
the board renders, never the raw state blob (which carries operator
material like the schedule-history revert pool).

Properties the isolation/Rule-8 tests pin:
- token resolution is the only lookup — a raw tournament UUID is never
  accepted here, so workspaces can't be enumerated;
- an invalid/rotated token answers the uniform 404;
- every route is GET; the token grants no mutation anywhere.

Owner-side management (mint / rotate) lives on the authenticated
``/tournaments/{tournament_id}/display-token`` routes below.
"""
from __future__ import annotations

import secrets
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel, Field

from operations.match_state_routes import MatchStateDTO, _row_to_dto
from bracket.brackets import TournamentOut, _hydrate_session, _serialize_session
from core.dependencies import require_tournament_access
from core.error_codes import ErrorCode, http_error
from core.schemas import MeetStandingRowDTO
from db.models import (
    DisplayToken,
    Tournament,
    WorkspaceModule,
    derive_modules,
)
from repositories import LocalRepository, get_repository

public_router = APIRouter(prefix="/display", tags=["display-public"])
manage_router = APIRouter(
    prefix="/tournaments/{tournament_id}/display-token", tags=["display-manage"]
)

_OWNER = Depends(require_tournament_access("owner"))


# ---- Token management (authenticated) --------------------------------


class DisplayTokenDTO(BaseModel):
    token: str
    url: str


def _mint_token() -> str:
    return secrets.token_urlsafe(24)


def _token_dto(token: str) -> DisplayTokenDTO:
    return DisplayTokenDTO(token=token, url=f"/display?token={token}")


@manage_router.get("", response_model=DisplayTokenDTO, dependencies=[_OWNER])
def get_or_create_display_token(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> DisplayTokenDTO:
    """The workspace's display link, minted on first ask."""
    row = repo.session.get(DisplayToken, tournament_id)
    if row is None:
        row = DisplayToken(tournament_id=tournament_id, token=_mint_token())
        repo.session.add(row)
        repo.session.commit()
    return _token_dto(row.token)


@manage_router.post("/rotate", response_model=DisplayTokenDTO, dependencies=[_OWNER])
def rotate_display_token(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> DisplayTokenDTO:
    """Revoke-by-rotation: the old link dies the moment this returns."""
    row = repo.session.get(DisplayToken, tournament_id)
    if row is None:
        row = DisplayToken(tournament_id=tournament_id, token=_mint_token())
        repo.session.add(row)
    else:
        row.token = _mint_token()
    repo.session.commit()
    return _token_dto(row.token)


# ---- Public projection routes ----------------------------------------


def _resolve(repo: LocalRepository, token: str) -> Tournament:
    row = (
        repo.session.query(DisplayToken).filter(DisplayToken.token == token).first()
        if token
        else None
    )
    tournament = (
        repo.tournaments.get_by_id(row.tournament_id) if row is not None else None
    )
    if tournament is None:
        raise http_error(
            404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found"
        )
    return tournament


class DisplaySummaryDTO(BaseModel):
    """``kind`` is the BOARD kind — which engine(s) the display renders —
    not the workspace's legacy ``kind`` column. ``meet`` | ``bracket`` |
    ``hybrid``."""

    kind: str
    name: Optional[str] = None


def _board_kind(t: Tournament, repo: LocalRepository) -> str:
    """Which board(s) this workspace has, keyed off ENABLED MODULES.

    The legacy ``kind`` column is fixed at create time and names exactly one
    engine, so reading it made a workspace running both modules — a supported
    state; ``derive_modules`` seeds the foreign operator as ``available`` and
    the control plane promotes it — structurally unable to show half of
    itself on the board.

    Read-only on purpose: this is the unauthenticated data plane, so it must
    not trigger the write-on-read module seed (``modules.ensure_modules``). A
    workspace whose rows aren't seeded yet falls back to the very derivation
    that seed would have written.
    """
    rows = (
        repo.session.query(WorkspaceModule)
        .filter(WorkspaceModule.tournament_id == t.id)
        .all()
    )
    statuses = {r.module_id: r.status for r in rows} or derive_modules(t.kind)
    meet = statuses.get("meet") == "enabled"
    bracket = statuses.get("bracket") == "enabled"
    if meet and bracket:
        return "hybrid"
    if bracket:
        return "bracket"
    return "meet"


@public_router.get("/{token}/summary", response_model=DisplaySummaryDTO)
def display_summary(
    token: str,
    repo: LocalRepository = Depends(get_repository),
) -> DisplaySummaryDTO:
    t = _resolve(repo, token)
    return DisplaySummaryDTO(kind=_board_kind(t, repo), name=t.name)


class DisplayStateDTO(BaseModel):
    """The meet board's projection of the workspace state blob (F-DM-30).

    Until SP-DM-3 P1 this route had NO ``response_model``: the one
    unauthenticated data plane in the product was the one with no declared
    shape, and its allow-list was a Python tuple with a prose comment naming
    its TS consumer. This class IS that allow-list now, and
    ``tests/backend/test_display_public.py`` pins its key set exactly.

    Notably ABSENT vs the raw blob, and deliberately: ``scheduleHistory``
    (the operator revert pool), ``scheduleVersion``, ``bracketPlayers``,
    ``planFinalized``.

    ponytail: the five pass-through fields are typed ``Any``, not with their
    real DTOs. Ceiling named: this is the public plane reading a blob that
    predates the strict DTOs, so validating it through ``TournamentConfig`` /
    ``PlayerDTO`` / ... (all ``StrictModel``, ``extra="forbid"``) would turn a
    legacy key into a 500 on a screen in a public hall, or — worse, with
    ``extra="ignore"`` — silently DROP keys the board renders. Upgrade path:
    tighten one field at a time behind P2's blob versioning, each with its own
    key-set test. What P1 buys is the KEY SET being declared, which is what
    F-DM-30 is about.
    """

    config: Any = None
    groups: Any = None
    players: Any = None
    matches: Any = None
    schedule: Any = None
    scheduleIsStale: Any = None
    standings: List[MeetStandingRowDTO] = Field(default_factory=list)


# The exact field set the meet board consumes (useDisplaySync.ts) — read off
# the response model so the projection and its declaration cannot drift.
# ``standings`` is excluded: it is computed, not copied from the blob.
_MEET_PROJECTION_FIELDS = tuple(
    f for f in DisplayStateDTO.model_fields if f != "standings"
)


@public_router.get(
    "/{token}/state",
    response_model=DisplayStateDTO,
    # The projection copies a key only when the blob HAS it
    # (``if k in t.data``), and the board distinguishes an absent key from a
    # null one. ``exclude_unset`` is what keeps that true through the
    # response model: a dict validated into the model marks exactly the keys
    # it carried as "set", so the wire key set is byte-for-byte what it was
    # before P1 — which the key-set test above is there to prove.
    response_model_exclude_unset=True,
)
def display_state(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    t = _resolve(repo, token)
    if not t.data:
        return Response(status_code=204)
    from workspaces.tournaments import _meet_standings_for
    from bracket import response_cache

    # SEC-13: this is the only unauthenticated data plane, and it recomputed
    # Meet standings plus a match_states query on EVERY request with no
    # cache — unlike /bracket, which has had one all along. A display link is
    # a capability URL projected onto a screen in a public hall, so anyone
    # holding one could drive that rebuild as fast as they liked. The edge
    # rate limit (nginx zone sw_display) bounds request volume; this bounds
    # the cost of each one.
    #
    # Same bounded-staleness contract as the bracket cache: a missed
    # invalidation is at most TTL_SECONDS stale and self-heals, never
    # permanently wrong. The board polls on a multi-second cadence, so the
    # TTL is below the poll period and adds no perceptible latency.
    cached = response_cache.get(t.id, response_cache.DISPLAY_STATE)
    if cached is not None:
        return cached

    payload = {k: t.data.get(k) for k in _MEET_PROJECTION_FIELDS if k in t.data}
    payload["standings"] = [s.model_dump() for s in _meet_standings_for(t, repo)]
    response_cache.put(t.id, payload, response_cache.DISPLAY_STATE)
    return payload


@public_router.get("/{token}/match-states", response_model=Dict[str, MatchStateDTO])
def display_match_states(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    t = _resolve(repo, token)
    rows = repo.match_states.list_for_tournament(t.id)
    return {row.match_id: _row_to_dto(row) for row in rows}


@public_router.get("/{token}/bracket", response_model=TournamentOut)
def display_bracket(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Bracket board read — same serialized session the viewer-gated
    ``GET /bracket`` returns (it is already a projection DTO with no
    operator-only material), served through the short-TTL cache.

    ``response_model`` is ``TournamentOut`` — the exact type
    ``_serialize_session`` already returns (F-DM-30: the route was untyped,
    not un-shaped). Declaring it changes no key; it puts the shape in the
    OpenAPI document, which is what the generated types and the parity
    oracle read.
    """
    t = _resolve(repo, token)
    from bracket import response_cache

    cached = response_cache.get(t.id)
    if cached is not None:
        return cached
    session = _hydrate_session(repo, t.id)
    if session is None:
        raise http_error(
            404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found"
        )
    payload = _serialize_session(session)
    response_cache.put(t.id, payload)
    return payload
