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
        if len(taipei.get("results") or []) != 103:
            # 103 = the per-discipline progress plan in
            # ``simulator/tournament_sim/seed.py::_DEMO_LIVE_PROGRESS``:
            # MS 10, WS 20, MD 26, WD 31 (a completed draw), XD 16.
            raise SystemExit("Taipei must contain exactly 103 recorded results")
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
        page = owner.entry_page_projection(entries["T030"]["slug"])
        if page.status_code != 200:
            raise SystemExit("Korea public page projection is not readable")
    finally:
        owner.close()
        viewer.close()

    # The public person handles every downstream consumer needs. A surface
    # book, a browser test and a reviewer all want the same three things and
    # none of them should have to guess a UUID: one person whose profile URL
    # is a real page, one who is present but deliberately unpublished, and one
    # key that belongs to nobody at all.
    featured = (manifest.get("publicEntrants") or {}).get("featured") or {}
    korea_players = entries["T030"].get("entryPlayerIds") or {}
    taipei_players = entries["T029"].get("entryPlayerIds") or {}
    featured_name = featured.get("MS")
    player_key = korea_players.get(featured_name) if featured_name else None
    if not player_key:
        raise SystemExit("fixture has no featured published player on Korea")
    linked_key = taipei_players.get(featured_name)
    if not linked_key:
        raise SystemExit("featured player is not registered in both tournaments")
    withheld = entries["T030"].get("withheldPerson") or {}

    output = {
        "taipeiTid": taipei_id,
        "taipeiSlug": entries["T029"]["slug"],
        "koreaTid": korea_id,
        "koreaSlug": entries["T030"]["slug"],
        "displayToken": entries["T029"]["displayToken"],
        "viewerEmail": VIEWER_EMAIL,
        "viewerPassword": VIEWER_PASSWORD,
        "playerKey": player_key,
        "playerName": featured_name,
        # The SAME human, in the other workspace. Same entrant account, same
        # stored name, different ``entry_players`` row — which is exactly what
        # a cross-tournament profile history has to be built from.
        "linkedPlayerKey": linked_key,
        # Registered, then withdrawn: present in the draw, resolves to
        # "Player not published", and its profile URL is a real 404.
        "withheldPlayerKey": withheld.get("entryPlayerId"),
        # Well-formed and belongs to nobody — the other 404 branch.
        "missingPlayerKey": "00000000-0000-4000-8000-000000000000",
    }
    # Prove the three player handles above before anything downstream trusts
    # them: a fixture that merely *claims* a working profile URL is how the
    # missing-player finding survived a whole review cycle.
    probe = SimClient(args.base_url)
    try:
        slug = entries["T030"]["slug"]
        profile = probe.request(
            "GET", f"/e/api/page/{slug}/players/{player_key}", expect=(200,)
        ).json()
        if not profile.get("events"):
            raise SystemExit("featured player profile carries no events")
        for key, expected in (
            (output["withheldPlayerKey"], 404),
            (output["missingPlayerKey"], 404),
        ):
            if key is None:
                raise SystemExit("fixture is missing a withheld-player handle")
            probe.request(
                "GET", f"/e/api/page/{slug}/players/{key}", expect=(expected,)
            )
    finally:
        probe.close()

    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
