"""Real SMTP delivery without credentials in fixture logs or database reads."""
import re
import smtplib

import pytest

from simulator.tournament_sim.mailbox import MAX_MESSAGE_BYTES, capture_mail, wait_for_token


def test_fixture_receives_the_real_encoded_mail_in_memory(monkeypatch, caplog):
    from core import email as email_module

    with capture_mail() as mailbox:
        monkeypatch.setattr(email_module.settings, "email_backend", "smtp")
        monkeypatch.setattr(email_module.settings, "smtp_host", "127.0.0.1")
        monkeypatch.setattr(email_module.settings, "smtp_port", mailbox["smtpPort"])
        monkeypatch.setattr(email_module.settings, "smtp_use_tls", False)
        monkeypatch.setattr(email_module.settings, "smtp_username", "")
        with caplog.at_level("INFO"):
            for token in ("old-synthetic-token", "new-synthetic-token"):
                email_module.send_email(
                    to="synthetic@players.example.test", subject="Invitation — welcome",
                    body=f"Welcome\n/e/verify?token={token}\n",
                )
        assert wait_for_token(
            mailbox["url"], "synthetic@players.example.test", re.compile(r"token=([\w-]+)"),
        ) == "new-synthetic-token"
        with pytest.raises(AssertionError, match="not delivered"):
            wait_for_token(mailbox["url"], "other@example.test", re.compile(r"token=([\w-]+)"), timeout_s=0.1)
    assert "synthetic-token" not in caplog.text


def test_fixture_refuses_real_recipients_and_oversized_messages():
    with capture_mail() as mailbox:
        with smtplib.SMTP("127.0.0.1", mailbox["smtpPort"]) as smtp:
            with pytest.raises(smtplib.SMTPRecipientsRefused):
                smtp.sendmail("fixture@example.test", "person@example.org", "Subject: No\r\n\r\nprivate")
        smtp = smtplib.SMTP("127.0.0.1", mailbox["smtpPort"])
        try:
            with pytest.raises(smtplib.SMTPDataError) as error:
                smtp.sendmail("fixture@example.test", "person@example.test", "x" * (MAX_MESSAGE_BYTES + 1))
            assert error.value.smtp_code == 552
        finally:
            smtp.close()


def test_fixture_mailbox_reader_refuses_remote_servers():
    with pytest.raises(ValueError, match="loopback"):
        wait_for_token("https://example.org", "person@example.test", re.compile("token=(.*)"))
