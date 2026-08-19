"""Client-IP trust boundary (SP-CLOUD-3, audit finding 0.F.2).

Under the target topology the API sits behind a Cloudflare Tunnel, so
``request.client.host`` is the cloudflared connector for *every* request.
The credential throttle keys on that value, which collapses every user
on the internet into one ``ip:`` bucket — the fifth failed login from
anyone locks out everyone, because ``_throttle_guard`` runs *before*
credentials are checked.

The fix reads ``CF-Connecting-IP``, but only when the immediate peer is
a configured trusted proxy. These tests pin BOTH halves, because a
header trusted from anywhere is worse than no header at all (Rule 8):
it turns the throttle into a bypass — an attacker rotates the header and
never gets locked out.

Coverage:
- untrusted peer  → header ignored, socket IP wins  (the Rule-8 half)
- trusted peer    → header honoured, buckets are per-real-client
- unset config    → header inert (local-mode parity, Rule 1)
"""
from __future__ import annotations

import pytest

from tests.backend._helpers import isolate_test_database

GOOD_PW = "a perfectly fine passphrase"

# The address TestClient presents as the socket peer. Standing in for
# the cloudflared connector: one address, many real clients behind it.
CONNECTOR = "10.42.0.9"


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    """Build a TestClient whose socket peer is ``CONNECTOR``."""
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from app.main import app

    def _make():
        return TestClient(app, client=(CONNECTOR, 51000))

    return _make


def _fail_login(client, *, email: str, real_ip: str):
    """One failed login attempt, tagged with a spoofable real-client IP."""
    return client.post(
        "/auth/login",
        json={"email": email, "password": "definitely-wrong"},
        headers={"CF-Connecting-IP": real_ip},
    )


# ---- The Rule-8 half: the header must be ignored when untrusted ------


def test_spoofed_client_ip_is_ignored_from_an_untrusted_peer(make_client, monkeypatch):
    """With no trusted proxies configured, ``CF-Connecting-IP`` must not
    influence throttling — otherwise rotating the header is a trivial
    throttle bypass.

    Asserted behaviourally: attempts arriving with *different* spoofed
    IPs still share one bucket, so the budget is spent collectively.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 3)
    monkeypatch.setattr(settings, "trusted_proxy_ips", [])  # trust nothing
    client = make_client()

    # Three failures, each claiming a different origin IP.
    for i, ip in enumerate(["1.1.1.1", "2.2.2.2", "3.3.3.3"]):
        r = _fail_login(client, email=f"ghost{i}@example.com", real_ip=ip)
        assert r.status_code == 401, r.text

    # A fourth, from yet another claimed IP. The header is untrusted, so
    # all four share the connector's bucket and this one is locked out.
    r = _fail_login(client, email="ghost9@example.com", real_ip="4.4.4.4")
    assert r.status_code == 429, (
        "spoofed CF-Connecting-IP from an untrusted peer changed the throttle "
        "bucket — the header is being trusted without a trust boundary"
    )
    assert r.json()["detail"]["code"] == "AUTH_THROTTLED"


# ---- The bug half: real clients must not share a bucket -------------


def test_trusted_proxy_gives_each_real_client_its_own_bucket(make_client, monkeypatch):
    """The regression test for the actual defect.

    With the connector trusted, exhausting one real client's budget must
    NOT lock out a different real client behind the same connector.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "auth_throttle_max_failures", 3)
    monkeypatch.setattr(settings, "trusted_proxy_ips", [CONNECTOR])
    client = make_client()

    # Client A burns its whole budget (distinct accounts each time, so
    # the per-account bucket can't be what locks anything).
    for i in range(3):
        r = _fail_login(client, email=f"alpha{i}@example.com", real_ip="203.0.113.7")
        assert r.status_code == 401, r.text

    # A is now locked.
    r = _fail_login(client, email="alpha9@example.com", real_ip="203.0.113.7")
    assert r.status_code == 429

    # B, behind the same connector, is a different person and unaffected.
    r = _fail_login(client, email="bravo0@example.com", real_ip="198.51.100.4")
    assert r.status_code == 401, (
        "a second real client behind the same trusted proxy was locked out by "
        "the first client's failures — every user still shares one bucket"
    )


# ---- Local-mode parity (Rule 1) -------------------------------------


def test_header_is_inert_when_no_proxy_is_configured(make_client, monkeypatch):
    """Default config trusts nothing, so local mode behaves exactly as
    it did before this seam existed."""
    from app.config import settings
    from app.client_ip import client_ip

    monkeypatch.setattr(settings, "trusted_proxy_ips", [])

    class _Req:
        headers = {"CF-Connecting-IP": "evil.example"}

        class client:  # noqa: N801 - stub shape mirrors starlette's
            host = CONNECTOR

    assert client_ip(_Req()) == CONNECTOR


def test_header_is_honoured_only_from_a_trusted_peer(monkeypatch):
    """Unit-level statement of the trust boundary."""
    from app.config import settings
    from app.client_ip import client_ip

    class _Req:
        def __init__(self, peer, header=None):
            self.headers = {"CF-Connecting-IP": header} if header else {}
            self.client = type("C", (), {"host": peer})

    monkeypatch.setattr(settings, "trusted_proxy_ips", [CONNECTOR])

    # Trusted peer, header present → header wins.
    assert client_ip(_Req(CONNECTOR, "203.0.113.7")) == "203.0.113.7"
    # Trusted peer, no header → fall back to the socket.
    assert client_ip(_Req(CONNECTOR)) == CONNECTOR
    # Untrusted peer, header present → header ignored.
    assert client_ip(_Req("8.8.8.8", "203.0.113.7")) == "8.8.8.8"
    # No peer at all (ASGI without a client scope) → stable sentinel.
    assert client_ip(_Req(None)) == "unknown"
