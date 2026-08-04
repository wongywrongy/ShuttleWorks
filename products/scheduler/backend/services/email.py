"""Email delivery seam (SP-CLOUD-2 Phase 3).

Email is a seam, not a dependency (Rule 3): local mode must never need
a mail provider. Two backends behind one function:

- ``console`` — logs the message (local mode default, tests). The solo
  operator never configures anything.
- ``smtp``    — generic SMTP via stdlib ``smtplib`` (cloud,
  env-configured). No provider SDKs; provider choice is a Track B
  concern.

Messages are plain text on purpose — templating polish is a non-goal.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("scheduler.email")


def send_email(*, to: str, subject: str, body: str) -> None:
    """Deliver one message via the configured backend.

    Raises on SMTP failure — callers decide whether delivery is
    load-bearing (invite create surfaces it; reset stays silent to
    avoid an account oracle).
    """
    if settings.email_backend == "smtp":
        _send_smtp(to=to, subject=subject, body=body)
    else:
        # Console backend: the full message goes to the server log.
        # This is how local invite/reset flows are exercised end-to-end
        # (the round-trip script greps for it) without any mail infra.
        log.info(
            "email (console backend)\nTo: %s\nSubject: %s\n\n%s", to, subject, body
        )


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
        server.starttls()
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    try:
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
    finally:
        server.quit()
