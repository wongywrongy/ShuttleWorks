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
