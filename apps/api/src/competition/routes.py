"""Operator commands for registration realization."""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from core.limits import Code, Identifier, StrictModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from core.dependencies import require_tournament_access
from repositories import LocalRepository, get_repository
from db.models import CompetitionEvent, CompetitionUnit, EntryEvent, EntryPlayer
from core.schemas import EntryEventDTO, EntryBindResultDTO, EntryBindOutcomeDTO
from competition import service
from competition.catalog import catalog_id, seed_catalog, formats

router = APIRouter(prefix="/tournaments/{tournament_id}/competition", tags=["competition"])


class EventRequest(StrictModel):
    categoryCode: str = Field(min_length=1, max_length=100)
    formatKey: Code
    formatVersion: int = Field(default=1, ge=1)
    genderCategory: Code | None = None
    ageGroup: Code | None = None
    level: Code | None = None
    bracketEventId: Identifier | None = None
    meetEventId: Identifier | None = None


class BindRequest(StrictModel):
    entryEventId: uuid.UUID | None = None
    competitionEventId: uuid.UUID | None = None
    requestId: str = Field(min_length=1, max_length=100)


class RebindRequest(StrictModel):
    competitionEventId: uuid.UUID
    unitId: uuid.UUID | None = None
    expectedVersion: int = Field(ge=1)
    targetVersion: int | None = Field(default=None, ge=1)
    requestId: str = Field(min_length=1, max_length=100)


class DefaultTargetRequest(StrictModel):
    competitionEventId: uuid.UUID | None
    expectedVersion: int = Field(ge=1)


class WithdrawUnitRequest(StrictModel):
    expectedVersion: int = Field(ge=1)


@router.post("/units/{unit_id}/withdraw")
def withdraw_unit(
    tournament_id: uuid.UUID,
    unit_id: uuid.UUID,
    body: WithdrawUnitRequest,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    return command(
        repo,
        service.withdraw_competition_unit,
        tournament_id,
        unit_id,
        expected_version=body.expectedVersion,
        actor_id=str(actor.as_uuid()),
    )


@router.get("/registration-events", response_model=list[EntryEventDTO])
def registration_events(
    tournament_id: uuid.UUID,
    actor=Depends(require_tournament_access("viewer")),
    repo: LocalRepository = Depends(get_repository),
):
    return repo.execute_query(
        lambda session: [
            EntryEventDTO.from_row(e)
            for e in session.scalars(
                select(EntryEvent)
                .where(EntryEvent.tournament_id == tournament_id)
                .order_by(EntryEvent.code)
            )
        ]
    )


def command(repo, operation, *args, **kwargs):
    try:
        return repo.execute_transaction(operation, *args, **kwargs)
    except service.CompetitionError as exc:
        raise HTTPException(409, detail={"code": exc.code, "message": exc.message}) from exc
    except (IntegrityError, StaleDataError) as exc:
        raise HTTPException(
            409,
            detail={
                "code": "COMPETITION_CONFLICT",
                "message": "The roster changed or violates a competition constraint; reload and retry",
            },
        ) from exc


@router.get("/formats")
def list_formats(
    tournament_id: uuid.UUID,
    actor=Depends(require_tournament_access("viewer")),
    repo: LocalRepository = Depends(get_repository),
):
    return [
        {
            "id": str(f.id),
            "key": f.format_key,
            "version": f.version,
            "rosterMin": f.roster_min,
            "rosterMax": f.roster_max,
            "genderRule": f.gender_rule,
        }
        for f in repo.execute_query(formats)
    ]


@router.get("/events")
def list_events(
    tournament_id: uuid.UUID,
    actor=Depends(require_tournament_access("viewer")),
    repo: LocalRepository = Depends(get_repository),
):
    def read(session):
        return [
            {
                "id": str(e.id),
                "categoryCode": e.category_code,
                "formatVersionId": str(e.format_version_id),
                "bracketEventId": e.bracket_event_id,
                "meetEventId": e.meet_event_id,
                "version": e.version,
            }
            for e in session.scalars(
                select(CompetitionEvent).where(CompetitionEvent.tournament_id == tournament_id)
            )
        ]

    return repo.execute_query(read)


@router.post("/events")
def create_event(
    tournament_id: uuid.UUID,
    body: EventRequest,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    def create(session):
        seed_catalog(session)
        event = CompetitionEvent(
            tournament_id=tournament_id,
            category_code=body.categoryCode,
            format_version_id=catalog_id(f"{body.formatKey}/{body.formatVersion}"),
            gender_category=body.genderCategory,
            age_group=body.ageGroup,
            level=body.level,
            bracket_event_id=body.bracketEventId,
            meet_event_id=body.meetEventId,
        )
        session.add(event)
        session.flush()
        return {"id": str(event.id), "version": event.version}

    return command(repo, create)


@router.put("/entry-events/{entry_event_id}/default")
def set_default(
    tournament_id: uuid.UUID,
    entry_event_id: uuid.UUID,
    body: DefaultTargetRequest,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    def change(session):
        service.lock_workspace(session, tournament_id)
        event = session.get(EntryEvent, (tournament_id, entry_event_id))
        if event is None:
            raise service.CompetitionError("NOT_FOUND", "Entry event not found")
        if event.version != body.expectedVersion:
            raise service.CompetitionError("VERSION_CONFLICT", "The entry event changed; reload")
        if body.competitionEventId:
            service.event_for(session, tournament_id, body.competitionEventId)
        event.competition_event_id = body.competitionEventId
        session.flush()
        return {
            "id": str(event.id),
            "competitionEventId": str(event.competition_event_id)
            if event.competition_event_id
            else None,
            "version": event.version,
        }

    return command(repo, change)


@router.post("/bind", response_model=EntryBindResultDTO)
def bind_entries(
    tournament_id: uuid.UUID,
    body: BindRequest,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    return command(
        repo,
        service.bind,
        tournament_id,
        entry_event_id=body.entryEventId,
        competition_event_id=body.competitionEventId,
        request_id=body.requestId,
        actor_id=str(actor.as_uuid()),
    )


@router.post("/entries/{entry_id}/rebind", response_model=EntryBindOutcomeDTO)
def rebind_entry(
    tournament_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: RebindRequest,
    actor=Depends(require_tournament_access("operator")),
    repo: LocalRepository = Depends(get_repository),
):
    return command(
        repo,
        service.rebind,
        tournament_id,
        entry_id,
        target_event_id=body.competitionEventId,
        target_unit_id=body.unitId,
        expected_version=body.expectedVersion,
        target_version=body.targetVersion,
        actor_id=str(actor.as_uuid()),
        request_id=body.requestId,
    )


@router.get("/units")
def list_units(
    tournament_id: uuid.UUID,
    actor=Depends(require_tournament_access("viewer")),
    repo: LocalRepository = Depends(get_repository),
):
    def read(session):
        return [
            {
                "id": str(u.id),
                "competitionEventId": str(u.competition_event_id),
                "status": u.status,
                "version": u.version,
                "label": " / ".join(
                    session.get(EntryPlayer, (tournament_id, m.player_id)).full_name
                    for m in service.members_of(session, u, active=True)
                ),
                "memberships": [service.outcome(m) for m in service.members_of(session, u)],
            }
            for u in session.scalars(
                select(CompetitionUnit).where(CompetitionUnit.tournament_id == tournament_id)
            )
        ]

    return repo.execute_query(read)
