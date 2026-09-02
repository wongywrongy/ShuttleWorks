"""Cloud mutation fencing while an event node owns tournament authority."""
from __future__ import annotations

import inspect
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from core.config import settings
from core.dependencies import (
    require_cloud_tournament_write_authority,
    require_pre_checkout_configuration_write,
)
from db.models import Base, Tournament
from repositories import LocalRepository
from sync.service import begin_checkout


def _repo() -> tuple[Session, LocalRepository, uuid.UUID]:
    session = Session(create_engine("sqlite:///:memory:"), expire_on_commit=False)
    Base.metadata.create_all(session.bind)
    tournament_id = uuid.uuid4()
    session.add(
        Tournament(
            id=tournament_id,
            name="Authority fence",
            data={"version": 2, "config": {}},
            schema_version=2,
        )
    )
    session.commit()
    return session, LocalRepository(session), tournament_id


def _request(method: str, tournament_id: uuid.UUID) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": f"/tournaments/{tournament_id}/state",
            "headers": [],
            "path_params": {"tournament_id": str(tournament_id)},
        }
    )


def test_cloud_mutation_is_rejected_as_soon_as_checkout_prepares(monkeypatch) -> None:
    session, repo, tournament_id = _repo()
    begin_checkout(session, tournament_id=tournament_id, node_id=uuid.uuid4())
    monkeypatch.setattr(settings, "deployment_profile", "cloud")

    with pytest.raises(HTTPException) as raised:
        require_cloud_tournament_write_authority(
            _request("PUT", tournament_id), repo
        )

    assert raised.value.status_code == 409
    assert raised.value.detail["code"] == "EVENT_CHECKED_OUT"


def test_cloud_reads_and_event_node_mutations_remain_available(monkeypatch) -> None:
    session, repo, tournament_id = _repo()
    begin_checkout(session, tournament_id=tournament_id, node_id=uuid.uuid4())

    monkeypatch.setattr(settings, "deployment_profile", "cloud")
    require_cloud_tournament_write_authority(_request("GET", tournament_id), repo)

    monkeypatch.setattr(settings, "deployment_profile", "event_node")
    require_cloud_tournament_write_authority(_request("POST", tournament_id), repo)


def test_preparation_writes_are_frozen_on_event_node_after_checkout(monkeypatch) -> None:
    session, repo, tournament_id = _repo()
    begin_checkout(session, tournament_id=tournament_id, node_id=uuid.uuid4())
    monkeypatch.setattr(settings, "deployment_profile", "event_node")

    with pytest.raises(HTTPException) as raised:
        require_pre_checkout_configuration_write(
            _request("PATCH", tournament_id), repo
        )

    assert raised.value.status_code == 409
    assert raised.value.detail["code"] == "CONFIG_LOCKED"


def test_preparation_writes_remain_available_before_checkout(monkeypatch) -> None:
    _session, repo, tournament_id = _repo()
    monkeypatch.setattr(settings, "deployment_profile", "event_node")

    require_pre_checkout_configuration_write(_request("POST", tournament_id), repo)


def test_setup_and_destructive_bracket_imports_share_preparation_fence() -> None:
    from bracket.brackets import router as bracket_router
    from core.dependencies import (
        require_pre_checkout_configuration_write as current_fence,
    )
    from workspaces.setup import router as setup_router

    protected_paths = {
        "/tournaments/{tournament_id}/setup/{section}",
        "/tournaments/{tournament_id}/bracket/import",
        "/tournaments/{tournament_id}/bracket/import.csv",
    }
    found: set[str] = set()
    for route in [*setup_router.routes, *bracket_router.routes]:
        path = getattr(route, "path", "")
        if path not in protected_paths:
            continue
        dependencies = {
            dependency.dependency
            for dependency in getattr(route, "dependencies", [])
        }
        assert current_fence in dependencies, path
        found.add(path)

    assert found == protected_paths


def test_operator_entry_router_freezes_mutations_after_checkout() -> None:
    from core.dependencies import require_pre_checkout_entry_write as current_fence
    from core.main import app
    from entries.entries_routes import router as entries_router

    included = next(
        route
        for route in app.routes
        if getattr(route, "original_router", None) is entries_router
    )
    dependencies = {
        dependency.dependency for dependency in included.include_context.dependencies
    }
    assert current_fence in dependencies


def test_operator_tournament_routers_share_the_write_fence() -> None:
    from core.dependencies import require_cloud_tournament_write_authority as fence
    from core.main import app

    protected_prefixes = (
        "/tournaments/{tournament_id}/bracket",
        "/tournaments/{tournament_id}/commands",
        "/tournaments/{tournament_id}/match-states",
        "/tournaments/{tournament_id}/solve-jobs",
    )
    matched: set[str] = set()
    for included in app.routes:
        if not hasattr(included, "include_context"):
            continue
        dependencies = {
            dependency.dependency
            for dependency in included.include_context.dependencies
        }
        for route in included.original_router.routes:
            path = getattr(route, "path", "")
            if not any(path.startswith(prefix) for prefix in protected_prefixes):
                continue
            if not set(getattr(route, "methods", set())) & {
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
            }:
                continue
            assert fence in dependencies, path
            matched.add(
                next(
                    prefix
                    for prefix in protected_prefixes
                    if path.startswith(prefix)
                )
            )

    assert matched == set(protected_prefixes)


def test_partner_acceptance_cannot_create_a_submission_after_checkout() -> None:
    from entries.partner_routes import accept_partner_invite

    source = inspect.getsource(accept_partner_invite)
    assert "tournament_is_checked_out" in source
    assert "EVENT_CHECKED_OUT" in source


def test_entrant_withdrawal_cannot_mutate_after_checkout() -> None:
    from entries.entries_me import withdraw_entry

    source = inspect.getsource(withdraw_entry)
    assert "tournament_is_checked_out" in source
    assert "EVENT_CHECKED_OUT" in source
