"""Per-workspace module control plane (workspace-modules sub-project #1).

Additive routes under ``/tournaments/{tournament_id}/modules`` that read
and mutate first-class ``workspace_modules`` rows. The rows are seeded
lazily from the legacy ``kind`` (``derive_modules``) the first time any
path touches a workspace's modules, so a fresh tournament and an existing
one converge without depending on the Alembic backfill.

The dependency / no-data-loss rules live here on the PATCH path; the
repository's ``modules.update`` is deliberately unguarded so the route is
the single place those rules are enforced.
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel

from app.dependencies import require_tournament_access
from app.error_codes import ErrorCode, http_error
from app.schemas import WorkspaceModuleDTO
from database.models import (
    MODULE_STATUSES,
    OPERATIONAL_MODULES,
    WorkspaceModule,
)
from repositories import LocalRepository, get_repository

router = APIRouter(prefix="/tournaments", tags=["workspace-modules"])
log = logging.getLogger("scheduler.workspace_modules")

# Allowed status transitions (excluding config-only no-ops). ``coming_soon``
# is immutable and never appears on either side. Setting a status to
# ``available`` is not an operator-driven transition — only the derived
# seed produces it.
_ALLOWED_TRANSITIONS = frozenset(
    {
        ("available", "enabled"),
        ("enabled", "disabled"),
        ("disabled", "enabled"),
    }
)


class WorkspaceModulePatchDTO(BaseModel):
    """Body of ``PATCH /tournaments/{id}/modules/{moduleId}``.

    Both fields optional; ``exclude_unset`` at the call site means an
    omitted field is left untouched (no-data-loss). ``status`` must be a
    member of the module status vocabulary; ``config`` replaces the
    module's settings blob.
    """
    status: Optional[str] = None
    config: Optional[dict] = None


def _resolve_modules(
    tournament_id: uuid.UUID,
    repo: LocalRepository,
) -> list[WorkspaceModule]:
    """Resolve a workspace + its (lazily-seeded) module rows, or 404."""
    tournament = repo.tournaments.get_by_id(tournament_id)
    if tournament is None:
        raise http_error(
            404,
            ErrorCode.STATE_CORRUPT,
            f"tournament not found: {tournament_id}",
        )
    return repo.modules.ensure_modules(tournament)


@router.get(
    "/{tournament_id}/modules",
    response_model=List[WorkspaceModuleDTO],
    dependencies=[Depends(require_tournament_access("viewer"))],
)
def list_modules(
    tournament_id: uuid.UUID = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Return the workspace's module rows (seeding them from ``kind`` if
    absent)."""
    modules = _resolve_modules(tournament_id, repo)
    return [WorkspaceModuleDTO.from_row(m) for m in modules]


@router.patch(
    "/{tournament_id}/modules/{module_id}",
    response_model=WorkspaceModuleDTO,
    dependencies=[Depends(require_tournament_access("operator"))],
)
def patch_module(
    body: WorkspaceModulePatchDTO,
    tournament_id: uuid.UUID = Path(...),
    module_id: str = Path(...),
    repo: LocalRepository = Depends(get_repository),
):
    """Update a module's status / config, enforcing the control-plane rules.

    Rules (each a 409 with a stable error code):
    - ``coming_soon`` modules are immutable.
    - Enabling ``display`` requires ≥1 enabled operational module.
    - A module with data (meet→matches, bracket→bracket_events) cannot be
      disabled (destructive-disable guard — blocked this slice).
    - The last enabled operational module cannot be disabled.
    Only status / config are writable; omitted fields are preserved.
    """
    modules = _resolve_modules(tournament_id, repo)
    by_id = {m.module_id: m for m in modules}
    target = by_id.get(module_id)
    if target is None:
        raise http_error(
            404,
            ErrorCode.MODULE_NOT_FOUND,
            f"module not found: {module_id}",
        )

    provided = body.model_dump(exclude_unset=True)

    # ``coming_soon`` is immutable — any mutation (status or config) is a
    # no-go until a future sub-project makes the module buildable.
    if target.status == "coming_soon" and provided:
        raise http_error(
            409,
            ErrorCode.MODULE_IMMUTABLE,
            f"module '{module_id}' is coming_soon and cannot be modified",
        )

    new_status = provided.get("status")
    if "status" in provided and new_status != target.status:
        if new_status not in MODULE_STATUSES:
            raise http_error(
                400,
                ErrorCode.MODULE_INVALID_STATUS,
                f"invalid status: {new_status!r}",
            )
        if (target.status, new_status) not in _ALLOWED_TRANSITIONS:
            raise http_error(
                409,
                ErrorCode.MODULE_INVALID_STATUS,
                f"transition {target.status} → {new_status} is not allowed",
            )

        if new_status == "enabled" and module_id == "display":
            has_operator = any(
                m.module_id in OPERATIONAL_MODULES and m.status == "enabled"
                for m in modules
            )
            if not has_operator:
                raise http_error(
                    409,
                    ErrorCode.MODULE_DEPENDENCY_UNMET,
                    "enabling display requires an enabled operational module",
                )

        if new_status == "disabled" and module_id in OPERATIONAL_MODULES:
            # Destructive-disable guard FIRST so a module with data surfaces
            # its own specific error even when it is also the last operator.
            if _module_has_data(module_id, tournament_id, repo):
                raise http_error(
                    409,
                    ErrorCode.MODULE_HAS_DATA,
                    f"module '{module_id}' has data and cannot be disabled",
                )
            enabled_operators = [
                m
                for m in modules
                if m.module_id in OPERATIONAL_MODULES and m.status == "enabled"
            ]
            if len(enabled_operators) <= 1:
                raise http_error(
                    409,
                    ErrorCode.MODULE_LAST_OPERATIONAL,
                    "cannot disable the last enabled operational module",
                )

    updated = repo.modules.update(tournament_id, module_id, provided)
    if updated is None:  # pragma: no cover — resolved above, defensive
        raise http_error(
            404,
            ErrorCode.MODULE_NOT_FOUND,
            f"module not found: {module_id}",
        )
    return WorkspaceModuleDTO.from_row(updated)


def _module_has_data(
    module_id: str,
    tournament_id: uuid.UUID,
    repo: LocalRepository,
) -> bool:
    """Whether disabling ``module_id`` would orphan operational data."""
    if module_id == "meet":
        return repo.modules.count_matches(tournament_id) > 0
    if module_id == "bracket":
        return repo.modules.count_bracket_events(tournament_id) > 0
    return False
