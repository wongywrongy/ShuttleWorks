from core.schemas import TournamentConfig


def test_display_layout_fields_roundtrip():
    c = TournamentConfig(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="17:00",
        courtCount=4,
        defaultRestMinutes=5,
        freezeHorizonSlots=2,
        courtOrder=[3, 1, 2],
        hiddenCourts=[4],
        standingsMode="side",
    )
    assert c.courtOrder == [3, 1, 2]
    assert c.hiddenCourts == [4]
    assert c.standingsMode == "side"


def test_display_layout_fields_default_none():
    c = TournamentConfig(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="17:00",
        courtCount=4,
        defaultRestMinutes=5,
        freezeHorizonSlots=2,
    )
    assert c.courtOrder is None and c.hiddenCourts is None and c.standingsMode is None


def test_tv_display_mode_accepts_auto_and_the_retired_strip():
    """`strip` was the DEFAULT before SP-CONSOLE-2 DC-1 retired it as a
    choice, so every workspace that never touched the setting has it stored.
    The schema keeps accepting it — the board maps it to `auto` on read — and
    rejecting it here would break exactly those workspaces on their next
    state write, which is every write."""
    base = dict(
        intervalMinutes=30,
        dayStart="09:00",
        dayEnd="17:00",
        courtCount=4,
        defaultRestMinutes=5,
        freezeHorizonSlots=2,
    )
    for mode in ("auto", "strip", "grid", "list"):
        assert TournamentConfig(**base, tvDisplayMode=mode).tvDisplayMode == mode


def test_tv_display_mode_rejects_an_unknown_mode():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TournamentConfig(
            intervalMinutes=30,
            dayStart="09:00",
            dayEnd="17:00",
            courtCount=4,
            defaultRestMinutes=5,
            freezeHorizonSlots=2,
            tvDisplayMode="carousel",
        )
