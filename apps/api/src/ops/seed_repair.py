"""Direct-database repairs for fixture-seeded workspaces.

``simulator/tournament_sim`` seeds the demo deployment through the product's
own HTTP surface, and that is where every fixture repair belongs by default:
``python -m tournament_sim seed repair-names`` fixes the workspace title the
way an operator would. Two repairs cannot travel that road:

* **A checked-out workspace freezes its preparation copy.**
  ``PATCH /tournaments/{id}/setup/general`` answers ``409 CONFIG_LOCKED``
  (``require_pre_checkout_configuration_write``), so the Setup document's
  ``general.name`` / ``general.publicName`` — and ``config.tournamentName``,
  which is what would put the stale title *back* on the workspace row at the
  next state save — keep a title the repaired workspace no longer uses.
  (debt-log OPR-0908-2.)
* **An Operations ``matches`` row that no API path removes.**
  ``POST /bracket/assign`` materialises one; ``/bracket/unassign`` clears the
  court but also drops the plan slot, so a row created in error cannot be
  taken back out. (debt-log OPR-0908-8 — still open as a *product* gap; this
  module is the fixture-maintenance escape hatch, not the fix.)
* **``personId`` on roster rows seeded before the seed wrote it.**
  Additive backfill onto ``data["bracketPlayers"]`` (debt-log OPR-0908-9).

This module therefore opens the database directly, with the API's OWN models
and repository — not hand-written SQL — so every write goes through
``LocalRepository.tournaments.upsert_data`` and picks up its stamping,
denormalised-column sync and ``state_version`` bump for free.

It lives under ``ops/`` because ``ops`` is the operational package, is copied
into the API image (so ``docker compose exec backend python -m ops.seed_repair``
works where the demo Postgres has no published host port), and is the one
package nothing else imports.

**Scope is the seed manifest and nothing else.** Only workspaces a
``tournaments[*].workspaceId`` entry names are read or written; a workspace a
director authored by hand is invisible to every step here. Every step is
idempotent: a second run reports no change.

Usage (inside the API container)::

    python -m ops.seed_repair --manifest /app/data/import-runs/bwf-recent.json \\
        --include-locked \\
        --drop-match T029-MD-R16-<hash> \\
        --backfill-person-ids /app/data/import-runs/bwf-recent.person-map.json

With no step flag it reports what it WOULD touch and writes nothing.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Iterable, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from db.models import Command, Match, MatchState
from db.session import normalize_database_url
from repositories import LocalRepository


# The twin of ``simulator/tournament_sim/seed.py::canonical_tournament_name``.
# Reproduced rather than imported: the simulator is a dev tool that is not
# installed in the API image, and this module has to run inside it. Both
# strip exactly the same thing — a trailing parenthesised four-digit year —
# and ``test_seed_repair_tool.py`` pins the shared examples.
_YEAR_SUFFIX_RE = re.compile(r"\s*\((?:19|20)\d{2}\)\s*$")


def canonical_tournament_name(name: str) -> str:
    """Strip a trailing parenthesised fixture year from a tournament name."""
    return _YEAR_SUFFIX_RE.sub("", name).strip()


class SeedRepairError(RuntimeError):
    """A repair could not be attempted safely; nothing was written."""


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def load_manifest(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def manifest_workspaces(manifest: dict) -> dict[str, dict[str, str]]:
    """``{tournament code: {"workspaceId": uuid, "sourceName": str}}``.

    Entries without a workspace id (a reset run) are skipped rather than
    guessed at.
    """
    scoped: dict[str, dict[str, str]] = {}
    for code, entry in sorted((manifest.get("tournaments") or {}).items()):
        workspace_id = (entry or {}).get("workspaceId")
        if not workspace_id:
            continue
        source = (entry or {}).get("source") or {}
        scoped[code] = {
            "workspaceId": str(workspace_id),
            "sourceName": str(source.get("name") or ""),
        }
    return scoped


# ---------------------------------------------------------------------------
# Step 1 — the locked Setup title
# ---------------------------------------------------------------------------


def _setup_general(document: dict) -> Optional[dict]:
    setup = document.get("setup")
    if not isinstance(setup, dict):
        return None
    general = setup.get("general")
    if not isinstance(general, dict):
        return None
    data = general.get("data")
    return data if isinstance(data, dict) else None


def repair_locked_titles(
    repo: LocalRepository, scoped: dict[str, dict[str, str]], *, apply: bool = True
) -> dict:
    """Bring the frozen Setup copy of the title onto the canonical rule.

    Three fields carry a second copy of the workspace title:
    ``setup.general.data.name``, ``.publicName`` and ``config.tournamentName``.
    The last one is the dangerous one — ``upsert_data`` denormalises it back
    onto ``tournaments.name``, so leaving it stale would restore the suffix
    the workspace repair removed at the next state save.
    """
    repaired: list[dict[str, Any]] = []
    unchanged: list[str] = []
    missing: list[str] = []
    for code, entry in scoped.items():
        row = repo.tournaments.get_by_id(uuid.UUID(entry["workspaceId"]))
        if row is None:
            missing.append(code)
            continue
        canonical = canonical_tournament_name(row.name or entry["sourceName"] or "")
        if not canonical:
            unchanged.append(code)
            continue
        document = copy.deepcopy(row.data if isinstance(row.data, dict) else {})
        before: dict[str, str] = {}
        general = _setup_general(document)
        if general is not None:
            for field in ("name", "publicName"):
                if general.get(field) != canonical:
                    before[f"setup.general.{field}"] = general.get(field)
                    general[field] = canonical
        config = document.get("config")
        if isinstance(config, dict) and config.get("tournamentName") != canonical:
            before["config.tournamentName"] = config.get("tournamentName")
            config["tournamentName"] = canonical
        if not before:
            unchanged.append(code)
            continue
        if apply:
            repo.tournaments.upsert_data(uuid.UUID(entry["workspaceId"]), document)
        repaired.append(
            {
                "tournamentId": code,
                "workspaceId": entry["workspaceId"],
                "to": canonical,
                "from": before,
            }
        )
    return {"repaired": repaired, "unchanged": unchanged, "missingWorkspaces": missing}


# ---------------------------------------------------------------------------
# Step 2 — a stray Operations match row
# ---------------------------------------------------------------------------


def drop_matches(
    repo: LocalRepository,
    scoped: dict[str, dict[str, str]],
    match_ids: Iterable[str],
    *,
    apply: bool = True,
) -> dict:
    """Delete Operations ``matches`` rows by id, scoped to the manifest.

    A row that any command or match-state row references is REFUSED, not
    force-deleted: those are operator history, and a fixture repair does not
    get to rewrite it. Deleting a row that is already gone is a no-op, which
    is what makes a second run report nothing.
    """
    workspace_ids = [uuid.UUID(entry["workspaceId"]) for entry in scoped.values()]
    dropped: list[dict[str, str]] = []
    absent: list[str] = []
    refused: list[dict[str, Any]] = []
    for match_id in match_ids:
        rows = (
            repo.session.query(Match)
            .filter(Match.id == match_id, Match.tournament_id.in_(workspace_ids))
            .all()
        )
        if not rows:
            absent.append(match_id)
            continue
        for row in rows:
            commands = (
                repo.session.query(Command)
                .filter(
                    Command.tournament_id == row.tournament_id,
                    Command.match_id == match_id,
                )
                .count()
            )
            states = (
                repo.session.query(MatchState)
                .filter(
                    MatchState.tournament_id == row.tournament_id,
                    MatchState.match_id == match_id,
                )
                .count()
            )
            if commands or states:
                refused.append(
                    {
                        "matchId": match_id,
                        "workspaceId": str(row.tournament_id),
                        "commands": commands,
                        "matchStates": states,
                    }
                )
                continue
            if apply:
                repo.session.delete(row)
            dropped.append(
                {
                    "matchId": match_id,
                    "workspaceId": str(row.tournament_id),
                    "courtId": row.court_id,
                    "timeSlot": row.time_slot,
                }
            )
    if apply and dropped:
        repo.session.commit()
    return {"dropped": dropped, "absent": absent, "refused": refused}


# ---------------------------------------------------------------------------
# Step 3 — personId backfill
# ---------------------------------------------------------------------------


def backfill_person_ids(
    repo: LocalRepository,
    scoped: dict[str, dict[str, str]],
    person_map: dict,
    *,
    apply: bool = True,
) -> dict:
    """Write ``personId``/``personSource`` onto roster rows that lack them.

    The map is the seed's own reviewed player table
    (``python -m tournament_sim seed person-map``), keyed by the same
    canonical name the roster row stores. Purely additive: a row that already
    carries a ``personId`` is never re-keyed, and a name absent from the table
    is left alone rather than given an invented id.
    """
    people = person_map.get("people") or {}
    source = person_map.get("source") or ""
    if not people:
        raise SeedRepairError("person map carries no 'people' table")
    updated: list[dict[str, Any]] = []
    unchanged: list[str] = []
    missing: list[str] = []
    for code, entry in scoped.items():
        workspace_id = uuid.UUID(entry["workspaceId"])
        row = repo.tournaments.get_by_id(workspace_id)
        if row is None:
            missing.append(code)
            continue
        document = copy.deepcopy(row.data if isinstance(row.data, dict) else {})
        roster = document.get("bracketPlayers")
        if not isinstance(roster, list) or not roster:
            unchanged.append(code)
            continue
        written = 0
        unmatched = 0
        for player in roster:
            if not isinstance(player, dict) or player.get("personId"):
                continue
            person_id = people.get(str(player.get("name") or "").strip())
            if not person_id:
                unmatched += 1
                continue
            player["personId"] = person_id
            if source:
                player["personSource"] = source
            written += 1
        if not written:
            unchanged.append(code)
            continue
        if apply:
            repo.tournaments.upsert_data(workspace_id, document)
        updated.append(
            {
                "tournamentId": code,
                "workspaceId": entry["workspaceId"],
                "rosterRows": len(roster),
                "written": written,
                "withoutPersonId": unmatched,
            }
        )
    return {"updated": updated, "unchanged": unchanged, "missingWorkspaces": missing}


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------


def _session_factory(database_url: Optional[str]):
    if database_url:
        engine = create_engine(normalize_database_url(database_url), future=True)
        return sessionmaker(bind=engine, autoflush=False, future=True)
    # No override: use the API's own engine, which resolves DATABASE_URL /
    # DATABASE_URL_FILE exactly the way the running service does.
    from db.session import SessionLocal

    return SessionLocal


def run(
    *,
    manifest_path: Path,
    database_url: Optional[str] = None,
    include_locked: bool = False,
    drop_match_ids: Iterable[str] = (),
    person_map_path: Optional[Path] = None,
    apply: bool = True,
    session: Optional[Session] = None,
) -> dict:
    """Run the requested steps against one manifest and return a report."""
    manifest = load_manifest(manifest_path)
    scoped = manifest_workspaces(manifest)
    report: dict[str, Any] = {
        "seedKey": manifest.get("seedKey"),
        "manifest": str(manifest_path),
        "workspaces": len(scoped),
        "applied": bool(apply),
    }
    drop_ids = list(drop_match_ids)
    owned = session is None
    db = session or _session_factory(database_url)()
    try:
        repo = LocalRepository(db)
        if include_locked:
            report["lockedTitles"] = repair_locked_titles(repo, scoped, apply=apply)
        if drop_ids:
            report["droppedMatches"] = drop_matches(repo, scoped, drop_ids, apply=apply)
        if person_map_path is not None:
            report["personIds"] = backfill_person_ids(
                repo,
                scoped,
                load_manifest(Path(person_map_path)),
                apply=apply,
            )
    finally:
        if owned:
            db.close()
    return report


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ops.seed_repair",
        description="Manifest-scoped database repairs for fixture-seeded workspaces",
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="the seed run manifest (e.g. /app/data/import-runs/bwf-recent.json)",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="override the API's own DATABASE_URL (tests, offline copies)",
    )
    parser.add_argument(
        "--include-locked",
        action="store_true",
        help="repair the Setup/config copy of the title on CONFIG_LOCKED workspaces",
    )
    parser.add_argument(
        "--drop-match",
        action="append",
        default=[],
        metavar="MATCH_ID",
        help="delete one Operations matches row by id; repeatable",
    )
    parser.add_argument(
        "--backfill-person-ids",
        default=None,
        metavar="PERSON_MAP_JSON",
        help="write personId onto roster rows from a seed person map",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change and write nothing",
    )
    args = parser.parse_args(argv)
    report = run(
        manifest_path=Path(args.manifest),
        database_url=args.database_url,
        include_locked=args.include_locked,
        drop_match_ids=args.drop_match,
        person_map_path=(
            Path(args.backfill_person_ids) if args.backfill_person_ids else None
        ),
        apply=not args.dry_run,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
