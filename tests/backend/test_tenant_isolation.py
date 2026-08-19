"""Cross-tenant isolation suite (SP-CLOUD-2 Rule 6).

For EVERY workspace-scoped endpoint, an authenticated non-member and
the anonymous local bootstrap identity must get the uniform 404
(Rule 5) — never data, never 403, never a validation error that fires
before the tenancy seam.

The endpoint list is DERIVED from the app's OpenAPI schema (every
operation whose path contains ``{tournament_id}``), so this suite is
self-maintaining: adding a workspace route without the
``require_tournament_access`` seam fails these tests immediately.
That derivation doubles as the meta-test that the seam is bound to the
path-param name convention.
"""
from __future__ import annotations

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}
GOOD_PW = "a perfectly fine passphrase"

# Fill-ins for non-tenant path params so routes resolve.
_PARAM_FILLERS = {
    "job_id": "00000000-0000-0000-0000-00000000aaaa",
    "match_id": "m-isolation",
    "event_id": "e-isolation",
    "proposal_id": "p-isolation",
    "suggestion_id": "s-isolation",
    "module_id": "meet",
    "filename": "backup-isolation.json",
    # UUID-shaped on purpose. The entries routes type ``entry_id`` as a
    # ``uuid.UUID``, so a slug filler would make the probe 422 on parsing
    # rather than exercise the tenancy seam. It passes either way today —
    # a router-level dependency is solved before the endpoint's own path
    # params — but that ordering is an implementation detail of FastAPI's
    # dependency solver, and a probe that only passes because of it is
    # testing the wrong thing.
    "entry_id": "00000000-0000-0000-0000-0000000000e1",
}


@pytest.fixture
def harness(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    # Tenant A (the victim): a registered account owning one workspace.
    r = client.post(
        "/auth/register",
        json={"email": "victim@example.com", "password": GOOD_PW},
    )
    assert r.status_code == 201
    r = client.post("/tournaments", json={"name": "victim-ws"}, headers=CSRF)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    client.cookies.clear()
    return app, client, tid


def _workspace_operations(app):
    """(method, concrete_path) for every op with {tournament_id}."""
    ops = []
    for path, methods in app.openapi()["paths"].items():
        if "{tournament_id}" not in path:
            continue
        for method in methods:
            concrete = path
            for name, filler in _PARAM_FILLERS.items():
                concrete = concrete.replace("{" + name + "}", filler)
            ops.append((method.upper(), concrete))
    return ops


def _probe_all(client, app, tid, headers):
    failures = []
    for method, path in _workspace_operations(app):
        url = path.replace("{tournament_id}", tid)
        r = client.request(method, url, json={}, headers=headers)
        if r.status_code != 404 or (
            r.headers.get("content-type", "").startswith("application/json")
            and r.json().get("detail", {}).get("code") != "TOURNAMENT_NOT_FOUND"
        ):
            failures.append((method, path, r.status_code))
    return failures


def test_enumeration_is_nonempty_and_covers_the_known_surface(harness):
    app, _, _ = harness
    ops = _workspace_operations(app)
    # 72 workspace-scoped operations after SP-E1-1 added the Entries desk
    # and its two configuration routes (70 with the desk alone; 67 after
    # SP-CLOUD-3 Phase 1's member management; 61 at the SP-CLOUD-2
    # Phase 0.E enumeration).
    # Growth is fine; shrinkage below the audited floor means routes
    # moved off the {tournament_id} convention — the seam binds to that
    # name, so investigate before lowering this number.
    assert len(ops) >= 67, f"only {len(ops)} workspace ops discovered"


def test_authenticated_non_member_gets_uniform_404_everywhere(harness):
    app, client, tid = harness
    r = client.post(
        "/auth/register",
        json={"email": "intruder@example.com", "password": GOOD_PW},
    )
    assert r.status_code == 201
    failures = _probe_all(client, app, tid, headers=CSRF)
    assert not failures, f"cross-tenant leak on: {failures}"


def test_anonymous_bootstrap_gets_uniform_404_everywhere(harness):
    """Local mode's bootstrap identity is a tenant like any other — it
    must not see a registered account's workspace (this also pins that
    the raw-UUID display link cannot read foreign workspaces)."""
    app, client, tid = harness
    client.cookies.clear()
    failures = _probe_all(client, app, tid, headers=CSRF)
    assert not failures, f"bootstrap leak on: {failures}"


def test_member_role_gates_still_403_not_404(harness):
    """A real member with an insufficient role keeps 403 — they already
    know the workspace exists; only *existence* is tenant-secret."""
    app, client, tid = harness
    # victim signs back in and invites a viewer
    client.post(
        "/auth/login", json={"email": "victim@example.com", "password": GOOD_PW}
    )
    r = client.post(
        f"/tournaments/{tid}/invites", json={"role": "viewer"}, headers=CSRF
    )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    client.cookies.clear()
    client.post(
        "/auth/register",
        json={"email": "viewer@example.com", "password": GOOD_PW},
    )
    assert client.post(f"/invites/{token}/accept", headers=CSRF).status_code == 200
    # Viewer can read…
    assert client.get(f"/tournaments/{tid}").status_code == 200
    # …but writes are 403 (insufficient role), not 404.
    r = client.patch(
        f"/tournaments/{tid}", json={"name": "nope"}, headers=CSRF
    )
    assert r.status_code == 403
