"""MFA persistence adapter. The caller owns the enclosing transaction.

Every factor mutation takes a database write reservation before reading the
factor. This serializes code consumption on SQLite as well as PostgreSQL;
SELECT FOR UPDATE alone would not protect the event node.
"""
from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from db.models import AuthSession, OfflineOperatorSession, OperatorMfaFactor, OperatorRecoveryCode


class MfaRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, user_id: uuid.UUID) -> OperatorMfaFactor | None:
        return self.session.scalar(select(OperatorMfaFactor).where(OperatorMfaFactor.user_id == user_id))

    def reserve(self, user_id: uuid.UUID, scope: str, now: datetime, *, create: bool = False) -> OperatorMfaFactor | None:
        # Production sessions disable autoflush. Preserve staged consumption
        # before refreshing a factor again within a composed unit of work.
        self.session.flush()
        if create:
            insert = pg_insert if self.session.get_bind().dialect.name == "postgresql" else sqlite_insert
            self.session.execute(insert(OperatorMfaFactor).values(
                id=uuid.uuid4(), user_id=user_id, scope=scope, status="unconfigured",
                generation=0, revision=0, last_counter=-1, created_at=now, updated_at=now,
            ).on_conflict_do_nothing(index_elements=["user_id"]))
        self.session.execute(update(OperatorMfaFactor).where(
            OperatorMfaFactor.user_id == user_id, OperatorMfaFactor.scope == scope,
        ).values(revision=OperatorMfaFactor.revision + 1).execution_options(synchronize_session=False))
        # Refresh any pre-lock identity-map snapshot after the reservation.
        return self.session.scalar(select(OperatorMfaFactor).where(
            OperatorMfaFactor.user_id == user_id, OperatorMfaFactor.scope == scope,
        ).execution_options(populate_existing=True))

    def replace_recovery_codes(self, factor_id: uuid.UUID, hashes: list[str], now: datetime) -> None:
        self.session.execute(delete(OperatorRecoveryCode).where(OperatorRecoveryCode.factor_id == factor_id))
        self.session.add_all([
            OperatorRecoveryCode(factor_id=factor_id, token_hash=value, created_at=now)
            for value in hashes
        ])

    def consume_recovery_code(self, factor_id: uuid.UUID, digest: str) -> bool:
        result = self.session.execute(delete(OperatorRecoveryCode).where(
            OperatorRecoveryCode.factor_id == factor_id, OperatorRecoveryCode.token_hash == digest,
        ))
        return result.rowcount == 1

    def revoke_sessions(self, user_id: uuid.UUID, now: datetime) -> None:
        for model in (AuthSession, OfflineOperatorSession):
            self.session.execute(update(model).where(
                model.user_id == user_id, model.revoked_at.is_(None),
            ).values(revoked_at=now))

    def persist_transition(self, record) -> None:
        record.persist(self.session)
