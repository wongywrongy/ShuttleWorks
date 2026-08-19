"""Member-management service + the last-owner invariant (SP-CLOUD-3 Phase 1).

Runs against SQLite always, and against Postgres when ``TEST_POSTGRES_URL``
is set. Both dialects matter here for a specific reason: the invariant's
failure modes differ between them, and a test that only runs on the engine
that happens to serialize proves nothing about the other.

- **SQLite** allows one writer at a time, so interleaved mutations either
  serialize or raise "database is locked". The re-check has to happen
  *inside* the writing statement, because a read taken before the write
  transaction opened can be stale by the time the write lands.
- **Postgres** under READ COMMITTED lets two transactions touch *different
  rows* concurrently without blocking. Two "demote the other owner"
  requests each see a valid second owner, each locks only its own row, and
  both commit — leaving zero owners. A conditional ``WHERE`` alone does not
  save you; the parent row has to be locked so the mutations serialize.

SQLite here is deliberately **file-based**, not the usual in-memory +
StaticPool: StaticPool shares one connection across sessions, which would
make the concurrency test pass without proving anything.
"""
from __future__ import annotations

import os
import threading
import uuid

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from db.models import Base, Org, Tournament, TournamentMember, User
from identity import members as members_service
from identity.members import LastOwnerError, MemberNotFoundError

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _make_engine(dialect: str, tmp_path):
    if dialect == "sqlite":
        # File-based on purpose — see the module docstring.
        return create_engine(
            f"sqlite:///{(tmp_path / 'members.db').as_posix()}", future=True
        )
    from db.session import normalize_database_url

    return create_engine(normalize_database_url(POSTGRES_URL), future=True)


@pytest.fixture(params=["sqlite", "postgres"])
def db(request, tmp_path):
    if request.param == "postgres" and not POSTGRES_URL:
        pytest.skip("TEST_POSTGRES_URL not set")
    engine = _make_engine(request.param, tmp_path)
    Base.metadata.create_all(engine)
    Session = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    try:
        yield engine, Session, request.param
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def session(db):
    _, Session, _ = db
    s = Session()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def _user(session, email: str) -> uuid.UUID:
    u = User(email=email, display_name=email.split("@")[0])
    session.add(u)
    session.commit()
    return u.id


@pytest.fixture
def workspace(session):
    """A workspace owned by ``owner_a``, with ``owner_b`` a second owner,
    ``op`` an operator and ``viewer`` a viewer."""
    org = Org(name="Test Org")
    session.add(org)
    session.commit()
    t = Tournament(name="Members Test", org_id=org.id)
    session.add(t)
    session.commit()

    ids = {}
    for label, role in [
        ("owner_a", "owner"),
        ("owner_b", "owner"),
        ("op", "operator"),
        ("viewer", "viewer"),
    ]:
        uid = _user(session, f"{label}@example.com")
        session.add(
            TournamentMember(tournament_id=t.id, user_id=uid, role=role)
        )
        ids[label] = uid
    session.commit()
    return t.id, ids


def _owner_count(session, tid) -> int:
    return session.scalar(
        select(func.count())
        .select_from(TournamentMember)
        .where(
            TournamentMember.tournament_id == tid,
            TournamentMember.role == "owner",
        )
    )


# ---- Role changes ----------------------------------------------------


def test_set_role_promotes_and_demotes(session, workspace):
    tid, ids = workspace
    members_service.set_role(session, tid, ids["viewer"], "operator")
    session.commit()
    assert members_service.get_role(session, tid, ids["viewer"]) == "operator"

    members_service.set_role(session, tid, ids["op"], "viewer")
    session.commit()
    assert members_service.get_role(session, tid, ids["op"]) == "viewer"


def test_demoting_one_of_two_owners_is_allowed(session, workspace):
    tid, ids = workspace
    members_service.set_role(session, tid, ids["owner_b"], "operator")
    session.commit()
    assert _owner_count(session, tid) == 1


def test_demoting_the_last_owner_is_refused(session, workspace):
    tid, ids = workspace
    members_service.set_role(session, tid, ids["owner_b"], "operator")
    session.commit()

    with pytest.raises(LastOwnerError):
        members_service.set_role(session, tid, ids["owner_a"], "operator")
    session.rollback()
    assert _owner_count(session, tid) == 1


def test_set_role_on_a_non_member_is_not_found(session, workspace):
    tid, _ = workspace
    with pytest.raises(MemberNotFoundError):
        members_service.set_role(session, tid, uuid.uuid4(), "viewer")


def test_set_role_rejects_an_unknown_role(session, workspace):
    tid, ids = workspace
    with pytest.raises(ValueError):
        members_service.set_role(session, tid, ids["op"], "superuser")


# ---- Removal ---------------------------------------------------------


def test_remove_non_owner_member(session, workspace):
    tid, ids = workspace
    members_service.remove_member(session, tid, ids["op"])
    session.commit()
    assert members_service.get_role(session, tid, ids["op"]) is None


def test_removing_the_last_owner_is_refused(session, workspace):
    tid, ids = workspace
    members_service.remove_member(session, tid, ids["owner_b"])
    session.commit()

    with pytest.raises(LastOwnerError):
        members_service.remove_member(session, tid, ids["owner_a"])
    session.rollback()
    assert _owner_count(session, tid) == 1


def test_removing_a_non_member_is_not_found(session, workspace):
    tid, _ = workspace
    with pytest.raises(MemberNotFoundError):
        members_service.remove_member(session, tid, uuid.uuid4())


# ---- Transfer --------------------------------------------------------


def test_transfer_ownership_promotes_target_and_demotes_caller(session, workspace):
    tid, ids = workspace
    # Reduce to a single owner so the transfer is the interesting case.
    members_service.remove_member(session, tid, ids["owner_b"])
    session.commit()

    members_service.transfer_ownership(session, tid, ids["owner_a"], ids["op"])
    session.commit()

    assert members_service.get_role(session, tid, ids["op"]) == "owner"
    assert members_service.get_role(session, tid, ids["owner_a"]) == "operator"
    # Never passes through a zero-owner state.
    assert _owner_count(session, tid) == 1


def test_transfer_from_a_non_owner_is_refused(session, workspace):
    """A viewer cannot transfer, and must not be promoted by trying.

    The demotion half of the transfer is a hardcoded ``operator``. Without
    a precondition check on the source's role, passing a VIEWER as
    ``from_user_id`` silently *promotes* them — a privilege escalation
    hiding inside a transfer. The route is owner-gated today, so this
    guards the service against its next caller.
    """
    tid, ids = workspace
    with pytest.raises(members_service.NotOwnerError):
        members_service.transfer_ownership(
            session, tid, ids["viewer"], ids["op"]
        )
    session.rollback()
    assert members_service.get_role(session, tid, ids["viewer"]) == "viewer"
    assert members_service.get_role(session, tid, ids["op"]) == "operator"


def test_transfer_from_an_operator_is_refused(session, workspace):
    """Same guard, one rung up — an operator is still not an owner."""
    tid, ids = workspace
    with pytest.raises(members_service.NotOwnerError):
        members_service.transfer_ownership(
            session, tid, ids["op"], ids["viewer"]
        )
    session.rollback()
    assert members_service.get_role(session, tid, ids["op"]) == "operator"


def test_transfer_to_a_non_member_is_not_found(session, workspace):
    tid, ids = workspace
    with pytest.raises(MemberNotFoundError):
        members_service.transfer_ownership(
            session, tid, ids["owner_a"], uuid.uuid4()
        )


def test_transfer_to_self_is_a_noop_not_a_stranding(session, workspace):
    tid, ids = workspace
    members_service.remove_member(session, tid, ids["owner_b"])
    session.commit()
    members_service.transfer_ownership(
        session, tid, ids["owner_a"], ids["owner_a"]
    )
    session.commit()
    assert members_service.get_role(session, tid, ids["owner_a"]) == "owner"
    assert _owner_count(session, tid) == 1


# ---- Leave -----------------------------------------------------------


def test_non_owner_can_leave(session, workspace):
    tid, ids = workspace
    members_service.remove_member(session, tid, ids["viewer"])
    session.commit()
    assert members_service.get_role(session, tid, ids["viewer"]) is None


def test_sole_owner_cannot_leave(session, workspace):
    """Self-removal must not be a back door around the invariant."""
    tid, ids = workspace
    members_service.remove_member(session, tid, ids["owner_b"])
    session.commit()
    with pytest.raises(LastOwnerError):
        members_service.remove_member(session, tid, ids["owner_a"])
    session.rollback()
    assert _owner_count(session, tid) == 1


# ---- The concurrent case ---------------------------------------------


def _run_interleaved(Session, tid, target_a, target_b, operation):
    """Force a genuine overlap of two membership mutations.

    A plain "start both threads at a barrier" test does NOT reproduce the
    race: the barrier only synchronises thread *start*, and the Python
    overhead before each thread reaches its SQL is enough that the two
    statements rarely overlap. Such a test passes even with the guard
    removed, which makes it worse than no test — it reports safety it
    never checked. (Verified: with ``_lock_workspace`` stubbed out, the
    barrier version passed on both dialects.)

    This instead exploits the module's transaction contract — the service
    functions do not commit — to hold thread A's write open while thread B
    attempts its own:

        A: mutate(target_a)          # writes, does NOT commit
        A: signal "written"
        B: wait, then mutate(target_b)  # must contend with A's open txn
        A: (after a beat) commit       # releases
        B: proceeds, re-checks, refuses

    With the parent-row lock, B blocks on Postgres until A commits and
    then correctly sees one owner. Without it, B's statement takes a fresh
    READ COMMITTED snapshot that does not include A's uncommitted update,
    sees two owners, updates a *different row* so no row lock conflicts,
    and both commit — zero owners. On SQLite B instead hits the writer
    lock and raises, which is equally acceptable: the invariant holds.

    Returns ``(remaining_owner_count, errors)``.
    """
    a_written = threading.Event()
    errors: list[Exception] = []

    def _thread_a():
        s = Session()
        try:
            operation(s, tid, target_a)
            a_written.set()
            # Hold the transaction open long enough for B to reach its
            # own write and contend.
            threading.Event().wait(0.75)
            s.commit()
        except Exception as exc:
            s.rollback()
            errors.append(exc)
            a_written.set()
        finally:
            s.close()

    def _thread_b():
        s = Session()
        try:
            a_written.wait(timeout=10)
            operation(s, tid, target_b)
            s.commit()
        except Exception as exc:
            s.rollback()
            errors.append(exc)
        finally:
            s.close()

    ta = threading.Thread(target=_thread_a)
    tb = threading.Thread(target=_thread_b)
    ta.start()
    tb.start()
    ta.join(timeout=30)
    tb.join(timeout=30)

    verify = Session()
    try:
        return _owner_count(verify, tid), errors
    finally:
        verify.close()


def test_concurrent_demotions_cannot_strand_the_workspace(db, workspace, session):
    """Two overlapping "demote the *other* owner" requests.

    Each is legal in isolation — at the moment it checks, two owners
    exist. Together, unguarded, they leave zero owners and nobody able to
    get back in.
    """
    _, Session, dialect = db
    tid, ids = workspace
    session.commit()

    remaining, errors = _run_interleaved(
        Session,
        tid,
        ids["owner_a"],
        ids["owner_b"],
        lambda s, t, u: members_service.set_role(s, t, u, "operator"),
    )

    assert remaining >= 1, (
        f"[{dialect}] both concurrent demotions succeeded — the workspace has "
        f"{remaining} owners and is permanently unreachable. errors: {errors!r}"
    )
    assert remaining == 1, f"[{dialect}] expected exactly one owner, got {remaining}"
    assert len(errors) == 1, (
        f"[{dialect}] expected the second demotion to be refused, "
        f"got {len(errors)} error(s): {errors!r}"
    )


def test_concurrent_removals_cannot_strand_the_workspace(db, workspace, session):
    """The same race via remove rather than demote."""
    _, Session, dialect = db
    tid, ids = workspace
    session.commit()

    remaining, errors = _run_interleaved(
        Session,
        tid,
        ids["owner_a"],
        ids["owner_b"],
        lambda s, t, u: members_service.remove_member(s, t, u),
    )

    assert remaining == 1, (
        f"[{dialect}] concurrent owner removals left {remaining} owners. "
        f"errors: {errors!r}"
    )
    assert len(errors) == 1, (
        f"[{dialect}] expected the second removal to be refused, "
        f"got {len(errors)} error(s): {errors!r}"
    )
