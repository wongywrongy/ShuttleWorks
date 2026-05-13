"""Repository layer — the only persistence boundary the routes touch.

Routes ``Depends(get_repository)`` and call sync methods on
``LocalRepository`` (or its future ``CloudRepository`` sibling, both
implementing the same protocols). The concrete repository swaps based on
``settings.database_url`` — no route knows whether it's hitting SQLite or
Postgres.
"""
from repositories.base import (
    InviteLinkRepository,
    MatchStateRepository,
    MemberRepository,
    TournamentBackupRepository,
    TournamentRepository,
)
from repositories.local import LocalRepository, get_repository, open_repository

__all__ = [
    "InviteLinkRepository",
    "LocalRepository",
    "MatchStateRepository",
    "MemberRepository",
    "TournamentBackupRepository",
    "TournamentRepository",
    "get_repository",
    "open_repository",
]
