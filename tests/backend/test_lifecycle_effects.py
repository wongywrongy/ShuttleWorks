"""E-1 … E-7: the consequential cross-table effects of the registration and
competition graphs (state machines v2, S-6 behavioural half).

Each test asserts two things the structural suite cannot: the state of every
table the effect touches, and the **exact** set of `state_transitions` rows it
produced. The row set is the point. A missing row means an act happened that
nobody can read back; an extra row means the software recorded a decision it
did not make, which is the I4 question in its most concrete form.

The effects and the tables each one touches are tabled in the S-3 appendix of
`docs/explanation/state-machines-v2-defined-plan.md`.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, event as sa_event, select
from sqlalchemy.orm import Session

from competition.catalog import catalog_id, seed_catalog
from competition.service import bind, withdraw_competition_unit
from db.models import (
    CompetitionEvent,
    CompetitionUnit,
    DrawInstance,
    EntrantAccount,
    Entry,
    EntryEvent,
    EntryPlayer,
    PartnerInvitation,
    PlayerRepresentative,
    StateTransition,
    Submission,
    Tournament,
    UnitMembership,
)
from entries import lifecycle


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @sa_event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    from _helpers import upgrade_test_database

    upgrade_test_database(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed_catalog(session)
        tournament = Tournament(name="Effects", kind="bracket", data={})
        account = EntrantAccount(email="entrant@example.test")
        session.add_all([tournament, account])
        session.flush()
        session.info.update(tid=tournament.id, account=account.id)
        session.commit()
        yield session
    engine.dispose()


# ---- fixtures shaped like the real records ----------------------------


def setup_event(db, kind="singles", code="MS", *, bracket=True):
    event = CompetitionEvent(
        tournament_id=db.info["tid"],
        category_code=code,
        format_version_id=catalog_id(kind + "/1"),
        bracket_event_id=code if bracket else None,
    )
    db.add(event)
    db.flush()
    registration = EntryEvent(
        tournament_id=event.tournament_id,
        code=code,
        discipline=code,
        entry_type="singles" if kind == "singles" else "doubles",
        competition_event_id=event.id,
    )
    db.add(registration)
    db.flush()
    return event, registration


def add_entry(db, registration, name="Alex", state="confirmed"):
    submission = Submission(
        tournament_id=registration.tournament_id,
        account_id=db.info["account"],
        fee_currency="USD",
        fee_total_cents=2000,
        status="submitted",
    )
    player = EntryPlayer(
        tournament_id=registration.tournament_id,
        full_name=name,
        gender="M",
        representatives=[PlayerRepresentative(account_id=db.info["account"])],
    )
    db.add_all([submission, player])
    db.flush()
    row = Entry(
        tournament_id=registration.tournament_id,
        entry_event_id=registration.id,
        submission_id=submission.id,
        entry_player_id=player.id,
        state=state,
    )
    db.add(row)
    db.flush()
    return row


def invite(db, inviting, *, status="sent", accepted=None):
    invitation = PartnerInvitation(
        tournament_id=inviting.tournament_id,
        inviting_entry_id=inviting.id,
        recipient_email="partner@example.test",
        status=status,
        accepted_entry_id=accepted.id if accepted is not None else None,
        accepted_at=datetime.now(timezone.utc) if accepted is not None else None,
    )
    db.add(invitation)
    db.flush()
    return invitation


def generate_draw(db, event, status="generated"):
    draw = DrawInstance(
        tournament_id=event.tournament_id,
        competition_event_id=event.id,
        revision=1,
        status=status,
        config={},
    )
    db.add(draw)
    db.flush()
    return draw


def history(db):
    """Every transition so far as ``machine.event``, in the order recorded."""
    db.flush()
    rows = db.scalars(
        select(StateTransition).order_by(StateTransition.occurred_at, StateTransition.id)
    )
    return [f"{row.machine}.{row.event}" for row in rows]


def statuses(db, model, attribute="status"):
    return sorted(getattr(row, attribute) for row in db.scalars(select(model)))


# ---- E-1 confirm, then bind -------------------------------------------


def test_e1_confirmed_entry_becomes_a_unit_membership(db):
    event, registration = setup_event(db, bracket=False)
    entry = add_entry(db, registration, state="pending")
    db.commit()

    lifecycle.confirm(db, entry)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()

    assert entry.state == "confirmed"
    assert statuses(db, CompetitionUnit) == ["confirmed"]
    assert statuses(db, UnitMembership) == ["active"]
    assert history(db) == ["entry.confirm", "unit.roster_complete"]


# ---- E-2 partner accepted ---------------------------------------------


def test_e2_accepted_invitation_forms_one_unit(db):
    event, registration = setup_event(db, "doubles", "MD", bracket=False)
    left = add_entry(db, registration)
    right = add_entry(db, registration, "Sam")
    invitation = invite(db, left)
    db.commit()

    invitation.accepted_entry_id = right.id
    invitation.accepted_at = datetime.now(timezone.utc)
    lifecycle.transition_invitation(invitation, "accept", session=db, source_state="sent")
    db.commit()
    db.expire_all()
    result = bind(db, event.tournament_id)
    db.commit()

    assert invitation.status == "accepted"
    assert len({binding["unitId"] for binding in result["bindings"]}) == 1
    assert statuses(db, CompetitionUnit) == ["confirmed"]
    assert statuses(db, UnitMembership) == ["active", "active"]
    assert history(db) == ["partner_invitation.accept", "unit.roster_complete"]


# ---- E-3 member withdraws before the draw ------------------------------


def test_e3_member_withdrawal_before_the_draw_returns_the_unit_to_pending(db):
    event, registration = setup_event(db, "doubles", "MD", bracket=False)
    left = add_entry(db, registration)
    right = add_entry(db, registration, "Sam")
    invite(db, left, status="accepted", accepted=right)
    db.commit()
    db.expire_all()
    bind(db, event.tournament_id)
    db.commit()
    before = len(history(db))

    lifecycle.withdraw(db, left, registration, by_operator=True)
    db.commit()

    assert left.state == "withdrawn"
    assert statuses(db, CompetitionUnit) == ["pending"]
    assert statuses(db, UnitMembership) == ["active", "withdrawn"]
    assert history(db)[before:] == [
        "entry.operator_withdraw",
        "unit_membership.withdraw",
        "unit.member_withdrew",
    ]


# ---- E-4 member withdraws after the draw (S-8.4) -----------------------


def test_e4_member_withdrawal_after_the_draw_ends_the_unit(db):
    event, registration = setup_event(db, "doubles", "MD", bracket=False)
    left = add_entry(db, registration)
    right = add_entry(db, registration, "Sam")
    invite(db, left, status="accepted", accepted=right)
    db.commit()
    db.expire_all()
    bind(db, event.tournament_id)
    generate_draw(db, event)
    db.commit()
    before = len(history(db))

    lifecycle.withdraw(db, left, registration, by_operator=True)
    db.commit()

    assert left.state == "withdrawn"
    assert right.state == "confirmed", "the partner's ENTRY is not withdrawn with the unit"
    assert statuses(db, CompetitionUnit) == ["withdrawn"]
    assert statuses(db, UnitMembership) == ["withdrawn", "withdrawn"]
    assert history(db)[before:] == [
        "entry.operator_withdraw",
        "unit_membership.withdraw",
        "unit_membership.withdraw",
        "unit.member_withdrew_after_draw",
    ]


def test_e4_director_withdrawal_of_a_whole_unit_is_the_operator_s(db):
    event, registration = setup_event(db, bracket=False)
    add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    unit = db.scalar(select(CompetitionUnit))
    before = len(history(db))

    withdraw_competition_unit(db, event.tournament_id, unit.id, expected_version=unit.version)
    db.commit()

    assert statuses(db, CompetitionUnit) == ["withdrawn"]
    assert history(db)[before:] == ["unit_membership.withdraw", "unit.withdraw"]
    row = db.scalars(
        select(StateTransition).where(StateTransition.machine == "unit")
    ).all()[-1]
    assert (row.from_state, row.actor_type) == ("confirmed", "operator")


# ---- E-5 / E-6 the draw revision ---------------------------------------


def test_e5_a_draw_revision_is_superseded_when_the_event_leaves_the_drawn_states(db):
    from competition.draws import record_status

    event, _ = setup_event(db)
    record_status(db, event.tournament_id, "MS", "generated")
    db.commit()
    before = len(history(db))

    record_status(db, event.tournament_id, "MS", "draft")
    db.commit()

    assert statuses(db, DrawInstance) == ["superseded"]
    assert history(db)[before:] == ["draw_instance.supersede"]


def test_e6_first_result_starts_the_draw_and_the_event(db):
    from competition.draws import record_status

    event, _ = setup_event(db)
    record_status(db, event.tournament_id, "MS", "generated")
    db.commit()
    assert event.status == "scheduled"
    before = len(history(db))

    record_status(db, event.tournament_id, "MS", "started")
    db.commit()

    assert statuses(db, DrawInstance) == ["started"]
    assert event.status == "in_progress"
    assert history(db)[before:] == ["draw_instance.start", "competition_event.first_result"]
    row = db.scalars(
        select(StateTransition).where(StateTransition.machine == "competition_event")
    ).one()
    assert row.actor_type == "system"


def test_e6_a_completed_event_does_not_reopen(db):
    from competition.draws import record_status

    event, _ = setup_event(db)
    record_status(db, event.tournament_id, "MS", "completed")
    db.commit()
    assert event.status == "completed"
    before = len(history(db))

    record_status(db, event.tournament_id, "MS", "generated")
    db.commit()

    assert event.status == "completed"
    assert history(db)[before:] == ["draw_instance.generate"]


# ---- E-7 the submission is cancelled -----------------------------------


def test_e7_cancelling_a_submission_withdraws_its_live_entries(db):
    from entries.submissions import cancel_submission

    event, registration = setup_event(db, bracket=False)
    entry = add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    submission = db.get(Submission, (entry.tournament_id, entry.submission_id))
    before = len(history(db))

    cancel_submission(db, submission)
    db.commit()

    assert submission.status == "cancelled"
    assert entry.state == "withdrawn"
    assert statuses(db, UnitMembership) == ["withdrawn"]
    assert statuses(db, CompetitionUnit) == ["pending"]
    assert history(db)[before:] == [
        "entry.operator_withdraw",
        "unit_membership.withdraw",
        "unit.member_withdrew",
        "submission.cancel",
    ]
