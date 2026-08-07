"""SP-E1-2 Phase C — the four-level entries schema (ruling R13, decision D-A4).

Ruling R13 turns the R7 "split-ready single row" into an actual shape::

    entrant account  ->  submission  ->  entries  ->  players
       (who acts)      (one form act)   (one per     (who plays)
                                       event per
                                      player-unit)

This module pins the *storage* half of that ruling — the tables, the
columns, the level boundaries and the indexes — independently of any route
or service, because a level boundary that only exists inside a service is a
convention, and a convention is not what R13 asked for.

**The index assertions are read in both directions on purpose.** R7's
rejection of natural-key uniqueness is preserved *verbatim* by R13, so
"an index exists on (entry_event_id, entry_player_id)" is only half the
claim: the other half is that it is **not unique**, and a test that
asserted only the first would pass just as happily against the hard
constraint Q12 spent a section rejecting. The same pairing covers the
submission-level idempotency index, where the ruling runs the other way
(D4's tenant-scoped uniqueness *is* enforced, and the negative control is
that the same key under a different tournament is accepted).
"""
from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import (
    Base,
    EntrantAccount,
    Entry,
    EntryEvent,
    EntryPage,
    EntryPlayer,
    Submission,
)


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture
def session(engine):
    s = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield s
    finally:
        s.close()


def _tournament(session, name="Spring Open"):
    from database.models import Tournament

    row = Tournament(name=name, status="draft", schema_version=1, data={})
    session.add(row)
    session.commit()
    return row.id


def _account(session, email="parent@example.com"):
    row = EntrantAccount(email=email, password_hash="x")
    session.add(row)
    session.commit()
    return row


# ---- the levels exist, and carry what R13 says they carry ---------------


def test_the_submission_level_carries_the_act_not_the_event(session):
    """R13's table: idempotency, acceptance, total and payment live here.

    These four moved *up* from ``entries`` because they describe one
    agreement, one retry unit and one payment — not one per event. The
    assertion is about where they live, which is the whole ruling.
    """
    tid = _tournament(session)
    account = _account(session)
    row = Submission(
        tournament_id=tid,
        account_id=account.id,
        idempotency_key="key-1",
        regulations_accepted_at=sa.func.now(),
        regulations_version_accepted=3,
        fee_total_cents=5500,
        fee_basis={"schedule": {"1": 4000, "2": 5500}, "eventCount": 2},
    )
    session.add(row)
    session.commit()

    stored = session.get(Submission, (tid, row.id))
    assert stored.idempotency_key == "key-1"
    assert stored.regulations_version_accepted == 3
    assert stored.fee_total_cents == 5500
    assert stored.fee_basis["eventCount"] == 2
    assert stored.paid_at is None
    assert stored.payment_note is None


def test_the_player_level_carries_the_human_and_requires_a_gender(session):
    """R12: ``gender`` is NOT NULL because MS/WD/XD filtering is impossible
    without it. Enforcement of the *match* is soft (Q14 §5); the presence of
    the field is not."""
    tid = _tournament(session)
    account = _account(session)
    row = EntryPlayer(
        tournament_id=tid,
        account_id=account.id,
        full_name="Alice Chen",
        gender="F",
        club="Riverside BC",
        birth_year=2011,
        remarks="can't play before 6pm Saturday",
    )
    session.add(row)
    session.commit()

    stored = session.get(EntryPlayer, (tid, row.id))
    assert stored.full_name == "Alice Chen"
    assert stored.gender == "F"
    assert stored.club == "Riverside BC"
    assert stored.remarks == "can't play before 6pm Saturday"


def test_a_player_without_a_gender_is_refused_by_the_database(session):
    """Negative control for the assertion above — NOT NULL, not a comment."""
    tid = _tournament(session)
    account = _account(session)
    session.add(
        EntryPlayer(
            tournament_id=tid,
            account_id=account.id,
            full_name="No Gender",
            gender=None,
        )
    )
    with pytest.raises(sa.exc.IntegrityError):
        session.commit()
    session.rollback()


# ---- the R14 configuration columns --------------------------------------


def test_the_entry_page_carries_the_r14_money_policy_and_venue_fields(session):
    tid = _tournament(session)
    page = EntryPage(
        tournament_id=tid,
        slug="spring-open",
        is_open=True,
        fee_schedule={"1": 4000, "2": 5500, "3": 6000},
        payment_instructions="Zelle to treasurer@club.example, or cash at check-in.",
        max_events_per_person=3,
        discipline_caps={"XD": 1},
        collect_phone=True,
        venue_name="Riverside Sports Hall",
        venue_address="12 Mill Lane, Riverside",
    )
    session.add(page)
    session.commit()

    stored = session.get(EntryPage, tid)
    assert stored.fee_schedule["2"] == 5500
    assert stored.payment_instructions.startswith("Zelle")
    assert stored.max_events_per_person == 3
    assert stored.discipline_caps == {"XD": 1}
    assert stored.collect_phone is True
    assert stored.venue_name == "Riverside Sports Hall"
    assert stored.venue_address == "12 Mill Lane, Riverside"


def test_collect_phone_is_off_by_default(session):
    """R12 §field policy: the one optional contact field is opt-in, and a
    default that leaked the other way would collect a phone number from
    every entrant of every director who never touched the setting."""
    tid = _tournament(session)
    session.add(EntryPage(tournament_id=tid, slug="quiet", is_open=True))
    session.commit()
    assert session.get(EntryPage, tid).collect_phone is False


def test_the_entry_event_carries_the_gender_constraint_and_its_own_deadline(session):
    """R14 §3: ``withdraws_until`` is a third first-class datetime, separate
    from ``closes_at`` — organisers use the gap between them."""
    tid = _tournament(session)
    event = EntryEvent(
        tournament_id=tid,
        code="XD",
        discipline="Mixed Doubles",
        entry_type="doubles",
        gender_constraint="mixed",
        withdraws_until=sa.func.now(),
    )
    session.add(event)
    session.commit()

    stored = session.get(EntryEvent, (tid, event.id))
    assert stored.gender_constraint == "mixed"
    assert stored.withdraws_until is not None


def test_an_event_with_no_gender_constraint_is_open_to_everyone(session):
    """Negative control: NULL means open, not 'unset and therefore refused'."""
    tid = _tournament(session)
    event = EntryEvent(
        tournament_id=tid, code="OS", discipline="Open Singles", entry_type="singles"
    )
    session.add(event)
    session.commit()
    assert session.get(EntryEvent, (tid, event.id)).gender_constraint is None


# ---- the indexes, read in both directions -------------------------------


def _index(table: str, name: str):
    return {ix.name: ix for ix in Base.metadata.tables[table].indexes}[name]


def test_the_duplicate_flag_index_is_not_unique(session):
    """R7 preserved verbatim by R13.

    The index exists so the soft duplicate lookup is cheap; it is NOT
    unique because one account legitimately enters the same event for two
    different players, and the *same* player twice is a judgment an
    operator makes, never a 409 the database returns.
    """
    ix = _index("entries", "ix_entries_event_player")
    assert not ix.unique
    assert [c.name for c in ix.columns] == ["entry_event_id", "entry_player_id"]


def test_the_submission_idempotency_index_is_unique_and_tenant_scoped(session):
    """D4 survives the move up a level (spec Q5 amendment)."""
    ix = _index("submissions", "uq_submissions_tournament_idempotency_key")
    assert ix.unique
    assert [c.name for c in ix.columns] == ["tournament_id", "idempotency_key"]


def test_the_database_enforces_that_uniqueness_within_one_tenant(session):
    tid = _tournament(session)
    account = _account(session)
    session.add(
        Submission(tournament_id=tid, account_id=account.id, idempotency_key="k")
    )
    session.commit()
    session.add(
        Submission(tournament_id=tid, account_id=account.id, idempotency_key="k")
    )
    with pytest.raises(sa.exc.IntegrityError):
        session.commit()
    session.rollback()


def test_the_same_key_under_another_tenant_is_accepted(session):
    """Negative control for the test above: scoped, not global. A global
    lookup would let a key-guesser learn that some other workspace used the
    same key — the reason D4 narrowed the solve rail's index in the first
    place."""
    other = _tournament(session, name="Autumn Open")
    tid = _tournament(session)
    account = _account(session)
    session.add(
        Submission(tournament_id=tid, account_id=account.id, idempotency_key="k")
    )
    session.commit()
    session.add(
        Submission(tournament_id=other, account_id=account.id, idempotency_key="k")
    )
    session.commit()

    assert len(list(session.scalars(sa.select(Submission)))) == 2


def test_entry_data_cascades_from_the_workspace(session):
    """Every level hangs off ``tournaments`` with ON DELETE CASCADE, the
    shape ``display_tokens`` uses — except ``entrant_accounts``, which
    outlives any one tournament and is checked by its absence here."""
    for table in ("submissions", "entry_players", "entries", "entry_events",
                  "entry_pages"):
        fks = [
            fk
            for fk in Base.metadata.tables[table].foreign_keys
            if fk.column.table.name == "tournaments"
        ]
        assert fks, f"{table} does not hang off tournaments"
        assert all(fk.ondelete == "CASCADE" for fk in fks), table

    assert not [
        fk
        for fk in Base.metadata.tables["entrant_accounts"].foreign_keys
    ], "an account must not be workspace-scoped — it outlives the tournament"


def test_a_submission_belongs_to_an_account(session):
    """The join R10 supplied: 'what else came in on this form?' follows
    entry -> submission -> account rather than grouping on a repeated
    email string."""
    fks = {
        fk.column.table.name
        for fk in Base.metadata.tables["submissions"].foreign_keys
    }
    assert "entrant_accounts" in fks
    assert "entrant_accounts" in {
        fk.column.table.name
        for fk in Base.metadata.tables["entry_players"].foreign_keys
    }


def test_uuid_ids_are_not_shared_between_levels(session):
    """A submission id and an entry id are different keyspaces; nothing
    should be able to pass one where the other is expected and be found."""
    tid = _tournament(session)
    account = _account(session)
    submission = Submission(tournament_id=tid, account_id=account.id)
    session.add(submission)
    session.commit()
    assert session.get(Entry, (tid, submission.id)) is None
    assert isinstance(submission.id, uuid.UUID)
