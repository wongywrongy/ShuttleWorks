"""Node-scoped credential storage. Workspace role is the HTTP seam's job.

The shared-capability bootstrap and the separate session-minting route were
retired with operator MFA (P08); ``issue`` is now reached only through
individual activation and sign-in in ``identity/node_identity.py``.
"""
from datetime import timedelta
import uuid

import pytest
from db.models import Tournament, TournamentAuthority, TournamentMember, User
from core.time_utils import _utcnow
from identity import offline_sessions


def _scope(session):
    user_id, tournament_id, node_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    session.add(User(id=user_id, email=f"{user_id.hex}@example.test"))
    session.add(Tournament(id=tournament_id, name="Offline event", data={}, schema_version=1))
    session.add(
        TournamentMember(
            tournament_id=tournament_id,
            user_id=user_id,
            role="operator",
        )
    )
    session.add(TournamentAuthority(
        tournament_id=tournament_id, epoch=2, node_id=node_id, state="active",
        checkpoint_hash="a" * 64, checkpoint_schema_version=1,
        capability_digest="b" * 64,
    ))
    session.flush()
    return user_id, tournament_id, node_id


@pytest.fixture
def session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    engine = create_engine("sqlite:///:memory:")
    from _helpers import upgrade_test_database
    upgrade_test_database(engine)
    with Session(engine) as value:
        yield value


def test_session_is_hashed_scoped_and_resolvable(session):
    user_id, tournament_id, node_id = _scope(session)
    token, row = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id)
    assert row.token_hash != token
    resolved = offline_sessions.resolve_identity(session, token)
    assert resolved is not None and resolved[0].id == user_id
    # The credential names exactly one workspace; any other is refused by
    # require_tournament_access (dependencies.py) with the uniform 404.
    assert resolved[1].tournament_id == tournament_id


def test_expiry_and_revocation_are_fail_closed(session):
    user_id, tournament_id, node_id = _scope(session)
    token, row = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id, ttl_hours=1)
    row.expires_at = _utcnow() - timedelta(seconds=1)
    assert offline_sessions.resolve_identity(session, token) is None
    token, _ = offline_sessions.issue(session, user_id=user_id, tournament_id=tournament_id, authority_epoch=2, device_id=node_id)
    assert offline_sessions.revoke(
        session,
        token,
        tournament_id=tournament_id,
        reason="operator logout",
    )
    assert offline_sessions.resolve_identity(session, token) is None


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

    assert offline_sessions.resolve_identity(session, token) is None


# A removed or downgraded operator is refused at the HTTP seam, byte-identical
# to a missing workspace: see test_node_operator_mfa_http.py::
# test_node_denial_is_identical_for_missing_foreign_and_downgraded_workspaces.


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
