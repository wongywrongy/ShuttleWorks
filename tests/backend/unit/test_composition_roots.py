"""The named deployment roots remain compatible during the migration."""

from __future__ import annotations

from pathlib import Path


def test_cloud_root_is_an_explicit_compatibility_shim() -> None:
    from core.composition import DeploymentProfile
    from core.composition.cloud import app, create_app, PROFILE
    from core.main import app as legacy_app

    assert PROFILE is DeploymentProfile.CLOUD
    assert create_app() is app is legacy_app


def test_event_node_root_is_an_explicit_compatibility_shim() -> None:
    from core.composition import DeploymentProfile
    from core.composition.event_node import app, create_app, PROFILE
    from core.main import app as legacy_app

    assert PROFILE is DeploymentProfile.EVENT_NODE
    assert create_app() is app is legacy_app


def test_named_plan_composition_roots_preserve_legacy_app() -> None:
    from core.main import app as legacy_app
    from shuttleworks.cloud.main import app as cloud_app, PROFILE as cloud_profile
    from shuttleworks.event_node.main import app as node_app, PROFILE as node_profile
    from shuttleworks.sync.main import app as sync_app

    assert cloud_profile.value == "cloud"
    assert node_profile.value == "event-node"
    assert cloud_app is node_app is sync_app is legacy_app


def test_named_worker_root_delegates_without_importing_worker_at_module_load() -> None:
    from shuttleworks.worker import main as worker_root

    assert worker_root.PROFILE == "cloud-worker"
    assert callable(worker_root.main)


def test_event_node_compose_boots_named_api_and_worker_roots() -> None:
    root = Path(__file__).resolve().parents[3]
    compose = (root / "infra/compose/docker-compose.event-node.yml").read_text()

    assert "shuttleworks.event_node.main:app" in compose
    assert '"shuttleworks.worker.main"' in compose
