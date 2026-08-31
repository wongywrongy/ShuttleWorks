"""Finish the canonical T029/T030 browser fixture through public APIs only."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from tournament_sim.client import SimClient

VIEWER_EMAIL = "console-viewer@example.test"
VIEWER_PASSWORD = "FixtureOnly!2026-aZ"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("status") != "complete":
        raise SystemExit("seed manifest is not complete")
    if set(manifest.get("selectedTournamentIds") or []) != {"T029", "T030"}:
        raise SystemExit("fixture must be selected from exactly T029 and T030")
    entries = manifest.get("tournaments") or {}
    if set(entries) != {"T029", "T030"}:
        raise SystemExit("seed manifest contains workspaces outside T029/T030")

    taipei_id = entries["T029"]["workspaceId"]
    korea_id = entries["T030"]["workspaceId"]
    owner = SimClient(args.base_url)
    viewer = SimClient(args.base_url)
    try:
        owner_rows = owner.list_tournaments()
        if {row["id"] for row in owner_rows} != {taipei_id, korea_id}:
            raise SystemExit("fresh fixture database does not contain exactly the canonical workspaces")

        taipei = owner.get_bracket(taipei_id)
        korea = owner.get_bracket(korea_id)
        if taipei.get("courts") != 6:
            raise SystemExit(f"Taipei must have six courts, got {taipei.get('courts')!r}")
        if len(taipei.get("play_units") or []) != 155:
            raise SystemExit("Taipei must contain the complete 155-match draw")
        if len(taipei.get("results") or []) != 50:
            raise SystemExit("Taipei must contain exactly 50 completed opening matches")
        if len(korea.get("play_units") or []) != 155:
            raise SystemExit("Korea must contain the complete 155-match draw")
        if korea.get("results"):
            raise SystemExit("Korea is upcoming and must not contain played results")

        invite = owner.create_invite(taipei_id, "viewer", VIEWER_EMAIL)
        viewer.register(VIEWER_EMAIL, VIEWER_PASSWORD, "Console Fixture Viewer")
        accepted = viewer.accept_invite(invite["token"])
        if accepted.get("role") != "viewer" or accepted.get("tournamentId") != taipei_id:
            raise SystemExit("viewer invite did not produce the intended membership")
        viewer_rows = viewer.list_tournaments()
        if len(viewer_rows) != 1 or viewer_rows[0].get("id") != taipei_id:
            raise SystemExit("viewer identity must see Taipei and no other workspace")
        if viewer_rows[0].get("role") != "viewer":
            raise SystemExit("viewer workspace list did not report a viewer role")
    finally:
        owner.close()
        viewer.close()

    output = {
        "taipeiTid": taipei_id,
        "koreaTid": korea_id,
        "displayToken": entries["T029"]["displayToken"],
        "viewerEmail": VIEWER_EMAIL,
        "viewerPassword": VIEWER_PASSWORD,
    }
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
