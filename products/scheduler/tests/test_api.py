"""API endpoint tests."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    """Test health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


def test_simple_schedule():
    """Test basic scheduling with 2 players, 1 match."""
    request = {
        "config": {
            "totalSlots": 10,
            "courtCount": 2
        },
        "players": [
            {"id": "p1", "name": "Player 1"},
            {"id": "p2", "name": "Player 2"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]}
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] in ["optimal", "feasible"]
    assert len(data["assignments"]) == 1
    assert data["assignments"][0]["matchId"] == "m1"
    assert 0 <= data["assignments"][0]["slotId"] < 10
    assert 1 <= data["assignments"][0]["courtId"] <= 2


def test_player_conflict():
    """Test that player cannot be in two matches at same time."""
    request = {
        "config": {
            "totalSlots": 10,
            "courtCount": 4
        },
        "players": [
            {"id": "p1", "name": "Player 1"},
            {"id": "p2", "name": "Player 2"},
            {"id": "p3", "name": "Player 3"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]},
            {"id": "m2", "eventCode": "MS-2", "sideA": ["p1"], "sideB": ["p3"]}
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] in ["optimal", "feasible"]
    
    # Both matches should be scheduled
    assert len(data["assignments"]) == 2
    
    # Player 1's matches should be at different slots
    slots = {a["matchId"]: a["slotId"] for a in data["assignments"]}
    assert slots["m1"] != slots["m2"]


def test_court_capacity():
    """Test that only one match per court per slot."""
    request = {
        "config": {
            "totalSlots": 5,
            "courtCount": 1  # Only 1 court
        },
        "players": [
            {"id": "p1", "name": "Player 1"},
            {"id": "p2", "name": "Player 2"},
            {"id": "p3", "name": "Player 3"},
            {"id": "p4", "name": "Player 4"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]},
            {"id": "m2", "eventCode": "MS-2", "sideA": ["p3"], "sideB": ["p4"]}
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] in ["optimal", "feasible"]
    
    # Both matches should have different slots (same court)
    slots = {a["matchId"]: a["slotId"] for a in data["assignments"]}
    assert slots["m1"] != slots["m2"]


def test_availability_constraint():
    """Test player availability windows."""
    request = {
        "config": {
            "totalSlots": 10,
            "courtCount": 2
        },
        "players": [
            {"id": "p1", "name": "Player 1", "availability": [[0, 3]]},  # Only slots 0-2
            {"id": "p2", "name": "Player 2"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]}
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] in ["optimal", "feasible"]
    
    # Match should be scheduled within player 1's availability
    assignment = data["assignments"][0]
    assert assignment["slotId"] < 3


def test_infeasible_schedule():
    """Test detection of infeasible schedule."""
    request = {
        "config": {
            "totalSlots": 1,  # Only 1 slot
            "courtCount": 1   # Only 1 court
        },
        "players": [
            {"id": "p1", "name": "Player 1"},
            {"id": "p2", "name": "Player 2"},
            {"id": "p3", "name": "Player 3"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]},
            {"id": "m2", "eventCode": "MS-2", "sideA": ["p1"], "sideB": ["p3"]}  # p1 in both
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "infeasible"
    assert len(data["infeasibleReasons"]) > 0


def test_locked_assignment():
    """Test that locked assignments are preserved."""
    request = {
        "config": {
            "totalSlots": 10,
            "courtCount": 2
        },
        "players": [
            {"id": "p1", "name": "Player 1"},
            {"id": "p2", "name": "Player 2"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p2"]}
        ],
        "previousAssignments": [
            {"matchId": "m1", "slotId": 5, "courtId": 2, "locked": True}
        ]
    }
    
    response = client.post("/schedule", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] in ["optimal", "feasible"]
    
    # Locked assignment should be preserved
    assignment = data["assignments"][0]
    assert assignment["slotId"] == 5
    assert assignment["courtId"] == 2


def test_validate_endpoint():
    """Test validation endpoint."""
    request = {
        "config": {
            "totalSlots": 10,
            "courtCount": 2
        },
        "players": [
            {"id": "p1", "name": "Player 1"}
        ],
        "matches": [
            {"id": "m1", "eventCode": "MS-1", "sideA": ["p1"], "sideB": ["p999"]}  # Invalid player
        ]
    }
    
    response = client.post("/validate", json=request)
    assert response.status_code == 200
    
    data = response.json()
    assert data["valid"] == False
    assert len(data["errors"]) > 0
    assert "p999" in data["errors"][0]
