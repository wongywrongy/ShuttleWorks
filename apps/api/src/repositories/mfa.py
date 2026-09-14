"""MFA persistence adapter. The caller owns the enclosing transaction.

Every factor mutation takes a database write reservation before reading the
factor. This serializes code consumption on SQLite as well as PostgreSQL;
SELECT FOR UPDATE alone would not protect the event node.
"""
from __future__ import annotations

from datetime import datetime
import uuid
import secrets

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from db.models import (AuthSession, OfflineOperatorSession, OperatorMfaFactor, OperatorRecoveryCode,
                       NodeOperatorEnrollment, TournamentAuthority, TournamentMember, User)
from core.operator_sessions import ABSOLUTE_LIFETIME, IDLE_LIFETIME
from core.time_utils import _aware
from core.tokens import _hash_token


class MfaRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, user_id: uuid.UUID) -> OperatorMfaFactor | None:
        return self.session.scalar(select(OperatorMfaFactor).where(OperatorMfaFactor.user_id == user_id))

    def reserve_account(self, user_id: uuid.UUID) -> User | None:
        """Serialize credential changes and grants, including users without MFA.

        Always acquire the account before the factor. Refresh pre-lock password
        and reset-token snapshots so a delayed request cannot reuse either.
        """
        self.session.flush()
        self.session.execute(update(User).where(User.id == user_id).values(id=User.id)
                             .execution_options(synchronize_session=False))
        return self.session.scalar(select(User).where(User.id == user_id)
                                   .execution_options(populate_existing=True))

    def reserve(self, user_id: uuid.UUID, scope: str, now: datetime, *, create: bool = False) -> OperatorMfaFactor | None:
        # Production sessions disable autoflush. Preserve staged consumption
        # before refreshing a factor again within a composed unit of work.
        self.reserve_account(user_id)
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

    def revoke_sessions(self, user_id: uuid.UUID, now: datetime, *, except_session_id: uuid.UUID | None = None) -> None:
        for model in (AuthSession, OfflineOperatorSession):
            statement = update(model).where(
                model.user_id == user_id, model.revoked_at.is_(None),
            )
            if except_session_id is not None:
                statement = statement.where(model.id != except_session_id)
            self.session.execute(statement.values(revoked_at=now))

    def credential(self, session_id: uuid.UUID, user_id: uuid.UUID, *, offline: bool):
        model = OfflineOperatorSession if offline else AuthSession
        return self.session.scalar(select(model).where(
            model.id == session_id, model.user_id == user_id,
        ).execution_options(populate_existing=True))

    @staticmethod
    def _live_credential(model, session_id: uuid.UUID, user_id: uuid.UUID, now: datetime):
        return update(model).where(
            model.id == session_id, model.user_id == user_id, model.revoked_at.is_(None),
            model.created_at <= now, model.created_at > now - ABSOLUTE_LIFETIME,
            model.last_seen_at >= model.created_at, model.last_seen_at <= now,
            model.last_seen_at > now - IDLE_LIFETIME, model.expires_at > now,
        ).execution_options(synchronize_session=False)

    def rotate_session(self, row, generation: int, now: datetime):
        model = type(row)
        result = self.session.execute(self._live_credential(model, row.id, row.user_id, now).values(revoked_at=now))
        if result.rowcount != 1:
            return None
        token = secrets.token_urlsafe(32)
        fields = dict(user_id=row.user_id, token_hash=_hash_token(token), created_at=row.created_at,
                      last_seen_at=now, expires_at=min(_aware(row.expires_at), _aware(row.created_at) + ABSOLUTE_LIFETIME),
                      mfa_generation=generation, authenticated_at=now)
        if isinstance(row, OfflineOperatorSession):
            fields.update(tournament_id=row.tournament_id, authority_epoch=row.authority_epoch, device_id=row.device_id)
        replacement = model(**fields)
        self.session.add(replacement)
        self.session.flush()
        return token, replacement

    def record_activity(self, session_id: uuid.UUID, user_id: uuid.UUID, *, offline: bool, now: datetime) -> bool:
        model = OfflineOperatorSession if offline else AuthSession
        result = self.session.execute(self._live_credential(model, session_id, user_id, now).values(last_seen_at=now))
        return result.rowcount == 1

    def persist_transition(self, record) -> None:
        record.persist(self.session)

    def node_scope(self, user_id: uuid.UUID, tournament_id: uuid.UUID, node_id: uuid.UUID):
        authority = self.session.scalar(select(TournamentAuthority).where(
            TournamentAuthority.tournament_id == tournament_id,
            TournamentAuthority.node_id == node_id,
            TournamentAuthority.state == "active",
        ).order_by(TournamentAuthority.epoch.desc()).limit(1))
        member = self.session.get(TournamentMember, (tournament_id, user_id))
        return authority if member is not None and member.role in {"owner", "operator"} else None

    def node_enrollment(self, user_id: uuid.UUID):
        return self.session.scalar(select(NodeOperatorEnrollment).where(
            NodeOperatorEnrollment.user_id == user_id,
        ).execution_options(populate_existing=True))

    def save_node_enrollment(self, user_id: uuid.UUID, *, tournament_id: uuid.UUID,
                            node_id: uuid.UUID, epoch: int, digest: str, now: datetime, expires_at: datetime):
        self.session.flush()
        row = self.node_enrollment(user_id)
        if row is None:
            row = NodeOperatorEnrollment(id=uuid.uuid4(), user_id=user_id, status="pending")
            self.session.add(row)
        row.tournament_id, row.node_id, row.authority_epoch = tournament_id, node_id, epoch
        row.token_hash, row.created_at, row.expires_at = digest, now, expires_at
        self.session.flush()
        return row

    def consume_node_enrollment(self, row, digest: str, now: datetime) -> bool:
        result = self.session.execute(update(NodeOperatorEnrollment).where(
            NodeOperatorEnrollment.id == row.id, NodeOperatorEnrollment.status == "pending",
            NodeOperatorEnrollment.token_hash == digest, NodeOperatorEnrollment.created_at <= now,
            NodeOperatorEnrollment.expires_at > now,
        ).values(status="consumed").execution_options(synchronize_session=False))
        return result.rowcount == 1
