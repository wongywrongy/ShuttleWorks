from pathlib import Path
import tarfile

import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from shuttleworks.event_node import package
from shuttleworks.event_node.package import create_bundle, verify_bundle


def test_signed_bundle_verifies_and_detects_malformed_archive(tmp_path: Path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "compose.yml").write_text("services: {}\n")
    (source / "README.txt").write_text("offline event node\n")
    bundle = tmp_path / "event-node.tar.gz"
    key = Ed25519PrivateKey.generate()

    manifest = create_bundle(source, bundle, version="2.0.0", signing_key=key)
    assert manifest["format"] == "shuttleworks.event_node.bundle.v1"
    assert verify_bundle(bundle, key.public_key())["version"] == "2.0.0"

    malformed = tmp_path / "malformed.tar.gz"
    malformed.write_bytes(b"not a gzip tar archive")
    with pytest.raises((OSError, tarfile.ReadError)):
        verify_bundle(malformed, key.public_key())


def test_bundle_rejects_wrong_signing_key(tmp_path: Path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "compose.yml").write_text("services: {}\n")
    bundle = tmp_path / "event-node.tar.gz"
    create_bundle(source, bundle, version="2.0.0", signing_key=Ed25519PrivateKey.generate())

    with pytest.raises(InvalidSignature):
        verify_bundle(bundle, Ed25519PrivateKey.generate().public_key())


def test_bundle_source_rejects_reserved_manifest_names(tmp_path: Path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "manifest.json").write_text("shadow manifest")

    with pytest.raises(ValueError, match="reserved path"):
        create_bundle(
            source,
            tmp_path / "event-node.tar.gz",
            version="2.0.0",
            signing_key=Ed25519PrivateKey.generate(),
        )


def test_package_cli_creates_a_verifiable_offline_artifact(
    tmp_path: Path, monkeypatch, capsys
):
    source = tmp_path / "source"
    source.mkdir()
    (source / "compose.yml").write_text("services: {}\n")
    bundle = tmp_path / "event-node.tar.gz"
    private_path = tmp_path / "signing.pem"
    public_path = tmp_path / "verification.pem"
    private = Ed25519PrivateKey.generate()
    private_path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    public_path.write_bytes(
        private.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    monkeypatch.setattr(
        "sys.argv",
        [
            "package",
            "create",
            "--source",
            str(source),
            "--output",
            str(bundle),
            "--version",
            "2.0.0",
            "--private-key",
            str(private_path),
        ],
    )
    package.main()
    assert '"version": "2.0.0"' in capsys.readouterr().out

    monkeypatch.setattr(
        "sys.argv",
        [
            "package",
            "verify",
            "--bundle",
            str(bundle),
            "--public-key",
            str(public_path),
        ],
    )
    package.main()
    assert '"profile": "event_node"' in capsys.readouterr().out
