"""Email delivery seam (SP-CLOUD-2 Phase 3).

Email is a seam, not a dependency (Rule 3): local mode must never need
a mail provider. Two backends behind one function:

- ``console`` — logs the message (local mode default, tests). The solo
  operator never configures anything.
- ``smtp``    — generic SMTP via stdlib ``smtplib`` (cloud,
  env-configured). No provider SDKs; provider choice is a Track B
  concern.

Messages are plain text on purpose — templating polish is a non-goal.

**Header safety (SP-SEC-1 Phase 2, SEC-09).** Callers interpolate
user-controlled text into the subject — the invite subject carries the
workspace name, which any owner types. Python's ``email.policy.default``
already refuses to *store* a header containing CR or LF, so forging a
``Bcc:`` was never possible; what actually happened was a ``ValueError``
escaping as an unhandled 500, after the invite row had been written.

So the fix is not "make injection impossible" — the stdlib does that. It
is to stop resting a security property on an undocumented library
behaviour nothing pinned, and to stop a punctuation choice in a workspace
name from breaking invites. ``_header_safe`` flattens line breaks before
they reach the header; ``tests/test_derived_output_encoding.py`` pins
both halves — the payload is neutralized, and it does not raise.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from core.config import settings
from core.telemetry.instruments import start_span

log = logging.getLogger("scheduler.email")

# Everything RFC 5322 treats as a line break, plus the lone characters
# some agents fold on. Replaced with a space rather than removed so
# "Spring\nChampionship" stays readable instead of becoming one word.
_HEADER_BREAKS = ("\r\n", "\r", "\n", "\v", "\f", " ", " ")

# Subjects longer than this are truncated rather than folded. Long
# headers are a delivery problem, not a security one, but a workspace
# name is already bounded at 200 and nothing legitimate needs more.
_MAX_SUBJECT = 400


def _header_safe(value: str, *, limit: int = _MAX_SUBJECT) -> str:
    """Flatten a value so it cannot escape its header line."""
    for token in _HEADER_BREAKS:
        value = value.replace(token, " ")
    value = value.strip()
    if len(value) > limit:
        value = value[: limit - 1].rstrip() + "…"
    return value


def send_email(*, to: str, subject: str, body: str) -> None:
    """Deliver one message via the configured backend.

    Raises on SMTP failure — callers decide whether delivery is
    load-bearing (invite create surfaces it; reset stays silent to
    avoid an account oracle).

    ``subject`` is sanitized here rather than at each call site: this is
    the one place every message passes through, and a caller that forgets
    is exactly the failure this is meant to prevent.
    """
    subject = _header_safe(subject)
    if settings.email_backend == "smtp":
        with start_span(
            "email.send",
            kind="client",
            attributes={"shuttleworks.email.transport": "smtp"},
        ) as span:
            try:
                _send_smtp(to=to, subject=subject, body=body)
            except Exception:
                span.set_attribute("shuttleworks.email.outcome", "error")
                raise
            span.set_attribute("shuttleworks.email.outcome", "success")
    else:
        # Console backend: the full message goes to the server log.
        # This is how local invite/reset flows are exercised end-to-end
        # (the round-trip script greps for it) without any mail infra.
        log.info(
            "email (console backend)\nTo: %s\nSubject: %s\n\n%s", to, subject, body
        )


def _tls_context() -> ssl.SSLContext:
    """Verified TLS for STARTTLS (SEC, 2026-09-07).

    ``smtplib``'s ``starttls()`` with no ``context`` builds one that does
    **not** verify the certificate chain and does **not** check the
    hostname — the connection is encrypted against a passive listener and
    wide open to anyone who can answer for the mail host. Everything this
    seam carries is credential material: password-reset links, workspace
    invite links, and the SMTP login itself on the very next command. So
    the context is explicit here rather than left to the stdlib default,
    which is permissive precisely because it cannot know that.

    ``ssl.create_default_context()`` is CERT_REQUIRED + hostname checking
    against the system trust store; a mail host with a private CA is
    configured by pointing ``SSL_CERT_FILE``/``SSL_CERT_DIR`` at it, not
    by weakening this.
    """
    return ssl.create_default_context()


def _send_smtp(*, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if settings.smtp_use_tls:
        server: smtplib.SMTP = smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=15
        )
        server.starttls(context=_tls_context())
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    try:
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
    finally:
        server.quit()
