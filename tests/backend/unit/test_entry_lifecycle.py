"""E2 (program Phase 7) — the entry lifecycle state machine, spec §6.

**Every transition and every actor**, which is the phase's stated exit gate.
The spec draws a diagram; this module is that diagram executed, one test per
edge, plus the edges that must NOT exist — because a state machine is
defined at least as much by the moves it refuses as by the ones it makes.

The negative controls are marked inline (CODE_HEALTH 3b). Each one asserts a
refusal, and each was demonstrated failing against a deliberately loosened
implementation before being kept — the loosening is named in the test's own
comment so a later reader can re-run the check.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import (
    Base,
    EntrantAccount,
    Entry,
    EntryEvent,
    EntryPage,
    EntryPlayer,
    Submission,
    Tournament,
)
from entries import lifecycle
from entries.submissions import PlayerInput, create_submission


def _utcnow():
    return datetime.now(timezone.utc)


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


@pytest.fixture
def world(session):
    """One workspace, one page, one verified account, three events.

    ``MS`` is uncapped, ``WS`` is capped at one (so the second entry queues),
    ``XD`` closed to withdrawals yesterday. Three events rather than one
    because every guard below is about a *property of the event*, and a
    single event fixture would force each test to mutate it — which is how
    two tests end up depending on each other's order.
    """
    t = Tournament(name="Autumn Open", status="draft", schema_version=1, data={})
    session.add(t)
    session.commit()
    page = EntryPage(tournament_id=t.id, slug="autumn-open", is_open=True)
    account = EntrantAccount(
        email="parent@example.com", password_hash="x", email_verified=True
    )
    session.add_all([page, account])
    events = {}
    for code, cap, withdraws_until in (
        ("MS", None, None),
        ("WS", 1, None),
        ("XD", None, _utcnow() - timedelta(days=1)),
    ):
        ev = EntryEvent(
            tournament_id=t.id,
            code=code,
            discipline=code,
            entry_type="singles",
            cap=cap,
            withdraws_until=withdraws_until,
        )
        session.add(ev)
        events[code] = ev
    session.commit()
    return {"tid": t.id, "page": page, "account": account, "events": events}


def _submit(session, world, *, event_codes=("MS",), account=None, name="Alice Chen"):
    account = account or world["account"]
    return create_submission(
        session,
        tournament_id=world["tid"],
        page=world["page"],
        account_id=account.id,
        players=[
            PlayerInput(
                full_name=name,
                gender="F",
                club="Riverside",
                birth_year=2009,
                remarks="not before 6pm",
                events=[world["events"][code] for code in event_codes],
            )
        ],
        fee_total_cents=4000,
        fee_basis={"basis": "schedule", "players": []},
        email_verified=account.email_verified,
    )


def _unverified_account(session, email="new@example.com"):
    row = EntrantAccount(email=email, password_hash="x", email_verified=False)
    session.add(row)
    session.commit()
    return row


# ---- intake: submit → unverified | pending -------------------------------


def test_a_verified_account_lands_in_pending(session, world):
    entry = _submit(session, world).entries[0]
    assert entry.state == lifecycle.PENDING


def test_an_unverified_account_lands_in_unverified(session, world):
    account = _unverified_account(session)
    entry = _submit(session, world, account=account).entries[0]
    # Ruling D1's condition flipped in this phase: the machinery that exits
    # this state now exists, so entries may enter it.
    assert entry.state == lifecycle.UNVERIFIED


def test_verifying_promotes_every_entry_that_account_ever_made(session, world):
    account = _unverified_account(session)
    _submit(session, world, event_codes=("MS",), account=account, name="Kid One")
    _submit(session, world, event_codes=("MS",), account=account, name="Kid Two")

    promoted = lifecycle.promote_verified_entries(session, account.id)
    session.commit()

    assert promoted == 2
    states = {e.state for e in session.scalars(sa.select(Entry))}
    assert states == {lifecycle.PENDING}


def test_verification_does_not_touch_another_account_s_entries(session, world):
    """NEGATIVE CONTROL — the account scope on the promotion.

    Demonstrated failing by dropping the ``Submission.account_id ==``
    predicate from ``_entries_of``: the other account's unverified entry is
    promoted too, and this assertion catches it.
    """
    mine = _unverified_account(session, "mine@example.com")
    theirs = _unverified_account(session, "theirs@example.com")
    _submit(session, world, account=mine, name="Mine")
    theirs_entry = _submit(session, world, account=theirs, name="Theirs").entries[0]

    lifecycle.promote_verified_entries(session, mine.id)
    session.commit()

    assert theirs_entry.state == lifecycle.UNVERIFIED


# ---- intake: → waitlisted, automatic, at cap -----------------------------


def test_the_entry_that_fills_the_cap_is_not_waitlisted(session, world):
    entry = _submit(session, world, event_codes=("WS",)).entries[0]
    assert entry.state == lifecycle.PENDING


def test_the_next_entry_past_the_cap_queues_with_the_reason(session, world):
    _submit(session, world, event_codes=("WS",), name="First In")
    entry = _submit(session, world, event_codes=("WS",), name="Second In").entries[0]

    assert entry.state == lifecycle.WAITLISTED
    assert lifecycle.OVER_CAP in entry.pending_reasons


def test_a_waitlisted_entry_does_not_itself_raise_the_bar(session, world):
    """Two over the cap of one, and the count that decides is unchanged.

    If waitlisted entries counted toward the cap, the third entrant would be
    measured against a fuller event than the second was — an event capped at
    16 with 4 queued would read as full at 12. Both queue; neither moves the
    line.
    """
    _submit(session, world, event_codes=("WS",), name="First In")
    _submit(session, world, event_codes=("WS",), name="Second In")
    third = _submit(session, world, event_codes=("WS",), name="Third In").entries[0]

    assert third.state == lifecycle.WAITLISTED
    holding = session.scalar(
        sa.select(sa.func.count())
        .select_from(Entry)
        .where(Entry.state == lifecycle.PENDING)
    )
    assert holding == 1


def test_an_uncapped_event_never_queues(session, world):
    for name in ("A", "B", "C", "D"):
        entry = _submit(session, world, event_codes=("MS",), name=name).entries[0]
        assert entry.state == lifecycle.PENDING


def test_a_withdrawal_frees_a_place_for_the_next_submission(session, world):
    """The cap counts places HELD, so a withdrawal reopens the event.

    This is the property that makes the waitlist honest rather than a
    high-water mark: an event does not stay full because it was once full.
    """
    first = _submit(session, world, event_codes=("WS",), name="First In").entries[0]
    lifecycle.withdraw(session, first, world["events"]["WS"])
    session.commit()

    later = _submit(session, world, event_codes=("WS",), name="Later").entries[0]
    assert later.state == lifecycle.PENDING


# ---- the entrant: any live state → withdrawn -----------------------------


@pytest.mark.parametrize(
    "state", [lifecycle.UNVERIFIED, lifecycle.PENDING, lifecycle.WAITLISTED, lifecycle.CONFIRMED]
)
def test_every_live_state_can_be_withdrawn_by_its_entrant(session, world, state):
    entry = _submit(session, world).entries[0]
    entry.state = state
    lifecycle.withdraw(session, entry, world["events"]["MS"])
    assert entry.state == lifecycle.WITHDRAWN
    assert entry.withdrawn_at is not None


@pytest.mark.parametrize("state", [lifecycle.WITHDRAWN, lifecycle.REJECTED])
def test_a_dead_entry_cannot_be_withdrawn_again(session, world, state):
    """NEGATIVE CONTROL — the state guard.

    ``rejected`` matters most here: an operator has decided, and a public
    route that accepted the transition would let an entrant overwrite that
    decision with a state of their own choosing. Demonstrated failing by
    widening ``LIVE_STATES`` to include ``rejected``.
    """
    entry = _submit(session, world).entries[0]
    entry.state = state
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.withdraw(session, entry, world["events"]["MS"])
    assert exc.value.code == "ENTRY_NOT_LIVE"


def test_the_withdrawal_deadline_refuses_the_entrant_and_names_the_reason(
    session, world
):
    """NEGATIVE CONTROL — ``withdraws_until`` (R14 §3).

    Demonstrated failing by deleting the deadline branch in
    ``assert_withdrawable``: the XD entry withdraws a day after the
    organiser stopped accepting withdrawals.
    """
    entry = _submit(session, world, event_codes=("XD",)).entries[0]
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.withdraw(session, entry, world["events"]["XD"])
    assert exc.value.code == "WITHDRAWAL_CLOSED"
    # The refusal carries what to do next, not just that it was refused.
    assert "organiser" in exc.value.message


def test_an_operator_may_withdraw_after_the_deadline(session, world):
    entry = _submit(session, world, event_codes=("XD",)).entries[0]
    lifecycle.withdraw(session, entry, world["events"]["XD"], by_operator=True)
    assert entry.state == lifecycle.WITHDRAWN


def test_a_missing_deadline_never_blocks(session, world):
    entry = _submit(session, world, event_codes=("MS",)).entries[0]
    lifecycle.withdraw(session, entry, world["events"]["MS"])
    assert entry.state == lifecycle.WITHDRAWN


# ---- the entrant: withdraw-and-erase (ruling D7) -------------------------


def test_erase_scrubs_the_person_and_keeps_the_record(session, world):
    result = _submit(session, world)
    entry = result.entries[0]
    submission_id = entry.submission_id

    lifecycle.withdraw(session, entry, world["events"]["MS"], erase=True)
    session.commit()

    player = session.get(EntryPlayer, (world["tid"], result.players[0].id))
    assert player.full_name == lifecycle.ERASED_NAME
    assert player.club is None
    assert player.remarks is None
    assert player.birth_year is None
    assert player.erased_at is not None

    # The director's record of what happened survives — ruling D7. The fee
    # is asserted on the SUBMISSION because that is where the number that
    # means something lives (R14: tiered pricing prices the person, not the
    # event, so an entry's share can legitimately be NULL).
    submission = session.get(Submission, (world["tid"], submission_id))
    assert submission is not None
    assert submission.fee_total_cents == 4000
    assert entry.state == lifecycle.WITHDRAWN


def test_erase_leaves_the_account_alone(session, world):
    """Erasing one entry is not deleting the parent's account.

    The account is the submitter — often a different person from the player
    — and it may hold entries for other children that were not withdrawn.
    Account-level deletion is Phase 10 and a different request.
    """
    result = _submit(session, world)
    lifecycle.withdraw(session, result.entries[0], world["events"]["MS"], erase=True)
    session.commit()

    account = session.get(EntrantAccount, world["account"].id)
    assert account is not None
    assert account.email == "parent@example.com"


def test_erase_is_idempotent(session, world):
    result = _submit(session, world)
    entry = result.entries[0]
    lifecycle.withdraw(session, entry, world["events"]["MS"], erase=True)
    session.commit()
    stamped = result.players[0].erased_at

    lifecycle.erase_player(session, entry)
    assert result.players[0].erased_at == stamped


def test_a_plain_withdrawal_does_not_erase(session, world):
    """NEGATIVE CONTROL — the two acts are separate.

    Withdrawing is "I am not playing"; erasing is "forget me". Demonstrated
    failing by defaulting ``erase=True``: a routine withdrawal silently
    destroys the entrant's name, and the desk loses who withdrew.
    """
    result = _submit(session, world)
    lifecycle.withdraw(session, result.entries[0], world["events"]["MS"])
    assert result.players[0].full_name == "Alice Chen"
    assert result.players[0].erased_at is None


# ---- committed + withdrawn = an operator's problem, never automatic ------


def test_a_committed_entry_keeps_its_roster_link_when_withdrawn(session, world):
    """Ruling R3: the seam is not reversed by a withdrawal.

    The player is already on a roster and possibly in a built draw. Pulling
    them out automatically is exactly the consequential automatic decision
    invariant I4 forbids — so the link stays and the pair becomes a signal.
    """
    entry = _submit(session, world).entries[0]
    entry.state = lifecycle.CONFIRMED
    entry.committed_player_id = "roster-player-7"

    lifecycle.withdraw(session, entry, world["events"]["MS"])

    assert entry.committed_player_id == "roster-player-7"
    assert lifecycle.committed_and_withdrawn([entry]) == [entry]


def test_an_uncommitted_withdrawal_raises_nothing_for_the_operator(session, world):
    entry = _submit(session, world).entries[0]
    lifecycle.withdraw(session, entry, world["events"]["MS"])
    assert lifecycle.committed_and_withdrawn([entry]) == []


# ---- the operator: confirm / reject / promote ----------------------------


def test_pending_is_confirmable(session, world):
    entry = _submit(session, world).entries[0]
    lifecycle.assert_confirmable(entry)  # does not raise


def test_a_waitlisted_entry_must_be_promoted_before_it_is_confirmed(session, world):
    _submit(session, world, event_codes=("WS",), name="First In")
    entry = _submit(session, world, event_codes=("WS",), name="Second In").entries[0]
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.assert_confirmable(entry)
    assert exc.value.code == "ENTRY_WAITLISTED"
    assert "Promote it first" in exc.value.message


def test_an_unverified_entry_is_not_confirmable(session, world):
    """NEGATIVE CONTROL — Seam A commits only ``confirmed`` entries.

    Confirming an entry whose entrant never proved the address would put an
    unverifiable person on a roster. Demonstrated failing by removing the
    ``UNVERIFIED`` branch from ``assert_confirmable``.
    """
    account = _unverified_account(session)
    entry = _submit(session, world, account=account).entries[0]
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.assert_confirmable(entry)
    assert exc.value.code == "ENTRY_UNVERIFIED"


def test_promote_moves_a_waitlisted_entry_to_pending_and_clears_over_cap(
    session, world
):
    _submit(session, world, event_codes=("WS",), name="First In")
    entry = _submit(session, world, event_codes=("WS",), name="Second In").entries[0]
    entry.pending_reasons = [lifecycle.OVER_CAP, "gender_mismatch"]

    lifecycle.promote(entry)

    assert entry.state == lifecycle.PENDING
    assert lifecycle.OVER_CAP not in entry.pending_reasons
    # An unrelated judgement is not resolved by a promotion.
    assert "gender_mismatch" in entry.pending_reasons


def test_promote_never_reaches_confirmed_directly(session, world):
    """The narrow half of the spec's "pending/confirmed".

    A place opening is not the same act as accepting an entry, and routing
    the promotion through ``pending`` means the confirm still happens
    deliberately, under the same rules and against the same reasons.
    """
    _submit(session, world, event_codes=("WS",), name="First In")
    entry = _submit(session, world, event_codes=("WS",), name="Second In").entries[0]
    lifecycle.promote(entry)
    assert entry.state != lifecycle.CONFIRMED


def test_only_a_waitlisted_entry_can_be_promoted(session, world):
    entry = _submit(session, world).entries[0]
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.promote(entry)
    assert exc.value.code == "ENTRY_NOT_WAITLISTED"


@pytest.mark.parametrize(
    "state", [lifecycle.PENDING, lifecycle.WAITLISTED, lifecycle.UNVERIFIED]
)
def test_an_undecided_entry_can_be_rejected(session, world, state):
    entry = _submit(session, world).entries[0]
    entry.state = state
    lifecycle.reject(entry)
    assert entry.state == lifecycle.REJECTED


def test_a_confirmed_entry_cannot_be_rejected(session, world):
    """NEGATIVE CONTROL — reject is not an undo for confirm.

    A confirmed entry may be on a roster and in a draw; the honest operation
    is a withdrawal, which says what happens to the player. Demonstrated
    failing by adding ``CONFIRMED`` to ``reject``'s allowed states.
    """
    entry = _submit(session, world).entries[0]
    entry.state = lifecycle.CONFIRMED
    with pytest.raises(lifecycle.LifecycleError) as exc:
        lifecycle.reject(entry)
    assert exc.value.code == "ENTRY_NOT_REJECTABLE"
    assert "Withdraw a confirmed entry instead" in exc.value.message


# ---- authorization: whose entry is it -----------------------------------


def test_owned_by_answers_from_the_act(session, world):
    entry = _submit(session, world).entries[0]
    assert lifecycle.owned_by(entry, world["account"].id) is True


def test_owned_by_refuses_a_stranger(session, world):
    """NEGATIVE CONTROL — the authorization predicate on every entrant write.

    Demonstrated failing by having ``owned_by`` read the PLAYER's
    ``account_id`` instead of the submission's and then reassigning the
    player: the stranger is admitted. The act is the narrower answer.
    """
    entry = _submit(session, world).entries[0]
    assert lifecycle.owned_by(entry, uuid.uuid4()) is False


def test_live_entries_for_is_scoped_to_the_account(session, world):
    other = _unverified_account(session, "other@example.com")
    _submit(session, world, name="Mine")
    _submit(session, world, account=other, name="Theirs")
    session.commit()

    mine = lifecycle.live_entries_for(session, world["account"].id)
    assert len(mine) == 1
    assert mine[0].player_name == "Mine"
