from app.schemas import TournamentConfig


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
