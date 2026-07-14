"""_hydrate_session must feed the shared engine-config fields into the
bracket's ScheduleConfig (Plan C wiring — before this, rest/freeze/
breaks/weights were silently ignored by the bracket path)."""
import uuid

import pytest

from _helpers import isolate_test_database


@pytest.fixture
def repo(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from database.session import SessionLocal
    from repositories.local import LocalRepository

    return LocalRepository(SessionLocal())


def test_hydrated_session_config_reads_shared_fields(repo):
    from api.brackets import _hydrate_session

    tid = uuid.uuid4()
    repo.tournaments.create(name="W")  # returns a row; use its id instead
    row = repo.tournaments.list_all()[0]
    tid = row.id
    repo.brackets.create_event(
        tid, "MS", discipline="MS", format="se", duration_slots=2
    )
    repo.tournaments.upsert_data(
        tid,
        {
            "config": {
                "intervalMinutes": 30,
                "dayStart": "09:00",
                "dayEnd": "18:00",
                "breaks": [{"start": "12:00", "end": "13:00"}],
                "courtCount": 3,
                "defaultRestMinutes": 60,
                "freezeHorizonSlots": 2,
                "enableCompactSchedule": True,
            },
            "bracket_session": {"total_slots": 128},
        },
    )

    session = _hydrate_session(repo, tid)
    assert session is not None
    sc = session.config
    assert sc.total_slots == 128            # session override intact
    assert sc.court_count == 3
    assert sc.default_rest_slots == 2       # NEW: was default 1 before wiring
    assert sc.freeze_horizon_slots == 2     # NEW: was 0
    assert (6, 8) in sc.break_slots         # NEW: was []
    assert sc.enable_compact_schedule is True  # NEW: weights flow through


def test_hydrated_session_config_preserves_rest_between_rounds_distinction(repo):
    """restBetweenRounds (round spacing, session-level) must remain
    distinct from defaultRestMinutes -> default_rest_slots (match rest)."""
    from api.brackets import _hydrate_session

    row = repo.tournaments.create(name="RestDistinct")
    tid = row.id
    repo.brackets.create_event(
        tid, "MS", discipline="MS", format="se", duration_slots=2
    )
    repo.tournaments.upsert_data(
        tid,
        {
            "config": {
                "intervalMinutes": 30,
                "dayStart": "09:00",
                "dayEnd": "18:00",
                "courtCount": 2,
                "defaultRestMinutes": 90,
                "restBetweenRounds": 4,
            },
            "bracket_session": {"total_slots": 64},
        },
    )

    session = _hydrate_session(repo, tid)
    assert session is not None
    # rest_between_rounds is a BracketSession-level field, not part of
    # ScheduleConfig — it must reflect the config-blob override, NOT the
    # default_rest_slots value derived from defaultRestMinutes.
    assert session.rest_between_rounds == 4
    assert session.config.default_rest_slots == 3  # 90 // 30


def test_hydrated_session_config_defaults_are_unchanged_when_unset(repo):
    """A bracket session with no engine-config overrides gets the same
    defaults as before the wiring (rest=0, freeze=0, no breaks)."""
    from api.brackets import _hydrate_session

    row = repo.tournaments.create(name="Defaults")
    tid = row.id
    repo.brackets.create_event(
        tid, "MS", discipline="MS", format="se", duration_slots=2
    )
    repo.tournaments.upsert_data(
        tid,
        {"bracket_session": {"total_slots": 32}},
    )

    session = _hydrate_session(repo, tid)
    assert session is not None
    sc = session.config
    assert sc.total_slots == 32
    assert sc.default_rest_slots == 0
    assert sc.freeze_horizon_slots == 0
    assert sc.break_slots == []


def test_hydrated_session_config_keeps_meet_occupied_windows_override(repo):
    """The bracket wrapper's closed_court_windows override (the
    meet-occupied courts, computed by _meet_occupied_windows) must win
    over whatever schedule_config_from_dto would compute on its own —
    breaking this would let meet and bracket double-book a court."""
    from api.brackets import _hydrate_session

    row = repo.tournaments.create(name="MeetCoexist")
    tid = row.id
    repo.brackets.create_event(
        tid, "MS", discipline="MS", format="se", duration_slots=2
    )
    repo.tournaments.upsert_data(
        tid,
        {
            "config": {
                "intervalMinutes": 30,
                "dayStart": "09:00",
                "dayEnd": "18:00",
                "courtCount": 3,
                "defaultRestMinutes": 0,
                "freezeHorizonSlots": 0,
            },
            "bracket_session": {"total_slots": 128},
            "schedule": {
                "assignments": [
                    {"courtId": 1, "slotId": 5, "durationSlots": 2}
                ]
            },
        },
    )

    session = _hydrate_session(repo, tid)
    assert session is not None
    assert (1, 5, 7) in session.config.closed_court_windows


def test_bracket_solver_options_deterministic_flows_through(repo):
    """config.deterministic + config.randomSeed must reach SolverOptions
    (single worker, seeded, deterministic=True) via the shared helper."""
    from api.brackets import _bracket_solver_options

    opts = _bracket_solver_options(
        5.0, {"deterministic": True, "randomSeed": 777}
    )
    assert opts.deterministic is True
    assert opts.num_workers == 1
    assert opts.random_seed == 777
    assert opts.time_limit_seconds == 5.0

    opts_default_seed = _bracket_solver_options(5.0, {"deterministic": True})
    assert opts_default_seed.random_seed == 42

    opts_non_deterministic = _bracket_solver_options(5.0, {})
    assert opts_non_deterministic.deterministic is False
