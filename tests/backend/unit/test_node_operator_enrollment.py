"""Node activation custody and transaction proofs on SQLite and PostgreSQL."""
from datetime import timedelta
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.time_utils import _aware
from core.tokens import _hash_token
from db.models import NodeOperatorEnrollment, StateTransition, Tournament, TournamentAuthority, TournamentMember, User
from identity import node_identity
from identity.auth import verify_password
from identity.mfa import MfaError
from repositories.local import LocalRepository
from tests.backend.unit import test_baseline_schema as fixtures
from tests.backend.unit.test_operator_mfa import NOW

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated
PASSWORD = "this password belongs to the node alone"


@pytest.fixture
def operator(migrated):
    with Session(migrated, autoflush=False, expire_on_commit=False) as session:
        user = User(id=uuid.uuid4(), email="offline@example.test")
        tid, node_id = uuid.uuid4(), uuid.uuid4()
        session.add_all([user, Tournament(id=tid, name="Individual enrollment", data={}, schema_version=1)])
        session.flush()
        session.add(TournamentMember(tournament_id=tid, user_id=user.id, role="operator"))
        session.add(TournamentAuthority(tournament_id=tid, epoch=1, node_id=node_id, state="active",
            checkpoint_hash="a" * 64, checkpoint_schema_version=1, capability_digest="b" * 64))
        session.commit()
        yield LocalRepository(session), user, dict(tournament_id=tid, node_id=node_id, now=NOW)


def test_activation_is_hashed_audited_and_never_asserts_mfa(operator):
    repo, user, scope = operator
    with repo.transaction():
        token, expires = node_identity.provision(repo, user_id=user.id, **scope)
    row = repo.mfa.node_enrollment(user.id)
    assert row.token_hash == _hash_token(token)
    assert _aware(row.expires_at) == expires == NOW + timedelta(minutes=10)
    with repo.transaction():
        account, _, credential = node_identity.activate(repo, email=user.email, token=token, password=PASSWORD, **scope)
    assert verify_password(account.password_hash, PASSWORD)
    assert credential.authenticated_at is None and credential.mfa_generation is None
    records = repo.session.scalars(select(StateTransition).where(StateTransition.machine == "node_operator_enrollment")
                                  .order_by(StateTransition.occurred_at)).all()
    assert [(r.event, r.actor_type, r.actor_id) for r in records] == [
        ("issue", "system", str(scope["node_id"])), ("activate", "operator", str(user.id)),
    ]
    assert all(token not in repr(r.detail) and token not in (r.reason or "") for r in records)


def test_reissuing_activation_invalidates_the_old_token_without_resetting_an_account(operator):
    repo, user, scope = operator
    with repo.transaction(): token, _ = node_identity.provision(repo, user_id=user.id, **scope)
    with repo.transaction(): replacement, _ = node_identity.provision(repo, user_id=user.id, **scope)
    with pytest.raises(MfaError), repo.transaction():
        node_identity.activate(repo, email=user.email, token=token, password=PASSWORD, **scope)
    with repo.transaction():
        node_identity.activate(repo, email=user.email, token=replacement, password=PASSWORD, **scope)
    with pytest.raises(MfaError, match="NODE_ALREADY_CONFIGURED"), repo.transaction():
        node_identity.provision(repo, user_id=user.id, **scope)


def test_failed_session_issue_rolls_back_password_and_activation_consumption(operator, monkeypatch):
    repo, user, scope = operator
    with repo.transaction(): token, _ = node_identity.provision(repo, user_id=user.id, **scope)
    def fail(*args, **kwargs): raise RuntimeError("credential persistence failed")
    with monkeypatch.context() as patched:
        patched.setattr(node_identity.offline_sessions, "issue", fail)
        with pytest.raises(RuntimeError), repo.transaction():
            node_identity.activate(repo, email=user.email, token=token, password=PASSWORD, **scope)
    repo.session.refresh(user)
    assert user.password_hash is None
    row = repo.session.scalar(select(NodeOperatorEnrollment))
    assert row.status == "pending"
    with repo.transaction():
        node_identity.activate(repo, email=user.email, token=token, password=PASSWORD, **scope)


def test_explicit_administrator_recovery_revokes_credentials_and_audits_the_reset(operator):
    import base64
    import secrets
    from core.secret_keys import SecretKeyring, secret_key_id
    from db.models import OfflineOperatorSession, OperatorRecoveryCode
    from identity import mfa
    from identity.mfa_crypto import totp_code
    repo, user, scope = operator
    with repo.transaction(): token, _ = node_identity.provision(repo, user_id=user.id, **scope)
    with repo.transaction():
        _, _, credential = node_identity.activate(repo, email=user.email, token=token, password=PASSWORD, **scope)
    material = secrets.token_bytes(32)
    options = dict(scope=f"node:{scope['node_id']}", keys=SecretKeyring(secret_key_id(material), {secret_key_id(material): material}), now=NOW)
    with repo.transaction():
        seed = mfa.begin_enrollment(repo, user.id, PASSWORD, fresh=False, session_id=credential.id, **options)
    with repo.transaction():
        _, old_codes = mfa.confirm_enrollment(repo, user.id, totp_code(base64.b32decode(seed), NOW.timestamp()), session_id=credential.id, **options)
    with repo.transaction():
        replacement, _ = node_identity.provision(repo, user_id=user.id, reset_reason="Identity checked by local administrator", **scope)
    repo.session.refresh(user)
    factor = repo.mfa.get(user.id)
    assert user.password_hash is None
    assert factor.status == "unconfigured" and factor.secret_ciphertext is None
    assert factor.pending_ciphertext is None and factor.generation == 2
    assert not repo.session.scalars(select(OperatorRecoveryCode)).all()
    assert all(row.revoked_at is not None for row in repo.session.scalars(select(OfflineOperatorSession)))
    resets = repo.session.scalars(select(StateTransition).where(StateTransition.event == "administrator_reset")).all()
    assert len(resets) == 2
    assert all(row.actor_type == "system" and row.actor_id == str(scope["node_id"]) for row in resets)
    with pytest.raises(mfa.MfaError), repo.transaction():
        mfa.verify_factor(repo, user.id, old_codes[0], **options)
    with repo.transaction():
        _, _, pending = node_identity.activate(repo, email=user.email, token=replacement, password=PASSWORD, **scope)
    assert pending.authenticated_at is None and pending.mfa_generation is None
