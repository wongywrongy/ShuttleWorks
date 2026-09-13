"""Append canonical changes to the existing authority-bound operation log."""

import uuid
from core.dependencies import LOCAL_DEV_USER_UUID
from db.models import Tournament
from competition.checkpoint import export_slice


def emit(session, tournament_id, *, actor_id=None):
    from sync.service import append_local_operation, _active_authority

    authority = _active_authority(session, tournament_id)
    if authority is None:
        return
    session.flush()
    node_id = authority.node_id
    row = session.get(Tournament, tournament_id)
    append_local_operation(
        session,
        tournament_id=tournament_id,
        node_id=node_id,
        actor_id=uuid.UUID(str(actor_id)) if actor_id else LOCAL_DEV_USER_UUID,
        command_type="competition.replace.v1",
        aggregate_type="competition",
        aggregate_id=str(tournament_id),
        payload={
            "competition": export_slice(session, tournament_id),
            "players": (row.data or {}).get("players", []),
            "bracketPlayers": (row.data or {}).get("bracketPlayers", []),
        },
        expected_version=None,
    )
