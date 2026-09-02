from datetime import timedelta
import uuid

import pytest
from fastapi import Response
from db.models import Tournament, TournamentAuthority, TournamentMember, User
class _SettingsProxy:
    def __getattr__(self, name):
        from core.config import settings as current

        return getattr(current, name)

    def __setattr__(self, name, value):
        from core.config import settings as current

        setattr(current, name, value)


settings = _SettingsProxy()
from core.dependencies import AuthUser
from core.time_utils import _utcnow
from identity import offline_sessions
from repositories import LocalRepository
from sync.routes import bootstrap_offline_session, create_offline_session
from sync.schemas import OfflineSessionBootstrapRequest, OfflineSessionRequest


def _scope(session):
    user_id, tournament_id, node_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    session.add(User(id=user_id, email=f"{user_id.hex}@example.test"))
    session.add(Tournament(id=tournament_id, name="Offline event", data={}, schema_version=2))
    session.add(
        TournamentMember(
            tournament_id=tournament_id,
            user_id=user_id,
            role="operator",
        )
    )
    session.add(TournamentAuthority(
        tournament_id=tournament_id, epoch=2, node_id=node_id, state="active",
        checkpoint_hash="a" * 64, checkpoint_schema_version=3,
        capability_digest="b" * 64,
    ))
    session.flush()
    return user_id, tournament_id, node_id


@pytest.fixture
def session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from db.models import Base
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as value:
        yield value


def test_session_is_hashed_scoped_and_resolvable(session):
    user_id, tournament_id, node_id = _scope(session)
    token, row = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id)
    assert row.token_hash != token
    resolved = offline_sessions.resolve(session, token, tournament_id=tournament_id)
    assert resolved is not None and resolved[0].id == user_id
    assert offline_sessions.resolve(session, token, tournament_id=uuid.uuid4()) is None


def test_bootstrap_issues_node_credential_from_capability_without_cloud_session(session):
    user_id, tournament_id, node_id = _scope(session)
    capability = "capability-" + "x" * 40
    authority = session.get(TournamentAuthority, (tournament_id, 2))
    import hashlib
    authority.capability_digest = hashlib.sha256(capability.encode()).hexdigest()
    token, row = offline_sessions.bootstrap(
        session,
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=2,
        device_id=node_id,
        capability=capability,
    )
    assert row.token_hash != token
    assert offline_sessions.resolve(session, token, tournament_id=tournament_id) is not None


def test_bootstrap_rejects_wrong_capability(session):
    user_id, tournament_id, node_id = _scope(session)
    with pytest.raises(ValueError, match="capability"):
        offline_sessions.bootstrap(
            session,
            user_id=user_id,
            tournament_id=tournament_id,
            authority_epoch=2,
            device_id=node_id,
            capability="capability-" + "x" * 40,
        )


def test_expiry_and_revocation_are_fail_closed(session):
    user_id, tournament_id, node_id = _scope(session)
    token, row = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id, ttl_hours=1)
    row.expires_at = _utcnow() - timedelta(seconds=1)
    assert offline_sessions.resolve(session, token, tournament_id=tournament_id) is None
    token, _ = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id)
    assert offline_sessions.revoke(
        session,
        token,
        tournament_id=tournament_id,
        reason="operator logout",
    )
    assert offline_sessions.resolve(session, token, tournament_id=tournament_id) is None


def test_issue_rejects_wrong_device(session):
    user_id, tournament_id, _node_id = _scope(session)
    with pytest.raises(ValueError, match="active authority"):
        offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=uuid.uuid4())


def test_closed_authority_invalidates_an_issued_session(session):
    user_id, tournament_id, node_id = _scope(session)
    token, _ = offline_sessions.issue(
        session,
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=2,
        device_id=node_id,
    )
    session.get(TournamentAuthority, (tournament_id, 2)).state = "closed"

    assert offline_sessions.resolve(session, token, tournament_id=tournament_id) is None


def test_removed_or_downgraded_operator_is_denied(session):
    user_id, tournament_id, node_id = _scope(session)
    token, _ = offline_sessions.issue(
        session,
        user_id=user_id,
        tournament_id=tournament_id,
        authority_epoch=2,
        device_id=node_id,
    )
    session.get(TournamentMember, (tournament_id, user_id)).role = "viewer"

    assert offline_sessions.resolve(session, token, tournament_id=tournament_id) is None


def test_issue_requires_operator_membership(session):
    user_id, tournament_id, node_id = _scope(session)
    session.get(TournamentMember, (tournament_id, user_id)).role = "viewer"

    with pytest.raises(ValueError, match="not authorized"):
        offline_sessions.issue(
            session,
            user_id=user_id,
            tournament_id=tournament_id,
            authority_epoch=2,
            device_id=node_id,
        )


def test_route_sets_a_secure_httponly_scoped_cookie(session, monkeypatch):
    user_id, tournament_id, node_id = _scope(session)
    response = Response()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    monkeypatch.setattr(settings, "session_cookie_secure", True)

    result = create_offline_session(
        body=OfflineSessionRequest(node_id=node_id, authority_epoch=2, ttl_hours=24),
        response=response,
        tournament_id=tournament_id,
        user=AuthUser(id=str(user_id), email="operator@example.test"),
        repo=LocalRepository(session),
    )

    cookie = response.headers["set-cookie"]
    assert result.tournament_id == tournament_id
    assert "sw_offline_operator=" in cookie
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie


def test_bootstrap_route_sets_cookie_without_auth_user(session, monkeypatch):
    user_id, tournament_id, node_id = _scope(session)
    capability = "capability-" + "x" * 40
    import hashlib
    session.get(TournamentAuthority, (tournament_id, 2)).capability_digest = hashlib.sha256(capability.encode()).hexdigest()
    response = Response()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    result = bootstrap_offline_session(
        body=OfflineSessionBootstrapRequest(
            node_id=node_id,
            authority_epoch=2,
            operator_id=user_id,
            ttl_hours=24,
        ),
        response=response,
        tournament_id=tournament_id,
        capability=capability,
        repo=LocalRepository(session),
    )
    assert result.tournament_id == tournament_id
    assert f"{settings.offline_session_cookie_name}=" in response.headers["set-cookie"]
