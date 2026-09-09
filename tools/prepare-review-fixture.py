"""Add the optional, real Meet review workspace to a disposable fixture.

The canonical seed intentionally contains only Bracket workspaces.  This
small follow-up creates one Meet workspace through the public API and writes
the server-issued workspace/invite handles into ``fixture.json``.  It is
safe to run only against the disposable fixture started by
``tools/fixture-up.sh``; it never targets the long-lived demo database.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

from tournament_sim.client import SimClient
from tournament_sim.demo_data import WORKSPACES, make_meet_blob

MEET_SPEC = next(spec for spec in WORKSPACES if spec["key"] == "fk-junior-league")
MEET_NAME = "F&K Junior League Summer 2026"
MEET_DATE = "2026-07-31"
MEET_END_DATE = "2026-08-01"
MEET_TIME_ZONE = "America/Los_Angeles"
INVITE_EMAIL = "meet-review-viewer@example.test"
FEATURED_EMAIL = "featured.singles@players.example.test"
FEATURED_PASSWORD = "FixtureOnly!2026-aZ"
TOKEN_RE = re.compile(r"/e/verify\?token=([A-Za-z0-9_-]+)")
PARTNER_RE = re.compile(r"/e/partner/([A-Za-z0-9_-]+)")
RESET_RE = re.compile(r"/e/reset\?token=([A-Za-z0-9_-]+)")


def _mail_token(api_log: Path, email: str, pattern: re.Pattern[str]) -> str | None:
    if not api_log.exists():
        return None
    text = api_log.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"(?=email \(console backend\))", text)
    for block in reversed(blocks):
        if f"To: {email}" not in block:
            continue
        match = pattern.search(block)
        if match:
            return match.group(1)
    return None


def _wait_mail_token(api_log: Path, email: str, pattern: re.Pattern[str]) -> str:
    for _ in range(30):
        token = _mail_token(api_log, email, pattern)
        if token:
            return token
        time.sleep(0.1)
    raise SystemExit(f"no mailed token for {email} in {api_log}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--api-log", type=Path, required=True)
    args = parser.parse_args()

    seed_manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if seed_manifest.get("status") != "complete":
        raise SystemExit("seed manifest is not complete")
    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    if fixture.get("fixtureMode", "normal") != "normal":
        raise SystemExit("Meet review workspace belongs only in normal fixture mode")

    client = SimClient(args.base_url)
    try:
        # Review books need both an empty past-workspace inspector and a real
        # backup to expose the inspection/restore-confirmation controls.
        if not fixture.get("pastTid"):
            past = client.create_tournament(
                "Past workspace review", kind="meet",
                tournament_date="2026-07-01", tournament_end_date="2026-07-02",
                time_zone="UTC",
            )
            fixture["pastTid"] = str(past["id"])
        if not fixture.get("reviewBackupFilename"):
            backup = client.request(
                "POST", f"/tournaments/{fixture['taipeiTid']}/state/backup",
                expect={200, 201},
            ).json()
            fixture["reviewBackupFilename"] = backup["filename"]
        existing = fixture.get("meetTid")
        if existing:
            row = client.request("GET", f"/tournaments/{existing}", expect={200}).json()
            if row.get("kind") != "meet":
                raise SystemExit("fixture meetTid points to a non-Meet workspace")
            meet_id = existing
        else:
            spec = {**MEET_SPEC, "date": MEET_DATE, "name": MEET_NAME}
            workspace = client.create_tournament(
                MEET_NAME,
                kind="meet",
                modules=[
                    {"moduleId": "meet", "status": "enabled"},
                    {"moduleId": "display", "status": "enabled"},
                ],
                tournament_date=MEET_DATE,
                tournament_end_date=MEET_END_DATE,
                time_zone=MEET_TIME_ZONE,
            )
            meet_id = str(workspace["id"])
            blob, _ratings = make_meet_blob(2026, spec)
            client.put_state(meet_id, blob)

        invite = fixture.get("meetInviteToken")
        if not invite:
            invite = client.create_invite(meet_id, "viewer", INVITE_EMAIL)["token"]

        # Read back both contracts before publishing handles.  A UUID in a
        # JSON file is not evidence that the Meet is usable.
        state = client.get_state(meet_id)
        if not state or not (state.get("matches") or state.get("players")):
            raise SystemExit("Meet workspace has no seeded state")

        # Use the seeded featured account and its real confirmation mail. The
        # account is already registered by seed.py, so this creates no junk
        # identity and proves the receipt flow against the real entry page.
        entrant = SimClient(args.base_url)
        try:
            entrant.entrant_login(FEATURED_EMAIL, FEATURED_PASSWORD)
            account = entrant.entrant_me()
            if not account.get("emailVerified", False):
                token = _wait_mail_token(args.api_log, FEATURED_EMAIL, TOKEN_RE)
                entrant._prove_csrf()  # noqa: SLF001 — cookie write mirrors a browser form
                entrant.request("POST", "/e/account/verify", json={"token": token}, expect={204})
            # Keep a real, single-use reset token for the reset form capture.
            # Do not consume it here: the browser state sheet needs to show
            # the server-rendered valid-token form.
            if not fixture.get("resetToken"):
                entrant._prove_csrf()  # noqa: SLF001 — authenticated write
                entrant.request(
                    "POST",
                    "/e/account/request-password-reset",
                    json={"email": FEATURED_EMAIL},
                    expect={202},
                )
                fixture["resetToken"] = _wait_mail_token(args.api_log, FEATURED_EMAIL, RESET_RE)
            if not fixture.get("submissionId") or not fixture.get("partnerToken"):
                page = entrant.entry_page_projection(fixture["koreaSlug"]).json()
                event = next(item for item in page.get("events", []) if item.get("code") == "XD")
                submit = entrant.submit_entry(
                    fixture["koreaSlug"],
                    [
                        ("playerName", fixture["playerName"]),
                        ("gender", "M"),
                        ("events", f"0:{event['id']}"),
                        (f"partner:0:{event['id']}", "featured.doubles@players.example.test"),
                        ("acknowledged", "on"),
                    ],
                )
                location = submit.headers.get("location", "")
                receipt_match = re.search(r"/receipt/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})", location)
                if receipt_match is None:
                    raise SystemExit(f"entry submission did not return a receipt: {location!r}")
                fixture["submissionId"] = receipt_match.group(1)
                fixture["partnerToken"] = _wait_mail_token(
                    args.api_log, "featured.doubles@players.example.test", PARTNER_RE
                )
        finally:
            entrant.close()
    finally:
        client.close()

    fixture["meetTid"] = meet_id
    fixture["meetInviteToken"] = invite
    fixture["reviewEntrantEmail"] = FEATURED_EMAIL
    fixture["reviewEntrantPassword"] = FEATURED_PASSWORD
    args.fixture.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
