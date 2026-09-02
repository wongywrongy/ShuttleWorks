"""Signed event-node update metadata and rollback contract."""
from __future__ import annotations

from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from shuttleworks.event_node.package import create_bundle
from shuttleworks.event_node.update import (
    build_update_metadata,
    sign_update_metadata,
    verify_rollback_candidate,
    verify_update_metadata,
)


def _bundle(tmp_path: Path, version: str = "2.4.0") -> tuple[Path, Ed25519PrivateKey]:
    source = tmp_path / "source"
    source.mkdir()
    (source / "app.txt").write_text("event node")
    key = Ed25519PrivateKey.generate()
    bundle = tmp_path / "event-node.tar.gz"
    create_bundle(source, bundle, version=version, signing_key=key)
    return bundle, key


def test_update_metadata_binds_bundle_and_reuses_package_key(tmp_path: Path) -> None:
    bundle, key = _bundle(tmp_path)
    metadata = build_update_metadata(
        bundle,
        version="2.4.0",
        source_revision="a" * 40,
        rollback_target="2.3.0",
    )
    signature = sign_update_metadata(metadata, key)
    assert verify_update_metadata(metadata, signature, key.public_key(), bundle=bundle)[
        "bundleSha256"
    ] == metadata["bundleSha256"]
    assert metadata["rollback"] == {"allowed": True, "targetVersion": "2.3.0"}


def test_tampered_metadata_or_bundle_is_rejected(tmp_path: Path) -> None:
    bundle, key = _bundle(tmp_path)
    metadata = build_update_metadata(bundle, version="2.4.0", source_revision="b" * 40)
    signature = sign_update_metadata(metadata, key)
    tampered = {**metadata, "version": "2.4.1"}
    with pytest.raises(ValueError, match="signature"):
        verify_update_metadata(tampered, signature, key.public_key())
    bundle.write_bytes(bundle.read_bytes() + b"tampered")
    with pytest.raises(ValueError, match="digest"):
        verify_update_metadata(metadata, signature, key.public_key(), bundle=bundle)


def test_rollback_requires_signed_older_candidate_and_matching_bundle(tmp_path: Path) -> None:
    bundle, key = _bundle(tmp_path, "2.3.0")
    metadata = build_update_metadata(bundle, version="2.3.0", source_revision="c" * 40)
    signature = sign_update_metadata(metadata, key)
    candidate = verify_rollback_candidate(
        metadata,
        signature,
        key.public_key(),
        current_version="2.4.0",
        bundle=bundle,
    )
    assert candidate["version"] == "2.3.0"
    with pytest.raises(ValueError, match="not older"):
        verify_rollback_candidate(
            metadata,
            signature,
            key.public_key(),
            current_version="2.2.0",
        )


def test_previous_release_compatibility_subset_remains_verifiable(tmp_path: Path) -> None:
    bundle, key = _bundle(tmp_path, "2.3.0")
    metadata = build_update_metadata(bundle, version="2.3.0", source_revision="e" * 40)
    metadata["compatibility"] = {
        "operationSchemas": [1, 2],
        "checkpointSchemas": [1, 2],
    }
    signature = sign_update_metadata(metadata, key)
    assert verify_rollback_candidate(
        metadata,
        signature,
        key.public_key(),
        current_version="2.4.0",
        bundle=bundle,
    )["version"] == "2.3.0"


def test_invalid_rollback_target_is_rejected(tmp_path: Path) -> None:
    bundle, _key = _bundle(tmp_path, "2.3.0")
    with pytest.raises(ValueError, match="older"):
        build_update_metadata(
            bundle, version="2.3.0", source_revision="d" * 40, rollback_target="2.3.0"
        )
