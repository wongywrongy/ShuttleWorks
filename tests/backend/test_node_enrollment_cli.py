"""Local provisioning emits one private artifact and cannot overwrite a file."""
import json
from pathlib import Path
import stat
import subprocess
import sys

from tests.backend import test_node_operator_mfa_http as node_fixtures

node = node_fixtures.node

ROOT = Path(__file__).resolve().parents[2]


def run_cli(body, user_id, output):
    return subprocess.run([sys.executable, str(ROOT / "tools/node-operator-enrollment.py"),
        "--workspace", body["workspaceId"], "--operator", str(user_id), "--output", str(output)],
        cwd=ROOT, capture_output=True, text=True, timeout=20)


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
