from __future__ import annotations

from types import SimpleNamespace

from api.workspace_signals import RowCounts, build_signals
from app.schemas import WorkspaceModuleDTO


def _mod(module_id: str, status: str) -> WorkspaceModuleDTO:
    return WorkspaceModuleDTO(moduleId=module_id, status=status, config=None)


def _row(kind="meet", status="active", data=None):
    return SimpleNamespace(kind=kind, status=status, data=data or {})


def test_module_counts():
    mods = [_mod("meet", "enabled"), _mod("bracket", "available"), _mod("display", "coming_soon")]
    sig = build_signals(_row(), mods, RowCounts())
    assert sig.modules.enabled == 1
    assert sig.modules.available == 1
    assert sig.modules.comingSoon == 1
    assert sig.modules.disabled == 0


def test_health_archived_and_draft_take_precedence():
    mods = [_mod("meet", "enabled")]
    assert build_signals(_row(status="archived"), mods, RowCounts()).health == "archived"
    assert build_signals(_row(status="draft"), mods, RowCounts()).health == "draft"


def test_health_attention_when_reasons_present():
    # active meet, no enabled modules → NO_MODULES_ENABLED → attention.
    mods = [_mod("meet", "available"), _mod("bracket", "available"), _mod("display", "available")]
    sig = build_signals(_row(status="active"), mods, RowCounts())
    assert sig.health == "attention"
    assert any(a.code == "NO_MODULES_ENABLED" for a in sig.attention)


def test_health_good_when_clean():
    # meet enabled, roster + schedule present, match_states present → no reasons.
    mods = [_mod("meet", "enabled"), _mod("bracket", "coming_soon"), _mod("display", "available")]
    data = {"config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "17:00"},
            "players": [{"id": "p1"}], "schedule": {"assignments": [1]}}
    sig = build_signals(_row(status="active", data=data), mods, RowCounts(match_states=1))
    assert sig.attention == []
    assert sig.health == "good"
    assert sig.setup["roster"] is True
    assert sig.setup["scheduled"] is True
    assert sig.setup["results"] is True
    assert sig.setup["configured"] is True


def test_meet_attention_no_roster_and_not_scheduled():
    mods = [_mod("meet", "enabled"), _mod("bracket", "coming_soon"), _mod("display", "available")]
    sig = build_signals(_row(status="active", data={"config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "17:00"}}), mods, RowCounts())
    codes = {a.code for a in sig.attention}
    assert "NO_ROSTER" in codes
    assert "NOT_SCHEDULED" in codes
    assert sig.setup["roster"] is False


def test_display_no_source_attention():
    mods = [_mod("meet", "available"), _mod("bracket", "available"), _mod("display", "enabled")]
    sig = build_signals(_row(status="active"), mods, RowCounts())
    assert any(a.code == "DISPLAY_NO_SOURCE" for a in sig.attention)


def test_bracket_readiness_from_counts():
    mods = [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]
    counts = RowCounts(bracket_events=2, bracket_matches=7, bracket_results=1)
    sig = build_signals(_row(kind="bracket", status="active"), mods, counts)
    assert sig.setup == {"events": True, "bracketBuilt": True, "results": True}
    assert sig.attention == []


def test_bracket_not_built_attention():
    mods = [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]
    sig = build_signals(_row(kind="bracket", status="active"), mods, RowCounts())
    assert any(a.code == "NO_BRACKET" for a in sig.attention)
    assert sig.setup["events"] is False


def test_bracket_events_without_matches_fires_no_bracket():
    # events configured (bracket_events=2) but draw not generated (bracket_matches=0)
    # → bracketBuilt is False → NO_BRACKET must fire (old guard on "events" would miss this)
    mods = [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]
    counts = RowCounts(bracket_events=2, bracket_matches=0)
    sig = build_signals(_row(kind="bracket", status="active"), mods, counts)
    assert sig.setup["events"] is True
    assert sig.setup["bracketBuilt"] is False
    assert any(a.code == "NO_BRACKET" for a in sig.attention)


def test_collaboration_counts():
    mods = [_mod("meet", "enabled")]
    sig = build_signals(_row(status="active"), mods, RowCounts(members=3, active_invites=2))
    assert sig.collaboration.memberCount == 3
    assert sig.collaboration.activeInviteCount == 2


# ---- match metrics + next-up (redesign) -----------------------------------


def _meet_mods():
    return [_mod("meet", "enabled"), _mod("display", "enabled"), _mod("bracket", "available")]


def test_meet_match_metrics_and_next_up_from_data_blob():
    # The persisted meet data blob is camelCase (ScheduleAssignment: matchId/
    # slotId/courtId; MatchDTO: id/eventCode/matchNumber; config: dayStart/
    # intervalMinutes). Everything computes from row.data — no new query.
    data = {
        "config": {"courtCount": 4, "dayStart": "09:00", "dayEnd": "18:00",
                   "intervalMinutes": 30},
        "players": [{"id": "p1"}],
        "matches": [
            {"id": "m1", "eventCode": "MS1", "matchNumber": 1},
            {"id": "m2", "eventCode": "WD2", "matchNumber": 2},
            {"id": "m3", "eventCode": "XD1", "matchNumber": 3},
        ],
        "schedule": {"assignments": [
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1},
            {"matchId": "m2", "slotId": 0, "courtId": 2, "durationSlots": 1},
            {"matchId": "m3", "slotId": 2, "courtId": 3, "durationSlots": 1},
        ]},
    }
    sig = build_signals(_row(data=data), _meet_mods(), RowCounts())
    assert sig.matches.total == 3
    assert sig.matches.scheduled == 3
    assert sig.matches.toDo == len(sig.attention)
    assert [n.code for n in sig.nextUp] == ["MS1", "WD2", "XD1"]  # slot asc, cap 3
    first = sig.nextUp[0]
    assert first.timeLabel == "09:00"          # dayStart + slot0*30m
    assert first.courtLabel == "Court 1"
    assert sig.nextUp[2].timeLabel == "10:00"  # slot2 → +60m
    assert all(n.status == "scheduled" for n in sig.nextUp)


def test_meet_next_up_falls_back_to_match_number_when_no_event_code():
    data = {
        "config": {"dayStart": "08:00", "intervalMinutes": 20},
        "matches": [{"id": "m1", "matchNumber": 7}],
        "schedule": {"assignments": [{"matchId": "m1", "slotId": 3, "courtId": 2}]},
    }
    sig = build_signals(_row(data=data), _meet_mods(), RowCounts())
    assert sig.matches.scheduled == 1
    assert sig.nextUp[0].code == "M7"
    assert sig.nextUp[0].timeLabel == "09:00"   # 08:00 + 3*20m
    assert sig.nextUp[0].courtLabel == "Court 2"


def _bracket_mods():
    return [_mod("bracket", "enabled"), _mod("meet", "coming_soon"), _mod("display", "coming_soon")]


def test_bracket_match_metrics_and_next_up_from_session_blob():
    # Bracket assignments live in data["bracket_session"]["assignments"]
    # (snake_case: play_unit_id/slot_id/court_id) with start_time (ISO) +
    # interval_minutes. Total is the already-grouped bracket_matches count.
    data = {"bracket_session": {
        "start_time": "2026-07-12T09:00:00", "interval_minutes": 30,
        "assignments": [
            {"play_unit_id": "MS-R1-2", "slot_id": 1, "court_id": 1},
            {"play_unit_id": "MS-R1-1", "slot_id": 0, "court_id": 1},
        ],
    }}
    counts = RowCounts(bracket_matches=8)
    sig = build_signals(_row(kind="bracket", data=data), _bracket_mods(), counts)
    assert sig.matches.total == 8               # from RowCounts, not the blob
    assert sig.matches.scheduled == 2           # from session assignments
    assert [n.code for n in sig.nextUp] == ["MS-R1-1", "MS-R1-2"]  # slot asc
    assert sig.nextUp[0].courtLabel == "Court 1"
    assert sig.nextUp[0].timeLabel == "09:00"   # start_time time-of-day + slot0
    assert sig.nextUp[1].timeLabel == "09:30"   # slot1 → +30m


def test_bracket_next_up_none_time_when_no_start_time():
    data = {"bracket_session": {
        "interval_minutes": 30,
        "assignments": [{"play_unit_id": "WS-R1-1", "slot_id": 0, "court_id": 2}],
    }}
    sig = build_signals(_row(kind="bracket", data=data), _bracket_mods(),
                        RowCounts(bracket_matches=4))
    assert sig.matches.scheduled == 1
    assert sig.nextUp[0].timeLabel is None      # unanchored session → no time
    assert sig.nextUp[0].courtLabel == "Court 2"


def test_undated_workspace_has_empty_next_up():
    sig = build_signals(_row(kind="meet", status="draft", data={"matches": []}),
                        [_mod("meet", "enabled")], RowCounts())
    assert sig.matches.total == 0
    assert sig.nextUp == []
