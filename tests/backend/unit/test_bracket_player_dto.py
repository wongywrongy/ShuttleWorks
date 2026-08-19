"""BracketPlayerDTO contract + camelCase hydration via _pick."""
from __future__ import annotations
import pytest

from app.schemas import BracketPlayerDTO, TournamentStateDTO, TournamentConfig


def test_bracket_player_dto_round_trip():
    p = BracketPlayerDTO(
        id="p-alex-tan",
        name="Alex Tan",
        notes="lefty",
        restSlots=1,
    )
    assert p.id == "p-alex-tan"
    assert p.restSlots == 1


def test_tournament_state_dto_carries_bracket_players():
    s = TournamentStateDTO(
        version=2,
        config=None,
        groups=[],
        players=[],
        matches=[],
        schedule=None,
        scheduleIsStale=False,
        bracketPlayers=[BracketPlayerDTO(id="p-ben", name="Ben")],
    )
    assert len(s.bracketPlayers) == 1
    assert s.bracketPlayers[0].name == "Ben"


def test_tournament_config_carries_rest_between_rounds():
    c = TournamentConfig(
        intervalMinutes=30, dayStart="09:00", dayEnd="18:00",
        breaks=[], courtCount=4, defaultRestMinutes=0,
        freezeHorizonSlots=0, restBetweenRounds=1,
    )
    assert c.restBetweenRounds == 1


# ---------------------------------------------------------------------------
# _pick — camelCase / legacy-snake_case hydration priority tests
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=False)
def pick():
    """Import _pick from the bracket API module."""
    from api.brackets import _pick
    return _pick


@pytest.mark.parametrize("camel_cfg,session_cfg,camel_key,legacy_key,default,expected", [
    # case 1: camelCase-only present → uses camelCase value
    ({"restBetweenRounds": 3}, {}, "restBetweenRounds", "rest_between_rounds", 1, 3),
    # case 2: legacy snake_case-only present → uses legacy value
    ({}, {"rest_between_rounds": 2}, "restBetweenRounds", "rest_between_rounds", 1, 2),
    # case 3: both present → camelCase wins
    ({"restBetweenRounds": 5}, {"rest_between_rounds": 2}, "restBetweenRounds", "rest_between_rounds", 1, 5),
    # case 4: neither present → uses default
    ({}, {}, "restBetweenRounds", "rest_between_rounds", 1, 1),
])
def test_pick_priority(pick, camel_cfg, session_cfg, camel_key, legacy_key, default, expected):
    assert pick(camel_cfg, session_cfg, camel_key, legacy_key, default) == expected
