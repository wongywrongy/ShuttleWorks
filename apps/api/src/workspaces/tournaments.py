"""Multi-tournament HTTP boundary (Step 2 of the cloud-prep migration).

Replaces the singleton ``/tournament/state`` API with explicit-id CRUD
plus scoped state and backup endpoints under
``/tournaments/{tournament_id}/state``. The frontend dashboard (Step 6
proper, but bootstrapped here) lists rows via ``GET /tournaments`` and
opens one by navigating to ``/tournaments/{id}/...``.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Header, Path, Query, Response, status
from pydantic import BaseModel, Field, ValidationError

from core.dependencies import (
    AuthUser,
    get_current_user,
    require_tournament_access,
)
from core.config import cloud_modules_enabled
from core.error_codes import ErrorCode, http_error
from core.exceptions import ConflictError
from core.limits import Code, Identifier, StrictModel
from core.schemas import (
    MeetStandingRowDTO,
    TournamentConfig,
    TournamentStateDTO,
    WorkspaceModuleDTO,
    state_dto_from_document,
)
from db.models import (
    CLOUD_ONLY_MODULES,
    Tournament,
    TournamentMember,
    normalize_module_seed,
    display_dependency_satisfied,
)
from repositories import LocalRepository, get_repository
from identity import members as members_service
from operations import conflict_metrics
from bracket import response_cache
from workspaces.config_lock import changed_scheduling_fields
from meet.standings import compute_meet_standings
from identity.invites import (
    InviteCreateDTO,
    InviteCreatedDTO,
    InviteSummaryDTO,
    _to_summary as _invite_summary,
)
from workspaces.entries_facts import build_entries_facts
from workspaces.workspace_signals import RowCounts, WorkspaceSignalsDTO, build_signals

router = APIRouter(prefix="/tournaments", tags=["tournaments"])
log = logging.getLogger("scheduler.tournaments")

TournamentStatus = Literal["draft", "active", "archived"]

# Keys inside the state blob that only the server may set, mapped to the
# value used when the stored document has none yet. Enforced in
# ``put_tournament_state``; see the comment there for why these are
# preserved from the prior document rather than stripped.
_SERVER_MANAGED_STATE_FIELDS: dict[str, object] = {
    "scheduleVersion": 0,
    "scheduleHistory": [],
}


# ---- DTOs --------------------------------------------------------------


class TournamentSummaryDTO(BaseModel):
    """Dashboard row shape — light enough to render dozens without loading
    the full payload.

    Step 6 added ``role`` (the requesting user's role on this
    tournament; always non-null in the list response because the list
    is filtered to memberships) and ``ownerName`` (the owner's email,
    denormalised at create time — see ``Tournament.owner_email``).

    Backend-merge follow-up added ``kind`` so the frontend can render
    different chrome for meets vs brackets (a meet's TabBar shows
    Setup/Roster/Matches/Schedule/Live/TV; a bracket-kind tournament
    hides the strip and renders BracketTab directly).
    """
    id: str
    name: Optional[str] = None
    status: TournamentStatus = "draft"
    kind: str = "meet"
    tournamentDate: Optional[str] = None
    createdAt: str
    updatedAt: str
    role: Optional[str] = None
    ownerName: Optional[str] = None
    # Workspace-modules program (#1): first-class per-workspace module
    # state, derived-and-persisted from ``kind``. Existing summary
    # consumers ignore the new field.
    modules: List[WorkspaceModuleDTO] = Field(default_factory=list)
    signals: Optional[WorkspaceSignalsDTO] = None


class WorkspaceModuleSeedDTO(StrictModel):
    moduleId: str = Field(max_length=20)
    status: str = Field(max_length=20)
    config: Optional[dict] = None


class TournamentCreateDTO(StrictModel):
    name: Optional[str] = Field(default=None, max_length=200)
    kind: str = Field(default="meet", max_length=20)
    tournamentDate: Optional[str] = Field(default=None, max_length=32)
    # One seed row per module; the vocabulary is fixed and tiny, so this
    # bound only exists to stop a payload repeating it indefinitely.
    modules: Optional[List[WorkspaceModuleSeedDTO]] = Field(default=None, max_length=20)


class TournamentUpdateDTO(StrictModel):
    name: Optional[str] = Field(default=None, max_length=200)
    status: Optional[TournamentStatus] = None
    tournamentDate: Optional[str] = Field(default=None, max_length=32)


class BackupEntryDTO(BaseModel):
    filename: str
    sizeBytes: int
    modifiedAt: str
    #: ``auto`` (a state write snapshotted the prior payload) or ``manual``
    #: (the director asked for it). Only ``auto`` rows rotate, so the list
    #: has to say which is which — a row the operator cannot lose reads
    #: differently from one that will age out on its own.
    origin: str = "auto"


class BackupListDTO(BaseModel):
    backups: List[BackupEntryDTO]


class BackupCreatedDTO(BaseModel):
    filename: Optional[str] = None
    created: bool


# ---- Helpers -----------------------------------------------------------


def _to_summary(
    row: Tournament,
    *,
    role: Optional[str] = None,
    modules: Optional[List[WorkspaceModuleDTO]] = None,
    signals: Optional[WorkspaceSignalsDTO] = None,
) -> TournamentSummaryDTO:
    return TournamentSummaryDTO(
        id=str(row.id),
        name=row.name,
        status=row.status,  # type: ignore[arg-type]
        kind=getattr(row, "kind", "meet"),
        tournamentDate=row.tournament_date,
        createdAt=row.created_at.isoformat() if row.created_at else "",
        updatedAt=row.updated_at.isoformat() if row.updated_at else "",
        role=role,
        ownerName=row.owner_email,
        modules=modules or [],
        signals=signals,
    )


def _modules_for(row: Tournament, repo: LocalRepository) -> List[WorkspaceModuleDTO]:
    """Derive-and-persist the workspace's modules, as DTOs for the summary."""
    return [
        WorkspaceModuleDTO.from_row(m) for m in repo.modules.ensure_modules(row)
    ]


def _meet_standings_for(
    row: Tournament, repo: LocalRepository
) -> List[MeetStandingRowDTO]:
    """Authoritative Meet pool standings for the ``/state`` GET payload.

    ``[]`` when the Meet module isn't enabled for this workspace, or the
    persisted blob has no matches/groups yet (e.g. a just-created
    tournament). Otherwise pulls ``matches``/``groups``/``players``
    straight out of the already-loaded ``row.data`` blob (no query — it's
    the same dict this route already returns) but reads ``match_states``
    fresh from the DB, because live finished/score data is never part of
    that blob (it lives in the separate ``match_states`` table owned by
    ``operations/match_state_routes.py`` — see ``meet.standings`` and the
    Task 2 report for why this one extra read is an intentional, flagged
    deviation from a "no new query" ask that assumed a payload shape this
    route doesn't actually have).
    """
    modules = _modules_for(row, repo)
    meet_enabled = any(m.moduleId == "meet" and m.status == "enabled" for m in modules)
    if not meet_enabled:
        return []
    data = row.data or {}
    matches = data.get("matches") or []
    groups = data.get("groups") or []
    players = data.get("players") or []
    if not matches or not groups:
        return []
    state_rows = repo.match_states.list_for_tournament(row.id)
    match_states = {
        s.match_id: {
            "status": s.status,
            "scoreSideA": s.score_side_a,
            "scoreSideB": s.score_side_b,
        }
        for s in state_rows
    }
    # Standings intentionally count every finished, scored match regardless
    # of current schedule membership. The client's original UI only saw
    # matches within schedule.assignments (incidental filtering), but the
    # authoritative backend standings reflect all recorded results.
    # ``compute_meet_standings`` returns the wire DTO itself since SP-DM-3 P1
    # (F-DM-26) - there is no private row shape left to translate from.
    return compute_meet_standings(
        matches=matches,
        match_states=match_states,
        groups=groups,
        players=players,
    )


def _counts_for(
    ids: List[uuid.UUID], repo: LocalRepository
) -> dict[uuid.UUID, RowCounts]:
    """``{tournament_id: RowCounts}`` from the 6 grouped count queries.

    Computed once for a set of ids (the list path) or a single id (the
    get/create/update paths). No per-row DB round-trips.
    """
    members = repo.members.count_by_tournament(ids)
    invites = repo.invite_links.count_active_by_tournament(ids)
    bevents = repo.brackets.count_events_by_tournament(ids)
    bmatches = repo.brackets.count_matches_by_tournament(ids)
    bresults = repo.brackets.count_results_by_tournament(ids)
    mstates = repo.match_states.count_by_tournament(ids)
    # {tid: {match_id: status}} for matches that left ``scheduled`` — the
    # lifecycle-phase + live-aware-nextUp input (7th grouped query).
    mstatuses = repo.matches.statuses_by_tournament(ids)
    # Bracket-side phase/nextUp inputs: resolved play-unit ids (8th) and the
    # Swiss rounds-still-pending flag (9th — two small queries internally).
    bresolved = repo.brackets.resolved_unit_ids_by_tournament(ids)
    swiss_pending = repo.brackets.swiss_pending_by_tournament(ids)
    # E4 (Phase 9): the entries rows, as a 10th grouped read, counted HERE
    # rather than in the repository — ``shared`` sits above persistence, so a
    # repository that built the record would be importing upward (caught by
    # the import contract, not by review). Sparse: only workspaces that HAVE
    # an entry page appear, so the ``.get`` below leaves every other
    # workspace's ``entries`` at None, which is what keeps the entries phases
    # and codes off a local-mode card entirely (invariant I3).
    entry_rows = repo.entry_signals.rows_by_tournament(ids)
    entry_facts = {
        tid: build_entries_facts(page=page, events=events, entries=entries)
        for tid, (page, events, entries) in entry_rows.items()
    }
    return {
        tid: RowCounts(
            members=members.get(tid, 0),
            active_invites=invites.get(tid, 0),
            bracket_events=bevents.get(tid, 0),
            bracket_matches=bmatches.get(tid, 0),
            bracket_results=bresults.get(tid, 0),
            match_states=mstates.get(tid, 0),
            match_status_by_id=mstatuses.get(tid, {}),
            bracket_resolved_ids=bresolved.get(tid, set()),
            swiss_pending=swiss_pending.get(tid, False),
            entries=entry_facts.get(tid),
        )
        for tid in ids
    }


def _backup_entry(row) -> BackupEntryDTO:
    return BackupEntryDTO(
        filename=row.filename,
        sizeBytes=row.size_bytes,
        modifiedAt=row.created_at.isoformat(),
        origin=row.origin,
    )


def _resolve_tournament(
    tournament_id: uuid.UUID,
    repo: LocalRepository,
) -> Tournament:
    """Common 404 helper for the scoped routes."""
    row = repo.tournaments.get_by_id(tournament_id)
    if row is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return row


# ---- Tournament CRUD ---------------------------------------------------


@router.get("", response_model=List[TournamentSummaryDTO])
def list_tournaments(
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Newest-first list, filtered to tournaments the caller is a member
    of. Each row carries the caller's role on that tournament so the
    Step 6 dashboard can split owned vs shared without an extra
    request.
    """
    user_uuid = user.as_uuid()
    if user_uuid is None:
        return []
    # Resolve every (tournament_id, role) pair for the caller in one query so the
    # list response carries the role per row without an N+1 lookup. ``list_all`` is
    # already newest-first.
    role_by_tournament = repo.members.list_roles_for_user(user_uuid)
    visible = [t for t in repo.tournaments.list_all() if t.id in role_by_tournament]
    # Modules + signals are both gathered in batch (one query for all module rows,
    # six grouped count queries) rather than per-row.
    modules_by_tid = repo.modules.ensure_modules_for(visible)
    counts = _counts_for([t.id for t in visible], repo)
    out: List[TournamentSummaryDTO] = []
    for t in visible:
        modules = [WorkspaceModuleDTO.from_row(m) for m in modules_by_tid[t.id]]
        out.append(
            _to_summary(
                t,
                role=role_by_tournament[t.id],
                modules=modules,
                signals=build_signals(t, modules, counts[t.id]),
            )
        )
    return out


@router.post("", response_model=TournamentSummaryDTO, status_code=201)
def create_tournament(
    body: TournamentCreateDTO,
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Create an empty tournament. The current user is stamped as the
    owner — both on the ``tournaments.owner_id`` column and as a
    ``tournament_members`` row with ``role='owner'`` — so the same
    user can immediately read / write / delete the new tournament via
    the role-checked endpoints. ``owner_email`` is denormalised here
    so Step 6's "Shared with You" dashboard rows can show who the
    tournament belongs to without a second lookup.
    """
    user_uuid = user.as_uuid()
    if body.kind not in ("meet", "bracket"):
        raise http_error(
            400,
            ErrorCode.INVALID_INPUT,
            f"kind must be 'meet' or 'bracket', got {body.kind!r}",
        )
    # Validate the seed up front (both checks are pure — no row needed) so a
    # rejected seed never leaves an orphan tournament/member row behind.
    if body.modules is not None:
        include_cloud_only = cloud_modules_enabled()
        # Pre-check before ``normalize_module_seed``, which raises a plain
        # ValueError that the handler below flattens into the generic
        # INVALID_INPUT. A cloud-only module named in local mode is a
        # specific, explainable refusal, not malformed input.
        if not include_cloud_only:
            for module in body.modules:
                if module.moduleId in CLOUD_ONLY_MODULES:
                    raise http_error(
                        400,
                        ErrorCode.MODULE_REQUIRES_CLOUD,
                        f"module '{module.moduleId}' requires a cloud-mode "
                        "deployment",
                    )
        try:
            seed_rows = normalize_module_seed(
                [m.model_dump() for m in body.modules],
                include_cloud_only=include_cloud_only,
            )
        except ValueError as exc:
            raise http_error(400, ErrorCode.INVALID_INPUT, str(exc))
        statuses = {r["module_id"]: r["status"] for r in seed_rows}
        if not display_dependency_satisfied(statuses):
            raise http_error(
                400,
                ErrorCode.INVALID_INPUT,
                "display may be enabled only with an enabled operational module",
            )
    else:
        seed_rows = None

    # SP-CLOUD-2: fail closed — an identity that can't own a membership
    # row must not be able to create a workspace nobody can ever access
    # (the pre-tenancy code tolerated this and produced orphans).
    if user_uuid is None:
        raise http_error(
            401, ErrorCode.AUTH_NOT_SIGNED_IN, "A signed-in identity is required"
        )
    # Workspaces belong to orgs: materialize the caller's users row +
    # personal org if this identity predates the account system.
    from identity.auth import ensure_user, personal_org_id

    ensure_user(repo.session, user_uuid, user.email)
    row = repo.tournaments.create(
        name=body.name,
        kind=body.kind,
        tournament_date=body.tournamentDate,
        owner_id=user_uuid,
        owner_email=user.email,
        org_id=personal_org_id(repo.session, user_uuid),
    )
    repo.members.add_member(row.id, user_uuid, role="owner")

    # Explicit module seed (control-plane templates / custom create). When
    # present, persist before any module read so ensure_modules is a no-op.
    if seed_rows is not None:
        repo.modules.seed_modules(row, seed_rows)

    # Seed a fully-valid config so SetupTab reads the dashboard name + date
    # on first open instead of blank fields, AND so the first frontend PUT
    # (which snapshots the Zustand store) passes Pydantic validation on all
    # required TournamentConfig fields (intervalMinutes, dayStart, etc.).
    # ``commit_tournament_state`` skips the backup snapshot when data is
    # still empty (the freshly-created default), so this is a cheap
    # upsert-only path.  Only seed when the caller supplied at least a name
    # or date; an anonymous create stays at 204 / no state.
    if body.name or body.tournamentDate:
        seeded_config: dict = {
            "intervalMinutes": 30,
            "dayStart": "09:00",
            "dayEnd": "18:00",
            "breaks": [],
            "courtCount": 4,
            "defaultRestMinutes": 0,
            "freezeHorizonSlots": 0,
        }
        if body.name:
            seeded_config["tournamentName"] = body.name
        if body.tournamentDate:
            seeded_config["tournamentDate"] = body.tournamentDate
        repo.commit_tournament_state(
            row.id,
            {"config": seeded_config},
        )
    modules = _modules_for(row, repo)
    counts = _counts_for([row.id], repo)
    return _to_summary(
        row,
        role="owner",
        modules=modules,
        signals=build_signals(row, modules, counts[row.id]),
    )


@router.get(
    "/{tournament_id}",
    response_model=TournamentSummaryDTO,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def get_tournament(
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the summary row (id + denormalised metadata).

    The full ``TournamentStateDTO`` payload is served by
    ``GET /tournaments/{id}/state`` to keep this endpoint cheap for
    dashboard polling. ``role`` is included so the frontend can hide
    owner-only affordances without a separate request.
    """
    row = _resolve_tournament(tournament_id, repo)
    role: Optional[str] = None
    user_uuid = user.as_uuid()
    if user_uuid is not None:
        role = repo.members.get_role(tournament_id, user_uuid)
    modules = _modules_for(row, repo)
    counts = _counts_for([row.id], repo)
    return _to_summary(
        row,
        role=role,
        modules=modules,
        signals=build_signals(row, modules, counts[row.id]),
    )


@router.patch(
    "/{tournament_id}",
    response_model=TournamentSummaryDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def update_tournament(
    body: TournamentUpdateDTO,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Partial update of name / status / tournament_date.

    The wire-format DTO uses camelCase ``tournamentDate``; we translate
    to the snake_case column name here.
    """
    fields: dict = {}
    if body.name is not None:
        fields["name"] = body.name
    if body.status is not None:
        fields["status"] = body.status
    if body.tournamentDate is not None:
        fields["tournament_date"] = body.tournamentDate

    row = repo.tournaments.update(tournament_id, fields)
    if row is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    role: Optional[str] = None
    user_uuid = user.as_uuid()
    if user_uuid is not None:
        role = repo.members.get_role(tournament_id, user_uuid)
    modules = _modules_for(row, repo)
    counts = _counts_for([row.id], repo)
    return _to_summary(
        row,
        role=role,
        modules=modules,
        signals=build_signals(row, modules, counts[row.id]),
    )


@router.delete(
    "/{tournament_id}",
    status_code=204,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def delete_tournament(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Delete the tournament and CASCADE its match_states + backups +
    members + invite_links."""
    if not repo.tournaments.delete(tournament_id):
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return Response(status_code=204)


# ---- Scoped state routes -----------------------------------------------


def _state_etag(row) -> str:
    """ETag for the state blob — the bare integer, matching the form
    ``match_state.py`` already ships (``"<n>"``)."""
    return f'"{row.state_version or 0}"'


def _parse_if_match(raw: str | None) -> int:
    """Parse ``If-Match`` into a version, or raise.

    Fail-closed on a MISSING header, like ``_enforce_if_match`` in
    ``operations/match_state_routes.py``: an optional precondition is a precondition that
    a caller silently forgets, which is the same defect class as the
    lost update this guard exists to prevent.

    412 here rather than 409 on purpose. A missing or malformed header is a
    CLIENT BUG — there is no conflict to resolve and no state worth returning.
    409 is reserved for the real thing: a well-formed request whose version
    has been superseded, answered with the current state so the caller can
    reconcile (SP-CLOUD-4, 0.D).
    """
    if raw is None:
        raise http_error(
            412,
            ErrorCode.STATE_VERSION_REQUIRED,
            "If-Match is required on this write. Send the ETag from the "
            "last GET or write response.",
        )
    # Parsed the same way as ``operations/match_state_routes.py::_parse_if_match_header``:
    # a literal ``W/`` PREFIX, then paired quotes. The obvious-looking
    # ``raw.strip("W/")`` is wrong — str.strip takes a CHARACTER SET, not a
    # prefix, so it also ate stray W and / at either end and accepted
    # malformed values like ``W/W/"3"`` that the sibling route rejects.
    token = raw.strip()
    if token.startswith("W/"):
        token = token[2:]
    if len(token) >= 2 and token.startswith('"') and token.endswith('"'):
        token = token[1:-1]
    try:
        return int(token)
    except ValueError:
        raise http_error(
            412,
            ErrorCode.STATE_VERSION_REQUIRED,
            f"malformed If-Match value: {raw!r}",
        )


@router.get(
    "/{tournament_id}/state",
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def get_tournament_state(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    # Deliberately LAST. Inserting it before `repo` silently rerouted the
    # in-process callers below, which pass (tournament_id, repo)
    # positionally — the repo landed in `response` and the route 500'd on
    # restore. FastAPI resolves these by name, so order costs nothing here
    # and buys immunity to that.
    response: Response = None,  # type: ignore[assignment]
):
    """Return the persisted ``TournamentStateDTO`` blob.

    ``204 No Content`` when the tournament exists but its data is still
    empty (newly created, never PUT). 404 when the tournament itself
    doesn't exist.

    ``standings`` is computed fresh on every call (Task 2) rather than
    read from the blob — see ``_meet_standings_for``. It's deliberately
    NOT part of the persisted payload; ``put_tournament_state`` strips it
    before committing so a stale value never gets written back.
    """
    row = _resolve_tournament(tournament_id, repo)
    if not row.data:
        # An empty workspace still HAS a version, and its client still needs
        # one: the very first save after creation sends If-Match like any
        # other. Returning a bare 204 here would leave that client with no
        # token and a guaranteed 412 on its first write.
        return Response(status_code=204, headers={"ETag": _state_etag(row)})
    # Project the stored document onto the wire shape (SP-SEC-1 Phase 1).
    #
    # This used to return ``dict(row.data)`` — the raw internal document,
    # including server-managed sections the DTO does not declare. Two
    # reasons that had to change once the PUT started forbidding unknown
    # fields:
    #
    # 1. It made GET → PUT round-tripping impossible. A client that read
    #    the state and wrote it back sent ``bracket_session`` and got a
    #    422. The frontend never did this (``snapshot()`` composes an
    #    explicit object), but scripts and tests do, and an API whose own
    #    output its input rejects is a broken API.
    # 2. ``bracket_session`` is the bracket engine's internal state. Every
    #    viewer-role member was being handed it for no reason; nothing
    #    reads it over the wire (verified across the frontend, the
    #    simulator, and the backend, which reads it from ``tournament.data``
    #    directly).
    #
    # Values are passed through unvalidated, exactly as before — this
    # filters which keys are returned, it does not re-parse them, so a
    # historical blob still reads back as whatever it holds.
    payload = {
        k: v for k, v in row.data.items() if k in TournamentStateDTO.model_fields
    }
    payload["standings"] = [
        s.model_dump() for s in _meet_standings_for(row, repo)
    ]
    if response is not None:
        # The concurrency token rides the ETag, not the body. Keeping it out
        # of the payload means a client cannot accidentally echo a stale one
        # back inside the blob (the mistake SEC-12 had to close for
        # scheduleVersion), and it matches the If-Match convention
        # match_state.py already ships.
        response.headers["ETag"] = _state_etag(row)
    return payload


@router.put(
    "/{tournament_id}/state",
    response_model=TournamentStateDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def put_tournament_state(
    state: TournamentStateDTO,
    tournament_id: uuid.UUID = Path(...),
    clearSchedule: bool = Query(
        False,
        description=(
            "Sanction the edit by clearing the committed schedule(s) it "
            "invalidates, atomically with the write. Refused (409 "
            "DRAW_STARTED) while any bracket draw is started."
        ),
    ),
    response: Response = None,  # type: ignore[assignment]
    if_match: str | None = Header(default=None, alias="If-Match"),
    repo: LocalRepository = Depends(get_repository),
):
    """Overwrite the tournament data blob.

    Snapshots the prior content to ``tournament_backups`` first (unless
    the row was freshly created with empty data) and rotates the backup
    pool to the configured retention (``LocalRepository.BACKUP_KEEP``).

    ``standings`` is excluded from what gets persisted — it's a derived
    field the GET route recomputes on every read (see
    ``_meet_standings_for``); persisting a client-sent snapshot of it
    would let a stale value linger in the blob.

    Locked-settings guards (Phase 0a — the backend mirrors of the
    frontend locks; a frontend-only lock is bypassable by any stale tab
    or direct API client):

    - **CONFIG_LOCKED (409):** ANY scheduling-relevant config key (see
      ``workspaces.config_lock.changed_scheduling_fields`` — fail-closed:
      everything except the shared non-scheduling-keys exemption list)
      may not change in a blob that RETAINS a committed schedule — those
      are the fields the engine solved against, and changing them under
      a live schedule silently invalidates every court/slot assignment.
      The structural venue fields (courtCount / intervalMinutes /
      dayStart / dayEnd) are a subset of this — the old venue-only guard
      is subsumed, not replaced. The sanctioned unlock path either clears
      the schedule in the same PUT (passes unconditionally) or retries
      with ``?clearSchedule=true``, which atomically nulls the schedule
      and applies the edit in the same commit. Non-scheduling config
      (scoringFormat, tv*, …) stays freely writable.
    - **ROSTER_LOCKED (409):** ``bracketPlayers`` entries referenced by a
      GENERATED draw (participant ids + member_ids of non-draft events)
      may not be removed; deleting them silently invalidates the draw's
      placements. Draft draws don't block.
    """
    row_prior = _resolve_tournament(tournament_id, repo)  # 404 if missing

    # SP-CLOUD-4: refuse a write built on a superseded revision.
    #
    # This blob carries essentially the whole product — config, roster,
    # groups, matches, schedule, bracket roster — and the client sends ALL of
    # it on every debounced save. So a stale writer does not lose only the
    # field it touched; it reverts every field the other tab changed since it
    # loaded. Before this check the loser's PUT answered 200 with no warning.
    seen = _parse_if_match(if_match)
    current = row_prior.state_version or 0
    if seen != current:
        conflict_metrics.record("PUT /tournaments/{id}/state")
        log.warning(
            "state version conflict on %s: client sent %s, server at %s",
            tournament_id, seen, current,
        )
        raise http_error(
            409,
            ErrorCode.STATE_VERSION_CONFLICT,
            "This workspace changed since you loaded it. Your copy is out of "
            "date; reload to see the current state before saving again.",
            extra={
                "seenVersion": seen,
                "currentVersion": current,
                # The current state travels WITH the refusal so a client can
                # reconcile without a second round trip.
                # mode="json" matters: the raw model is not JSON-serializable
                # and the error path would 500 while reporting a conflict —
                # turning a recoverable refusal into an opaque failure.
                "currentState": state_dto_from_document(
                    row_prior.data or {}
                ).model_dump(mode="json"),
            },
        )

    incoming = state.model_dump(exclude={"standings"})
    prior = dict(row_prior.data or {})

    # SP-SEC-1 (SEC-12): server-managed fields come from the stored
    # document, never from the request. ``scheduleVersion`` is the
    # optimistic-concurrency token the proposal-commit path compares
    # ``fromScheduleVersion`` against, and ``scheduleHistory`` is the
    # revert pool — a client that could set either could defeat the
    # stale-proposal check or forge the audit trail.
    #
    # Preserved, not stripped. Stripping looks like the safer move and is
    # the wrong one: the DTO's defaults (0 / []) would then win and every
    # ordinary save would wipe the value. That is exactly why the
    # frontend's ``snapshot()`` echoes both fields back in the first
    # place (see ``useTournamentState.ts``). Preserving makes the echo
    # redundant rather than load-bearing, so an older tab cannot roll the
    # version backwards either.
    #
    # The legitimate writer is the proposal-commit path, which builds its
    # payload server-side from persisted state and calls
    # ``commit_tournament_state`` directly — it does not come through
    # this route, so it is unaffected. Backup restore likewise writes via
    # the repository, so a restore still restores the historical values.
    #
    # ``updatedAt`` and ``version`` need no handling here: ``_stamp_payload``
    # in the repository overwrites both unconditionally on every write.
    for key, default in _SERVER_MANAGED_STATE_FIELDS.items():
        incoming[key] = prior.get(key, default)

    prior_schedule = prior.get("schedule")
    prior_assignments = (
        prior_schedule.get("assignments") if isinstance(prior_schedule, dict) else None
    )
    incoming_schedule = incoming.get("schedule")
    incoming_assignments = (
        incoming_schedule.get("assignments")
        if isinstance(incoming_schedule, dict)
        else None
    )
    incoming_cfg = incoming.get("config") if isinstance(incoming.get("config"), dict) else None
    # Both sides of the lock comparison must be read through the SAME
    # projection. ``incoming`` is a DTO dump, so every field the client did
    # not set still arrives carrying its ``TournamentConfig`` default. The
    # STORED blob can be sparse — ``POST /tournaments`` seeds 8 keys — so
    # comparing the dump against the raw blob reported all 13
    # defaulted-but-absent scheduling keys as user edits, and 409'd an
    # unmodified round trip on every workspace that had never completed a
    # full state PUT. Found by a real-browser pass: 6 of 8 demo workspaces
    # raised the destructive "Discard committed schedule?" modal on Bracket
    # page load, because the GET the client hydrates from already applies
    # this very projection.
    #
    # Fail-closed on an unparseable stored config: fall back to the raw
    # blob (the old comparison), which over-reports changes rather than
    # under-reporting them. Never let the lock's own normalization 500 a
    # write that would otherwise be refused cleanly.
    prior_cfg = prior.get("config") if isinstance(prior.get("config"), dict) else None
    if prior_cfg is not None:
        try:
            prior_cfg = TournamentConfig.model_validate(prior_cfg).model_dump()
        except ValidationError:
            log.warning("stored config for %s does not validate; comparing raw", tournament_id)

    bracket_session = prior.get("bracket_session")
    bracket_assignments = (
        bracket_session.get("assignments")
        if isinstance(bracket_session, dict)
        else None
    )

    fields = changed_scheduling_fields(prior_cfg, incoming_cfg)
    locked_schedules: list[str] = []
    if fields and prior_assignments and incoming_assignments:
        locked_schedules.append("meet")
    if fields and bracket_assignments:
        locked_schedules.append("bracket")

    if locked_schedules and not clearSchedule:
        raise http_error(
            409,
            ErrorCode.CONFIG_LOCKED,
            "Schedule locked: "
            f"{', '.join(fields)} cannot change while a committed schedule "
            "exists. Retry with ?clearSchedule=true to clear it and apply "
            "the edit.",
            extra={"fields": fields, "schedules": locked_schedules},
        )

    clear_bracket = False
    if clearSchedule and fields:
        # The hard lock only protects a bracket schedule actually being
        # cleared — a started draw with no committed assignments has
        # nothing bracket-side for this clear to touch, so it must not
        # freeze a meet-only clearSchedule.
        started = (
            [
                ev.id
                for ev in repo.brackets.list_events(tournament_id)
                if (ev.status or "draft") == "started"
            ]
            if bracket_assignments
            else []
        )
        if started:
            raise http_error(
                409,
                ErrorCode.DRAW_STARTED,
                "Draws in play cannot have their schedule cleared: "
                f"{', '.join(started)}. Finish or reset those draws first.",
                extra={"events": started},
            )
        # Atomic clear-and-apply: the same single upsert persists both.
        incoming["schedule"] = None
        incoming["scheduleIsStale"] = False
        clear_bracket = bool(bracket_assignments)

    prior_roster = {
        p.get("id")
        for p in (prior.get("bracketPlayers") or [])
        if isinstance(p, dict) and p.get("id")
    }
    incoming_roster = {
        p.get("id")
        for p in (incoming.get("bracketPlayers") or [])
        if isinstance(p, dict) and p.get("id")
    }
    removed = prior_roster - incoming_roster
    if removed:
        referenced = repo.brackets.player_ids_referenced_by_generated(tournament_id)
        blocked = sorted(removed & referenced)
        if blocked:
            raise http_error(
                409,
                ErrorCode.ROSTER_LOCKED,
                "These players are placed in a generated draw and cannot be "
                f"removed: {', '.join(blocked[:5])}"
                f"{' …' if len(blocked) > 5 else ''}. Re-generate or reset the "
                "draw first.",
            )

    try:
        row = repo.commit_tournament_state(
            tournament_id,
            incoming,
            clear_bracket_assignments=clear_bracket,
            # Compare-and-swap against the version the caller was shown. The
            # check above is necessary but NOT sufficient: it reads the row at
            # the top of the request and the write lands ~150 lines later, so
            # two concurrent requests can both pass it.
            expected_version=seen,
        )
        if response is not None:
            # The client's next debounced save needs the version this write
            # produced. Without this it would have to GET first, and a client
            # that forgot would conflict with itself on every second save.
            response.headers["ETag"] = _state_etag(row)
        if clear_bracket:
            # clearSchedule just nulled the committed bracket assignments —
            # a cached GET /bracket payload would still show them until the
            # TTL expires. Invalidate now so a poll or re-entry right after
            # this write sees the cleared schedule immediately.
            response_cache.invalidate(tournament_id)
    except ConflictError as exc:
        # Lost the compare-and-swap: another request committed between this
        # one's check and its write. Same answer as the pre-check, so a client
        # cannot tell them apart — both mean "reload and retry".
        conflict_metrics.record("PUT /tournaments/{id}/state")
        log.warning(
            "state version CAS lost on %s: expected %s, row at %s",
            tournament_id, seen, getattr(exc, "current_version", "?"),
        )
        raise http_error(
            409,
            ErrorCode.STATE_VERSION_CONFLICT,
            "This workspace changed since you loaded it. Your copy is out of "
            "date; reload to see the current state before saving again.",
            extra={
                "seenVersion": seen,
                "currentVersion": getattr(exc, "current_version", seen + 1),
                "currentState": state_dto_from_document(
                    _resolve_tournament(tournament_id, repo).data or {}
                ).model_dump(mode="json"),
            },
        )
    except KeyError:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    except Exception as e:
        log.error("tournament-state write failed: %s", e)
        raise http_error(
            500,
            ErrorCode.STATE_WRITE_FAILED,
            "could not persist tournament state",
        )
    return state_dto_from_document(row.data)


@router.get(
    "/{tournament_id}/state/backups",
    response_model=BackupListDTO,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_tournament_backups(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    rows = repo.backups.list_for_tournament(tournament_id)
    return BackupListDTO(backups=[_backup_entry(r) for r in rows])


@router.post(
    "/{tournament_id}/state/backup",
    response_model=BackupCreatedDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def create_tournament_backup(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    _resolve_tournament(tournament_id, repo)
    backup = repo.snapshot_tournament(tournament_id)
    return BackupCreatedDTO(
        created=backup is not None,
        filename=backup.filename if backup else None,
    )


@router.get(
    "/{tournament_id}/state/backups/{filename}",
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def download_tournament_backup(
    filename: str,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Hand the snapshot back as a file.

    Viewer, matching ``GET /state``: a backup is a workspace state the caller
    is already allowed to read, at an earlier moment. The value of this over
    Restore is that it is not destructive — a director who wants to check what
    a snapshot contains before replacing today's work has, until now, had only
    the replacing option.
    """
    _resolve_tournament(tournament_id, repo)
    row = repo.backups.get_by_filename(tournament_id, filename)
    if row is None:
        raise http_error(
            404,
            ErrorCode.BACKUP_NOT_FOUND,
            f"backup not found: {filename}",
        )
    # The filename is server-generated (``_backup_filename``) and the row was
    # looked up BY it, so it cannot carry a header-splitting payload; quoted
    # anyway, because that reasoning stops holding the day the name changes.
    return Response(
        content=json.dumps(row.snapshot, sort_keys=True),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{row.filename}"'
        },
    )


@router.delete(
    "/{tournament_id}/state/backups/{filename}",
    status_code=204,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def delete_tournament_backup(
    filename: str,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Owner, matching Restore: both are irreversible, in opposite directions.

    Needed because manual snapshots no longer rotate — a list that only ever
    grows needs a way to shrink, or the exemption that protects a director's
    backup becomes the thing that clutters their list.
    """
    _resolve_tournament(tournament_id, repo)
    if not repo.delete_tournament_backup(tournament_id, filename):
        raise http_error(
            404,
            ErrorCode.BACKUP_NOT_FOUND,
            f"backup not found: {filename}",
        )
    return Response(status_code=204)


@router.post(
    "/{tournament_id}/state/restore/{filename}",
    dependencies=[Depends(require_tournament_access("owner"))],
)
def restore_tournament_backup(
    filename: str,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    response: Response = None,  # type: ignore[assignment]
):
    _resolve_tournament(tournament_id, repo)
    try:
        repo.restore_tournament_from_backup(tournament_id, filename)
    except FileNotFoundError:
        raise http_error(
            404,
            ErrorCode.BACKUP_NOT_FOUND,
            f"backup not found: {filename}",
        )
    except Exception:
        # SEC-06: the exception's str() went to the client. A SQLAlchemy
        # connection error carries the DSN — the exact leak the 2026-08-04
        # audit already fixed once in /health/ready. The detail belongs in
        # the log, where the operator can read it and the caller cannot.
        log.exception("restore failed for tournament %s", tournament_id)
        raise http_error(
            500,
            ErrorCode.BACKUP_RESTORE_FAILED,
            "restore failed (see server logs)",
        )
    return get_tournament_state(
        tournament_id=tournament_id, repo=repo, response=response
    )


# ---- Plan-finalized flag (SP-G1 Plan→Run handoff) ----------------------


class PlanFinalizedDTO(StrictModel):
    finalized: bool


@router.post(
    "/{tournament_id}/plan-finalized",
    dependencies=[Depends(require_tournament_access("operator"))],
)
def set_plan_finalized(
    body: PlanFinalizedDTO,
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
    response: Response = None,  # type: ignore[assignment]
):
    """Toggle the ``planFinalized`` flag stored in the tournament data blob.

    Read-modify-writes the existing blob so all other state (config,
    players, matches, schedule …) is preserved.  The flag is a pure
    persisted boolean — no server-side derivation; the Run surface
    derives "what's missing" client-side.
    """
    row = _resolve_tournament(tournament_id, repo)  # 404 if missing
    data = dict(row.data or {})
    data["planFinalized"] = bool(body.finalized)
    updated = repo.tournaments.upsert_data(tournament_id, data)
    if response is not None:
        # This route WRITES the blob, so it advances the concurrency token.
        # Hand the new one back or the director's very next autosave carries a
        # stale If-Match and 409s on a flow with no conflict in it.
        response.headers["ETag"] = _state_etag(updated)
    return {"planFinalized": data["planFinalized"]}


# ---- Invite-link endpoints scoped under a tournament --------------------


@router.post(
    "/{tournament_id}/invites",
    response_model=InviteCreatedDTO,
    status_code=201,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def create_invite_link(
    body: InviteCreateDTO,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Generate an invite link granting ``body.role`` on the tournament.

    Returns the token + a relative URL (``/invite/{token}``) the
    frontend joins with ``window.location.origin`` to produce a
    copy-able link.
    """
    user_uuid = user.as_uuid()
    if user_uuid is None:
        # Owner-role dep already verified the caller; this is defensive.
        raise http_error(
            403,
            ErrorCode.STATE_CORRUPT,
            "user id is not a UUID",
        )
    email = None
    expires_at = None
    if body.email:
        # Email invite (SP-CLOUD-2): validated address, bounded lifetime,
        # delivered via the email seam (console backend in local mode).
        from datetime import datetime, timedelta, timezone

        from core.config import settings
        from identity.auth import AuthError, normalize_email

        try:
            email = normalize_email(body.email)
        except AuthError as exc:
            raise http_error(400, ErrorCode.INVALID_INPUT, exc.message)
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.invite_ttl_days
        )
    invite = repo.invite_links.create(
        tournament_id=tournament_id,
        role=body.role,
        created_by=user_uuid,
        email=email,
        expires_at=expires_at,
    )
    if email:
        from core.config import settings
        from core.email import send_email

        tournament = repo.tournaments.get_by_id(tournament_id)
        # OPERATOR tier (SP-HOST-1 D-9): a workspace invite is accepted in
        # the console, behind Access, by someone who will be a member.
        origin = settings.app_origin
        send_email(
            to=email,
            subject=f"You're invited to {tournament.name or 'a ShuttleWorks workspace'}",
            body=(
                f"You've been invited as {invite.role}.\n\n"
                f"Accept here: {origin}/invite/{invite.id}\n\n"
                f"This invite expires {expires_at:%Y-%m-%d}."
            ),
        )
    return InviteCreatedDTO(
        token=str(invite.id),
        url=f"/invite/{invite.id}",
        tournamentId=str(tournament_id),
        role=invite.role,  # type: ignore[arg-type]
        createdAt=invite.created_at.isoformat(),
    )


@router.get(
    "/{tournament_id}/invites",
    response_model=List[InviteSummaryDTO],
    dependencies=[Depends(require_tournament_access("owner"))],
)
def list_invite_links(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """List every invite (active + revoked + expired) for a tournament.

    Owner-only. The Step 7 Settings → Share UI uses this to render the
    "Active links" + revoke-button list.
    """
    rows = repo.invite_links.list_for_tournament(tournament_id)
    return [_invite_summary(r) for r in rows]


# ---- Member listing scoped under a tournament ---------------------------


class TournamentMemberDTO(BaseModel):
    """Wire shape for the Step 7 Settings → Share "Members" list.

    ``email``/``displayName`` (SP-CLOUD-2) come from the users table;
    ``email`` is None for pre-account placeholder identities."""
    userId: str
    role: str
    joinedAt: str
    email: Optional[str] = None
    displayName: Optional[str] = None


@router.get(
    "/{tournament_id}/members",
    response_model=List[TournamentMemberDTO],
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_tournament_members(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """All members of a tournament. Viewer-level so any member can see
    who else has access; owner-only management actions stay gated.

    SP-CLOUD-2: rows carry real identity (email/display name from the
    users table) — People & Access finally shows people, not UUIDs.
    Placeholder ``@unmigrated.local`` addresses (pre-account era) are
    withheld so the UI falls back to its short-id rendering.
    """
    from db.models import User

    members = repo.members.list_for_tournament(tournament_id)
    users = {
        u.id: u
        for u in repo.session.query(User)
        .filter(User.id.in_([m.user_id for m in members]))
        .all()
    } if members else {}

    def _identity(m):
        u = users.get(m.user_id)
        if u is None or u.email.endswith("@unmigrated.local"):
            return None, (u.display_name if u else None)
        return u.email, u.display_name

    out = []
    for m in members:
        email, display = _identity(m)
        out.append(
            TournamentMemberDTO(
                userId=str(m.user_id),
                role=m.role,
                joinedAt=m.joined_at.isoformat() if m.joined_at else "",
                email=email,
                displayName=display,
            )
        )
    return out


# ---- Member management (SP-CLOUD-3 Phase 1) -----------------------------
#
# The invariant lives in ``identity/members.py``, not here: these routes
# translate its errors to HTTP and own the transaction. Removal takes
# effect immediately because ``require_tournament_access`` reads
# membership live per request and nothing caches it.
#
# ROUTE ORDER MATTERS: ``/members/me`` must be declared before
# ``/members/{user_id}``. FastAPI matches in declaration order, and
# ``user_id`` is typed ``uuid.UUID``, so the literal "me" would 422
# against the parameterised route instead of reaching the leave handler.


class RoleChangeRequest(StrictModel):
    # Validated against ``members_service.ROLES`` in the handler, which
    # owns the last-owner invariant too; bounded here so an unknown role
    # is a short string either way.
    role: Code


class TransferOwnershipRequest(StrictModel):
    userId: Identifier


def _member_error(exc: members_service.MemberError):
    if isinstance(exc, members_service.LastOwnerError):
        return http_error(
            status.HTTP_409_CONFLICT,
            ErrorCode.MEMBER_LAST_OWNER,
            "A workspace must always have at least one owner.",
        )
    return http_error(
        status.HTTP_404_NOT_FOUND,
        ErrorCode.MEMBER_NOT_FOUND,
        "That person is not a member of this workspace.",
    )


@router.delete(
    "/{tournament_id}/members/me",
    status_code=204,
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def leave_tournament(
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Remove yourself from a workspace.

    Viewer-gated: any member may leave. A sole owner cannot — self-removal
    goes through the same guard as being removed, so it is not a back door
    around the last-owner invariant.
    """
    user_uuid = user.as_uuid()
    if user_uuid is None:
        raise _member_error(members_service.MemberNotFoundError())
    try:
        members_service.remove_member(repo.session, tournament_id, user_uuid)
        repo.session.commit()
    except members_service.MemberError as exc:
        repo.session.rollback()
        raise _member_error(exc)
    return Response(status_code=204)


@router.delete(
    "/{tournament_id}/members/{user_id}",
    status_code=204,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def remove_tournament_member(
    tournament_id: uuid.UUID = Path(...),
    user_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Remove a member. Owner-gated. Effective on their next request."""
    try:
        members_service.remove_member(repo.session, tournament_id, user_id)
        repo.session.commit()
    except members_service.MemberError as exc:
        repo.session.rollback()
        raise _member_error(exc)
    return Response(status_code=204)


@router.patch(
    "/{tournament_id}/members/{user_id}",
    response_model=TournamentMemberDTO,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def change_tournament_member_role(
    body: RoleChangeRequest,
    tournament_id: uuid.UUID = Path(...),
    user_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Promote or demote a member. Owner-gated.

    Demoting the only owner is refused (409) rather than silently
    reordering the workspace into an unreachable state.
    """
    from db.models import User

    try:
        members_service.set_role(repo.session, tournament_id, user_id, body.role)
        repo.session.commit()
    except ValueError:
        repo.session.rollback()
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.MEMBER_INVALID_ROLE,
            f"Role must be one of: {', '.join(members_service.ROLES)}.",
        )
    except members_service.MemberError as exc:
        repo.session.rollback()
        raise _member_error(exc)

    row = repo.session.get(TournamentMember, (tournament_id, user_id))
    u = repo.session.get(User, user_id)
    email = None if (u is None or u.email.endswith("@unmigrated.local")) else u.email
    return TournamentMemberDTO(
        userId=str(user_id),
        role=row.role,
        joinedAt=row.joined_at.isoformat() if row.joined_at else "",
        email=email,
        displayName=(u.display_name if u else None),
    )


@router.post(
    "/{tournament_id}/transfer-ownership",
    status_code=204,
    dependencies=[Depends(require_tournament_access("owner"))],
)
def transfer_tournament_ownership(
    body: TransferOwnershipRequest,
    tournament_id: uuid.UUID = Path(...),
    user: AuthUser = Depends(get_current_user),
    repo: LocalRepository = Depends(get_repository),
):
    """Hand the workspace to another member, demoting yourself to operator.

    An explicit operation rather than demote-then-promote, which would
    pass through a zero-owner state.
    """
    caller = user.as_uuid()
    if caller is None:
        raise _member_error(members_service.MemberNotFoundError())
    try:
        target = uuid.UUID(body.userId)
    except (ValueError, AttributeError, TypeError):
        raise _member_error(members_service.MemberNotFoundError())
    try:
        members_service.transfer_ownership(
            repo.session, tournament_id, caller, target
        )
        repo.session.commit()
    except members_service.MemberError as exc:
        repo.session.rollback()
        raise _member_error(exc)
    return Response(status_code=204)
