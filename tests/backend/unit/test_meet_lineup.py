"""Contract tests for the pure Meet lineup builder and HTTP seam."""
from __future__ import annotations

import pytest

from core.schemas import TournamentStateDTO, state_dto_from_document
from meet.lineup import build_lineup, is_doubles_rank


def _state(**overrides) -> TournamentStateDTO:
    document: dict = {
        "config": {
            "tournamentName": "Spring Invitational",
            "intervalMinutes": 15,
            "dayStart": "08:00",
            "dayEnd": "18:00",
            "courtCount": 4,
            "defaultRestMinutes": 20,
            "freezeHorizonSlots": 0,
            "rankCounts": {},
        },
        "groups": [],
        "players": [],
        "matches": [],
    }
    config_over = overrides.pop("config", None)
    if config_over:
        document["config"] = {**document["config"], **config_over}
    document.update(overrides)
    return state_dto_from_document(document)


def _player(player_id: str, group_id: str, ranks: list[str]) -> dict:
    return {
        "id": player_id,
        "name": player_id,
        "groupId": group_id,
        "ranks": ranks,
    }


def test_is_doubles_rank_matches_console_suffix_convention():
    assert is_doubles_rank("XD2") is True
    assert is_doubles_rank("XD") is True
    assert is_doubles_rank("MS1") is False
    assert is_doubles_rank("BD") is True


def test_one_singles_slot_pairs_two_schools():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS1"]), _player("p2", "g2", ["MS1"])],
    )
    out = build_lineup(state)
    assert len(out.matches) == 1
    match = out.matches[0]
    assert match.sideA == ["p1"] and match.sideB == ["p2"]
    assert match.eventRank == "MS1"
    assert match.matchType == "dual"
    assert match.durationSlots == 1


def test_duplicate_rank_values_do_not_duplicate_a_player_on_a_side():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS1", "MS1"]), _player("p2", "g2", ["MS1"])],
    )
    assert build_lineup(state).matches[0].sideA == ["p1"]


def test_bare_division_code_and_unconfigured_number_generate_nothing():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS"]), _player("p2", "g2", ["MS999999999"])],
    )
    assert build_lineup(state).matches == []


def test_only_occupied_valid_ranks_are_considered_without_huge_expansion():
    state = _state(
        config={"rankCounts": {"MS": 2_000_000_000, "WS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS2"]), _player("p2", "g2", ["MS2"])],
    )
    out = build_lineup(state)
    assert [(m.eventRank, m.sideA, m.sideB) for m in out.matches] == [("MS2", ["p1"], ["p2"])]


def test_doubles_requires_two_per_side_and_reports_incomplete_pair():
    state = _state(
        config={"rankCounts": {"XD": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[
            _player("p1", "g1", ["XD1"]),
            _player("p2", "g1", ["XD1"]),
            _player("p3", "g2", ["XD1"]),
        ],
    )
    out = build_lineup(state)
    assert out.matches == []
    assert out.incompletePairs == ["Riverside XD1"]


def test_pairs_are_strictly_across_groups_and_follow_rank_then_group_order():
    state = _state(
        config={"rankCounts": {"WS": 1, "MS": 2}},
        groups=[
            {"id": "g1", "name": "Kingsway"},
            {"id": "g2", "name": "Riverside"},
            {"id": "g3", "name": "Westfield"},
        ],
        players=[
            _player("a1", "g1", ["MS1", "MS2"]),
            _player("a2", "g1", ["MS1"]),
            _player("b1", "g2", ["MS1", "MS2"]),
            _player("c1", "g3", ["MS1", "MS2"]),
        ],
    )
    out = build_lineup(state)
    assert [(m.eventRank, m.sideA, m.sideB) for m in out.matches] == [
        ("MS1", ["a1"], ["b1"]),
        ("MS1", ["a1"], ["c1"]),
        ("MS1", ["b1"], ["c1"]),
        ("MS2", ["a1"], ["b1"]),
        ("MS2", ["a1"], ["c1"]),
        ("MS2", ["b1"], ["c1"]),
    ]


def test_builder_rejects_more_than_maximum_generated_matches_before_dto_validation():
    groups = [
        {"id": f"g{index}", "name": f"School {index}"}
        for index in range(101)
    ]
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=groups,
        players=[_player(f"p{index}", f"g{index}", ["MS1"]) for index in range(101)],
    )

    with pytest.raises(ValueError, match="Lineup exceeds the 5000-match limit"):
        build_lineup(state)


def test_builder_rejects_generated_and_custom_match_total_over_the_limit():
    groups = [{"id": f"g{index}", "name": f"School {index}"} for index in range(100)]
    state = _state(
        config={"rankCounts": {"MS": 7}},
        groups=groups,
        players=[
            _player(
                f"p{index}",
                f"g{index}",
                [
                    "MS1",
                    *(["MS2"] if index < 10 else []),
                    *(["MS3", "MS4", "MS5", "MS6", "MS7"] if index < 2 else []),
                ],
            )
            for index in range(100)
        ],
        matches=[
            {"id": "custom", "sideA": [], "sideB": [], "eventRank": None}
        ],
    )

    with pytest.raises(ValueError, match="Lineup exceeds the 5000-match limit"):
        build_lineup(state)


def test_builder_rejects_more_than_maximum_incomplete_pair_descriptions():
    groups = [
        {"id": f"g{index}", "name": f"School {index}"}
        for index in range(101)
    ]
    state = _state(
        config={"rankCounts": {"XD": 50}},
        groups=groups,
        players=[
            _player(
                f"p{index}",
                f"g{index}",
                [f"XD{rank}" for rank in range(1, 51)],
            )
            for index in range(101)
        ],
    )

    with pytest.raises(
        ValueError, match="Lineup exceeds the 5000-incomplete-pair limit"
    ):
        build_lineup(state)


def test_custom_matches_survive_including_empty_sides_and_lineup_slot_is_replaced():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS1"]), _player("p2", "g2", ["MS1"])],
        matches=[
            {"id": "old", "sideA": ["p1"], "sideB": ["p2"], "eventRank": "MS1"},
            {"id": "custom", "sideA": ["p1"], "sideB": ["p2"], "eventRank": None},
            {"id": "empty", "sideA": [], "sideB": [], "eventRank": "MS1"},
        ],
    )
    out = build_lineup(state)
    assert [match.id for match in out.matches[1:]] == ["custom", "empty"]
    assert out.matches[0].id not in {"old", "custom", "empty"}


def test_none_config_returns_empty_document():
    state = _state(config=None)
    assert build_lineup(state).matches == []


def test_endpoint_rejects_unknown_state_fields_before_builder():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from meet.lineup import router

    app = FastAPI()
    app.include_router(router)
    route = router.routes[0]
    access_dependency = route.dependant.dependencies[0].call
    app.dependency_overrides[access_dependency] = lambda: None
    client = TestClient(app)
    response = client.post(
        "/tournaments/00000000-0000-0000-0000-000000000001/meet/lineup",
        json={"bogus": True},
    )
    assert response.status_code == 422


def test_endpoint_maps_lineup_capacity_to_a_bounded_422():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from meet.lineup import router

    app = FastAPI()
    app.include_router(router)
    route = router.routes[0]
    access_dependency = route.dependant.dependencies[0].call
    app.dependency_overrides[access_dependency] = lambda: None
    groups = [
        {"id": f"g{index}", "name": f"School {index}"}
        for index in range(101)
    ]
    response = TestClient(app, raise_server_exceptions=False).post(
        "/tournaments/00000000-0000-0000-0000-000000000001/meet/lineup",
        json={
            "config": {
                "tournamentName": "Spring Invitational",
                "intervalMinutes": 15,
                "dayStart": "08:00",
                "dayEnd": "18:00",
                "courtCount": 4,
                "defaultRestMinutes": 20,
                "freezeHorizonSlots": 0,
                "rankCounts": {"MS": 1},
            },
            "groups": groups,
            "players": [
                _player(f"p{index}", f"g{index}", ["MS1"])
                for index in range(101)
            ],
            "matches": [],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Lineup exceeds the 5000-match limit"


def test_endpoint_requires_a_signed_in_operator():
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from core.dependencies import get_current_user
    from meet.lineup import router

    app = FastAPI()
    app.include_router(router)

    def reject_anonymous():
        raise HTTPException(status_code=401, detail="Not signed in")

    app.dependency_overrides[get_current_user] = reject_anonymous
    response = TestClient(app).post(
        "/tournaments/00000000-0000-0000-0000-000000000001/meet/lineup",
        json={},
    )
    assert response.status_code == 401


def test_builder_is_pure_and_does_not_need_a_repository():
    state = _state(
        config={"rankCounts": {"MS": 1}},
        groups=[{"id": "g1", "name": "Kingsway"}, {"id": "g2", "name": "Riverside"}],
        players=[_player("p1", "g1", ["MS1"]), _player("p2", "g2", ["MS1"])],
    )
    before = state.model_copy(deep=True)
    build_lineup(state)
    assert state == before
