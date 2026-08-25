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

import logging
from datetime import datetime, timedelta, timezone

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
from entries.entries import SkipReason, commit_entries, roster_id


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


def _entry_event(
    session,
    tournament_id,
    *,
    code="MS",
    bracket_event_id=None,
    entry_type="singles",
):
    row = EntryEvent(
        tournament_id=tournament_id,
        code=code,
        discipline=f"{code} discipline",
        entry_type=entry_type,
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
    partner_entry_id=None,
    partner_accepted_at=None,
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
        partner_entry_id=partner_entry_id,
        partner_accepted_at=partner_accepted_at,
    )
    session.add(row)
    session.commit()
    return row


def _pair(
    session,
    tournament_id,
    entry_event,
    *,
    names=("Ana Reyes", "Bo Lin"),
    states=("confirmed", "confirmed"),
):
    """Two confirmed entries mutually linked, as ``partners.accept()`` leaves them.

    ``accept()`` writes ``partner_entry_id`` on BOTH halves inside one
    transaction (``entries/partners.py:265,272``); this helper reproduces
    that end state directly rather than driving the HTTP invite flow,
    because what the seam reads is the two columns, not how they got set.
    Returns ``(nominator, partner)`` in submission order.

    ``submitted_at`` is set EXPLICITLY and one second apart. The seam
    orders pair members by ``(submitted_at, id)`` and ``id`` is a random
    UUID, so two rows written microseconds apart would tie on the
    timestamp and order randomly - which would make every assertion about
    member order or the minted team name flaky.

    ``states`` exists because the seam's first predicate leg is "both halves
    are candidates on THIS run", and the only way to fail that from a fixture
    is to leave one half out of the candidate set. Widened in Task 3 (SP-DM-3
    P5) for exactly that; the default is still the accepted pair.
    """
    now = datetime.now(timezone.utc)
    first = _entry(
        session, tournament_id, entry_event, player_name=names[0], state=states[0]
    )
    second = _entry(
        session, tournament_id, entry_event, player_name=names[1], state=states[1]
    )
    first.submitted_at = now
    second.submitted_at = now + timedelta(seconds=1)
    first.partner_entry_id = second.id
    second.partner_entry_id = first.id
    first.partner_accepted_at = now
    second.partner_accepted_at = now
    session.commit()
    return first, second


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


def test_a_committed_meet_entry_cannot_reach_a_generated_match(repo, session):
    """Recorded, not fixed — P7 owns it (see the P5 plan, "What the tree
    says that the card does not" §4).

    ``_plan_meet`` writes ``groupId = event.code`` and ``ranks =
    [event.code]`` (``entries/entries.py:418-419``), e.g. ``"XD"``. The
    only Meet match generator, ``RegenerateMenu.expandRanks``, expands
    ``config.rankCounts`` into NUMBERED ranks ``"XD1".."XDn"`` and filters
    players with ``(p.ranks ?? []).includes(rank)`` - and ``"XD" !=
    "XD1"``. It also pairs only ACROSS groups, while every committed
    entrant lands in the single group named for their event code. So a
    committed Meet entry is invisible to match generation whether or not
    it has a partner, which is why P5 does NOT put a pair field on the
    Meet roster: there is no reader for it until P7 gives Meet an Event.
    """
    tid = _meet_workspace(repo, ranks=("XD",))
    ev = _entry_event(session, tid, code="XD", entry_type="doubles")
    _entry(session, tid, ev, player_name="Ana Reyes")

    commit_entries(repo, tid)

    player = _players(repo, tid)[0]
    assert player["ranks"] == ["XD"]
    assert player["groupId"] == "XD"

    # Two-line mirror of ``RegenerateMenu.tsx:23-29`` (``expandRanks``):
    # every declared prefix, numbered 1..count.
    counts = repo.tournaments.get_by_id(tid).data["config"]["rankCounts"]
    expanded = [
        f"{prefix}{i}" for prefix, count in counts.items() for i in range(1, count + 1)
    ]
    assert expanded == ["XD1", "XD2"]
    assert not set(expanded) & set(player["ranks"]), (
        "a committed entry's rank is not one the match generator ever emits"
    )


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


def _doubles_draw(repo, session, tid, *, code="XD"):
    """A draft draw plus the doubles entry event mapped onto it."""
    _draft_event(repo, tid, code)
    return _entry_event(
        session, tid, code=code, bracket_event_id=code, entry_type="doubles"
    )


def test_a_confirmed_pair_commits_as_ONE_team_with_real_member_ids(repo, session):
    """NC 1 (P5 card) — the flip of ``test_a_confirmed_pair_TODAY_commits_
    as_two_unrelated_singletons`` (characterized at ``8ded73c5``).

    R-DM-4(a): the intake chain already holds a real mutual key
    (``entries.partner_entry_id``, written on BOTH halves at acceptance),
    so the seam does not have to match names the way the incumbent
    products do — it can build the team from the key it was given. One
    ``TEAM`` participant, two ``member_ids``, and the two humans still get
    one roster row each because that is where remarks and availability
    live.

    So ``participant_id == roster_id`` stops being universally true: it
    holds for singles (``test_a_bracket_entry_becomes_a_participant_and_a_
    roster_player``, untouched) and not for a pair, whose participant is
    neither of its two roster rows.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev)

    result = commit_entries(repo, tid)

    assert {c.entry_id for c in result.committed} == {
        str(nominator.id),
        str(partner.id),
    }
    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 1, "a confirmed pair is ONE team"
    team = participants[0]
    assert team.type == "TEAM"
    assert team.name == "Ana Reyes / Bo Lin"
    session.expire_all()
    assert team.member_ids == [
        roster_id(nominator.entry_player_id),
        roster_id(partner.entry_player_id),
    ], "nominator first — ``_pair`` spaces submitted_at by a second"

    # The roster blob half: two PEOPLE are two rows whether or not they are
    # a pair, because remarks and availability are per-person.
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert [p["name"] for p in roster] == ["Ana Reyes", "Bo Lin"]

    # Each half keeps its OWN back-reference, to its own roster row — never
    # to the team.
    session.expire_all()
    assert nominator.committed_player_id == roster_id(nominator.entry_player_id)
    assert partner.committed_player_id == roster_id(partner.entry_player_id)
    assert team.id not in (
        nominator.committed_player_id,
        partner.committed_player_id,
    )


def test_a_half_accepted_pair_commits_as_a_singleton_and_nothing_dangles(
    repo, session
):
    """NC 2 (P5 card). Only one half is confirmed-and-uncommitted, so
    there is no pair to build. It commits exactly as it does today — one
    ``PLAYER``, one roster row, one back-reference — and NOTHING points at
    a partner that is not there: no TEAM with one member, no member id
    naming a roster row that does not exist. The designed state
    (``entries/partners.py:28-34`` — unpartnered is ``pending`` with
    ``awaiting_partner``, not over-cap and not refused) survives untouched.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev, states=("confirmed", "pending"))

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(nominator.id)]
    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 1
    assert participants[0].type == "PLAYER"
    assert participants[0].member_ids == []
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert [p["name"] for p in roster] == ["Ana Reyes"]
    session.expire_all()
    assert partner.committed_player_id is None


def test_a_partner_already_committed_alone_leaves_the_second_half_a_singleton(
    repo, session
):
    """The common upgrade path, and the reason director manual pairing
    STAYS (R-DM-4's ruling note). A pair whose halves were confirmed on
    different days: the first ran through the seam as a PLAYER before its
    partner confirmed, so on the second run there is no candidate to pair
    with and the seam declines rather than rewriting a participant row
    that a draw may already reference. Two PLAYERs, and the director pairs
    them in the picker.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev, states=("confirmed", "pending"))
    assert [c.entry_id for c in commit_entries(repo, tid).committed] == [
        str(nominator.id)
    ]

    partner.state = "confirmed"
    session.commit()
    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(partner.id)]
    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 2
    assert {p.type for p in participants} == {"PLAYER"}
    assert all(p.member_ids == [] for p in participants)


def test_a_one_directional_partner_link_is_detected_and_no_team_is_built(
    repo, session, caplog
):
    """NC 4 (P5 card). ``partner_entry_id`` is mutual by WRITE CONVENTION
    only (F-DM-12): no FK, no constraint, nothing that detects a
    half-written link. ``partners.accept()`` writes both halves in one
    transaction and withdrawal touches neither, so this state is not
    reachable from live code — it is constructed here by hand, which is
    the only way to assert that the seam notices.

    Detection is the seam refusing to build the team and saying so in the
    log, NOT a new operator reason code: ``pair_conflict`` means "the
    named partner is already spoken for" (``entries/partners.py:36-40``)
    and would be a lie here. See the plan's judgment call 3.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev)
    nominator_id, partner_id = str(nominator.id), str(partner.id)
    partner.partner_entry_id = None
    session.commit()

    with caplog.at_level(logging.WARNING, logger="scheduler.entries"):
        result = commit_entries(repo, tid)

    assert {c.entry_id for c in result.committed} == {nominator_id, partner_id}
    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 2
    assert {p.type for p in participants} == {"PLAYER"}
    assert nominator_id in caplog.text and partner_id in caplog.text, (
        "the half-written link must be reported, not silently tolerated"
    )


def test_a_pair_conflict_flag_does_not_stop_the_seam_building_the_team(repo, session):
    """RULED (SP-DM-3 P5): ``pair_conflict`` does not keep an agreed pair out
    of the draw — the team is built and the flag rides along.

    The predicate requires a MUTUAL, both-accepted link: two people who
    actually agreed. ``pair_conflict`` says a THIRD person unilaterally
    nominated one of them, and letting that veto the agreed pair would hand
    any stranger a way to keep two entrants out of a draw. The flagged half
    still commits carrying its reason, so the operator still adjudicates —
    the flag stays a question, never a refusal (invariant I4).

    ``pending_reasons`` appears NOWHERE in ``entries/entries.py`` and no
    predicate leg reads it. That is decided, not accidental, and this is
    where a later change teaching the seam to consult it — to skip the pair
    or to refuse the entry — goes red.

    Bracket, not meet, on purpose: ``_candidates`` is kind-agnostic and
    ``test_partner_invites.py`` covers that chokepoint. The surface only a
    bracket workspace reaches is ``_plan_bracket``'s plan-local legs, and
    ``TEAM`` exists nowhere else.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev)
    nominator.pending_reasons = ["pair_conflict"]
    session.commit()

    result = commit_entries(repo, tid)

    assert {c.entry_id for c in result.committed} == {
        str(nominator.id),
        str(partner.id),
    }
    participants = repo.brackets.list_participants(tid, "XD")
    assert [p.type for p in participants] == ["TEAM"]
    assert participants[0].name == "Ana Reyes / Bo Lin"

    # …and the flag is still there afterwards, which is the half of the
    # ruling that keeps this from being "the seam ignores conflicts".
    session.expire_all()
    assert "pair_conflict" in nominator.pending_reasons


def test_a_teams_member_ids_name_the_roster_rows_its_members_actually_occupy(
    repo, session
):
    """NC 2's "no member id naming a roster row that does not exist", for
    the case where a half ADOPTS its roster row instead of minting one.

    ``_adoptable``'s ``sourceEntryId`` branch returns a legacy entry-keyed
    row (``entry-{entry.id}``, left by a build that keyed the roster on the
    entry) where ``_player_id`` mints ``entry-{entry_player_id}``. The two
    are different strings, so a team whose ``member_ids`` carried the
    person ids would point at nothing for that half, while the half's own
    ``committed_player_id`` pointed at the adopted row - the roster editor
    and the draw disagreeing about the same human.

    ``member_ids`` therefore carries the SEAT ids, the same two the
    predicate's legs 6 and 7 are checked against. ``team_id`` stays on the
    PERSON ids: it must be the same string whether or not this particular
    run adopted a legacy row, which is the whole of its re-run promise.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev)

    # The legacy row: entry-keyed, and reachable only through
    # ``sourceEntryId`` because its id is not the one the seam would mint.
    legacy_id = roster_id(nominator.id)
    assert legacy_id != roster_id(nominator.entry_player_id)
    row = repo.tournaments.get_by_id(tid)
    document = dict(row.data)
    document["bracketPlayers"] = [
        {
            "id": legacy_id,
            "name": "Ana Reyes",
            "availability": [],
            "sourceEntryId": str(nominator.id),
        }
    ]
    repo.tournaments.upsert_data(tid, document)

    commit_entries(repo, tid)

    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 1
    team = participants[0]
    assert team.type == "TEAM"
    assert team.member_ids == [legacy_id, roster_id(partner.entry_player_id)]

    # The point of the assertion above, stated as the invariant it defends.
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert set(team.member_ids) <= {p["id"] for p in roster}
    session.expire_all()
    assert nominator.committed_player_id == legacy_id
    assert nominator.committed_player_id in team.member_ids
    # And the id itself did NOT move onto the adopted seat.
    assert team.id.endswith(str(partner.entry_player_id))


def test_two_halves_in_different_events_never_put_one_team_in_two_draws(
    repo, session
):
    """The predicate's fifth leg. Both halves carry the same
    ``entry_event_id`` by construction — ``partners.accept()`` copies it
    onto the half it builds — so this, like the one-directional link and
    the self-reference, is hand-built corruption.

    It is checked rather than trusted because ``existing_ids`` is keyed per
    BRACKET event: the team id that de-duplicates the pair's second half
    against the first would be looked up in a different draw's set, and the
    same team would be inserted twice, once into each draw.
    """
    tid = _bracket_workspace(repo)
    xd = _doubles_draw(repo, session, tid, code="XD")
    md = _doubles_draw(repo, session, tid, code="MD")
    now = datetime.now(timezone.utc)
    first = _entry(
        session, tid, xd, player_name="Ana Reyes", partner_accepted_at=now
    )
    second = _entry(session, tid, md, player_name="Bo Lin", partner_accepted_at=now)
    first.partner_entry_id = second.id
    second.partner_entry_id = first.id
    session.commit()

    commit_entries(repo, tid)

    for code, name in (("XD", "Ana Reyes"), ("MD", "Bo Lin")):
        assert [
            (p.type, p.name) for p in repo.brackets.list_participants(tid, code)
        ] == [("PLAYER", name)]


def test_an_entry_partnered_with_ITSELF_does_not_become_a_one_person_team(
    repo, session
):
    """The predicate's premise is TWO entries, and a self-link satisfies
    the mutual check trivially — ``entry.partner_entry_id == entry.id``
    means ``partner.partner_entry_id == entry.id`` by construction. Left
    unrefused it would emit a TEAM carrying one human's roster id twice and
    named after them twice.

    Same threat model as the one-directional link: unreachable from
    ``partners.accept()``, hand-built here, and refused rather than
    reasoned about.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    # ``partner_accepted_at`` is stamped so the self-reference is the ONLY
    # leg that fails — otherwise leg 3 would refuse first and the test
    # would pass without exercising anything.
    entry = _entry(
        session,
        tid,
        ev,
        player_name="Ana Reyes",
        partner_accepted_at=datetime.now(timezone.utc),
    )
    entry.partner_entry_id = entry.id
    session.commit()

    commit_entries(repo, tid)

    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 1
    assert participants[0].type == "PLAYER"
    assert participants[0].member_ids == []
    assert participants[0].name == "Ana Reyes"


def test_one_human_holding_BOTH_halves_does_not_become_a_one_person_team(
    repo, session
):
    """The predicate's eighth leg — two entries must be two PEOPLE.

    Unlike the one-directional link and the self-reference, this state is
    REACHABLE from live code. ``partner_routes.py:243`` says in so many
    words that the accept route checks neither the accepting address nor
    the accepting account against the inviter, so a nominator who typed
    their own address can accept their own invite; ``adopt_or_mint`` then
    matches on account + name + birth year and hands back the nominator's
    OWN ``EntryPlayer``. Two mutually-linked, both-accepted entries, one
    ``entry_player_id``, one roster seat.

    Before P5 that corruption degraded gracefully — the seam's id dedupe
    collapsed it to a single PLAYER row. Without this leg P5 upgrades it to
    exactly the artifact the self-reference guard exists to refuse: a TEAM
    named "Alex Kim / Alex Kim" whose ``member_ids`` names one seat twice.
    Refusing restores the pre-P5 behaviour, which is the honest one: one
    human in the draw once, and an operator to notice.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    now = datetime.now(timezone.utc)
    first = _entry(
        session, tid, ev, player_name="Alex Kim", partner_accepted_at=now
    )
    # ``player=`` is the same human, which is precisely what ``adopt_or_mint``
    # produces when the nominator accepts their own invite.
    second = _entry(session, tid, ev, player=first.player, partner_accepted_at=now)
    first.submitted_at = now
    second.submitted_at = now + timedelta(seconds=1)
    first.partner_entry_id = second.id
    second.partner_entry_id = first.id
    session.commit()

    commit_entries(repo, tid)

    participants = repo.brackets.list_participants(tid, "XD")
    assert [(p.type, p.name) for p in participants] == [("PLAYER", "Alex Kim")]
    assert participants[0].member_ids == []
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert [p["name"] for p in roster] == ["Alex Kim"]
    session.expire_all()
    seat = roster_id(first.entry_player_id)
    assert first.committed_player_id == second.committed_player_id == seat


def test_a_singles_event_never_builds_a_team_even_with_a_partner_link(repo, session):
    """The predicate's fourth leg. ``entry_events.entry_type`` is the
    backend's one answer to "is this doubles" (``partners.is_doubles``,
    F-DM-13), and a stray ``partner_entry_id`` on a singles event is data
    the seam must not act on."""
    tid = _bracket_workspace(repo)
    _draft_event(repo, tid, "MS")
    ev = _entry_event(
        session, tid, code="MS", bracket_event_id="MS", entry_type="singles"
    )
    _pair(session, tid, ev)

    commit_entries(repo, tid)

    participants = repo.brackets.list_participants(tid, "MS")
    assert len(participants) == 2
    assert {p.type for p in participants} == {"PLAYER"}
    assert sorted(p.name for p in participants) == ["Ana Reyes", "Bo Lin"]


def test_a_half_that_fails_validation_leaves_a_singleton_and_no_dangling_team(
    repo, session
):
    """NC 2's sharp edge, and the reason leg 6 checks BOTH halves.

    ``_valid(BracketPlayerDTO, ...)`` runs per entry inside the loop, and
    the nominator is processed FIRST. Without a both-halves check the
    nominator would emit a TEAM naming a member whose own iteration then
    fails validation and writes no ``bracketPlayers`` row - a team
    pointing at a roster row that does not exist, an entry that never
    commits, and a re-run that cannot repair it because the team id is
    already in ``existing_ids``. The valid half must commit as a
    singleton instead.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    # 300 characters: ``BracketPlayerDTO.name`` caps at 200, and SQLite does
    # not enforce the column width, so the DTO is the only thing that
    # refuses it — which is exactly the seam under test.
    nominator, partner = _pair(session, tid, ev, names=("Ana Reyes", "B" * 300))

    result = commit_entries(repo, tid)

    assert [c.entry_id for c in result.committed] == [str(nominator.id)]
    assert [(s.entry_id, s.reason) for s in result.skipped] == [
        (str(partner.id), SkipReason.INVALID_PLAYER)
    ]
    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 1
    assert participants[0].type == "PLAYER"
    assert participants[0].member_ids == []
    roster = repo.tournaments.get_by_id(tid).data["bracketPlayers"]
    assert [p["name"] for p in roster] == ["Ana Reyes"]


def test_a_member_already_entered_by_hand_is_not_double_entered_as_a_team(
    repo, session
):
    """The predicate's seventh leg. The director may hand-add one half
    through the participant picker before the other half's entry is
    confirmed. Emitting a TEAM then would put one human in the draw
    TWICE - once inside the team, once as their surviving PLAYER row -
    and un-adding the PLAYER row is a decision the seam does not get to
    make (I4). Both halves commit as singletons; the director pairs them.
    """
    tid = _bracket_workspace(repo)
    ev = _doubles_draw(repo, session, tid)
    nominator, partner = _pair(session, tid, ev)
    # Hand-added under the id the seam would itself mint for that person —
    # the only id "already in this draw" can be recognized by, since a
    # picker row carries no ``entry_player_id``.
    repo.brackets.bulk_create_participants(
        tid,
        "XD",
        [
            {
                "id": roster_id(nominator.entry_player_id),
                "name": "Ana Reyes",
                "type": "PLAYER",
            }
        ],
    )

    commit_entries(repo, tid)

    participants = repo.brackets.list_participants(tid, "XD")
    assert len(participants) == 2
    assert {p.type for p in participants} == {"PLAYER"}
    assert sorted(p.name for p in participants) == ["Ana Reyes", "Bo Lin"]


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
        # ``"entry-`` rather than ``f"entry-{``: it catches the f-string AND
        # a plain concatenation, which is the same drift wearing a different
        # syntax. The prose mention in ``entries_site``'s docstring uses
        # backticks, so it is not a match.
        name: pathlib.Path(src, name).read_text(encoding="utf-8").count('"entry-')
        for name in ("entries.py", "entries_site.py", "entries_me.py")
    }

    assert counts == {"entries.py": 1, "entries_site.py": 0, "entries_me.py": 0}


def test_the_backend_asks_entry_type_in_exactly_one_place():
    """F-DM-13's backend half. ``entries/partners.py::is_doubles`` is the
    one place ``entry_events.entry_type`` is compared to ``"doubles"``
    (audit B1). P5 adds a second CALLER (the commit seam) and no second
    RULE — read the sources and assert the comparison appears once."""
    import pathlib
    import re

    import entries.entries as entries_module

    src = pathlib.Path(entries_module.__file__).parent
    # Match the COMPARISON (``== "doubles"``), not the bare word: a docstring
    # that says "doubles" is prose, and ``entries_json``'s ``or "singles"``
    # default is a fallback, not a rule. Globbed rather than named so a
    # FUTURE file growing its own copy of the rule trips this too — which is
    # the whole point of the gate.
    comparison = re.compile(r'==\s*"doubles"')
    counts = {
        path.name: len(comparison.findall(path.read_text(encoding="utf-8")))
        for path in sorted(src.glob("*.py"))
    }

    assert counts.pop("partners.py") == 1
    assert {name: n for name, n in counts.items() if n} == {}
