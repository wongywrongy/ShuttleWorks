"""SP-E1-2 Phase C — one form act, recorded once (ruling R13; Seam B).

The unit under test is the **submission**. Everything here is a claim about
the level boundary R13 drew: one act produces one ``submissions`` row and
one ``entries`` row per (player, event) selection, the acceptance record and
the fee total sit on the act, and a replay hands back **the original act and
all of its entries** rather than re-creating part of it.

The replay assertions are deliberately about *counts as well as identity*.
"the same submission came back" would pass against an implementation that
returned the original row and quietly inserted a second set of entries
beside it — which is the exact failure the R13 move up a level makes
possible, because the retry key no longer sits on the thing being
duplicated.
"""
from __future__ import annotations

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
from entries.submissions import (
    PlayerInput,
    create_submission,
    entries_for,
    find_for_account,
    looks_duplicate,
)


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
    t = Tournament(name="Spring Open", status="draft", schema_version=1, data={})
    session.add(t)
    session.commit()
    page = EntryPage(
        tournament_id=t.id,
        slug="spring-open",
        is_open=True,
        regulations_version=3,
        fee_schedule={"1": 4000, "2": 5500},
    )
    account = EntrantAccount(email="parent@example.com", password_hash="x")
    session.add_all([page, account])
    events = {}
    for code, constraint in (("MS", "M"), ("WS", "F"), ("XD", "mixed")):
        ev = EntryEvent(
            tournament_id=t.id,
            code=code,
            discipline=code,
            entry_type="singles",
            gender_constraint=constraint,
            fee_cents=1500,
        )
        session.add(ev)
        events[code] = ev
    session.commit()
    return {"tid": t.id, "page": page, "account": account, "events": events}


def _create(session, world, players, *, key=None, total=5500, basis=None, account=None):
    return create_submission(
        session,
        tournament_id=world["tid"],
        page=world["page"],
        account_id=(account or world["account"]).id,
        players=players,
        fee_total_cents=total,
        fee_basis=basis if basis is not None else {"basis": "schedule", "players": []},
        idempotency_key=key,
    )


def _other_account(session, email="coach@example.com"):
    row = EntrantAccount(email=email, password_hash="x")
    session.add(row)
    session.commit()
    return row


# ---- one act -------------------------------------------------------------


def test_one_act_produces_one_submission_and_one_entry_per_event(session, world):
    result = _create(
        session,
        world,
        [
            PlayerInput(
                full_name="Alice Chen",
                gender="F",
                remarks="can't play before 6pm Saturday",
                events=[world["events"]["WS"], world["events"]["XD"]],
            )
        ],
    )

    assert len(result.entries) == 2
    assert len({e.submission_id for e in result.entries}) == 1
    assert len(list(session.scalars(sa.select(Submission)))) == 1
    assert len(list(session.scalars(sa.select(EntryPlayer)))) == 1


def test_two_players_in_one_act_share_one_acceptance_and_one_total(session, world):
    """The parent-with-two-children case R13 exists for: one agreement, one
    retry unit, one payment, four entries across two players."""
    result = _create(
        session,
        world,
        [
            PlayerInput(
                full_name="Alice Chen",
                gender="F",
                events=[world["events"]["WS"], world["events"]["XD"]],
            ),
            PlayerInput(
                full_name="Bo Chen",
                gender="M",
                events=[world["events"]["MS"], world["events"]["XD"]],
            ),
        ],
        total=8000,
    )

    assert len(result.entries) == 4
    assert len(result.players) == 2
    assert len({e.submission_id for e in result.entries}) == 1
    assert result.submission.fee_total_cents == 8000
    assert result.submission.regulations_accepted_at is not None


def test_the_acceptance_records_the_version_that_was_read(session, world):
    """Q11: 'they agreed to something at some point' is not a record."""
    result = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    assert result.submission.regulations_version_accepted == 3


def test_the_recorded_total_is_the_total_that_was_passed_in(session, world):
    """Seam B: the total shown to the entrant IS the total recorded. This
    function deliberately does not recompute — a price that changes after
    agreement is not a price."""
    result = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        total=1234,
        basis={"basis": "schedule", "totalCents": 1234, "players": []},
    )
    assert result.submission.fee_total_cents == 1234
    assert result.submission.fee_basis["totalCents"] == 1234


def test_the_player_carries_the_remarks_and_the_entries_do_not_duplicate_them(
    session, world
):
    """Spec §4: three events for one child must not carry three copies of
    one sentence, because the seam writes it onto a roster *player*."""
    result = _create(
        session,
        world,
        [
            PlayerInput(
                "Alice Chen",
                "F",
                remarks="leaving at 4",
                events=[world["events"]["WS"], world["events"]["XD"]],
            )
        ],
    )
    players = list(session.scalars(sa.select(EntryPlayer)))
    assert len(players) == 1
    assert players[0].remarks == "leaving at 4"
    assert all(e.entry_player_id == players[0].id for e in result.entries)


def test_a_repeated_event_for_one_player_is_written_once(session, world):
    """A double-selected event is a form slip. Writing it twice would
    manufacture exactly the condition the duplicate flag exists to ask
    about."""
    ws = world["events"]["WS"]
    result = _create(session, world, [PlayerInput("Alice Chen", "F", events=[ws, ws])])
    assert len(result.entries) == 1


def test_entries_land_pending_not_unverified(session, world):
    """Ruling D1, unamended. ``unverified`` has one exit — automatic, on
    account verification — and E2 owns that machinery, so an entry parked
    there in this slice could never be confirmed and Seam A commits only
    confirmed entries. The pipe would not reach the roster."""
    result = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    assert [e.state for e in result.entries] == ["pending"]


# ---- replay (D4, one level up) ------------------------------------------


def test_a_replayed_key_returns_the_original_act_whole(session, world):
    first = _create(
        session,
        world,
        [
            PlayerInput(
                "Alice Chen",
                "F",
                events=[world["events"]["WS"], world["events"]["XD"]],
            )
        ],
        key="key-1",
    )
    second = _create(
        session,
        world,
        [PlayerInput("Somebody Else", "M", events=[world["events"]["MS"]])],
        key="key-1",
    )

    assert second.replayed is True
    assert second.submission.id == first.submission.id
    assert {e.id for e in second.entries} == {e.id for e in first.entries}
    assert len(second.entries) == 2


def test_a_replay_creates_nothing_at_any_level(session, world):
    """Counts, not just identity. 'the same submission came back' would
    pass against an implementation that returned the original row and
    quietly inserted a second set of entries beside it — the failure the
    move up a level makes possible."""
    _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )

    assert len(list(session.scalars(sa.select(Submission)))) == 1
    assert len(list(session.scalars(sa.select(Entry)))) == 1
    assert len(list(session.scalars(sa.select(EntryPlayer)))) == 1


def test_a_different_key_creates_a_second_act(session, world):
    """Negative control for the replay: the key is what dedups, not the
    content. Two identical entries are legitimate (Q12) and must not be
    swallowed."""
    _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-2",
    )
    assert len(list(session.scalars(sa.select(Submission)))) == 2


def test_no_key_at_all_never_dedups(session, world):
    for _ in range(2):
        _create(
            session,
            world,
            [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        )
    assert len(list(session.scalars(sa.select(Submission)))) == 2


def test_a_lost_race_on_the_unique_index_returns_the_winner_not_a_conflict(
    session, world, monkeypatch
):
    """The other half of the retry race.

    Two identical posts in flight both miss the lookup and one wins the
    index. Answering 409 to the loser would be a correct-looking error to a
    client that did nothing wrong. Simulated by making the pre-write lookup
    miss while a row genuinely exists.
    """
    winner = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="racy",
    )

    from entries import submissions as service

    real = service.find_by_idempotency_key
    calls = {"n": 0}

    def blind_first(sess, tid, key, account_id):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(sess, tid, key, account_id)

    monkeypatch.setattr(service, "find_by_idempotency_key", blind_first)

    loser = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="racy",
    )

    assert loser.replayed is True
    assert loser.submission.id == winner.submission.id
    assert len(list(session.scalars(sa.select(Submission)))) == 1


def test_the_key_is_scoped_to_the_workspace(session, world):
    """Ruling D4. The submit route is reachable by anyone holding a public
    slug, so a global key lookup would let an outsider learn that some other
    workspace used the same key."""
    other = Tournament(name="Autumn", status="draft", schema_version=1, data={})
    session.add(other)
    session.commit()
    session.add(
        Submission(
            tournament_id=other.id,
            account_id=world["account"].id,
            idempotency_key="shared",
        )
    )
    session.commit()

    result = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="shared",
    )
    assert result.replayed is False
    assert result.submission.tournament_id == world["tid"]


def test_a_key_minted_by_another_account_does_not_resolve(session, world):
    """D4 narrowed to the principal (SP-PROGRAM-1 Phase 6 §4).

    Tenant scope alone was enough only while no real key ever arrived: a
    native HTML form cannot send a header, so ``idempotency_key`` was NULL
    for every real entrant and this branch was unreachable. Phase 6 mints
    the key in the loader and carries it as a hidden field, which makes a
    *guessed* key resolve — and a resolved key hands the guesser the other
    entrant's submission, i.e. their receipt.

    The answer is a fresh act, not a 409: this route speaks 403, 429 and a
    rendered 400 and nothing else, and a conflict status would tell the
    guesser that the key exists — the same disclosure D4 narrowed the
    index to prevent, one scope down.
    """
    mine = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    stranger = _other_account(session)

    theirs = _create(
        session,
        world,
        [PlayerInput("Bo Ito", "M", events=[world["events"]["MS"]])],
        key="key-1",
        account=stranger,
    )

    assert theirs.replayed is False
    assert theirs.submission.id != mine.submission.id
    assert theirs.submission.account_id == stranger.id
    assert {e.id for e in theirs.entries}.isdisjoint({e.id for e in mine.entries})
    assert len(list(session.scalars(sa.select(Submission)))) == 2


def test_the_same_account_replaying_its_own_key_still_gets_its_act_back(session, world):
    """Non-vacuity for the test above: the narrowing must not have simply
    turned replay off. Same account, same key — still one act."""
    first = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    second = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
        key="key-1",
    )
    assert second.replayed is True
    assert second.submission.id == first.submission.id
    assert len(list(session.scalars(sa.select(Submission)))) == 1


# ---- reading one act back by id (the receipt door) -----------------------
#
# The 303 the persist path answers with names a submission id, so the
# disclosure this module closes has a second mouth: whoever writes the
# receipt loader (Phase 6 Tasks 14-18) will fetch a submission *by id*. The
# authorisation therefore lives here, in the only read that returns one act
# by id, rather than in the route that has not been written yet — a loader
# that goes through ``find_for_account`` cannot forget the predicate,
# because there is no argument-less way through.


def test_a_foreign_account_cannot_fetch_a_submission_by_id(session, world):
    """The receipt door. The id travels in a redirect ``Location`` and in
    the browser's address bar; it is a handle, never a capability."""
    mine = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
    )
    stranger = _other_account(session)

    assert (
        find_for_account(session, world["tid"], mine.submission.id, stranger.id) is None
    )


def test_the_owning_account_does_fetch_its_own_act_whole(session, world):
    """Non-vacuity for the test above: a lookup that always returned None
    would satisfy it and break every receipt."""
    mine = _create(
        session,
        world,
        [
            PlayerInput(
                "Alice Chen",
                "F",
                events=[world["events"]["WS"], world["events"]["XD"]],
            )
        ],
    )

    found = find_for_account(
        session, world["tid"], mine.submission.id, world["account"].id
    )
    assert found is not None
    assert found.submission.id == mine.submission.id
    assert {e.id for e in found.entries} == {e.id for e in mine.entries}
    assert found.replayed is True


def test_the_by_id_read_is_scoped_to_the_workspace_too(session, world):
    """The tenant half of D4 is not dropped by adding the account half."""
    mine = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
    )
    other = Tournament(name="Autumn", status="draft", schema_version=1, data={})
    session.add(other)
    session.commit()

    assert (
        find_for_account(session, other.id, mine.submission.id, world["account"].id)
        is None
    )


# ---- the flags -----------------------------------------------------------


def test_a_gender_mismatch_is_accepted_and_flagged(session, world):
    """Q14 §5: accepted with an attention flag, never refused."""
    result = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["MS"]])],
    )
    assert len(result.entries) == 1
    assert result.entries[0].state == "pending"
    assert "gender_mismatch" in result.entries[0].pending_reasons


def test_a_matching_gender_is_unflagged(session, world):
    """Negative control."""
    result = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])],
    )
    assert result.entries[0].pending_reasons == []


def test_the_same_player_and_event_across_acts_raises_needs_review(session, world):
    _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    second = _create(
        session, world, [PlayerInput("alice chen", "F", events=[world["events"]["WS"]])]
    )
    assert "needs_review" in second.entries[0].pending_reasons


def test_a_different_player_under_the_same_account_is_not_flagged(session, world):
    """Negative control, and the case a hard unique index would have broken:
    one parent, two children."""
    _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    second = _create(
        session, world, [PlayerInput("Cleo Chen", "F", events=[world["events"]["WS"]])]
    )
    assert second.entries[0].pending_reasons == []


def test_the_same_player_in_a_different_event_is_not_flagged(session, world):
    _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    second = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["XD"]])]
    )
    assert second.entries[0].pending_reasons == []


def test_a_withdrawn_entry_does_not_raise_the_flag(session, world):
    """A resubmission after a withdrawal is a correction, not a
    double-submit."""
    first = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    first.entries[0].state = "withdrawn"
    session.commit()

    assert not looks_duplicate(
        session, world["tid"], world["events"]["WS"].id, "Alice Chen"
    )


# ---- reading an act back -------------------------------------------------


def test_entries_for_returns_the_act_in_a_stable_order(session, world):
    result = _create(
        session,
        world,
        [
            PlayerInput(
                "Alice Chen",
                "F",
                events=[world["events"]["WS"], world["events"]["XD"]],
            )
        ],
    )
    first = [e.id for e in entries_for(session, world["tid"], result.submission.id)]
    second = [e.id for e in entries_for(session, world["tid"], result.submission.id)]
    assert first == second and len(first) == 2


def test_entries_for_is_scoped_to_the_workspace(session, world):
    result = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    other = Tournament(name="Autumn", status="draft", schema_version=1, data={})
    session.add(other)
    session.commit()
    assert entries_for(session, other.id, result.submission.id) == []
