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
import logging
import smtplib

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


def test_console_transport_never_logs_message_fields(monkeypatch, caplog):
    from core import email as email_module

    monkeypatch.setattr(email_module.settings, "email_backend", "console")
    with caplog.at_level("INFO", logger="scheduler.email"):
        email_module.send_email(
            to="sentinel-recipient@example.test",
            subject="sentinel-subject",
            body="Reset link: /reset?token=sentinel-bearer",
        )
    for private in ("sentinel-recipient", "sentinel-subject", "sentinel-bearer"):
        assert private not in caplog.text
    assert "email delivery skipped" in caplog.text


def test_smtp_failure_does_not_leak_provider_response_in_caller_logs(monkeypatch, caplog):
    from core import email as email_module

    def fail(**kwargs):
        raise smtplib.SMTPDataError(550, b"private-provider-response-token")

    monkeypatch.setattr(email_module.settings, "email_backend", "smtp")
    monkeypatch.setattr(email_module, "_send_smtp", fail)
    with caplog.at_level("ERROR"):
        try:
            email_module.send_email(to="person@example.test", subject="hello", body="body")
        except RuntimeError:
            logging.getLogger("test.mail_caller").exception("mail failed")
        except smtplib.SMTPDataError:
            logging.getLogger("test.mail_caller").exception("mail failed")
    assert "mail failed" in caplog.text
    assert "private-provider-response-token" not in caplog.text
