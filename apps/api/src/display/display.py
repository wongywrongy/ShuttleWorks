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
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel, Field

from bracket.brackets import _hydrate_session, _serialize_session
from core.dependencies import require_tournament_access
from core.error_codes import ErrorCode, http_error
from core.limits import HexColor
from core.schemas import MeetStandingRowDTO
from display.projection import (
    DisplayConfigDTO, DisplayGroupDTO, DisplayPlayerDTO, DisplayMatchDTO,
    DisplayScheduleDTO, DisplayBracketDTO,
)
from db.models import (
    MatchState,
    Tournament,
    derive_modules,
)
from repositories import LocalRepository, get_repository
from shared.match_vocabulary import canonical_to_legacy, legacy_to_canonical

public_router = APIRouter(prefix="/display", tags=["display-public"])
manage_router = APIRouter(
    prefix="/tournaments/{tournament_id}/display-token", tags=["display-manage"]
)
board_router = APIRouter(
    prefix="/tournaments/{tournament_id}/board-settings", tags=["display-manage"]
)

_OWNER = Depends(require_tournament_access("owner"))
_VIEWER = Depends(require_tournament_access("viewer"))
_OPERATOR = Depends(require_tournament_access("operator"))


# ---- Venue-board settings --------------------------------------------

#: Ceiling on a stored image source. Board branding is deliberately allowed
#: to be an inline ``data:`` URI — that is what makes a logo survive a venue
#: with no internet and the app's own ``img-src 'self' data: blob:`` CSP —
#: so the cap has to admit a real (downscaled) image rather than a URL. The
#: console downscales before it uploads; this is the backstop.
MAX_BOARD_IMAGE_CHARS = 300_000


class BoardSettingsDTO(BaseModel):
    """What the venue board LOOKS like and WHICH optional content it carries.

    Stored on ``tournaments.board_settings`` (one JSON column, this DTO's
    ``model_dump``) rather than in the state blob, and read by BOTH boards —
    meet, bracket and hybrid — plus the public token projection. That is the
    reason it is not another ``tvXxx`` field on ``TournamentConfig``: the
    bracket board never reads the meet config, and ``showNext`` has to mean
    the same thing on every board (operator-visual-fixes P4; match-card
    contract §4.4).

    ``showNext`` defaults to **False**: the venue board's job is to say what
    is happening on a court now, and a "next" preview is opt-in.
    """

    title: Optional[str] = Field(default=None, max_length=120)
    logoUrl: Optional[str] = Field(default=None, max_length=MAX_BOARD_IMAGE_CHARS)
    bannerUrl: Optional[str] = Field(default=None, max_length=MAX_BOARD_IMAGE_CHARS)
    accent: Optional[HexColor] = None
    showNext: bool = False
    showScores: bool = True


def _board_settings(t: Tournament) -> BoardSettingsDTO:
    """Stored settings, or the board's defaults for a workspace that has
    never opened the appearance controls. Unknown/legacy keys are ignored
    rather than 500-ing a screen in a public hall."""
    stored = t.board_settings or {}
    known = {k: v for k, v in stored.items() if k in BoardSettingsDTO.model_fields}
    try:
        return BoardSettingsDTO(**known)
    except Exception:  # pragma: no cover - defensive; a bad stored blob
        return BoardSettingsDTO()


@board_router.get("", response_model=BoardSettingsDTO, dependencies=[_VIEWER])
def get_board_settings(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> BoardSettingsDTO:
    t = repo.tournaments.get_by_id(tournament_id)
    if t is None:
        raise http_error(404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found")
    return _board_settings(t)


@board_router.put("", response_model=BoardSettingsDTO, dependencies=[_OPERATOR])
def put_board_settings(
    body: BoardSettingsDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> BoardSettingsDTO:
    """Replace the board settings wholesale. Small, self-contained document —
    a merge would need a per-field "unset" sentinel to clear a logo."""
    stored = repo.set_board_settings(tournament_id, body.model_dump(mode="json"))
    if stored is None:
        raise http_error(404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found")
    return body


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
    token = repo.get_or_create_display_token(tournament_id, _mint_token())
    return _token_dto(token)


@manage_router.post("/rotate", response_model=DisplayTokenDTO, dependencies=[_OWNER])
def rotate_display_token(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
) -> DisplayTokenDTO:
    """Revoke-by-rotation: the old link dies the moment this returns."""
    token = repo.rotate_display_token(tournament_id, _mint_token())
    return _token_dto(token)


# ---- Public projection routes ----------------------------------------


def _resolve(repo: LocalRepository, token: str) -> Tournament:
    tournament = repo.get_tournament_by_display_token(token)
    if tournament is None:
        raise http_error(
            404, ErrorCode.TOURNAMENT_NOT_FOUND, "Tournament not found"
        )
    return tournament


class DisplaySummaryDTO(BaseModel):
    """``kind`` is the BOARD kind — which engine(s) the display renders —
    not the workspace's legacy ``kind`` column. ``meet`` | ``bracket`` |
    ``hybrid``.

    ``timeZone`` is the workspace's IANA venue zone, carried here so the
    board's clock is the TOURNAMENT's clock. Until operator-visual-fixes P4
    no timezone reached the board's wire at all and both boards hardcoded
    UTC (match-card contract §4.4: "timezone is data, not a constant"). It
    is ``None`` when the workspace has no usable zone, and the board then
    omits the clock rather than inventing one.

    ``board`` is the venue-board settings document — see ``BoardSettingsDTO``.
    Branding is public by construction: it is what is projected on the wall.
    """

    kind: str
    name: Optional[str] = None
    timeZone: Optional[str] = None
    board: BoardSettingsDTO = Field(default_factory=BoardSettingsDTO)


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
    statuses = repo.get_workspace_module_statuses(t.id) or derive_modules(t.kind)
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
    # A blank/whitespace zone is "unavailable", not "UTC": the column
    # defaults to UTC for legacy rows, and a real UTC venue is a real
    # answer, so only an EMPTY value is treated as missing.
    zone = (t.time_zone or "").strip() or None
    return DisplaySummaryDTO(
        kind=_board_kind(t, repo),
        name=t.name,
        timeZone=zone,
        board=_board_settings(t),
    )


class DisplayStateDTO(BaseModel):
    """Public fields only, including every nested member of the stored blob."""

    config: Optional[DisplayConfigDTO] = None
    groups: Optional[List[DisplayGroupDTO]] = None
    players: Optional[List[DisplayPlayerDTO]] = None
    matches: Optional[List[DisplayMatchDTO]] = None
    schedule: Optional[DisplayScheduleDTO] = None
    scheduleIsStale: Optional[bool] = None
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
    # (``if k in t.data``). ``exclude_unset`` keeps that true through the
    # response model: a dict validated into the model marks exactly the
    # keys it carried as "set", so the wire key set is byte-for-byte what
    # it was before P1 gave this route a response_model - which the
    # key-set test above proves.
    #
    # This is conservatism about the wire, NOT a contract with the board:
    # the console's own consumer null-coalesces every field it reads
    # (``useDisplaySync.ts`` - ``remote.config ?? null`` and friends), so
    # it cannot tell an absent key from a null one. An earlier version of
    # this comment claimed it could. Other consumers of a public capability
    # URL are not enumerable, which is the real reason not to widen the
    # payload here.
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


class DisplayMatchScoreDTO(BaseModel):
    sideA: int
    sideB: int


class DisplayMatchStateDTO(BaseModel):
    """The board's own ``/match-states`` wire shape (D4).

    This used to be ``operations.match_state_routes.MatchStateDTO`` verbatim
    — including that DTO's four-value ``MatchStateStatusLiteral``
    (``scheduled | called | started | finished``) and its
    ``coerce_unknown_status`` validator, which silently maps anything else,
    ``retired`` included, to ``scheduled``. That vocabulary belongs to the
    PUT route's legacy wire input; it is not total over the canonical match
    states (``db.models.MatchStatus``) and this public projection must not
    repeat the drop. This DTO's ``status`` is instead exactly
    ``shared.match_vocabulary.CANONICAL_TO_LEGACY``'s value set — bidirectional
    and total, ``retired`` included — so a retired match reads as *Retired*
    on the board rather than reappearing as *Scheduled*.
    """

    matchId: str
    status: Literal["scheduled", "called", "started", "finished", "retired"]
    calledAt: Optional[str] = None
    actualStartTime: Optional[str] = None
    actualEndTime: Optional[str] = None
    score: Optional[DisplayMatchScoreDTO] = None
    updatedAt: Optional[str] = None
    originalSlotId: Optional[int] = None
    originalCourtId: Optional[int] = None


def _display_status_word(raw: str) -> str:
    """Round-trip a stored ``match_states.status`` string through the
    canonical vocabulary so the wire word is always one this authority
    recognises — total and bidirectional, unlike the coercion this route
    used to inherit. A truly unrecognised value falls back to ``scheduled``,
    the same fallback the previous DTO used for garbage input; that fallback
    is not the D4 defect — dropping a *known* canonical value (``retired``)
    was."""
    try:
        canonical = legacy_to_canonical(raw)
    except KeyError:
        return "scheduled"
    return canonical_to_legacy(canonical)


def _display_score(row: MatchState) -> Optional[DisplayMatchScoreDTO]:
    """The AUTHORIZED score for the public board, or ``None``.

    match-card contract §4.4: "a synthesised score where none is published
    (absent scores are not zero)". The score editor seeds blank games as
    ``0``, so an operator who opens it on a running match and closes it
    without typing leaves a stored ``0 / 0`` that is not a result — and the
    board rendered it as a real "0–0" on the wall. A zero-zero pair on a
    match that has not FINISHED is therefore read as "nothing recorded yet"
    and omitted; on a finished match 0–0 is a recorded (if unusual) outcome
    and is published unchanged.
    """
    if row.score_side_a is None or row.score_side_b is None:
        return None
    if (
        row.score_side_a == 0
        and row.score_side_b == 0
        and _display_status_word(row.status) != "finished"
    ):
        return None
    return DisplayMatchScoreDTO(sideA=row.score_side_a, sideB=row.score_side_b)


def _row_to_display_state(row: MatchState) -> DisplayMatchStateDTO:
    score = _display_score(row)
    return DisplayMatchStateDTO(
        matchId=row.match_id,
        status=_display_status_word(row.status),
        calledAt=row.called_at,
        actualStartTime=row.actual_start_time,
        actualEndTime=row.actual_end_time,
        score=score,
        updatedAt=row.updated_at.isoformat() if row.updated_at else None,
        originalSlotId=row.original_slot_id,
        originalCourtId=row.original_court_id,
    )


@public_router.get(
    "/{token}/match-states", response_model=Dict[str, DisplayMatchStateDTO]
)
def display_match_states(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    t = _resolve(repo, token)
    rows = repo.match_states.list_for_tournament(t.id)
    return {row.match_id: _row_to_display_state(row) for row in rows}


@public_router.get("/{token}/bracket", response_model=DisplayBracketDTO)
def display_bracket(
    token: str,
    repo: LocalRepository = Depends(get_repository),
):
    """Project the cached session through a recursive spectator allow-list.

    Private roster provenance, arbitrary format configuration, score metadata
    and operator notes cannot leave through the public response model.
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
