"""Authentication boundary contract for tournament-scoped sync routes."""
from __future__ import annotations

from fastapi.routing import APIRoute

from sync.routes import authority_bootstrap_router, authority_router, sync_router


CAPABILITY_AUTHENTICATED_ROUTES = {
    ("POST", "/tournaments/{tournament_id}/authority/offline-session/bootstrap"),
    ("POST", "/tournaments/{tournament_id}/authority/checkpoint/import"),
    ("POST", "/sync/v1/tournaments/{tournament_id}/operations"),
    ("GET", "/sync/v1/tournaments/{tournament_id}/status"),
}


def test_every_human_sync_route_enforces_tournament_membership() -> None:
    routes = [
        route
        for router in (authority_router, authority_bootstrap_router, sync_router)
        for route in router.routes
        if isinstance(route, APIRoute)
    ]
    seen_capability_routes: set[tuple[str, str]] = set()

    for route in routes:
        method = next(iter(route.methods - {"HEAD", "OPTIONS"}))
        identity = (method, route.path)
        dependency_names = {
            dependency.call.__name__
            for dependency in route.dependant.dependencies
            if hasattr(dependency.call, "__name__")
        }
        membership_dependencies = {
            name
            for name in dependency_names
            if name.startswith("require_tournament_access[")
        }
        if identity in CAPABILITY_AUTHENTICATED_ROUTES:
            seen_capability_routes.add(identity)
            assert not membership_dependencies
            continue
        assert membership_dependencies, f"{method} {route.path} lacks tenant membership"

    assert seen_capability_routes == CAPABILITY_AUTHENTICATED_ROUTES
