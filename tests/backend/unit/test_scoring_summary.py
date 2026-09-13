"""The published scoring sentence is DERIVED, never re-typed prose (D3).

The reviewed demo fixture said "a cap at 30" in its regulations while its
configuration carried no cap; this function is what makes the two the same
statement.
"""
from shared.scoring_rules import scoring_summary


def test_standard_badminton_rules_read_as_the_regulations_prose():
    assert scoring_summary(
        {
            "scoring": "badminton",
            "pointsPerSet": 21,
            "setsToWin": 2,
            "deuceEnabled": True,
            "pointCap": 30,
        }
    ) == "Best of 3 games to 21, win by 2, capped at 30."


def test_no_cap_says_no_maximum_rather_than_inventing_one():
    assert scoring_summary(
        {"scoring": "badminton", "pointsPerSet": 21, "setsToWin": 2}
    ) == "Best of 3 games to 21, win by 2, no maximum."


def test_config_spelling_and_simple_scoring_are_both_understood():
    assert scoring_summary({"scoringFormat": "simple"}) == (
        "Match result only. Game scores are not recorded."
    )
    assert scoring_summary(
        {"scoringFormat": "badminton", "pointsPerSet": 15, "setsToWin": 1, "deuceEnabled": False}
    ) == "Single game to 15, no advantage required."


def test_unconfigured_rules_publish_nothing():
    assert scoring_summary({}) is None
    assert scoring_summary({"scoring": "badminton"}) is None
