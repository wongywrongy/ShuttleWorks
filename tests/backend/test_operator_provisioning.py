"""Owner-authenticated operator provisioning (debt-log D12).

`POST /tournaments/{tournament_id}/operators` exists because the only way to
create an account on a self-hosted instance used to be public self-service,
and that path is throttled at ``registration_max_per_ip`` SUCCESSFUL
registrations per IP per hour — deliberately (SEC-03). An admin standing an
instance up for several clubs from one office hit the wall after four.

The four properties below are the whole point, and each can regress silently:

1. an owner can provision past the public budget;
2. the public budget is *not* loosened, and provisioning does not spend it;
3. anyone who is not an owner of the named workspace gets the uniform 404;
4. the account that comes out is a real one — same password policy, same
   Argon2id hash — which is proved by signing in as it.

Freshness (a stale session is refused) is pinned where every other sensitive
workspace route's freshness is pinned, in ``test_operator_mfa_http.py``: that
suite owns the MFA clock fixture, and a second copy of it here would be a
second thing to keep in step.
"""
from __future__ import annotations

import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
OWNER_PW = "a perfectly fine owner passphrase"
NEW_PW = "a perfectly fine provisioned passphrase"


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    with TestClient(app, headers=CSRF) as client:
        yield client


def _register(client, email: str, password: str = OWNER_PW):
    client.cookies.clear()
    return client.post("/auth/register", json={"email": email, "password": password})


def _owner_with_workspace(client) -> str:
    assert _register(client, "owner@example.test").status_code == 201
    created = client.post("/tournaments", json={"name": "Provisioning"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _provision(client, workspace: str, email: str, password: str = NEW_PW):
    return client.post(
        f"/tournaments/{workspace}/operators",
        json={"email": email, "password": password},
    )


def test_owner_provisions_past_the_public_registration_budget(app_client, monkeypatch):
    """The gap D12 names: four accounts, then a wall — unless an owner asks."""
    from core.config import settings

    client = app_client
    # Set BEFORE the first registration: the lock is written when a
    # registration is recorded, against the budget in force at that moment.
    # The owner's own signup is the one registration this budget allows, so
    # the public path is closed from here on.
    monkeypatch.setattr(settings, "registration_max_per_ip", 1)
    workspace = _owner_with_workspace(client)
    assert _register(client, "public@example.test").status_code == 429

    # The owner's session was cleared by that probe; sign back in and keep
    # going well past the public budget.
    assert client.post(
        "/auth/login", json={"email": "owner@example.test", "password": OWNER_PW}
    ).status_code == 200
    for n in range(5):
        created = _provision(client, workspace, f"club{n}@example.test")
        assert created.status_code == 201, created.text
        assert created.json()["email"] == f"club{n}@example.test"
        # No session is handed back: the account is for someone else.
        assert "id" in created.json() and "token" not in created.json()


def test_provisioning_does_not_spend_the_public_budget(app_client, monkeypatch):
    """The throttle is not loosened — this route simply is not the public one."""
    from core.config import settings

    client = app_client
    monkeypatch.setattr(settings, "registration_max_per_ip", 3)
    workspace = _owner_with_workspace(client)
    for n in range(4):
        assert _provision(client, workspace, f"bulk{n}@example.test").status_code == 201

    # The owner's own registration spent one of the three; two remain, and
    # the fourth public signup is still refused. Had provisioning charged the
    # registration bucket, the first of these would already be a 429.
    assert _register(client, "public1@example.test").status_code == 201
    assert _register(client, "public2@example.test").status_code == 201
    assert _register(client, "public3@example.test").status_code == 429


def test_the_provisioned_account_is_a_real_operator_account(app_client):
    client = app_client
    workspace = _owner_with_workspace(client)
    assert _provision(client, workspace, "director@example.test").status_code == 201

    # Same password policy, same Argon2id hashing — proved by using it.
    client.cookies.clear()
    signed_in = client.post(
        "/auth/login", json={"email": "director@example.test", "password": NEW_PW}
    )
    assert signed_in.status_code == 200, signed_in.text
    # ...and it is NOT a member of the provisioning owner's workspace: invites
    # do membership, this route does accounts.
    assert client.get(f"/tournaments/{workspace}").status_code == 404


def test_the_password_policy_is_the_same_one(app_client):
    client = app_client
    workspace = _owner_with_workspace(client)
    weak = _provision(client, workspace, "weak@example.test", password="short")
    assert weak.status_code == 400
    assert weak.json()["detail"]["code"] == "AUTH_WEAK_PASSWORD"
    taken = _provision(client, workspace, "owner@example.test")
    assert taken.status_code == 400
    assert taken.json()["detail"]["code"] == "AUTH_EMAIL_TAKEN"


def test_non_owners_and_strangers_get_the_uniform_404(app_client):
    """Viewer, operator, non-member and unknown workspace are one response."""
    client = app_client
    workspace = _owner_with_workspace(client)
    invites = {
        role: client.post(
            f"/tournaments/{workspace}/invites", json={"role": role}
        ).json()["token"]
        for role in ("viewer", "operator")
    }
    unknown = _provision(client, str(uuid.uuid4()), "nobody@example.test")
    assert unknown.status_code == 404

    denials = [unknown]
    for role, token in invites.items():
        assert _register(client, f"{role}@example.test").status_code == 201
        assert client.post(f"/invites/{token}/accept").status_code == 200
        # The member can read the workspace…
        assert client.get(f"/tournaments/{workspace}").status_code == 200
        # …and still cannot mint an account with it.
        denials.append(_provision(client, workspace, f"by-{role}@example.test"))

    assert _register(client, "stranger@example.test").status_code == 201
    denials.append(_provision(client, workspace, "by-stranger@example.test"))

    assert {response.status_code for response in denials} == {404}
    # Byte-identical: which of the four reasons applied must not be readable.
    assert len({response.content for response in denials}) == 1
