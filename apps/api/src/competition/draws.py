"""Track draw revisions while the existing match projection remains in use."""

from sqlalchemy import func, select
from db.models import CompetitionEvent, DrawInstance


def record_status(session, tournament_id, bracket_event_id, status, *, config=None):
    event = session.scalar(
        select(CompetitionEvent).where(
            CompetitionEvent.tournament_id == tournament_id,
            CompetitionEvent.bracket_event_id == bracket_event_id,
        )
    )
    if event is None:
        return
    current = session.scalar(
        select(DrawInstance)
        .where(
            DrawInstance.tournament_id == tournament_id,
            DrawInstance.competition_event_id == event.id,
            DrawInstance.status != "superseded",
        )
        .order_by(DrawInstance.revision.desc())
    )
    if status not in {"generated", "started", "completed"}:
        if current:
            current.status = "superseded"
        session.flush()
        return
    if current is None:
        revision = 1 + (
            session.scalar(
                select(func.max(DrawInstance.revision)).where(
                    DrawInstance.tournament_id == tournament_id,
                    DrawInstance.competition_event_id == event.id,
                )
            )
            or 0
        )
        current = DrawInstance(
            tournament_id=tournament_id,
            competition_event_id=event.id,
            revision=revision,
            status=status,
            config=config or {},
        )
        session.add(current)
    else:
        current.status = status
    session.flush()
