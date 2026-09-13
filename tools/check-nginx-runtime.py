"""Exercise real ingress headers and secret-free logs in isolated containers.

Called by check-nginx.sh with its ephemeral certificate directory. No host ports
are published; curl runs inside each network-disabled test container.
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "nginxinc/nginx-unprivileged@sha256:2ddec616f1cb58bcac057aa388f28cb81e35137641ef4226d321714499329bd1"
HEADERS = (
    "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy",
    "Permissions-Policy", "Content-Security-Policy", "Strict-Transport-Security",
)


def docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args], check=check, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, timeout=30,
    )


def request(container: str, port: int, path: str, sentinel: str) -> tuple[int, str]:
    scheme = "https" if port in {8443, 8444} else "http"
    result = docker(
        "exec", container, "curl", "--silent", "--show-error", "--insecure",
        "--max-time", "5", "--dump-header", "-", "--output", "/dev/null",
        "--header", "X-Forwarded-Proto: https",
        "--header", f"Referer: https://example.invalid/display/{sentinel}?token={sentinel}",
        f"{scheme}://127.0.0.1:{port}{path}", check=False,
    )
    statuses = re.findall(r"HTTP/\S+ (\d{3})", result.stdout)
    return (int(statuses[-1]) if statuses else 0), result.stdout


def check_headers(output: str, *, public: bool) -> None:
    for header in HEADERS:
        matches = re.findall(rf"^\s*{header}:\s*(.+)$", output, re.M | re.I)
        assert len(matches) == 1, (header, output)
    assert "unsafe-eval" not in output
    script = re.search(r"script-src ([^;]+)", output)
    assert script and "unsafe-inline" not in script[1], output
    assert "max-age=31536000" in output, output
    assert f"X-Frame-Options: {'DENY' if public else 'SAMEORIGIN'}" in output, output


def run(check_dir: Path) -> None:
    html = check_dir / "html"
    html.mkdir()
    (html / "index.html").write_text("<!doctype html><title>Ingress probe</title>")
    cases = {
        "app": ("http-shared.conf", "console.conf", "play.conf"),
        "lan": ("lan-tls.conf",),
        "docs": ("docs.conf",),
    }
    for mode, includes in cases.items():
        config = check_dir / "wrappers" / f"runtime-{mode}.conf"
        config.write_text(
            "pid /tmp/nginx.pid; events {} http {\n"
            + "\n".join(f"include /etc/nginx/snippets/{name};" for name in includes)
            + "\n}\n"
        )
        container = f"sw-ingress-check-{uuid.uuid4().hex}"
        sentinel = f"secret-sentinel-{uuid.uuid4().hex}"
        try:
            docker(
                "run", "-d", "--name", container, "--network", "none",
                "--add-host", "backend:127.0.0.1", "--add-host", "entrant:127.0.0.1",
                "--add-host", "frontend:127.0.0.1",
                "-v", f"{ROOT / 'infra/nginx'}:/etc/nginx/snippets:ro",
                "-v", f"{check_dir / 'wrappers'}:/check:ro",
                "-v", f"{check_dir / 'tls'}:/run/shuttleworks/tls:ro",
                "-v", f"{html}:/usr/share/nginx/html:ro",
                "--entrypoint", "nginx", IMAGE, "-c", f"/check/{config.name}",
                "-g", "daemon off;",
            )
            port = 8443 if mode == "lan" else 8080
            for _ in range(30):
                status, output = request(container, port, "/", sentinel)
                if status:
                    break
                time.sleep(0.1)
            assert status == (502 if mode == "lan" else 200), output
            check_headers(output, public=False)
            probes = (
                [(8080, "/assets/missing.js", 404)] if mode == "docs" else
                [(8443, f"/{kind}/{sentinel}", 502) for kind in ("display", "invite", "invites")]
                + [(8444, f"/e/partner/{sentinel}", 502)]
                if mode == "lan" else
                [(8080, f"/api/{kind}/{sentinel}", 502) for kind in ("display", "invites", "partners")]
                + [(8081, f"/e/api/partners/{sentinel}", 502), (8080, f"/?token={sentinel}", 200)]
            )
            for probe_port, path, expected in probes:
                status, output = request(container, probe_port, path, sentinel)
                assert status == expected, output
                check_headers(output, public=probe_port in {8081, 8444})
            if mode == "app":
                statuses = []
                for _ in range(12):
                    status, output = request(container, 8080, "/api/auth/login", sentinel)
                    statuses.append(status)
                    check_headers(output, public=False)
                assert 429 in statuses, statuses
            logs = docker("logs", container).stdout
            assert '"status":' in logs, "positive control: access logging must be enabled"
            assert sentinel not in logs, logs
            print(f"{mode}: headers, failures and log redaction passed")
        finally:
            docker("rm", "-f", container, check=False)


if __name__ == "__main__":
    run(Path(sys.argv[1]).resolve())
