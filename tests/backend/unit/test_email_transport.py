"""SMTP transport hardening (SEC, 2026-09-07).

``smtplib.SMTP.starttls()`` called with no ``context`` gets a context that
neither verifies the certificate chain nor checks the hostname, so anyone
able to answer for the mail host reads every password-reset link, every
workspace invite link, and the SMTP login that follows on the next command.
This pins the explicit verified context so a future edit cannot quietly
drop it back to the permissive stdlib default.
"""
from __future__ import annotations

import ssl

import pytest


class _FakeSMTP:
    """Records what ``_send_smtp`` does to the connection."""

    instances: list["_FakeSMTP"] = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.starttls_calls: list[dict] = []
        self.logins: list[tuple[str, str]] = []
        self.sent: list[object] = []
        self.quit_called = False
        _FakeSMTP.instances.append(self)

    def starttls(self, *args, **kwargs):
        self.starttls_calls.append(kwargs)

    def login(self, user, password):
        self.logins.append((user, password))

    def send_message(self, msg):
        self.sent.append(msg)

    def quit(self):
        self.quit_called = True


@pytest.fixture
def fake_smtp(monkeypatch):
    from core import email as email_module

    _FakeSMTP.instances = []
    monkeypatch.setattr(email_module.smtplib, "SMTP", _FakeSMTP)
    return _FakeSMTP


def test_starttls_uses_a_verifying_context(monkeypatch, fake_smtp):
    from core import email as email_module

    monkeypatch.setattr(email_module.settings, "smtp_use_tls", True)
    monkeypatch.setattr(email_module.settings, "smtp_username", "")

    email_module._send_smtp(to="a@example.test", subject="hi", body="body")

    server = fake_smtp.instances[-1]
    assert len(server.starttls_calls) == 1
    context = server.starttls_calls[0]["context"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert server.sent and server.quit_called


def test_plaintext_transport_still_sends_without_starttls(monkeypatch, fake_smtp):
    """``SMTP_USE_TLS=false`` is a deliberate local/relay choice, unchanged."""
    from core import email as email_module

    monkeypatch.setattr(email_module.settings, "smtp_use_tls", False)
    monkeypatch.setattr(email_module.settings, "smtp_username", "")

    email_module._send_smtp(to="a@example.test", subject="hi", body="body")

    server = fake_smtp.instances[-1]
    assert server.starttls_calls == []
    assert server.sent
