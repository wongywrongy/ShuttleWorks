"""Retirement evidence uses the migrated cloud/node schema without changing epochs."""
import uuid

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Tournament, TournamentAuthority
from repositories.local import LocalRepository
from sync.errors import ProtocolError
from sync.key_rotation import retirement_candidate
from sync.signing_keys import key_id, read_verification_keys
from tests.backend.unit import test_baseline_schema as fixtures

pytestmark = pytest.mark.shared_postgres
initial_revision = fixtures.initial_revision
migrated = fixtures.migrated


@pytest.fixture
def retirement(migrated):
    keys = [Ed25519PrivateKey.generate().public_key() for _ in range(2)]
    trusted = {key_id(key): key for key in keys}
    old, current = trusted
    with Session(migrated) as session:
        tenant = Tournament(id=uuid.uuid4(), name="Key retirement proof")
        session.add(tenant)
        session.flush()
        epoch = TournamentAuthority(
            tournament_id=tenant.id, epoch=1, node_id=uuid.uuid4(),
            checkpoint_hash="a" * 64, checkpoint_schema_version=1,
            capability_digest="b" * 64, grant_key_id=old, state="active",
        )
        session.add(epoch)
        session.commit()
        yield session, epoch, dict(retiring_key_id=old, active_key_id=current, trusted=trusted)


@pytest.mark.parametrize("state,attribution", [
    ("preparing", "old"), ("active", "old"), ("active", "unknown"), ("active", "missing"),
])
def test_retirement_refuses_open_or_unattributed_epochs(retirement, state, attribution):
    session, epoch, options = retirement
    epoch.state = state
    if attribution == "unknown":
        epoch.grant_key_id = "unrecognized-key"
    elif attribution == "missing":
        epoch.grant_key_id = None
    session.commit()
    with pytest.raises(ProtocolError) as denied:
        retirement_candidate(LocalRepository(session), **options)
    assert denied.value.code == "authority_rotation_open_epochs"
    assert session.get(TournamentAuthority, (epoch.tournament_id, 1)).state == state


def test_retirement_refuses_the_current_signer_even_without_open_epochs(retirement):
    session, epoch, options = retirement
    epoch.state = "closed"
    session.commit()
    options["active_key_id"] = options["retiring_key_id"]
    with pytest.raises(ProtocolError) as denied:
        retirement_candidate(LocalRepository(session), **options)
    assert denied.value.code == "authority_rotation_active_signer"


@pytest.mark.parametrize("state", ["closed", "recovered"])
def test_retirement_preserves_history_and_keeps_the_current_key(retirement, tmp_path, state):
    session, epoch, options = retirement
    epoch.state = state
    session.commit()
    before = session.execute(select(TournamentAuthority.__table__)).all()
    path = tmp_path / "candidate.pem"
    path.write_bytes(retirement_candidate(LocalRepository(session), **options))
    assert set(read_verification_keys(path)) == {options["active_key_id"]}
    assert session.execute(select(TournamentAuthority.__table__)).all() == before


def test_an_open_epoch_signed_by_the_current_key_does_not_block_retirement(retirement):
    session, epoch, options = retirement
    epoch.grant_key_id = options["active_key_id"]
    session.commit()
    assert retirement_candidate(LocalRepository(session), **options)


def test_cli_database_connection_refuses_writes(migrated, monkeypatch, capsys):
    import importlib.util
    from importlib import import_module
    from pathlib import Path
    from sqlalchemy import inspect, text

    source = Path(__file__).resolve().parents[3] / "tools/authority-keyring.py"
    spec = importlib.util.spec_from_file_location("readonly_authority_keyring_cli", source)
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    monkeypatch.setattr(import_module("core.config").settings, "database_url",
                        migrated.url.render_as_string(hide_password=False))
    monkeypatch.setattr("sys.argv", [str(source)])

    def attempted_write(repo):
        repo.session.execute(text("CREATE TABLE unexpected_retirement_write (id INTEGER)"))
        return []

    monkeypatch.setattr(import_module("repositories.local").LocalRepository, "authority_key_usage", attempted_write)
    assert cli.main() == 1
    assert "Refused:" in capsys.readouterr().err
    assert "unexpected_retirement_write" not in inspect(migrated).get_table_names()
