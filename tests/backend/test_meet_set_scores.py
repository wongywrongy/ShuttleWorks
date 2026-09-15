"""Meet games survive a fresh read and the JSON export/import boundary (P11)."""
import json

import pytest

from tests.backend import test_match_state as fixtures

client = fixtures.client
tid = fixtures.tid
SETS = [{"sideA": 21, "sideB": 17}, {"sideA": 18, "sideB": 21}, {"sideA": 21, "sideB": 19}]


def test_completed_meet_sets_survive_read_export_and_import(client, tid):
    base = f"/tournaments/{tid}/match-states"
    version = 0
    for status in ("called", "started", "finished"):
        response = client.put(f"{base}/m1", headers={"If-Match": f'"{version}"'},
            json={"matchId": "m1", "status": status, "score": {"sideA": 2, "sideB": 1}, "sets": SETS})
        assert response.status_code == 200, response.text
        version = int(response.headers["ETag"].strip('"'))
    assert client.get(f"{base}/m1").json().get("sets") == SETS
    assert client.get(base).json()["m1"].get("sets") == SETS
    exported = client.get(f"{base}/export/download")
    assert exported.status_code == 200
    assert exported.json()["matchStates"]["m1"]["sets"] == SETS
    assert client.post(f"{base}/reset").status_code == 200
    restored = client.post(f"{base}/import/upload", headers={"Idempotency-Key": "restore-set-scores"},
        files={"file": ("match_states.json", json.dumps(exported.json()), "application/json")})
    assert restored.status_code == 200, restored.text
    assert client.get(f"{base}/m1").json().get("sets") == SETS
    assert client.get(f"{base}/m1").json()["score"] == {"sideA": 2, "sideB": 1}


@pytest.mark.parametrize("sets", [SETS * 2, [{"sideA": -1, "sideB": 2}],
    [{"sideA": 100, "sideB": 2}], [{"sideA": 21, "sideB": 2, "private": "surplus"}]])
def test_set_input_is_bounded_before_any_match_write(client, tid, sets):
    base = f"/tournaments/{tid}/match-states"
    response = client.put(f"{base}/m1", headers={"If-Match": '"0"'},
        json={"matchId": "m1", "status": "called", "sets": sets})
    assert response.status_code == 422
    assert client.get(base).json() == {}


def test_bulk_import_can_replace_and_clear_sets(client, tid):
    base = f"/tournaments/{tid}/match-states"
    for index, sets in enumerate((SETS, [{"sideA": 21, "sideB": 10}], None)):
        response = client.post(f"{base}/import-bulk", headers={"Idempotency-Key": f"set-score-{index}"},
            json={"m1": {"matchId": "m1", "status": "called", "sets": sets}})
        assert response.status_code == 200, response.text
        assert client.get(f"{base}/m1").json().get("sets") == sets
