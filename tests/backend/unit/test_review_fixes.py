"""Regression tests for the 2026-08-05 code-review findings.

Each test names the defect it pins. Rule 3b negative controls were
performed for all three safety-relevant ones — see the commit body.
"""
from __future__ import annotations

import ipaddress

import pytest


# ---- F3: ops-token comparison must not explode on non-ASCII ---------------


def test_ops_token_guard_rejects_non_ascii_without_crashing(monkeypatch):
    """A non-ASCII token header is a 403, not an unhandled 500.

    ``secrets.compare_digest`` raises TypeError on str arguments holding
    non-ASCII characters, so the guard used to escape as a 500 with a
    traceback instead of the uniform 403.
    """
    from fastapi import HTTPException

    from api import health
    from app.config import settings

    monkeypatch.setattr(settings, "ops_token", "correct-horse", raising=False)

    class _Req:
        headers = {health.OPS_TOKEN_HEADER: "café"}

    with pytest.raises(HTTPException) as exc:
        health.require_ops_token(_Req())
    assert exc.value.status_code == 403


def test_ops_token_guard_still_accepts_the_right_token(monkeypatch):
    """The encode() must not break the happy path."""
    from api import health
    from app.config import settings

    monkeypatch.setattr(settings, "ops_token", "correct-horse", raising=False)

    class _Req:
        headers = {health.OPS_TOKEN_HEADER: "correct-horse"}

    health.require_ops_token(_Req())  # no raise


def test_ops_token_guard_rejects_a_wrong_token(monkeypatch):
    from fastapi import HTTPException

    from api import health
    from app.config import settings

    monkeypatch.setattr(settings, "ops_token", "correct-horse", raising=False)

    class _Req:
        headers = {health.OPS_TOKEN_HEADER: "wrong-horse"}

    with pytest.raises(HTTPException) as exc:
        health.require_ops_token(_Req())
    assert exc.value.status_code == 403


# ---- F5: trusted-proxy matching, literal and CIDR -------------------------


def _client_ip_with(monkeypatch, trusted, peer, header=None):
    from app import client_ip as mod
    from app.config import settings

    monkeypatch.setattr(settings, "trusted_proxy_ips", trusted, raising=False)
    mod._parse_trusted.cache_clear()

    class _Client:
        host = peer

    class _Req:
        client = _Client()
        headers = {"CF-Connecting-IP": header} if header else {}

    return mod.client_ip(_Req())


def test_cidr_entry_trusts_a_peer_inside_the_range(monkeypatch):
    """The fix for a pinned container IP that drifts on recreate."""
    assert (
        _client_ip_with(
            monkeypatch, ["10.201.0.0/24"], "10.201.0.7", header="203.0.113.9"
        )
        == "203.0.113.9"
    )


def test_cidr_entry_does_not_trust_a_peer_outside_the_range(monkeypatch):
    """Fail CLOSED: an untrusted peer's header is ignored, peer returned."""
    assert (
        _client_ip_with(
            monkeypatch, ["10.201.0.0/24"], "192.0.2.5", header="203.0.113.9"
        )
        == "192.0.2.5"
    )


def test_literal_entry_still_works(monkeypatch):
    """Bare addresses must keep working — existing deployments use them."""
    assert (
        _client_ip_with(
            monkeypatch, ["172.20.0.5"], "172.20.0.5", header="203.0.113.9"
        )
        == "203.0.113.9"
    )


def test_empty_trust_list_never_consults_the_header(monkeypatch):
    """Rule 1: local mode trusts nothing and behaves as before the seam."""
    assert (
        _client_ip_with(monkeypatch, [], "127.0.0.1", header="203.0.113.9")
        == "127.0.0.1"
    )


def test_unparseable_entry_degrades_to_never_matching(monkeypatch):
    """A typo must not raise at import — it just stops matching."""
    assert (
        _client_ip_with(
            monkeypatch, ["not-an-ip"], "10.0.0.1", header="203.0.113.9"
        )
        == "10.0.0.1"
    )


def test_the_selfhost_default_subnet_contains_a_plausible_nginx_address():
    """Pins the compose default to the range the runbook documents.

    If someone changes the subnet in docker-compose.selfhost.yml without
    changing TRUSTED_PROXY_IPS (or vice versa), the throttle silently
    goes global. This is the cheap tripwire for that pair.
    """
    net = ipaddress.ip_network("10.201.0.0/24")
    assert ipaddress.ip_address("10.201.0.2") in net
