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
from typing import Dict, Optional

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel

from api.match_state import MatchStateDTO, _row_to_dto
from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from database.models import DisplayToken, Tournament
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
    kind: str
    name: Optional[str] = None


@public_router.get("/{token}/summary", response_model=DisplaySummaryDTO)
def display_summary(
    token: str,
    repo: LocalRepository = Depends(get_repository),
) -> DisplaySummaryDTO:
    t = _resolve(repo, token)
    return DisplaySummaryDTO(kind=t.kind, name=t.name)


# The exact field set the meet board consumes (useDisplaySync.ts) —
# nothing more. Notably ABSENT vs the raw blob: scheduleHistory (the
# operator revert pool), scheduleVersion, bracketPlayers, planFinalized.
_MEET_PROJECTION_FIELDS = (
    "config",
    "groups",
    "players",
    "matches",
    "schedule",
    "scheduleIsStale",
)


@public_router.get("/{token}/state")
def display_state(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    t = _resolve(repo, token)
    if not t.data:
        return Response(status_code=204)
    from api.tournaments import _meet_standings_for

    payload = {k: t.data.get(k) for k in _MEET_PROJECTION_FIELDS if k in t.data}
    payload["standings"] = [s.model_dump() for s in _meet_standings_for(t, repo)]
    return payload


@public_router.get("/{token}/match-states", response_model=Dict[str, MatchStateDTO])
def display_match_states(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    t = _resolve(repo, token)
    rows = repo.match_states.list_for_tournament(t.id)
    return {row.match_id: _row_to_dto(row) for row in rows}


@public_router.get("/{token}/bracket")
def display_bracket(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Bracket board read — same serialized session the viewer-gated
    ``GET /bracket`` returns (it is already a projection DTO with no
    operator-only material), served through the short-TTL cache."""
    t = _resolve(repo, token)
    from api.brackets import _hydrate_session, _serialize_session
    from services.bracket import response_cache

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
