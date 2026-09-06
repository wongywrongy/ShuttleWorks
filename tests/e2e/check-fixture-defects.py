"""Assert the states ``tools/fixture-defects.py`` and
``tools/fixture-defects-db.py`` reconstruct, via reads through the same
public HTTP API they wrote through (or, for the DB-defects half, through
the ORM only to write — never to read back here; this script proves the
state through the same API surfaces a real reviewer would use).

Verifies:

  (d) T030 has an entry with a single player and ``awaiting_partner`` among
      its pending reasons.
  (f) T030 has at least one recorded result with a 3-set (deciding-game)
      score.
  (g) T030's entry page has ``entrantsPublished: true`` and
      ``resultsPublished: false``.
  (a) T029 has two play units both showing ``status: "live"`` with
      ``court: null`` on the public schedule (the double-current conflict
      suppression in ``entries_site.py::_merge_live_bracket_courts``).
  (b) T029 has a play unit with a known ``scheduledTime`` and ``court: null``
      while not live — see ``tools/fixture-defects-db.py``'s docstring for
      why this needs no reconstruction (it is this fixture's default state
      for a not-yet-live scheduled unit) and is asserted here anyway so a
      regression in that default would be caught.
  (c) T029's ``courtNoTime`` play unit shows a non-null ``court`` on the
      public schedule (verifying ``matches.court_id`` is read independently
      of the bracket plan) — deliberately NOT asserting the schedule time is
      absent, because it is not: see the module docstring on why "no time"
      cannot be produced on this fixture's public schedule at all.
  (e) T029's bracket state has the recorded ``unresolvedPredecessorScheduled``
      play unit with an assignment (a scheduled court/slot) while its
      recorded feeder id carries no entry in ``results``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tournament_sim.client import SimClient


def _schedule_items(client: SimClient, slug: str) -> list[dict]:
    resp = client.request("GET", f"/e/api/page/{slug}/matches?page_size=100")
    return resp.json().get("items", [])


def _find_schedule_item(items: list[dict], play_unit_id: str) -> dict | None:
    # matchKey is "{eventCode}:{playUnitId}"; play_unit_id itself embeds the
    # event code as its second "-"-separated segment (e.g.
    # "T029-MD-R32-<hash>" -> "MD"), so derive the key rather than assume one.
    event_code = play_unit_id.split("-")[1] if "-" in play_unit_id else ""
    key = f"{event_code}:{play_unit_id}"
    return next((m for m in items if m.get("matchKey") == key), None)


def check(base_url: str, fixture: dict) -> list[str]:
    problems: list[str] = []
    korea_id = fixture["koreaTid"]
    taipei_id = fixture["taipeiTid"]
    taipei_slug = fixture.get("taipeiSlug") or "2026-taipei-open-t029"
    defects = fixture.get("defects") or {}
    db_defects = fixture.get("dbDefects") or {}

    client = SimClient(base_url)
    try:
        # (d) incomplete doubles pair
        entries = client.list_entries(korea_id)
        incomplete = [
            e
            for e in entries
            if e.get("entryEventId") == (defects.get("incompleteDoublesPair") or {}).get("entryEventId")
            and "awaiting_partner" in (e.get("pendingReasons") or [])
        ]
        if not incomplete:
            problems.append(
                "(d) expected an entry with pendingReasons including "
                "'awaiting_partner' on the fixture-defects MD event; found none"
            )

        # (f) deciding-game result
        bracket = client.get_bracket(korea_id)
        deciding_game = [
            r for r in bracket.get("results", []) if len(((r.get("score") or {}).get("sets")) or []) == 3
        ]
        if not deciding_game:
            problems.append("(f) expected at least one recorded 3-set result on T030; found none")

        # (g) publication flags
        page = client.request("GET", f"/tournaments/{korea_id}/entry-page").json()
        if not page.get("entrantsPublished"):
            problems.append("(g) expected T030 entrantsPublished=true")
        if page.get("resultsPublished"):
            problems.append("(g) expected T030 resultsPublished=false")

        if not db_defects:
            problems.append(
                "(a)/(b)/(c)/(e) expected fixture.json to carry a 'dbDefects' "
                "section written by tools/fixture-defects-db.py; found none"
            )
        else:
            items = _schedule_items(client, taipei_slug)

            # (a) double-current conflict: both play units live, both
            # suppressed to court: null.
            conflict = db_defects.get("doubleCurrentConflicts") or {}
            for play_unit_id in conflict.get("playUnitIds") or []:
                match = _find_schedule_item(items, play_unit_id)
                if match is None:
                    problems.append(f"(a) expected {play_unit_id} on the public schedule; not found")
                elif match.get("status") != "live" or match.get("court") is not None:
                    problems.append(
                        f"(a) expected {play_unit_id} live with a suppressed (null) court; "
                        f"got status={match.get('status')!r} court={match.get('court')!r}"
                    )

            # (b) approved slot, no court: known time, not live, no court.
            approved = db_defects.get("approvedSlotNoCourt") or {}
            play_unit_id = approved.get("playUnitId")
            if play_unit_id:
                match = _find_schedule_item(items, play_unit_id)
                if match is None:
                    problems.append(f"(b) expected {play_unit_id} on the public schedule; not found")
                elif match.get("scheduledTime") is None or match.get("court") is not None:
                    problems.append(
                        f"(b) expected {play_unit_id} to have a scheduledTime and no court; "
                        f"got scheduledTime={match.get('scheduledTime')!r} court={match.get('court')!r}"
                    )

            # (c) a court on the public schedule where matches.court_id was
            # written directly (the "no time" half is not observable on this
            # fixture's public schedule — see the module docstring).
            court_no_time = db_defects.get("courtNoTime") or {}
            play_unit_id = court_no_time.get("playUnitId")
            if play_unit_id:
                match = _find_schedule_item(items, play_unit_id)
                if match is None:
                    problems.append(f"(c) expected {play_unit_id} on the public schedule; not found")
                elif match.get("court") is None:
                    problems.append(
                        f"(c) expected {play_unit_id} to show a non-null court; got None"
                    )

            # (e) an R16 (or later) unit scheduled while its recorded feeder
            # has no result.
            unresolved = db_defects.get("unresolvedPredecessorScheduled") or {}
            successor_id = unresolved.get("r16PlayUnitId")
            feeder_id = unresolved.get("unresolvedR32FeederId")
            if successor_id and feeder_id:
                taipei_bracket = client.get_bracket(taipei_id)
                assignments_by_id = {
                    a["play_unit_id"]: a for a in taipei_bracket.get("assignments", [])
                }
                results_by_id = {r["play_unit_id"] for r in taipei_bracket.get("results", [])}
                if successor_id not in assignments_by_id:
                    problems.append(
                        f"(e) expected {successor_id} to carry a bracket_session assignment "
                        "(scheduled); found none"
                    )
                if feeder_id in results_by_id:
                    problems.append(
                        f"(e) expected feeder {feeder_id} to have NO recorded result; it has one"
                    )
    finally:
        client.close()

    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    problems = check(args.base_url, fixture)
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}", file=sys.stderr)
        return 1
    print("fixture defects (a), (b), (c), (d), (e), (f), (g): verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
