"""TDD test for the planFinalized readiness flag (Task 7 — SP-G1).

POST /tournaments/{tid}/plan-finalized toggles a boolean flag stored in the
tournament data blob.  GET /tournaments/{tid}/state must round-trip it, and
the rest of the state blob must survive the toggle unchanged.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from _helpers import isolate_test_database


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from workspaces import tournaments

    app_ = FastAPI()
    app_.include_router(tournaments.router)
    return TestClient(app_)


@pytest.fixture
def seeded_meet_tid(client):
    """Create a tournament with a name so the state blob is auto-seeded."""
    r = client.post("/tournaments", json={"name": "Plan Test Meet", "tournamentDate": "2026-09-01"})
    assert r.status_code == 201
    return r.json()["id"]


# ---- core round-trip -------------------------------------------------------


def test_plan_finalized_round_trips(client, seeded_meet_tid):
    """Default absent/False → toggle True → GET shows True."""
    tid = seeded_meet_tid
    assert client.get(f"/tournaments/{tid}/state").json().get("planFinalized") in (False, None)
    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is True


def test_plan_finalized_can_be_toggled_back(client, seeded_meet_tid):
    """Once set True it can be cleared back to False."""
    tid = seeded_meet_tid
    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": False})
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is False


def test_plan_finalized_toggle_preserves_rest_of_blob(client, seeded_meet_tid):
    """Toggling the flag must NOT wipe the rest of the state (config, players, etc.).

    This catches a naive implementation that writes only {"planFinalized": true}
    instead of read-modify-writing the full blob.
    """
    tid = seeded_meet_tid
    # State blob was seeded at create time — tournamentName should be present.
    state_before = client.get(f"/tournaments/{tid}/state").json()
    assert state_before["config"]["tournamentName"] == "Plan Test Meet"

    client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})

    state_after = client.get(f"/tournaments/{tid}/state").json()
    assert state_after["planFinalized"] is True
    assert state_after["config"]["tournamentName"] == "Plan Test Meet", (
        "planFinalized toggle wiped the rest of the blob"
    )


# ---- the write boundary refuses a double-booked plan (P2) -----------------
#
# The console disables "Mark plan ready" while two matches share a court, but
# a disabled button is a suggestion: the desk's screen can be stale, and a
# second operator can submit at the same moment. These tests pin the refusal
# at the boundary, judged against the STORED plan.


def _put_schedule(client, tid, assignments):
    """Commit a schedule blob with the given court/slot assignments."""
    state = client.get(f"/tournaments/{tid}/state").json()
    state["schedule"] = {
        "assignments": assignments,
        "unscheduledMatches": [],
        "softViolations": [],
        "objectiveScore": None,
        "infeasibleReasons": [],
        "status": "feasible",
    }
    r = client.put(f"/tournaments/{tid}/state", json=state)
    assert r.status_code == 200, r.text


def test_plan_finalized_refuses_a_double_booked_court(client, seeded_meet_tid):
    tid = seeded_meet_tid
    _put_schedule(
        client,
        tid,
        [
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 2},
            {"matchId": "m2", "slotId": 1, "courtId": 1, "durationSlots": 1},
        ],
    )

    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["code"] == "PLAN_DOUBLE_BOOKED"
    assert detail["courts"] == [1]
    # ...and the refusal actually held: nothing was written.
    assert client.get(f"/tournaments/{tid}/state").json().get("planFinalized") in (
        False,
        None,
    )


def test_plan_finalized_accepts_a_plan_with_no_overlap(client, seeded_meet_tid):
    tid = seeded_meet_tid
    _put_schedule(
        client,
        tid,
        [
            # Back-to-back on one court is not an overlap; a second court is
            # a different resource entirely.
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1},
            {"matchId": "m2", "slotId": 1, "courtId": 1, "durationSlots": 1},
            {"matchId": "m3", "slotId": 0, "courtId": 2, "durationSlots": 1},
        ],
    )

    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True})
    assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is True


def test_un_readying_a_double_booked_plan_is_never_refused(client, seeded_meet_tid):
    """A bad plan must not be able to trap the day in the ready state."""
    tid = seeded_meet_tid
    _put_schedule(
        client, tid, [{"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1}]
    )
    assert (
        client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": True}).status_code
        == 200
    )
    # The plan then becomes double-booked (a repair, an import, another desk).
    _put_schedule(
        client,
        tid,
        [
            {"matchId": "m1", "slotId": 0, "courtId": 1, "durationSlots": 1},
            {"matchId": "m2", "slotId": 0, "courtId": 1, "durationSlots": 1},
        ],
    )
    r = client.post(f"/tournaments/{tid}/plan-finalized", json={"finalized": False})
    assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}/state").json()["planFinalized"] is False
