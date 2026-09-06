"""Assert the states ``tools/fixture-defects.py`` reconstructs, via reads
through the same public HTTP API it wrote through — no direct DB access.

Verifies exactly the states that script actually produces (see its
docstring for the four it deliberately does not, and why):

  (d) T030 has an entry with a single player and ``awaiting_partner`` among
      its pending reasons.
  (f) T030 has at least one recorded result with a 3-set (deciding-game)
      score.
  (g) T030's entry page has ``entrantsPublished: true`` and
      ``resultsPublished: false``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tournament_sim.client import SimClient


def check(base_url: str, fixture: dict) -> list[str]:
    problems: list[str] = []
    korea_id = fixture["koreaTid"]
    defects = fixture.get("defects") or {}

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
    print("fixture defects (d), (f), (g): verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
