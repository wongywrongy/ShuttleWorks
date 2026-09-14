"""Planned Ed25519 rotation keeps old grants verifiable without trusting key hints."""
from importlib import import_module
import uuid

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from sync import service
from sync.errors import ProtocolError


def _public_pem(key):
    return key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def test_raw_key_bytes_are_not_trimmed_as_text(tmp_path):
    from sync.signing_keys import read_verification_keys

    raw = b"\n" + b"\x01" * 30 + b" "
    path = tmp_path / "raw-public-key"
    path.write_bytes(raw)
    key, = read_verification_keys(path).values()
    assert key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw) == raw


@pytest.fixture
def rotation(tmp_path, monkeypatch):
    settings = import_module("core.config").settings
    private_path = tmp_path / "active.pem"
    trust_path = tmp_path / "trusted.pem"
    monkeypatch.setattr(settings, "environment", "cloud")
    monkeypatch.setattr(settings, "authority_signing_key_file", str(private_path))
    monkeypatch.setattr(settings, "authority_signing_public_key_file", str(trust_path))
    keys = [Ed25519PrivateKey.generate(), Ed25519PrivateKey.generate()]
    scope = dict(
        tournament_id=uuid.uuid4(), node_id=uuid.uuid4(), epoch=1,
        checkpoint_hash="a" * 64, checkpoint_schema_version=1,
    )
    grants = []
    for key in keys:
        private_path.write_bytes(key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
        grants.append(service._authority_grant(**scope, node_key_fingerprint="b" * 64))
    trust_path.write_bytes(b"".join(_public_pem(key) for key in keys))
    return keys, grants, scope, trust_path


def test_overlap_verifies_both_original_and_rotated_grants(rotation):
    _keys, grants, scope, _path = rotation
    assert grants[0]["keyId"] != grants[1]["keyId"]
    for grant in grants:
        assert service._verify_authority_grant(grant, **scope) == grant


@pytest.mark.parametrize("key_hint", ["unknown", "other", "missing"])
def test_key_id_cannot_be_forged_or_omitted(rotation, key_hint):
    _keys, grants, scope, _path = rotation
    grant = dict(grants[0])
    if key_hint == "missing":
        del grant["keyId"]
    else:
        grant["keyId"] = grants[1]["keyId"] if key_hint == "other" else "0" * 16
    with pytest.raises(ProtocolError) as denied:
        service._verify_authority_grant(grant, **scope)
    assert denied.value.status_code == 403


def test_removing_retired_key_denies_old_grant_but_accepts_new(rotation):
    keys, grants, scope, path = rotation
    path.write_bytes(_public_pem(keys[1]))
    assert service._verify_authority_grant(grants[1], **scope) == grants[1]
    with pytest.raises(ProtocolError) as denied:
        service._verify_authority_grant(grants[0], **scope)
    assert denied.value.status_code == 403


@pytest.mark.parametrize("suffix", [b"not a public key", b"x" * 20000], ids=["malformed", "oversized"])
def test_malformed_or_oversized_bundle_fails_closed(rotation, suffix):
    keys, grants, scope, path = rotation
    path.write_bytes(_public_pem(keys[0]) + suffix)
    with pytest.raises(ProtocolError) as unavailable:
        service._verify_authority_grant(grants[0], **scope)
    assert unavailable.value.status_code == 503


@pytest.mark.parametrize("bundle", ["empty", "duplicate", "too-many"])
def test_trust_bundle_rejects_empty_duplicate_or_excess_keys(rotation, bundle):
    keys, grants, scope, path = rotation
    material = {
        "empty": b"",
        "duplicate": _public_pem(keys[0]) * 2,
        "too-many": b"".join(_public_pem(Ed25519PrivateKey.generate()) for _ in range(17)),
    }[bundle]
    path.write_bytes(material)
    with pytest.raises(ProtocolError) as unavailable:
        service._verify_authority_grant(grants[0], **scope)
    assert unavailable.value.status_code == 503


def test_old_and_new_checkout_grants_import_during_overlap(rotation):
    from sqlalchemy import select
    from db.models import TournamentAuthority
    from tests.backend.unit.test_event_node_identity import _fixture, _session, _public_key

    keys, _grants, _scope, _path = rotation
    settings = import_module("core.config").settings
    checkouts = []
    # Issue the two real checkpoints under different signing keys, then import
    # both after the cloud has switched to the second signer.
    for key in keys:
        from pathlib import Path
        Path(settings.authority_signing_key_file).write_bytes(key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
        with _session() as source:
            _org, tenant = _fixture(source)
            node = uuid.uuid4()
            public, _private = _public_key()
            service.enroll_device(source, tournament_id=tenant, node_id=node,
                                  label="Rotation proof", public_key=public, actor_id=uuid.uuid4())
            authority, capability, checkpoint = service.begin_checkout(
                source, tournament_id=tenant, node_id=node,
            )
            checkouts.append((authority, capability, checkpoint, node))
    for authority, capability, checkpoint, node in checkouts:
        with _session() as target:
            service.import_checkpoint(
                target, checkpoint=checkpoint, node_id=node,
                authority_epoch=authority.epoch, capability=capability,
                checkpoint_hash=service.checkpoint_digest(checkpoint), authority_grant=authority.grant,
            )
            imported = target.scalar(select(TournamentAuthority))
            assert imported.grant_key_id == authority.grant_key_id


def test_retirement_cli_only_writes_a_new_candidate(rotation, tmp_path, monkeypatch, capsys):
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, inspect
    from _helpers import upgrade_test_database
    from sync.signing_keys import read_verification_keys

    _keys, grants, _scope, trust_path = rotation
    database = f"sqlite:///{tmp_path / 'rotation.db'}"
    engine = create_engine(database)
    upgrade_test_database(engine)
    monkeypatch.setattr(import_module("core.config").settings, "database_url", database)
    source = Path(__file__).resolve().parents[3] / "tools/authority-keyring.py"
    spec = importlib.util.spec_from_file_location("authority_keyring_cli", source)
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    before = trust_path.read_bytes()
    tables = inspect(engine).get_table_names()
    output = tmp_path / "candidate.pem"
    monkeypatch.setattr("sys.argv", [str(source), "--retire-key-id", grants[0]["keyId"], "--output", str(output)])
    assert cli.main() == 0
    assert set(read_verification_keys(output)) == {grants[1]["keyId"]}
    assert trust_path.read_bytes() == before
    assert inspect(engine).get_table_names() == tables
    assert '"deployed": false' in capsys.readouterr().out
    # An existing file (including the active trust file) is never overwritten.
    monkeypatch.setattr("sys.argv", [str(source), "--retire-key-id", grants[0]["keyId"], "--output", str(trust_path)])
    assert cli.main() == 1
    assert trust_path.read_bytes() == before
    engine.dispose()


def test_retirement_cli_does_not_expose_invalid_database_credentials(rotation, tmp_path, monkeypatch, capsys):
    import importlib.util
    from pathlib import Path

    source = Path(__file__).resolve().parents[3] / "tools/authority-keyring.py"
    spec = importlib.util.spec_from_file_location("invalid_authority_keyring_cli", source)
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    monkeypatch.setattr(import_module("core.config").settings, "database_url",
                        "postgresql://user:synthetic-db-secret@invalid:bad-port/db")
    monkeypatch.setattr("sys.argv", [str(source)])
    assert cli.main() == 1
    output = capsys.readouterr()
    assert "synthetic-db-secret" not in output.out + output.err
    assert "Refused:" in output.err


def test_retirement_cli_startup_error_hides_configuration_values():
    import subprocess
    import sys
    from pathlib import Path

    source = Path(__file__).resolve().parents[3] / "tools/authority-keyring.py"
    result = subprocess.run(
        [sys.executable, str(source)], capture_output=True, text=True, check=False,
        env={"ENVIRONMENT": "cloud", "AUTH_MODE": "cloud",
             "DATABASE_URL": "postgresql://user:synthetic-startup-secret@invalid/db"},
    )
    assert result.returncode == 1
    assert "Refused:" in result.stderr
    assert "synthetic-startup-secret" not in result.stdout + result.stderr
    assert "Traceback" not in result.stderr
