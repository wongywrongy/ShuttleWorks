"""ADR 0030: database invariants and command outcomes, including rollback."""

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from db.models import (
    CompetitionEvent,
    CompetitionUnit,
    Entry,
    EntryEvent,
    EntryPlayer,
    EntrantAccount,
    PartnerInvitation,
    Payment,
    PlayerRepresentative,
    Submission,
    Tournament,
    UnitMembership,
)
from competition.catalog import seed_catalog, catalog_id
from competition.service import bind, rebind, withdraw_membership, CompetitionError
from entries.money import record_payment


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    from _helpers import upgrade_test_database

    upgrade_test_database(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed_catalog(session)
        tournament = Tournament(name="Registration test", kind="bracket", data={})
        account = EntrantAccount(email="representative@example.test")
        session.add_all([tournament, account])
        session.flush()
        session.info.update(tid=tournament.id, account=account.id)
        session.commit()
        yield session
    engine.dispose()


def setup_event(db, kind="singles", code="MS"):
    event = CompetitionEvent(
        tournament_id=db.info["tid"], category_code=code, format_version_id=catalog_id(kind + "/1")
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


def add_entry(db, registration, name="Alex", player=None):
    submission = Submission(
        tournament_id=registration.tournament_id,
        account_id=db.info["account"],
        fee_currency="USD",
        fee_total_cents=2000,
    )
    if player is None:
        player = EntryPlayer(
            tournament_id=registration.tournament_id,
            full_name=name,
            gender="M",
            representatives=[PlayerRepresentative(account_id=db.info["account"])],
        )
        db.add(player)
    db.add(submission)
    db.flush()
    row = Entry(
        tournament_id=registration.tournament_id,
        entry_event_id=registration.id,
        submission_id=submission.id,
        entry_player_id=player.id,
        state="confirmed",
    )
    db.add(row)
    db.flush()
    return row


def accept_pair(db, left, right):
    from datetime import datetime, timezone

    db.add(
        PartnerInvitation(
            tournament_id=left.tournament_id,
            inviting_entry_id=left.id,
            accepted_entry_id=right.id,
            recipient_email="partner@example.test",
            status="accepted",
            accepted_at=datetime.now(timezone.utc),
        )
    )
    db.flush()
    db.expire_all()


def test_singles_bind_retry_and_projection_are_one_realization(db):
    event, registration = setup_event(db)
    entry = add_entry(db, registration)
    db.commit()
    first = bind(db, event.tournament_id)
    assert first["bindings"][0]["entryId"] == str(entry.id)
    second = bind(db, event.tournament_id)
    assert second["bindings"][0]["outcome"] == "already_bound"
    assert len(list(db.scalars(select(CompetitionUnit)))) == 1
    assert db.scalar(select(CompetitionUnit)).status == "confirmed"
    roster = db.get(Tournament, event.tournament_id).data["bracketPlayers"]
    assert [p["entryPlayerId"] for p in roster] == [str(entry.entry_player_id)]


def test_accepted_doubles_are_grouped_once(db):
    event, registration = setup_event(db, "doubles", "MD")
    left, right = add_entry(db, registration), add_entry(db, registration, "Sam")
    accept_pair(db, left, right)
    db.commit()
    result = bind(db, event.tournament_id)
    assert len(result["bindings"]) == 2
    assert len({b["unitId"] for b in result["bindings"]}) == 1
    assert db.scalar(select(CompetitionUnit)).status == "confirmed"


def test_late_accepted_partner_fills_pending_unit(db):
    event, registration = setup_event(db, "doubles", "MD")
    left = add_entry(db, registration)
    db.commit()
    first = bind(db, event.tournament_id)
    db.commit()
    ident = first["bindings"][0]["unitId"]
    assert db.scalar(select(CompetitionUnit)).status == "pending"
    right = add_entry(db, registration, "Sam")
    accept_pair(db, left, right)
    db.commit()
    result = bind(db, event.tournament_id)
    assert {b["unitId"] for b in result["bindings"]} == {ident}
    assert db.scalar(select(CompetitionUnit)).status == "confirmed"


def test_registration_duplicates_are_soft_competition_duplicates_are_hard(db):
    event, registration = setup_event(db)
    entry = add_entry(db, registration)
    add_entry(db, registration, player=entry.player)
    db.commit()
    result = bind(db, event.tournament_id)
    assert len(result["bindings"]) == 1
    assert result["skipped"][0]["reason"] == "PLAYER_ALREADY_BOUND"


def test_confirmed_roster_cannot_be_edited_by_direct_sql(db):
    event, registration = setup_event(db)
    add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    with pytest.raises(IntegrityError, match="pending"):
        db.execute(text("UPDATE unit_memberships SET status='withdrawn'"))
    db.rollback()
    assert db.scalar(select(UnitMembership)).status == "active"


def test_empty_unit_cannot_confirm_or_insert_confirmed(db):
    event, _ = setup_event(db)
    db.commit()
    unit = CompetitionUnit(
        tournament_id=event.tournament_id, competition_event_id=event.id, status="pending"
    )
    db.add(unit)
    db.commit()
    unit.status = "confirmed"
    with pytest.raises(IntegrityError, match="Roster size"):
        db.flush()
    db.rollback()
    db.add(
        CompetitionUnit(
            tournament_id=event.tournament_id, competition_event_id=event.id, status="confirmed"
        )
    )
    with pytest.raises(IntegrityError, match="pending"):
        db.flush()


def test_withdrawal_retains_membership_and_bind_does_not_reactivate(db):
    event, registration = setup_event(db)
    entry = add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    withdraw_membership(db, event.tournament_id, entry.id)
    db.commit()
    assert db.scalar(select(CompetitionUnit)).status == "pending"
    assert bind(db, event.tournament_id)["bindings"][0]["outcome"] == "withdrawn"


def test_rebind_moves_row_and_keeps_old_unit(db):
    source, registration = setup_event(db)
    target, _ = setup_event(db, code="MS2")
    entry = add_entry(db, registration)
    db.commit()
    bind(db, source.tournament_id)
    db.commit()
    member = db.scalar(select(UnitMembership))
    old_id = member.unit_id
    unit = db.get(CompetitionUnit, (source.tournament_id, old_id))
    result = rebind(
        db, source.tournament_id, entry.id, target_event_id=target.id, expected_version=unit.version
    )
    assert result["membershipId"] == str(member.id)
    assert member.unit_id != old_id
    assert db.get(CompetitionUnit, (source.tournament_id, old_id)).status == "pending"
    assert len(list(db.scalars(select(UnitMembership)))) == 1


def test_projection_failure_rolls_back_memberships(db, monkeypatch):
    event, registration = setup_event(db)
    add_entry(db, registration)
    db.commit()

    def fail(*args):
        raise RuntimeError("projection failed")

    monkeypatch.setattr("competition.projection.project", fail)
    with pytest.raises(RuntimeError):
        bind(db, event.tournament_id)
    db.rollback()
    assert db.scalar(select(UnitMembership)) is None
    assert db.scalar(select(CompetitionUnit)) is None


def test_payment_retries_partial_refund_and_no_confirmation(db):
    _, registration = setup_event(db)
    entry = add_entry(db, registration)
    entry.state = "pending"
    db.commit()
    kwargs = dict(
        currency="USD", note=None, actor_id="operator", request_id="receipt-1", amount_cents=1200
    )
    record_payment(db, entry.submission, **kwargs)
    db.commit()
    record_payment(db, entry.submission, **kwargs)
    db.commit()
    assert entry.submission.paid_cents == 1200
    assert entry.submission.outstanding_cents == 800
    assert entry.state == "pending"
    record_payment(
        db, entry.submission, **{**kwargs, "request_id": "refund-1", "amount_cents": -200}
    )
    db.commit()
    assert entry.submission.paid_cents == 1000
    assert len(list(db.scalars(select(Payment)))) == 2
    with pytest.raises(ValueError, match="different payment"):
        record_payment(db, entry.submission, **{**kwargs, "amount_cents": 300})


def test_membership_player_must_match_source_entry(db):
    event, registration = setup_event(db)
    entry = add_entry(db, registration)
    other = add_entry(db, registration, "Other")
    unit = CompetitionUnit(
        tournament_id=event.tournament_id, competition_event_id=event.id, status="pending"
    )
    db.add(unit)
    db.flush()
    db.add(
        UnitMembership(
            tournament_id=event.tournament_id,
            unit_id=unit.id,
            competition_event_id=event.id,
            player_id=other.entry_player_id,
            entry_id=entry.id,
            slot=1,
            origin="entry",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_checkpoint_roundtrip_preserves_bindings_without_credentials(db):
    from competition.checkpoint import export_slice, import_slice

    event, registration = setup_event(db)
    add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    snapshot = export_slice(db, event.tournament_id)
    assert all("password_hash" not in row for row in snapshot["accounts"])
    engine = create_engine("sqlite://")
    from _helpers import upgrade_test_database
    upgrade_test_database(engine)
    with Session(engine) as other:
        other.add(Tournament(id=event.tournament_id, name="Restored", kind="bracket", data={}))
        other.flush()
        import_slice(other, event.tournament_id, snapshot)
        assert other.scalar(select(CompetitionUnit)).status == "confirmed"
        assert other.scalar(select(UnitMembership)).entry_id is not None
    engine.dispose()


def test_tournament_deletion_cascades_ledger_and_memberships(db):
    event, registration = setup_event(db)
    entry = add_entry(db, registration)
    db.commit()
    bind(db, event.tournament_id)
    record_payment(
        db,
        entry.submission,
        amount_cents=2000,
        currency="USD",
        note=None,
        actor_id="operator",
        request_id="paid",
    )
    db.commit()
    db.delete(db.get(Tournament, event.tournament_id))
    db.commit()
    assert db.scalar(select(Payment)) is None
    assert db.scalar(select(UnitMembership)) is None


def test_direct_payment_mutation_is_rejected(db):
    _, registration = setup_event(db)
    entry = add_entry(db, registration)
    db.commit()
    record_payment(
        db,
        entry.submission,
        amount_cents=2000,
        currency="USD",
        note=None,
        actor_id="operator",
        request_id="paid",
    )
    db.commit()
    with pytest.raises(IntegrityError, match="append only"):
        db.execute(text("UPDATE payments SET amount_cents = 1"))
    db.rollback()
    with pytest.raises(IntegrityError, match="append only"):
        db.execute(text("DELETE FROM payments"))


def test_manual_roster_replacement_withdraws_old_units(db):
    from competition.roster import ingest_bracket_participants
    from db.models import BracketEvent, BracketParticipant

    tid = db.info["tid"]
    db.add(
        BracketEvent(
            tournament_id=tid,
            id="MS",
            discipline="MS",
            format="se",
            duration_slots=1,
            status="draft",
        )
    )
    db.flush()
    ingest_bracket_participants(
        db,
        tid,
        "MS",
        [{"id": f"p{i}", "name": f"Player {i}", "type": "PLAYER"} for i in range(4)],
        replace=True,
    )
    ingest_bracket_participants(
        db, tid, "MS", [{"id": "new", "name": "New player", "type": "PLAYER"}], replace=True
    )
    assert len(list(db.scalars(select(BracketParticipant)))) == 1
    assert len(list(db.scalars(select(CompetitionUnit)))) == 5
    assert (
        len(list(db.scalars(select(UnitMembership).where(UnitMembership.status == "withdrawn"))))
        == 4
    )


def test_rebind_request_replays_after_source_version_changes(db):
    source, registration = setup_event(db)
    target, _ = setup_event(db, code="MS2")
    entry = add_entry(db, registration)
    db.commit()
    bind(db, source.tournament_id)
    db.commit()
    unit = db.scalar(select(CompetitionUnit))
    kwargs = {
        "target_event_id": target.id,
        "expected_version": unit.version,
        "request_id": "move-1",
    }
    first = rebind(db, source.tournament_id, entry.id, **kwargs)
    db.commit()
    assert rebind(db, source.tournament_id, entry.id, **kwargs) == first
    with pytest.raises(CompetitionError, match="different move"):
        rebind(db, source.tournament_id, entry.id, **{**kwargs, "target_event_id": source.id})


def test_manual_meet_repair_moves_memberships_and_retains_units(db):
    from competition.roster import ingest_document
    from competition.projection import project

    tournament = db.get(Tournament, db.info["tid"])
    tournament.kind = "meet"
    rows = [
        {"id": "a", "name": "Alex", "ranks": ["MD"], "partnerPlayerIds": {"MD": "b"}},
        {"id": "b", "name": "Blair", "ranks": ["MD"], "partnerPlayerIds": {"MD": "a"}},
        {"id": "c", "name": "Casey", "ranks": ["MD"]},
    ]
    ingest_document(db, tournament, {"players": rows})
    project(db, tournament.id)
    db.commit()
    identities = {m.player_id: m.id for m in db.scalars(select(UnitMembership))}
    previous_units = {m.unit_id for m in db.scalars(select(UnitMembership))}
    rows[0]["partnerPlayerIds"] = {"MD": "c"}
    rows[1]["partnerPlayerIds"] = {}
    rows[2]["partnerPlayerIds"] = {"MD": "a"}
    ingest_document(db, tournament, {"players": rows})
    project(db, tournament.id)
    db.commit()
    assert {m.player_id: m.id for m in db.scalars(select(UnitMembership))} == identities
    assert previous_units <= {u.id for u in db.scalars(select(CompetitionUnit))}
    # Integration fixtures reload ORM modules; inspect the persisted projection.
    db.refresh(tournament)
    projected = {p["id"]: p for p in tournament.data["players"]}
    assert projected["a"]["partnerPlayerIds"] == {"MD": "c"}
    assert projected["b"]["partnerPlayerIds"] == {}


def test_director_can_withdraw_the_whole_unit_without_deleting_it(db):
    from competition.service import withdraw_competition_unit

    event, registration = setup_event(db, "doubles", "MD")
    left, right = add_entry(db, registration), add_entry(db, registration, "Partner")
    accept_pair(db, left, right)
    db.commit()
    bind(db, event.tournament_id)
    db.commit()
    unit = db.scalar(select(CompetitionUnit))
    ident = unit.id
    result = withdraw_competition_unit(
        db, event.tournament_id, ident, expected_version=unit.version
    )
    db.commit()
    assert result["status"] == "withdrawn"
    assert db.get(CompetitionUnit, (event.tournament_id, ident)) is not None
    assert all(m.status == "withdrawn" for m in db.scalars(select(UnitMembership)))
    assert all(item["outcome"] == "withdrawn" for item in bind(db, event.tournament_id)["bindings"])
