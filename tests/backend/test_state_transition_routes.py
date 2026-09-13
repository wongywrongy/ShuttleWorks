"""Request-level proof of canonical retirement and exactly-once audit history."""
from fastapi.testclient import TestClient
from sqlalchemy import select


def test_match_retirement_round_trip_and_history(backend_env):
    from _helpers import seed_tournament
    from core.main import app
    from core.dependencies import LOCAL_DEV_USER_UUID
    from db.models import StateTransition
    from db.session import SessionLocal
    with TestClient(app) as client:
        tournament_id = seed_tournament(client, "Transition history")
        url = f"/tournaments/{tournament_id}/match-states/m1"
        version = 0
        for target in ("called", "started", "retired"):
            response = client.put(url, json={"matchId": "m1", "status": target},
                                  headers={"If-Match": f'"{version}"'})
            assert response.status_code == 200, response.text
            assert response.json()["status"] == target
            version = int(response.headers["etag"].strip('"'))
        assert client.get(url).json()["status"] == "retired"
        refused = client.put(url, json={"matchId": "m1", "status": "started"},
                             headers={"If-Match": f'"{version}"'})
        assert refused.status_code == 409
        same = client.put(url, json={"matchId": "m1", "status": "retired"},
                          headers={"If-Match": f'"{version}"'})
        assert same.status_code == 200
    with SessionLocal() as session:
        history = list(session.scalars(select(StateTransition).order_by(StateTransition.occurred_at)))
        assert [row.event for row in history] == ["call", "start", "retire"]
        assert all(row.actor_type == "operator" and row.actor_id == str(LOCAL_DEV_USER_UUID) for row in history)
        assert all(row.subject_type == "matches" and row.subject_id == "m1" for row in history)
