"""End-to-end key-ring rotation against a live enrolled operator."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from tests.backend import test_operator_mfa_http as http

authenticated_app = http.authenticated_app
ROOT = Path(__file__).resolve().parents[2]


def keyring(*args):
    return subprocess.run([sys.executable, str(ROOT / "tools/operator-mfa-keyring.py"), *args],
                          cwd=ROOT, capture_output=True, text=True, timeout=30, env=dict(os.environ))


def test_rotation_procedure_keeps_the_operator_signed_in_and_never_prints_keys(authenticated_app):
    client, clock = authenticated_app
    http.register(client)
    seed, _ = http.enroll(client, clock)
    path = os.environ["MFA_KEYRING_FILE"]
    raw_keys = set(json.loads(Path(path).read_text())["keys"].values())
    old_id = json.loads(Path(path).read_text())["active"]

    added = keyring("add-key", path)
    assert added.returncode == 0, added.stderr
    new_id = re.search(r"key ([0-9a-f]{16})", added.stdout).group(1)
    assert keyring("promote", path, "--key-id", new_id).returncode == 0
    refused = keyring("remove-key", path, "--key-id", old_id)
    assert refused.returncode == 1 and "rewrap" in refused.stderr  # a seed still uses it

    rewrapped = keyring("rewrap")
    assert rewrapped.returncode == 0, rewrapped.stderr
    assert json.loads(rewrapped.stdout)["rewrapped"] == {"active": 1, "pending": 0}
    usage = keyring("usage")
    assert json.loads(usage.stdout)["usage"] == [{"keyId": new_id, "use": "active", "factors": 1}]
    removed = keyring("remove-key", path, "--key-id", old_id)
    assert removed.returncode == 0, removed.stderr
    assert json.loads(Path(path).read_text())["keys"].keys() == {new_id}

    raw_keys |= set(json.loads(Path(path).read_text())["keys"].values())
    for result in (added, refused, rewrapped, usage, removed):
        assert not any(key in result.stdout + result.stderr for key in raw_keys)

    from datetime import timedelta
    from identity.mfa_crypto import totp_code
    clock["now"] += timedelta(seconds=30)
    client.post("/auth/logout")
    client.post("/auth/login", json={"email": http.EMAIL, "password": http.PASSWORD})
    verified = client.post("/auth/mfa/verify", json={"currentPassword": http.PASSWORD,
                                                     "code": totp_code(seed, clock["now"].timestamp())})
    assert verified.status_code == 200, verified.text
