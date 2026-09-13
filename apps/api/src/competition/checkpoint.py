"""Current-version checkpoint slice for canonical registration/competition.

Entrant credentials and invitation capabilities never travel to event nodes.
The import is staged inside the checkpoint application's existing transaction.
"""

import uuid
from datetime import datetime
from sqlalchemy import DateTime, Uuid, select
from db.models import (
    CompetitionAudit,
    CompetitionEvent,
    CompetitionUnit,
    DrawInstance,
    Entry,
    EntryEvent,
    EntryPlayer,
    EntrantAccount,
    EventFormatVersion,
    PartnerInvitation,
    Payment,
    PlayerRepresentative,
    ScoringProfileVersion,
    Submission,
)

MODELS = (
    ScoringProfileVersion,
    EventFormatVersion,
    CompetitionEvent,
    EntryPlayer,
    EntryEvent,
    Submission,
    Entry,
    PlayerRepresentative,
    PartnerInvitation,
    Payment,
    CompetitionUnit,
)
# Defined separately to keep the order explicit: entries and units precede memberships.
from db.models import UnitMembership

MODELS = MODELS + (UnitMembership, DrawInstance, CompetitionAudit)
GLOBAL_MODELS = (ScoringProfileVersion, EventFormatVersion)


def serialize(row):
    values = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        values[column.name] = (
            value.isoformat()
            if isinstance(value, datetime)
            else str(value)
            if isinstance(value, uuid.UUID)
            else value
        )
    return values


def export_slice(session, tournament_id):
    result = {"schemaVersion": 1}
    for model in MODELS:
        query = select(model)
        if model not in GLOBAL_MODELS:
            query = query.where(model.tournament_id == tournament_id)
        result[model.__tablename__] = sorted(
            [serialize(row) for row in session.scalars(query)], key=lambda r: str(r.get("id") or r)
        )
    accounts = {r["account_id"] for r in result["submissions"]} | {
        r["account_id"] for r in result["player_representatives"]
    }
    result["accounts"] = []
    for account_id in sorted(accounts):
        account = session.get(EntrantAccount, uuid.UUID(account_id))
        result["accounts"].append(
            {"id": account_id, "email": account.email, "display_name": account.display_name}
        )
    for invitation in result["partner_invitations"]:
        invitation["token_hash"] = None
        if invitation["status"] == "sent":
            invitation["status"] = "revoked"
    return result


def import_slice(session, tournament_id, data):
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise ValueError("Invalid competition checkpoint slice")
    for raw in data.get("accounts", []):
        ident = uuid.UUID(raw["id"])
        existing = session.get(EntrantAccount, ident)
        if existing is None:
            session.add(
                EntrantAccount(
                    id=ident,
                    email=raw["email"],
                    display_name=raw.get("display_name"),
                    password_hash=None,
                )
            )
        elif existing.email != raw["email"]:
            raise ValueError("Checkpoint representative identity conflicts with this node")
    session.flush()
    confirm = []
    for model in MODELS:
        if not isinstance(data.get(model.__tablename__), list):
            raise ValueError(f"Missing checkpoint table {model.__tablename__}")
        for raw in data[model.__tablename__]:
            values = {}
            for col in model.__table__.columns:
                if col.name not in raw:
                    continue
                value = raw[col.name]
                if value is not None and isinstance(col.type, Uuid):
                    value = uuid.UUID(value)
                elif value is not None and isinstance(col.type, DateTime):
                    value = datetime.fromisoformat(value)
                values[col.name] = value
            if model not in GLOBAL_MODELS and values.get("tournament_id") != tournament_id:
                raise ValueError("Checkpoint row belongs to another tournament")
            if model in GLOBAL_MODELS:
                existing = session.get(model, values["id"])
                if existing:
                    if serialize(existing) != raw:
                        raise ValueError("Published catalog version conflicts with checkpoint")
                    continue
            if model is PartnerInvitation and values.get("token_hash") is not None:
                raise ValueError("Invitation credentials are forbidden in checkpoints")
            if model is CompetitionUnit and values["status"] == "confirmed":
                confirm.append(values["id"])
                values["status"] = "pending"
            session.add(model(**values))
        session.flush()
    for ident in confirm:
        session.get(CompetitionUnit, (tournament_id, ident)).status = "confirmed"
    session.flush()
