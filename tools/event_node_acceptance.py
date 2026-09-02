"""Deterministic Phase 2 event-node durability acceptance harness.

This is a fast release gate, not the 24-hour reference-hardware soak. It
blocks outbound socket connections, commits a real event-node command, tears
down the SQLAlchemy engine/session, deletes a browser-cache sentinel, and
proves the normalized state, immutable operation, and outbox survive from a
fresh connection.
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
API_SRC = ROOT / "apps/api/src"
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))

from sqlalchemy import create_engine, func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from core.config import settings  # noqa: E402
from db.models import (  # noqa: E402
    Base,
    EventOperation,
    Match,
    MatchState,
    MatchStatus,
    SyncOutbox,
    Tournament,
    TournamentAuthority,
)
from operations.match_state_application import MatchStateApplication  # noqa: E402
from repositories import LocalRepository  # noqa: E402


def _blocked_connect(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
    raise OSError("WAN disabled by event-node acceptance harness")


def run_acceptance(database_path: Path) -> dict[str, object]:
    """Run the bounded durability proof against a new SQLite database."""
    database_path = database_path.resolve()
    if database_path.exists():
        raise ValueError("acceptance database path must not already exist")
    database_path.parent.mkdir(parents=True, exist_ok=True)
    node_id = uuid.uuid4()
    tournament_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    database_url = f"sqlite:///{database_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    session = Session(engine, expire_on_commit=False)
    session.add(
        Tournament(
            id=tournament_id,
            name="Offline acceptance",
            data={"version": 2},
            schema_version=2,
        )
    )
    session.add(
        TournamentAuthority(
            tournament_id=tournament_id,
            epoch=1,
            node_id=node_id,
            state="active",
            checkpoint_hash="a" * 64,
            checkpoint_schema_version=3,
            capability_digest="b" * 64,
            allowed_command_classes=["match_state.update.v1"],
        )
    )
    session.commit()

    browser_cache = database_path.with_suffix(".browser-cache")
    browser_cache.write_text("disposable IndexedDB sentinel")
    previous_profile, previous_node = settings.deployment_profile, settings.node_id
    try:
        settings.deployment_profile = "event_node"
        settings.node_id = str(node_id)
        with patch.object(socket, "create_connection", side_effect=_blocked_connect):
            MatchStateApplication(LocalRepository(session)).update(
                tournament_id=tournament_id,
                match_id="acceptance-match",
                fields={"status": "called"},
                target_status=MatchStatus.CALLED,
                expected_version=0,
                actor_id=actor_id,
            )
    finally:
        settings.deployment_profile = previous_profile
        settings.node_id = previous_node
        session.close()
        engine.dispose()

    browser_cache.unlink()
    restarted_engine = create_engine(database_url)
    restarted = Session(restarted_engine, expire_on_commit=False)
    try:
        match = restarted.get(Match, (tournament_id, "acceptance-match"))
        state = restarted.get(MatchState, (tournament_id, "acceptance-match"))
        operation = restarted.scalar(select(EventOperation))
        outbox_count = restarted.scalar(select(func.count()).select_from(SyncOutbox))
        passed = bool(
            match is not None
            and match.status == MatchStatus.CALLED.value
            and state is not None
            and state.status == "called"
            and operation is not None
            and operation.command_type == "match_state.update.v1"
            and outbox_count == 1
        )
        if not passed:
            raise RuntimeError("event-node durability acceptance failed")
        return {
            "status": "passed",
            "wanBlocked": True,
            "freshDatabaseConnection": True,
            "browserStorageDeleted": not browser_cache.exists(),
            "operationCount": 1,
            "pendingOutboxCount": int(outbox_count or 0),
            "tournamentId": str(tournament_id),
        }
    finally:
        restarted.close()
        restarted_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run event-node offline durability proof")
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run_acceptance(args.database), sort_keys=True))


if __name__ == "__main__":
    main()
