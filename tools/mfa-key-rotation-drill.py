#!/usr/bin/env python3
"""Rehearse an operator MFA key-ring rotation on a real container stack.

Brings up an isolated copy of infra/compose/docker-compose.cloud.yml (API +
Postgres 16, its own project name, a loopback port and a throwaway volume),
enrolls one synthetic operator over HTTP, then performs the documented
rotation with tools/operator-mfa-keyring.py run INSIDE the API image as root,
exactly as docs/how-to/security-operations.md describes:

    add-key -> restart -> promote -> restart -> rewrap -> usage -> remove-key -> restart

After every restart the operator signs in again: with an authenticator code,
except after promotion, where a recovery code is used on purpose (it does not
re-encrypt), so rewrap has an old-key seed to move and the final sign-in proves
the seed decrypts under the new key alone. The ring must stay 0600 and owned by
the API user (UID 1001) through
every rewrite. The record printed (and written with --record) holds key
identifiers, timings and verdicts only: never key material, codes or cookies.

Run from the repository root with the repository venv and a Docker daemon:

    .venv/bin/python tools/mfa-key-rotation-drill.py --record docs/reviews/mfa-key-rotation-drill-YYYY-MM-DD.json

Everything it creates (containers, volume, network, temporary secret files) is
removed afterwards, including on failure.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import http.cookiejar
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import secrets
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "infra/compose/docker-compose.cloud.yml"
TOOL = ROOT / "tools/operator-mfa-keyring.py"
PASSWORD = "a synthetic rotation drill passphrase"


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def _totp(secret: str, step: int) -> str:
    key = base64.b32decode(secret)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


class Drill:
    def __init__(self, workdir: Path):
        self.workdir = workdir
        self.project = f"sw-mfa-drill-{secrets.token_hex(3)}"
        self.port = _free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.env = {
            **os.environ,
            "MFA_KEYRING_FILE": str(workdir / "keys.json"),
            "AUTHORITY_SIGNING_KEY_FILE": str(workdir / "authority.pem"),
            "BACKEND_HOST_PORT": f"127.0.0.1:{self.port}",
            "POSTGRES_PASSWORD": secrets.token_hex(16),
            "PUBLIC_APP_ORIGIN": f"http://127.0.0.1:{self.port}",
        }
        self.used_steps: set[int] = set()
        self.cookies = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.steps: list[dict] = []

    # ---- plumbing --------------------------------------------------------
    def compose(self, *args: str, capture: bool = False) -> str:
        result = subprocess.run(["docker", "compose", "-p", self.project, "-f", str(COMPOSE), *args],
                                cwd=ROOT, env=self.env, text=True, check=True,
                                stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                                stderr=subprocess.PIPE if capture else subprocess.DEVNULL)
        return result.stdout if capture else ""

    def in_api_image(self, *argv: str) -> str:
        """Run as root in the API image, the operator's documented position."""
        return self.compose("run", "--rm", "--no-deps", "-T", "--user", "0",
                            "-v", f"{self.workdir}:/keys",
                            "-v", f"{TOOL}:/app/tools/operator-mfa-keyring.py:ro",
                            *argv, capture=True)

    def keyring(self, *args: str) -> str:
        return self.in_api_image("backend", "python", "/app/tools/operator-mfa-keyring.py", *args)

    def ring_custody(self) -> str:
        out = self.in_api_image("--entrypoint", "stat", "backend", "-c", "%u:%g %a", "/keys/keys.json")
        return out.strip()

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method, headers={
            "Content-Type": "application/json", "X-ShuttleWorks-CSRF": "1"})
        try:
            with self.http.open(request, timeout=15) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                return error.code, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return error.code, {}

    def wait_healthy(self, timeout: float = 120) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if self.request("GET", "/health")[0] == 200:
                    return
            except (urllib.error.URLError, ConnectionError, OSError):
                pass
            time.sleep(1)
        raise RuntimeError("API did not become healthy")

    def restart(self) -> None:
        self.compose("restart", "backend")
        self.wait_healthy()

    def fresh_code(self, secret: str) -> str:
        while True:
            step, remaining = divmod(time.time(), 30)
            if int(step) not in self.used_steps and 30 - remaining >= 3:
                self.used_steps.add(int(step))
                return _totp(secret, int(step))
            time.sleep(30 - remaining + 0.2)

    def sign_in_again(self, secret: str, recovery_code: str | None = None) -> bool:
        """A recovery code leaves custody alone; a TOTP proof re-encrypts under the active key."""
        self.cookies.clear()
        status, body = self.request("POST", "/auth/login", {"email": self.email, "password": PASSWORD})
        if status != 200 or body.get("mfaAuthenticated") is not False:
            return False
        code = recovery_code or self.fresh_code(secret)
        status, _ = self.request("POST", "/auth/mfa/verify", {"currentPassword": PASSWORD, "code": code})
        return status == 200 and self.request("GET", "/tournaments")[0] == 200

    def record(self, name: str, ok: bool, **detail) -> None:
        self.steps.append({"step": name, "result": "PASS" if ok else "FAIL", **detail})
        if not ok:
            raise RuntimeError(f"drill step failed: {name}")

    # ---- the rehearsal ----------------------------------------------------
    def run(self) -> dict:
        started = time.monotonic()
        venv_python = ROOT / ".venv/bin/python"
        subprocess.run([str(venv_python), str(TOOL), "create", str(self.workdir / "keys.json")],
                       check=True, stdout=subprocess.DEVNULL)
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        (self.workdir / "authority.pem").write_bytes(Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        os.chmod(self.workdir / "authority.pem", 0o600)
        first_key = json.loads((self.workdir / "keys.json").read_text())["active"]

        self.compose("build", "backend")
        # Custody as the self-host guide prescribes: private, owned by the API user.
        self.in_api_image("--entrypoint", "chown", "backend", "1001:1001", "/keys/keys.json", "/keys/authority.pem")
        self.compose("up", "-d", "--wait", "postgres", "backend")
        self.wait_healthy()

        self.email = f"rotation-drill-{secrets.token_hex(4)}@example.test"
        status, _ = self.request("POST", "/auth/register", {"email": self.email, "password": PASSWORD})
        self.record("register", status == 201)
        status, enrollment = self.request("POST", "/auth/mfa/enroll", {"currentPassword": PASSWORD})
        secret = enrollment.get("secret", "")
        status, confirmed = self.request("POST", "/auth/mfa/confirm", {"code": self.fresh_code(secret)})
        recovery = confirmed.get("recoveryCodes", [])
        self.record("enroll", status == 200 and len(recovery) == 8
                    and self.request("GET", "/tournaments")[0] == 200, keyId=first_key)

        added = self.keyring("add-key", "/keys/keys.json")
        new_key = added.split("key ", 1)[1].split(".", 1)[0].strip()
        self.restart()
        self.record("add-key+restart", self.sign_in_again(secret) and self.ring_custody() == "1001:1001 600",
                    newKeyId=new_key, custody=self.ring_custody())

        self.keyring("promote", "/keys/keys.json", "--key-id", new_key)
        self.restart()
        # Recovery-code sign-in on purpose: it proves the old-key seed still works
        # after promotion and leaves it wrapped by the old key for rewrap to move.
        self.record("promote+restart", self.sign_in_again(secret, recovery_code=recovery[0]))
        before = json.loads(self.keyring("usage", "--keyring", "/keys/keys.json"))["usage"]

        rewrap = json.loads(self.keyring("rewrap", "--keyring", "/keys/keys.json"))
        usage = json.loads(self.keyring("usage", "--keyring", "/keys/keys.json"))["usage"]
        self.record("rewrap", {row["keyId"] for row in before} == {first_key} and rewrap["rewrapped"]["active"] == 1
                    and {row["keyId"] for row in usage} == {new_key},
                    usageBefore=before, rewrapped=rewrap["rewrapped"], usageAfter=usage)

        self.keyring("remove-key", "/keys/keys.json", "--key-id", first_key)
        remaining = json.loads((self.workdir / "keys.json").read_text() if os.access(self.workdir / "keys.json", os.R_OK)
                               else self.in_api_image("--entrypoint", "cat", "backend", "/keys/keys.json"))
        self.restart()
        self.record("remove-key+restart", set(remaining["keys"]) == {new_key} and self.sign_in_again(secret)
                    and self.ring_custody() == "1001:1001 600", custody=self.ring_custody())

        return {
            "runAt": datetime.now(timezone.utc).isoformat(),
            "scope": "local Docker copy of docker-compose.cloud.yml (API image + Postgres 16); synthetic operator",
            "result": "PASS",
            "sourceRevision": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
                                             capture_output=True).stdout.strip(),
            "retiredKeyId": first_key,
            "activeKeyId": new_key,
            "steps": self.steps,
            "elapsedSeconds": round(time.monotonic() - started, 1),
            "drillImplementationSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "toolImplementationSha256": hashlib.sha256(TOOL.read_bytes()).hexdigest(),
            "notRehearsed": "a production host, its backups, and an incident-driven emergency rotation",
        }

    def teardown(self) -> None:
        subprocess.run(["docker", "compose", "-p", self.project, "-f", str(COMPOSE), "down", "-v", "--remove-orphans"],
                       cwd=ROOT, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--record", type=Path, help="Write the dated JSON record here (new file)")
    args = parser.parse_args()
    workdir = Path(tempfile.mkdtemp(prefix="sw-mfa-drill-"))
    os.chmod(workdir, 0o700)
    drill = Drill(workdir)
    try:
        record = drill.run()
    except Exception as exc:  # noqa: BLE001 — report the step, never provider output
        print(json.dumps({"result": "FAIL", "steps": drill.steps, "error": type(exc).__name__, "detail": str(exc)[:200]}))
        return 1
    finally:
        drill.teardown()
        shutil.rmtree(workdir, ignore_errors=True)
    output = json.dumps(record, indent=2) + "\n"
    if args.record:
        with args.record.open("x") as target:
            target.write(output)
    print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
