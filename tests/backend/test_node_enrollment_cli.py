"""Local provisioning emits one private artifact and cannot overwrite a file."""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

from tests.backend import test_node_operator_mfa_http as node_fixtures

node = node_fixtures.node

ROOT = Path(__file__).resolve().parents[2]


def run_cli(body, user_id, output, *extra, env=None):
    return subprocess.run([sys.executable, str(ROOT / "tools/node-operator-enrollment.py"),
        "--workspace", body["workspaceId"], "--operator", str(user_id), "--output", str(output), *extra],
        cwd=ROOT, capture_output=True, text=True, timeout=20, env=env)


def test_local_provisioning_emits_a_private_one_use_file_without_logging_the_token(node, tmp_path):
    client, body, _, user_id = node
    output = tmp_path / "activation.json"
    result = run_cli(body, user_id, output)
    assert result.returncode == 0, result.stderr
    issued = json.loads(output.read_text())
    assert stat.S_IMODE(output.stat().st_mode) == 0o600
    assert issued["activationToken"] not in result.stdout + result.stderr
    assert issued["activationToken"] != body["activationToken"]
    assert client.post("/auth/node/activate", json=body).status_code == 401
    response = client.post("/auth/node/activate", json={**body, "activationToken": issued["activationToken"]})
    assert response.status_code == 200, response.text
    assert response.json()["mfaAuthenticated"] is False


def test_refused_output_preserves_the_old_credential_and_existing_file(node, tmp_path):
    client, body, _, user_id = node
    output = tmp_path / "existing.json"
    output.write_text("do not overwrite")
    result = run_cli(body, user_id, output)
    assert result.returncode != 0
    assert output.read_text() == "do not overwrite"
    assert client.post("/auth/node/activate", json=body).status_code == 200


def test_host_run_provisioning_needs_no_mfa_key_ring(node, tmp_path):
    """The API's ring is a container path; the host tool never reads it."""
    client, body, _, user_id = node
    output = tmp_path / "activation.json"
    env = {**os.environ, "MFA_KEYRING_FILE": "", "PROCESS_ROLE": "api"}
    result = run_cli(body, user_id, output, env=env)
    assert result.returncode == 0, result.stderr
    issued = json.loads(output.read_text())
    assert client.post("/auth/node/activate", json={**body, "activationToken": issued["activationToken"]}).status_code == 200


def test_administrator_reset_revokes_the_enrolled_identity_and_reissues_activation(node, tmp_path):
    client, body, _, user_id = node
    tid = body["workspaceId"]
    node_fixtures.activate_and_enroll(client, body)
    assert client.get(f"/tournaments/{tid}").status_code == 200
    plain = run_cli(body, user_id, tmp_path / "refused.json")
    assert plain.returncode != 0  # an enrolled identity is never silently re-provisioned
    output = tmp_path / "reset.json"
    result = run_cli(body, user_id, output, "--reset-existing", "--reason", "Identity checked in person by the referee")
    assert result.returncode == 0, result.stderr
    assert client.get(f"/tournaments/{tid}").status_code == 401  # existing node session revoked
    client.cookies.clear()
    old = client.post("/auth/login", params={"workspaceId": tid}, json={"email": body["email"], "password": node_fixtures.PASSWORD})
    assert old.status_code == 401  # the old password is gone
    issued = json.loads(output.read_text())
    assert client.post("/auth/node/activate", json={**body, "activationToken": issued["activationToken"]}).status_code == 200


def test_reset_requires_an_audited_reason(node, tmp_path):
    _, body, _, user_id = node
    output = tmp_path / "reset.json"
    result = run_cli(body, user_id, output, "--reset-existing")
    assert result.returncode == 2
    assert not output.exists()
