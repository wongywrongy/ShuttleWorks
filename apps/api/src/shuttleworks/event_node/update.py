"""Signed, transport-neutral event-node update metadata.

This module deliberately stops at an authenticated update descriptor. It does
not install files, replace a running process, manage an OS keychain, or talk to
a registry. Those are desktop/release concerns. The descriptor gives future
transports one stable contract for checking the exact bundle digest, protocol
compatibility, and an explicitly signed rollback candidate.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import tarfile
from pathlib import Path
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from shuttleworks.event_node.package import FORMAT as BUNDLE_FORMAT, verify_bundle
from sync.compatibility import (
    SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS,
    SUPPORTED_OPERATION_SCHEMA_VERSIONS,
)


FORMAT = "shuttleworks.event_node.update.v1"
PRODUCT = "event_node"
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_REVISION = re.compile(r"^[0-9a-f]{40,64}$")
_SEMVER = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def _canonical(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("ascii")


def _bundle_digest(bundle: Path) -> str:
    if not bundle.is_file():
        raise ValueError("update bundle must be a regular file")
    digest = hashlib.sha256()
    with bundle.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _bundle_version(bundle: Path) -> str:
    """Read the package version without trusting it as an authenticity proof."""
    try:
        with tarfile.open(bundle, "r:gz") as archive:
            manifest = json.loads(archive.extractfile("manifest.json").read())
    except (OSError, KeyError, tarfile.TarError, TypeError, ValueError, AttributeError) as exc:
        raise ValueError("update bundle manifest is unreadable") from exc
    if manifest.get("format") != BUNDLE_FORMAT or manifest.get("profile") != PRODUCT:
        raise ValueError("update bundle manifest format is unsupported")
    return _validate_semver(manifest.get("version"), field="bundle version")


def _validate_semver(value: object, *, field: str = "version") -> str:
    if not isinstance(value, str) or not _SEMVER.fullmatch(value):
        raise ValueError(f"update {field} must be a semantic version")
    return value


def _version_key(value: str) -> tuple[int, int, int, tuple[tuple[int, object], ...]]:
    match = _SEMVER.fullmatch(value)
    if match is None:  # pragma: no cover - callers validate first
        raise ValueError("invalid semantic version")
    major, minor, patch, prerelease = match.group(1, 2, 3, 4)
    identifiers: tuple[tuple[int, object], ...] = tuple(
        (0, int(part)) if part.isdigit() else (1, part)
        for part in (prerelease.split(".") if prerelease else [])
    )
    # Release versions sort after all pre-releases.
    return int(major), int(minor), int(patch), identifiers or ((2, ""),)


def build_update_metadata(
    bundle: Path,
    *,
    version: str,
    source_revision: str,
    rollback_target: str | None = None,
    channel: str = "stable",
) -> dict[str, Any]:
    """Build metadata for a specific signed event-node bundle."""
    version = _validate_semver(version)
    bundle_version = _bundle_version(bundle)
    if bundle_version != version:
        raise ValueError("update version does not match bundle manifest")
    if rollback_target is not None:
        rollback_target = _validate_semver(rollback_target, field="rollback target")
        if _version_key(rollback_target) >= _version_key(version):
            raise ValueError("rollback target must be older than the update")
    if not isinstance(source_revision, str) or not _REVISION.fullmatch(source_revision):
        raise ValueError("update source revision must be a hexadecimal commit id")
    if channel not in {"stable", "beta"}:
        raise ValueError("update channel must be stable or beta")
    return {
        "format": FORMAT,
        "product": PRODUCT,
        "version": version,
        "channel": channel,
        "bundleFormat": BUNDLE_FORMAT,
        "bundleVersion": bundle_version,
        "bundleSha256": _bundle_digest(bundle),
        "sourceRevision": source_revision,
        "compatibility": {
            "operationSchemas": list(SUPPORTED_OPERATION_SCHEMA_VERSIONS),
            "checkpointSchemas": list(SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS),
        },
        "rollback": {
            "allowed": rollback_target is not None,
            "targetVersion": rollback_target,
        },
    }


def sign_update_metadata(
    metadata: Mapping[str, Any], signing_key: Ed25519PrivateKey
) -> str:
    """Sign canonical update metadata using the package's Ed25519 key."""
    _validate_metadata(metadata)
    return base64.urlsafe_b64encode(signing_key.sign(_canonical(dict(metadata)))).decode(
        "ascii"
    ).rstrip("=")


def _validate_metadata(metadata: Mapping[str, Any]) -> None:
    if not isinstance(metadata, Mapping):
        raise ValueError("update metadata must be an object")
    if metadata.get("format") != FORMAT or metadata.get("product") != PRODUCT:
        raise ValueError("update metadata format or product is unsupported")
    _validate_semver(metadata.get("version"))
    if metadata.get("channel") not in {"stable", "beta"}:
        raise ValueError("update channel is unsupported")
    if metadata.get("bundleFormat") != BUNDLE_FORMAT:
        raise ValueError("update bundle format is unsupported")
    if metadata.get("bundleVersion") != metadata.get("version"):
        raise ValueError("update bundle version does not match update version")
    digest = metadata.get("bundleSha256")
    if not isinstance(digest, str) or not _HEX64.fullmatch(digest):
        raise ValueError("update bundle digest is invalid")
    revision = metadata.get("sourceRevision")
    if not isinstance(revision, str) or not _REVISION.fullmatch(revision):
        raise ValueError("update source revision is invalid")
    compatibility = metadata.get("compatibility")
    if not isinstance(compatibility, Mapping):
        raise ValueError("update compatibility is missing")
    for field, supported in (
        ("operationSchemas", SUPPORTED_OPERATION_SCHEMA_VERSIONS),
        ("checkpointSchemas", SUPPORTED_CHECKPOINT_SCHEMA_VERSIONS),
    ):
        versions = compatibility.get(field)
        if (
            not isinstance(versions, list)
            or not versions
            or any(isinstance(version, bool) or not isinstance(version, int) for version in versions)
            or len(set(versions)) != len(versions)
            or tuple(sorted(versions)) != tuple(versions)
            or not set(versions).issubset(supported)
        ):
            raise ValueError(f"update {field} are not compatible with this build")
    rollback = metadata.get("rollback")
    if not isinstance(rollback, Mapping) or not isinstance(rollback.get("allowed"), bool):
        raise ValueError("update rollback metadata is invalid")
    target = rollback.get("targetVersion")
    if target is not None:
        _validate_semver(target, field="rollback target")
        if _version_key(target) >= _version_key(str(metadata["version"])):
            raise ValueError("rollback target must be older than the update")
    if rollback["allowed"] != (target is not None):
        raise ValueError("rollback allowance does not match its target")


def verify_update_metadata(
    metadata: Mapping[str, Any],
    signature: str,
    public_key: Ed25519PublicKey,
    *,
    bundle: Path | None = None,
) -> Mapping[str, Any]:
    """Authenticate metadata and optionally bind it to a local bundle."""
    try:
        raw_signature = base64.urlsafe_b64decode(
            signature.encode("ascii") + b"=" * (-len(signature) % 4)
        )
        public_key.verify(raw_signature, _canonical(dict(metadata)))
    except (InvalidSignature, ValueError, TypeError, UnicodeEncodeError) as exc:
        raise ValueError("update metadata signature is invalid") from exc
    _validate_metadata(metadata)
    if bundle is not None and _bundle_digest(bundle) != metadata["bundleSha256"]:
        raise ValueError("update bundle digest does not match metadata")
    if bundle is not None:
        manifest = verify_bundle(bundle, public_key)
        if manifest.get("version") != metadata["bundleVersion"]:
            raise ValueError("update bundle version does not match metadata")
    return metadata


def verify_rollback_candidate(
    candidate: Mapping[str, Any],
    signature: str,
    public_key: Ed25519PublicKey,
    *,
    current_version: str,
    bundle: Path | None = None,
) -> Mapping[str, Any]:
    """Verify an explicitly signed older candidate before a future rollback."""
    current_version = _validate_semver(current_version, field="current version")
    metadata = verify_update_metadata(
        candidate, signature, public_key, bundle=bundle
    )
    if _version_key(str(metadata["version"])) >= _version_key(current_version):
        raise ValueError("rollback candidate is not older than the current version")
    return metadata
