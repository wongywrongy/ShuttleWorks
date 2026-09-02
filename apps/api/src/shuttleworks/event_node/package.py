"""Small signed event-node bundle prototype with a deterministic manifest.

This is intentionally a transport-neutral installer artifact: release tooling can
wrap the tarball in a desktop installer later, while operators already have a
verifiable offline package today.  The signature covers the manifest and the
manifest covers every payload file.
"""

from __future__ import annotations

import base64
import argparse
import hashlib
import io
import json
import tarfile
from pathlib import Path, PurePosixPath
from typing import Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization


FORMAT = "shuttleworks.event_node.bundle.v1"
RESERVED_MEMBERS = frozenset({"manifest.json", "manifest.sig"})


def _canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _safe_name(path: Path, root: Path) -> str:
    relative = path.relative_to(root).as_posix()
    if relative in {"", "."} or relative.startswith("../"):
        raise ValueError(f"invalid bundle path: {relative!r}")
    return relative


def build_manifest(source: Path, *, version: str, profile: str = "event_node") -> dict[str, object]:
    """Return a stable manifest for regular files below *source*."""
    source = source.resolve()
    if not source.is_dir():
        raise ValueError("bundle source must be a directory")
    files: list[dict[str, object]] = []
    for path in sorted((p for p in source.rglob("*") if p.is_file()), key=lambda p: p.as_posix()):
        name = _safe_name(path, source)
        if name in RESERVED_MEMBERS:
            raise ValueError(f"bundle source uses reserved path: {name}")
        data = path.read_bytes()
        files.append({"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return {"format": FORMAT, "profile": profile, "version": version, "files": files}


def create_bundle(source: Path, output: Path, *, version: str, signing_key: Ed25519PrivateKey, profile: str = "event_node") -> dict[str, object]:
    """Write a signed gzip tar bundle and return its manifest."""
    manifest = build_manifest(source, version=version, profile=profile)
    signature = base64.urlsafe_b64encode(signing_key.sign(_canonical(manifest))).decode().rstrip("=")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        manifest_bytes = _canonical(manifest) + b"\n"
        info = tarfile.TarInfo("manifest.json")
        info.size = len(manifest_bytes)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(manifest_bytes))
        signature_bytes = (signature + "\n").encode()
        info = tarfile.TarInfo("manifest.sig")
        info.size = len(signature_bytes)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(signature_bytes))
        for item in manifest["files"]:
            name = str(item["path"])
            archive.add(source / name, arcname=name, recursive=False)
    return manifest


def verify_bundle(bundle: Path, public_key: Ed25519PublicKey) -> Mapping[str, object]:
    """Verify signature, file hashes, and archive paths before installation."""
    with tarfile.open(bundle, "r:gz") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)):
            raise ValueError("bundle contains duplicate member names")
        name_set = set(names)
        if not RESERVED_MEMBERS.issubset(name_set):
            raise ValueError("bundle is missing manifest or signature")
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"unsafe bundle path: {member.name!r}")
            if not member.isfile():
                raise ValueError(f"bundle member is not a regular file: {member.name!r}")
        manifest = json.loads(archive.extractfile("manifest.json").read())
        if manifest.get("format") != FORMAT or manifest.get("profile") != "event_node":
            raise ValueError("bundle manifest has an unsupported format or profile")
        signature = base64.urlsafe_b64decode(archive.extractfile("manifest.sig").read().strip() + b"===")
        public_key.verify(signature, _canonical(manifest))
        items = manifest.get("files", [])
        if not isinstance(items, list):
            raise ValueError("bundle manifest file inventory is invalid")
        expected = {str(item["path"]): item for item in items}
        if len(expected) != len(items) or RESERVED_MEMBERS.intersection(expected):
            raise ValueError("bundle manifest contains duplicate or reserved paths")
        if set(expected) != name_set - RESERVED_MEMBERS:
            raise ValueError("bundle contents do not match manifest")
        for name, item in expected.items():
            data = archive.extractfile(name).read()
            if len(data) != item["size"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError(f"bundle checksum mismatch: {name}")
        return manifest


def _private_key(path: Path) -> Ed25519PrivateKey:
    key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("event-node package signing key must be Ed25519")
    return key


def _public_key(path: Path) -> Ed25519PublicKey:
    key = serialization.load_pem_public_key(path.read_bytes())
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("event-node package verification key must be Ed25519")
    return key


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or verify an event-node package")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--source", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--version", required=True)
    create.add_argument("--private-key", type=Path, required=True)
    verify = commands.add_parser("verify")
    verify.add_argument("--bundle", type=Path, required=True)
    verify.add_argument("--public-key", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "create":
        result = create_bundle(
            args.source,
            args.output,
            version=args.version,
            signing_key=_private_key(args.private_key),
        )
    else:
        result = verify_bundle(args.bundle, _public_key(args.public_key))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
