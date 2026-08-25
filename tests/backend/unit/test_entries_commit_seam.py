"""SP-E1-1 — Seam A, the Entries → Meet | Bracket commit seam.

Spec §5 states the contract this suite holds the implementation to:

    Output: for every ``confirmed`` entry with no ``committed_player_id``,
    a roster player (Meet: a PlayerDTO in the state blob with ranks[]
    derived from entry_events.code; Bracket: a bracket_participants row
    under the mapped bracket_event_id), plus the back-reference written on
    both sides, plus the entrant's remarks carried onto the roster player
    verbatim.

    Invariants: idempotent (re-running commits nothing new); never mutates
    or deletes an existing roster player; never auto-removes on withdrawal;
    total commits ≤ total confirmed.

    Failure modes: a state_version conflict on the Meet blob → refetch and
    retry, never blind overwrite; an unmappable entry_events.code → the
    entry is skipped and reported, not guessed at; partial success is
    reported per-entry, not rolled back wholesale.

Driven at the service layer rather than over HTTP because the conflict
case cannot be produced by ordering two requests — the interleaving
happens *inside* one call. Same reasoning as
``test_concurrent_state_writes.py::test_the_write_is_a_compare_and_swap_not_just_a_precheck``,
whose characterization pass (SP-E1-1 Task 1) is what this seam is built on.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import (
    Base,
    EntrantAccount,
    Entry,
    EntryEvent,
    EntryPlayer,
)
from repositories.local import LocalRepository
from entries.entries import SkipReason, commit_entries


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
def sessions(engine):
    """A session factory, so a test can open a genuine *second* session.

    Concurrency here means two units of work, not two calls on one — the
    characterization pass established that a competing write on the same
    session is a different (and weaker) scenario.
    """
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def session(sessions):
    s = sessions()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def repo(session):
    return LocalRepository(session)


def _meet_workspace(repo, *, ranks=("MS",)):
    row = repo.tournaments.create(name="Spring Invitational", kind="meet")
    repo.tournaments.upsert_data(
        row.id,
        {
            "config": {
                "tournamentName": "Spring Invitational",
                "intervalMinutes": 15,
                "dayStart": "08:00",
                "dayEnd": "18:00",
                "courtCount": 4,
                "defaultRestMinutes": 20,
                "freezeHorizonSlots": 0,
                "rankCounts": {r: 2 for r in ranks},
            },
            "groups": [],
            "players": [],
            "matches": [],
        },
    )
    return row.id


def _bracket_workspace(repo):
    row = repo.tournaments.create(name="Club Champs", kind="bracket")
    repo.tournaments.upsert_data(
        row.id, {"config": {"tournamentName": "Club Champs"}, "bracketPlayers": []}
    )
    return row.id


def _entry_event(session, tournament_id, *, code="MS", bracket_event_id=None):
    row = EntryEvent(
        tournament_id=tournament_id,
        code=code,
        discipline=f"{code} discipline",
        entry_type="singles",
        bracket_event_id=bracket_event_id,
    )
    session.add(row)
    session.commit()
    return row


def _account(session, email="parent@example.com"):
    """One entrant account, reused across a test's entries.

    Reused rather than minted per entry because that is what the model
    means: one account acts for many players (a parent, a club rep).
    """
    row = session.scalars(
        __import__("sqlalchemy").select(EntrantAccount).where(
            EntrantAccount.email == email
        )
    ).first()
    if row is None:
        row = EntrantAccount(email=email, password_hash="x")
        session.add(row)
        session.commit()
    return row


def _entry(
    session,
    tournament_id,
    entry_event,
    *,
    player_name="Alice Chen",
    state="confirmed",
    remarks=None,
    player=None,
):
    """One confirmed entry, built at the level boundary ruling R13 drew.

    Pass ``player`` to enter the SAME human in a second event — the
    multi-event case ``EntryPlayer``'s own docstring describes ("three
    events for one child"), and the one a per-entry helper cannot express.

    **This helper is the only thing in this file that SP-E1-2 changed.**
    ``player_name`` and ``remarks`` used to be columns on ``entries`` and
    are now columns on ``entry_players``; the seam reads them through
    association proxies, so ``entries/entries.py`` is byte-for-byte
    unedited and every assertion below is untouched. ``gender`` is new
    fixture data (R12 makes the field required) rather than a backfill —
    there is no old value it could have come from, which is exactly why
    ruling D-A5 authorised a clean rebuild instead of one.
    """
    if player is None:
        player = EntryPlayer(
            tournament_id=tournament_id,
            account_id=_account(session).id,
            full_name=player_name,
            gender="F",
            remarks=remarks,
        )
        session.add(player)
        session.commit()
    row = Entry(
        tournament_id=tournament_id,
        entry_event_id=entry_event.id,
        entry_player_id=player.id,
        state=state,
        pending_reasons=[],
    )
    session.add(row)
    session.commit()
    return row


def _players(repo, tournament_id):
    repo.session.expire_all()
    return repo.tournaments.get_by_id(tournament_id).data.get("players") or []


# ---- Meet ---------------------------------------------------------------


def test_a_confirmed_entry_becomes_a_roster_player_with_both_back_references(
    repo, session
):
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    entry = _entry(
        session, tid, ev, remarks="can't play before 6pm Saturday"
    )

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    assert result.skipped == []

    players = _players(repo, tid)
    assert len(players) == 1
    player = players[0]
    assert player["name"] == "Alice Chen"
    assert player["ranks"] == ["MS"], "ranks[] is derived from entry_events.code"
    assert player["remarks"] == "can't play before 6pm Saturday"
    # Back-reference, both halves.
    assert player["sourceEntryId"] == str(entry.id)
    session.expire_all()
    assert entry.committed_player_id == player["id"]


def test_the_default_group_is_the_event_code_and_the_group_row_is_created(
    repo, session
):
    """``PlayerDTO.groupId`` is REQUIRED and an entry has no school.

    The seam defaults it to the entry event's code — the same string it
    already puts in ``ranks[]`` — and materializes the matching group row.
    A player pointing at a group that does not exist would be invisible in
    a roster grouped by school, which is how the Meet roster renders.
    """
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    _entry(session, tid, ev)

    commit_entries(repo, tid)

    document = repo.tournaments.get_by_id(tid).data
    assert document["players"][0]["groupId"] == "MS"
    assert [g["id"] for g in document["groups"]] == ["MS"]


def test_re_running_the_seam_commits_nothing_new(repo, session):
    """Spec §5: idempotent. Q3: re-runnable, because entries reopen and
    late arrivals are the norm, not the exception."""
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    _entry(session, tid, ev)

    first = commit_entries(repo, tid)
    assert len(first.committed) == 1
    version_after_first = repo.tournaments.get_by_id(tid).state_version

    second = commit_entries(repo, tid)
    assert second.committed == []
    assert second.skipped == []
    assert len(_players(repo, tid)) == 1
    assert repo.tournaments.get_by_id(tid).state_version == version_after_first, (
        "an idempotent no-op must not even write the blob"
    )


def test_a_second_run_picks_up_a_late_entry_without_duplicating_the_first(
    repo, session
):
    """Negative control for idempotency: prove the no-op above is 'nothing
    new to do', not 'the seam stopped working after one run'."""
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    _entry(session, tid, ev, player_name="Alice Chen")
    commit_entries(repo, tid)

    late = _entry(session, tid, ev, player_name="Bo Ferrar")
    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(late.id)]
    assert sorted(p["name"] for p in _players(repo, tid)) == [
        "Alice Chen",
        "Bo Ferrar",
    ]


def test_only_confirmed_entries_are_committed(repo, session):
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    for state in ("pending", "unverified", "withdrawn", "rejected", "waitlisted"):
        _entry(session, tid, ev, player_name=f"{state} person", state=state)

    result = commit_entries(repo, tid)

    assert result.committed == []
    assert result.skipped == [], "a non-candidate is not a skip — it is not a candidate"
    assert _players(repo, tid) == []


def test_confirming_one_of_them_is_what_makes_it_commit(repo, session):
    """Negative control for the test above — same fixture, one state
    changed. Without this the previous test would also pass if the seam
    were broken outright."""
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    pending = _entry(session, tid, ev, player_name="Dee Park", state="pending")
    assert commit_entries(repo, tid).committed == []

    pending.state = "confirmed"
    session.commit()

    result = commit_entries(repo, tid)
    assert [c.entry_id for c in result.committed] == [str(pending.id)]
    assert [p["name"] for p in _players(repo, tid)] == ["Dee Park"]


def test_an_existing_roster_player_is_never_touched(repo, session):
    """Spec §5 invariant. The operator's own player, with the operator's
    own ``notes``, survives the commit byte-for-byte."""
    tid = _meet_workspace(repo)
    hand_added = {
        "id": "p-hand",
        "name": "Existing Player",
        "groupId": "MS",
        "ranks": ["MS"],
        "availability": [],
        "notes": "operator wrote this",
    }
    row = repo.tournaments.get_by_id(tid)
    document = dict(row.data)
    document["players"] = [hand_added]
    document["groups"] = [{"id": "MS", "name": "Men's Singles"}]
    repo.tournaments.upsert_data(tid, document)

    ev = _entry_event(session, tid, code="MS")
    _entry(session, tid, ev)
    commit_entries(repo, tid)

    players = _players(repo, tid)
    assert len(players) == 2
    survivor = next(p for p in players if p["id"] == "p-hand")
    assert survivor == hand_added
    # The pre-existing group keeps its name — the seam adds, never renames.
    groups = repo.tournaments.get_by_id(tid).data["groups"]
    assert groups == [{"id": "MS", "name": "Men's Singles"}]


def test_an_unmappable_code_is_skipped_and_reported_not_guessed(repo, session):
    """The workspace's rank vocabulary is ``config.rankCounts``. A code
    that is not in it has no roster meaning, and inventing one would be
    exactly the silent automatic decision invariant I4 forbids."""
    tid = _meet_workspace(repo, ranks=("MS", "WS"))
    ev = _entry_event(session, tid, code="ZZ")
    entry = _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert result.committed == []
    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(entry.id), SkipReason.UNMAPPABLE_EVENT)
    ]
    assert _players(repo, tid) == []
    session.expire_all()
    assert entry.committed_player_id is None


def test_a_mappable_code_on_the_same_fixture_commits(repo, session):
    """Negative control for the skip above."""
    tid = _meet_workspace(repo, ranks=("MS", "WS"))
    ev = _entry_event(session, tid, code="WS")
    entry = _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    assert _players(repo, tid)[0]["ranks"] == ["WS"]


def test_one_bad_code_does_not_roll_back_the_good_entries(repo, session):
    """Spec §5: partial success is reported per-entry, not rolled back
    wholesale."""
    tid = _meet_workspace(repo, ranks=("MS",))
    good_ev = _entry_event(session, tid, code="MS")
    bad_ev = _entry_event(session, tid, code="ZZ")
    good = _entry(session, tid, good_ev, player_name="Good Entry")
    bad = _entry(session, tid, bad_ev, player_name="Bad Entry")

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(good.id)]
    assert [s.entry_id for s in result.skipped] == [str(bad.id)]
    assert [p["name"] for p in _players(repo, tid)] == ["Good Entry"]


def test_entries_in_another_workspace_are_not_touched(repo, session):
    tid = _meet_workspace(repo)
    other = _meet_workspace(repo)
    ev_other = _entry_event(session, other, code="MS")
    _entry(session, other, ev_other, player_name="Not Mine")

    result = commit_entries(repo, tid)

    assert result.committed == []
    assert _players(repo, tid) == []
    assert _players(repo, other) == []


def test_a_workspace_with_no_rank_vocabulary_accepts_any_code(repo, session):
    """A workspace that has not declared ``rankCounts`` has declared
    nothing to contradict. Refusing every entry there would make the seam
    unusable on a fresh workspace, and there is no guess involved in
    accepting a code when no vocabulary exists."""
    row = repo.tournaments.create(name="Fresh", kind="meet")
    repo.tournaments.upsert_data(row.id, {"config": {"tournamentName": "Fresh"}})
    ev = _entry_event(session, row.id, code="XD1")
    entry = _entry(session, row.id, ev)

    result = commit_entries(repo, row.id)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]


# ---- Meet: the CAS contract --------------------------------------------


def _conflict_once(repo, sessions, tid, *, times=1):
    """Wrap ``commit_tournament_state`` so the first ``times`` calls are
    preceded by a competing write from a genuinely separate session.

    That is what a conflict looks like in production — another request,
    another unit of work — and per the Task 1 characterization it is
    precisely the case the repository's own CAS misses unless the caller
    expires its snapshot first.
    """
    original = repo.commit_tournament_state
    calls = {"n": 0}

    def wrapper(tournament_id, payload, **kwargs):
        calls["n"] += 1
        if calls["n"] <= times:
            other = sessions()
            try:
                other_repo = LocalRepository(other)
                row = other_repo.tournaments.get_by_id(tid)
                bumped = dict(row.data or {})
                bumped["scheduleIsStale"] = calls["n"] % 2 == 1
                other_repo.tournaments.upsert_data(tid, bumped)
            finally:
                other.close()
        return original(tournament_id, payload, **kwargs)

    repo.commit_tournament_state = wrapper  # type: ignore[method-assign]
    return calls


def test_a_conflict_mid_commit_is_retried_not_blindly_overwritten(
    repo, session, sessions
):
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    entry = _entry(session, tid, ev)

    calls = _conflict_once(repo, sessions, tid, times=1)
    result = commit_entries(repo, tid)

    assert calls["n"] == 2, "the seam did not retry"
    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    assert len(_players(repo, tid)) == 1
    # The competing writer's change survived — the retry rebuilt from the
    # refetched document rather than replaying the stale one.
    assert repo.tournaments.get_by_id(tid).data["scheduleIsStale"] is True


def test_retries_are_bounded_and_exhaustion_is_reported_per_entry(
    repo, session, sessions
):
    """Negative control for the retry: a conflict that never clears must
    stop, report, and leave the entry uncommitted — not spin, and not
    force the write through."""
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    entry = _entry(session, tid, ev)

    calls = _conflict_once(repo, sessions, tid, times=99)
    result = commit_entries(repo, tid, max_attempts=3)

    assert calls["n"] == 3
    assert result.committed == []
    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(entry.id), SkipReason.STATE_CONFLICT)
    ]
    assert _players(repo, tid) == []
    session.expire_all()
    assert entry.committed_player_id is None


def test_a_crash_between_the_two_writes_self_heals(repo, session):
    """The seam writes the blob, then the back-references — two commits,
    so a crash between them leaves a roster player with no
    ``committed_player_id`` pointing at it.

    Re-running must *adopt* that player rather than add a second one. The
    adoption keys on ``sourceEntryId``, which is why the field is on the
    roster player and not only in the entries table.
    """
    tid = _meet_workspace(repo)
    ev = _entry_event(session, tid, code="MS")
    entry = _entry(session, tid, ev)
    commit_entries(repo, tid)

    # Simulate the crash: the blob keeps the player, the entry loses its
    # back-reference.
    session.expire_all()
    player_id = entry.committed_player_id
    entry.committed_player_id = None
    session.commit()

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    assert len(_players(repo, tid)) == 1, "a duplicate roster player was created"
    session.expire_all()
    assert entry.committed_player_id == player_id


# ---- Bracket ------------------------------------------------------------


def _draft_event(repo, tid, event_id="MS"):
    return repo.brackets.create_event(
        tid,
        event_id,
        discipline="Men's Singles",
        format="se",
        duration_slots=2,
    )


def test_a_bracket_entry_becomes_a_participant_and_a_roster_player(repo, session):
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    entry = _entry(session, tid, ev, player_name="Alex Tan", remarks="leaving at 4")

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    participants = repo.brackets.list_participants(tid, "MS")
    assert [p.name for p in participants] == ["Alex Tan"]
    assert participants[0].type == "PLAYER"

    # The blob half — where remarks and the availability controls live.
    document = repo.tournaments.get_by_id(tid).data
    roster = document["bracketPlayers"]
    assert len(roster) == 1
    assert roster[0]["name"] == "Alex Tan"
    assert roster[0]["remarks"] == "leaving at 4"
    assert roster[0]["sourceEntryId"] == str(entry.id)
    session.expire_all()
    assert entry.committed_player_id == participants[0].id == roster[0]["id"]


def test_a_committed_entry_puts_the_person_key_on_its_participant(repo, session):
    """R-DM-2(a) end to end: the commit seam knows the person
    (``entries.entry_player_id``), and now the participant row carries it as
    a constrained key instead of only as a name-derived id."""
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    entry = _entry(session, tid, ev, player_name="Alex Tan")

    commit_entries(repo, tid)

    session.expire_all()
    participants = repo.brackets.list_participants(tid, "MS")
    assert [p.entry_player_id for p in participants] == [entry.entry_player_id]


def test_one_person_in_two_draws_is_one_roster_row_in_both_participant_lists(
    repo, session
):
    """Regression (real-browser demo pass, 2026-08-10): the Lewisville
    workspace's bracket roster read "42 players" for 23 people.

    The seam keyed the roster row on the ENTRY, so a person entering three
    events became three rows. ``EntryPlayer``'s own docstring already says
    what the shape must be — "three events for one child must not carry
    three copies of one sentence, because the commit seam writes it onto a
    roster player". One row per person; the events fan out through the
    per-event participant lists, which is where the roster's ``{code,
    type}`` badges come from (``rosterEvents.badgesByPlayerId``).
    """
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    _draft_event(repo, tid, "XD")
    ms = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    xd = _entry_event(session, tid, code="XD", bracket_event_id="XD")
    first = _entry(session, tid, ms, player_name="Alex Tan", remarks="leaving at 4")
    second = _entry(session, tid, xd, player=first.player)

    result = commit_entries(repo, tid)

    assert {c.entry_id for c in result.committed} == {str(first.id), str(second.id)}
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert [p["name"] for p in roster] == ["Alex Tan"], "one row per PERSON"
    # Both entries point at that single row, and it appears under both
    # draws — badges derive from the per-event participant lists.
    session.expire_all()
    assert first.committed_player_id == second.committed_player_id == roster[0]["id"]
    assert [p.id for p in repo.brackets.list_participants(tid, "MS")] == [roster[0]["id"]]
    assert [p.id for p in repo.brackets.list_participants(tid, "XD")] == [roster[0]["id"]]


def test_one_person_in_two_meet_events_is_one_player_carrying_both_ranks(
    repo, session
):
    """The Meet half of the same defect. ``ranks[]`` is where a meet player
    carries their events, so a second entry extends the list rather than
    minting a second player."""
    tid = _meet_workspace(repo, ranks=("MS", "XD"))
    ms = _entry_event(session, tid, code="MS")
    xd = _entry_event(session, tid, code="XD")
    first = _entry(session, tid, ms, player_name="Alice Chen")
    second = _entry(session, tid, xd, player=first.player)
    # Distinct submitted_at: the seam orders by (submitted_at, id), and two
    # same-transaction inserts can share one timestamp — the random-UUID id
    # then breaks the tie arbitrarily and ranks[] arrives ["XD", "MS"]. The
    # assertion below is about ORDER, so the fixture must actually make the
    # MS entry earlier.
    from datetime import timedelta

    second.submitted_at = first.submitted_at + timedelta(seconds=1)
    session.commit()

    commit_entries(repo, tid)

    players = _players(repo, tid)
    assert [p["name"] for p in players] == ["Alice Chen"]
    assert players[0]["ranks"] == ["MS", "XD"]
    session.expire_all()
    assert first.committed_player_id == second.committed_player_id == players[0]["id"]


def test_a_started_draw_is_skipped_and_never_mutated(repo, session):
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    repo.brackets.set_event_status(tid, "MS", "started")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    entry = _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert result.committed == []
    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(entry.id), SkipReason.DRAW_NOT_EDITABLE)
    ]
    assert repo.brackets.list_participants(tid, "MS") == []
    assert repo.tournaments.get_by_id(tid).data["bracketPlayers"] == []


def test_a_generated_draw_is_skipped_too(repo, session):
    """A generated draw already has a match tree; adding an entrant under
    it would produce a participant the bracket does not contain."""
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    repo.brackets.set_event_status(tid, "MS", "generated")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert [s.reason for s in result.skipped] == [SkipReason.DRAW_NOT_EDITABLE]
    assert repo.brackets.list_participants(tid, "MS") == []


def test_the_same_entry_commits_once_the_draw_is_back_to_draft(repo, session):
    """Negative control for both skips above: the refusal is about the
    draw's state, not about bracket entries being unsupported."""
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    repo.brackets.set_event_status(tid, "MS", "started")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    entry = _entry(session, tid, ev)
    assert commit_entries(repo, tid).committed == []

    repo.brackets.set_event_status(tid, "MS", "draft")
    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(entry.id)]
    assert len(repo.brackets.list_participants(tid, "MS")) == 1


def test_an_entry_event_with_no_mapped_bracket_event_is_skipped(repo, session):
    tid = _bracket_workspace(repo)
    ev = _entry_event(session, tid, code="MS", bracket_event_id=None)
    entry = _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(entry.id), SkipReason.UNMAPPABLE_EVENT)
    ]


def test_a_dangling_bracket_event_pointer_is_skipped_not_guessed(repo, session):
    """``entry_events.bracket_event_id`` deliberately carries no FK (the
    migration explains why), so it can point at a rebuilt-away draw. That
    is a handled state, not a crash and not a guess."""
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="XD", bracket_event_id="XD")
    entry = _entry(session, tid, ev)

    result = commit_entries(repo, tid)

    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(entry.id), SkipReason.UNMAPPABLE_EVENT)
    ]
    assert repo.brackets.list_participants(tid, "MS") == []


def test_bracket_commit_is_idempotent(repo, session):
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    _entry(session, tid, ev)

    assert len(commit_entries(repo, tid).committed) == 1
    second = commit_entries(repo, tid)

    assert second.committed == []
    assert len(repo.brackets.list_participants(tid, "MS")) == 1
    assert len(repo.tournaments.get_by_id(tid).data["bracketPlayers"]) == 1


def test_an_existing_bracket_participant_is_never_disturbed(repo, session):
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    repo.brackets.bulk_create_participants(
        tid, "MS", [{"id": "P1", "name": "Seeded One", "type": "PLAYER", "seed": 1}]
    )
    ev = _entry_event(session, tid, code="MS", bracket_event_id="MS")
    _entry(session, tid, ev, player_name="Late Entrant")

    commit_entries(repo, tid)

    rows = {p.id: p for p in repo.brackets.list_participants(tid, "MS")}
    assert len(rows) == 2
    assert rows["P1"].name == "Seeded One"
    assert rows["P1"].seed == 1


def test_the_roster_id_prefix_has_exactly_one_definition():
    """F-DM-05's deletion gate as an executable assertion, not a grep in a
    plan. The prefix was minted in one file and RE-DERIVED in three others
    (``entries_site.py`` twice, ``entries_me.py`` once), so renaming it
    silently orphaned every public player page. Read the sources and assert
    the literal appears once."""
    import pathlib

    import entries.entries as entries_module

    src = pathlib.Path(entries_module.__file__).parent
    counts = {
        name: pathlib.Path(src, name).read_text(encoding="utf-8").count('f"entry-{')
        for name in ("entries.py", "entries_site.py", "entries_me.py")
    }

    assert counts == {"entries.py": 1, "entries_site.py": 0, "entries_me.py": 0}
