"""The entry reference an entrant can read aloud (V3-24-1 / V3-PE39.1).

Four claims, and they are about different things on purpose:

1. the alphabet is the one that was ruled, and it excludes the characters
   people actually transcribe wrong;
2. a submission gets one at the only place a submission comes into
   existence, and two submissions never share one;
3. the database refuses a duplicate even if the service ever stopped
   checking — the uniqueness claim is enforced, not merely produced;
4. the entrant tier's copy of the pattern is the same pattern. A Node route
   cannot import Python, so the receipt page validates its path segment
   against a hand-written regex; nothing but a test keeps the two in step,
   and a drift there is a 404 on every real receipt.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import short_reference
from db.models import Base, EntrantAccount, Submission, Tournament

_REPO_ROOT = Path(__file__).resolve().parents[3]
_RECEIPT_ROUTE = _REPO_ROOT / "apps" / "entrant" / "app" / "routes" / "receipt.tsx"


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def test_the_alphabet_excludes_the_characters_people_transcribe_wrong():
    """`0`/`O` and `1`/`I`/`L` are where a quoted reference actually fails."""
    assert set("01OIL").isdisjoint(short_reference.ALPHABET)
    assert short_reference.ALPHABET.isupper()
    assert len(set(short_reference.ALPHABET)) == len(short_reference.ALPHABET)


def test_a_reference_is_eight_characters_of_that_alphabet():
    for _ in range(200):
        value = short_reference.new_reference()
        assert len(value) == 8
        assert set(value) <= set(short_reference.ALPHABET)
        assert short_reference.is_reference(value)


def test_only_that_shape_is_a_reference():
    """The validator every surface asks before it uses a path segment."""
    assert not short_reference.is_reference("h4kj29qw")  # lower case
    assert not short_reference.is_reference("H4KJ29Q")  # seven
    assert not short_reference.is_reference("H4KJ29QWX")  # nine
    assert not short_reference.is_reference("H4KJ29Q0")  # excluded symbol
    assert not short_reference.is_reference("6f1c2b0e-1111-4111-8111-111111111111")
    assert not short_reference.is_reference(None)


def test_a_taken_reference_is_redrawn_rather_than_returned():
    """The collision retry, driven directly — the realistic collision is two
    draws far apart in time, not two inserts in flight."""
    drawn: list[str] = []

    def taken(candidate: str) -> bool:
        drawn.append(candidate)
        # The first two draws are "already used"; the third is free.
        return len(drawn) < 3

    value = short_reference.unique_reference(taken)
    assert len(drawn) == 3
    assert value == drawn[-1]
    assert value not in drawn[:2]


def test_an_exhausted_keyspace_fails_loudly_rather_than_spinning():
    with pytest.raises(RuntimeError):
        short_reference.unique_reference(lambda _candidate: True)


def test_every_submission_gets_a_reference_and_no_two_share_one(session):
    """The model default, which is what makes the NOT NULL an invariant:
    every insert path gets one, including a row constructed by hand."""
    tournament = Tournament(name="Spring Open", status="draft", schema_version=1, data={})
    account = EntrantAccount(email="parent@example.com", password_hash="x")
    session.add_all([tournament, account])
    session.commit()

    rows = [
        Submission(tournament_id=tournament.id, account_id=account.id)
        for _ in range(50)
    ]
    session.add_all(rows)
    session.commit()

    references = {row.short_reference for row in rows}
    assert len(references) == 50
    assert all(short_reference.is_reference(value) for value in references)


def test_the_database_itself_refuses_a_duplicate(session):
    """`uq_submissions_short_reference` — global, so a code names one row
    everywhere. An entrant quoting a reference does not also quote a
    workspace, and the index is what makes that safe to rely on."""
    tournament = Tournament(name="Spring Open", status="draft", schema_version=1, data={})
    other = Tournament(name="Autumn Open", status="draft", schema_version=1, data={})
    account = EntrantAccount(email="parent@example.com", password_hash="x")
    session.add_all([tournament, other, account])
    session.commit()

    first = Submission(
        tournament_id=tournament.id, account_id=account.id, short_reference="H4KJ29QW"
    )
    session.add(first)
    session.commit()

    session.add(
        Submission(
            tournament_id=other.id, account_id=account.id, short_reference="H4KJ29QW"
        )
    )
    with pytest.raises(sa.exc.IntegrityError):
        session.commit()
    session.rollback()


def test_the_entrant_receipt_route_validates_the_same_alphabet():
    """`receipt.tsx` holds a hand-written copy of the pattern (a Node route
    cannot import Python). If it drifts, every real receipt link 404s at the
    door — so the copy is pinned here rather than left to review."""
    source = _RECEIPT_ROUTE.read_text(encoding="utf-8")
    expected = f"const REFERENCE = /^[{short_reference.ALPHABET}]{{{short_reference.LENGTH}}}$/;"
    assert expected in source, f"receipt.tsx must validate {expected!r}"
