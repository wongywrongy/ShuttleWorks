"""Published roster/scoring definitions. Changes create a new version."""

import uuid
from sqlalchemy import select
from db.models import EventFormatVersion, ScoringProfileVersion

CATALOG_NAMESPACE = uuid.UUID("b5834c82-a2bd-493f-9d07-c98ac5c46c87")


def catalog_id(key):
    return uuid.uuid5(CATALOG_NAMESPACE, key)


def seed_catalog(session):
    scoring_id = catalog_id("badminton/1")
    if session.get(ScoringProfileVersion, scoring_id) is None:
        session.add(
            ScoringProfileVersion(
                id=scoring_id,
                profile_key="badminton",
                version=1,
                rules={
                    "scoring": "badminton",
                    "pointsPerSet": 21,
                    "deuceEnabled": True,
                    "pointCap": 30,
                    "setsToWin": 2,
                },
            )
        )
        session.flush()
    for key, size, gender in [
        ("singles", 1, "event"),
        ("doubles", 2, "event"),
        ("mixed", 2, "mixed"),
    ]:
        ident = catalog_id(f"{key}/1")
        if session.get(EventFormatVersion, ident) is None:
            session.add(
                EventFormatVersion(
                    id=ident,
                    format_key=key,
                    version=1,
                    roster_min=size,
                    roster_max=size,
                    gender_rule=gender,
                    scoring_profile_version_id=scoring_id,
                )
            )
    session.flush()


def formats(session):
    return list(
        session.scalars(
            select(EventFormatVersion)
            .where(EventFormatVersion.published.is_(True))
            .order_by(EventFormatVersion.format_key, EventFormatVersion.version)
        )
    )


def update_unpublished(session, row, **fields):
    if row.published:
        raise ValueError("Published catalog versions are immutable; publish a new version")
    for key, value in fields.items():
        if key in {"id", "version", "format_key", "profile_key"} or not hasattr(row, key):
            raise ValueError(f"Cannot update catalog field {key}")
        setattr(row, key, value)
    session.flush()
