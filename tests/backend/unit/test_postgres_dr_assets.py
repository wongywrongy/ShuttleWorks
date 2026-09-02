"""Contract tests for the self-hosted PostgreSQL DR assets.

These tests exercise checksum and dry-run boundaries only; they never connect
to or mutate a PostgreSQL server.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DR = ROOT / "infra/postgres"


def test_dr_scripts_are_syntax_valid_and_dry_run_by_default():
    for path in (
        DR / "backup-manifest.sh",
        DR / "failover-rejoin.sh",
        DR / "restore-drill.sh",
    ):
        result = subprocess.run(
            ["bash", "-n", str(path)], capture_output=True, text=True, check=False
        )
        assert result.returncode == 0, result.stderr
    failover = (DR / "failover-rejoin.sh").read_text()
    assert 'DRY_RUN="${DRY_RUN:-1}"' in failover
    assert "FENCE_PRIMARY_COMMAND" in failover
    assert "CONFIRM_FENCED_FAILOVER=I_UNDERSTAND_FENCED_DR" in failover
    assert failover.index("fence primary") < failover.index("pg_ctl -D /var/lib/postgresql/data promote")


def test_backup_manifest_create_verify_and_tamper_detection(tmp_path: Path):
    backup = tmp_path / "backup"
    backup.mkdir()
    (backup / "database.dump").write_bytes(b"isolated postgres dump")
    (backup / "globals.sql").write_bytes(b"isolated globals")
    script = DR / "backup-manifest.sh"

    created = subprocess.run(
        ["bash", str(script), "create", str(backup), "2026-09-01T12:00:00Z"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert created.returncode == 0, created.stderr
    assert (backup / "backup-manifest.env").read_text() == (
        "manifest_version=1\nschema_version=1\n"
        "tool_version=shuttleworks-postgres-backup-manifest/1\n"
        "created_at=2026-09-01T12:00:00Z\nartifact=postgresql\n"
        "stanza=shuttleworks\npayload_count=2\n"
        "payload_file=database.dump\npayload_file=globals.sql\n"
    )
    verified = subprocess.run(
        ["bash", str(script), "verify", str(backup)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert verified.returncode == 0, verified.stderr

    (backup / "database.dump").write_bytes(b"tampered")
    rejected = subprocess.run(
        ["bash", str(script), "verify", str(backup)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert rejected.returncode != 0
    assert "FAILED" in rejected.stdout


def test_backup_manifest_rejects_missing_extra_and_wrong_stanza_files(tmp_path: Path):
    backup = tmp_path / "backup"
    backup.mkdir()
    (backup / "database.dump").write_bytes(b"isolated postgres dump")
    script = DR / "backup-manifest.sh"
    create = subprocess.run(
        ["bash", str(script), "create", str(backup), "2026-09-01T12:00:00Z"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert create.returncode == 0, create.stderr

    (backup / "extra.dump").write_bytes(b"not in the inventory")
    extra = subprocess.run(
        ["bash", str(script), "verify", str(backup)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert extra.returncode == 2
    assert "inventory does not match" in extra.stderr

    (backup / "extra.dump").unlink()
    (backup / "database.dump").unlink()
    missing = subprocess.run(
        ["bash", str(script), "verify", str(backup)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert missing.returncode == 2
    assert "inventory does not match" in missing.stderr

    (backup / "database.dump").write_bytes(b"isolated postgres dump")
    wrong_stanza = subprocess.run(
        ["bash", str(script), "verify", str(backup)],
        env={**os.environ, "PGBACKREST_STANZA": "other"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert wrong_stanza.returncode == 2
    assert "stanza does not match" in wrong_stanza.stderr


def test_backup_manifest_rejects_ambiguous_payload_names(tmp_path: Path):
    backup = tmp_path / "backup"
    backup.mkdir()
    (backup / "database dump").write_bytes(b"ambiguous filename")

    rejected = subprocess.run(
        [
            "bash",
            str(DR / "backup-manifest.sh"),
            "create",
            str(backup),
            "2026-09-01T12:00:00Z",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert rejected.returncode == 2
    assert "unsupported characters" in rejected.stderr


def test_dr_checklists_execute_only_safe_dry_run_paths(tmp_path: Path):
    restore = subprocess.run(
        ["bash", str(DR / "restore-drill.sh")],
        env={**os.environ, "DRY_RUN": "1", "RESTORE_DRILL_TARGET": "pitr-drill"},
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )
    assert restore.returncode == 0
    assert "isolated clean target=pitr-drill" in restore.stdout
    assert "pgbackrest --stanza=shuttleworks check" in restore.stdout

    failover = subprocess.run(
        ["bash", str(DR / "failover-rejoin.sh"), "failover"],
        env={
            **os.environ,
            "DRY_RUN": "1",
            "FENCE_PRIMARY_COMMAND": "witness fence server-1",
            "CONFIRM_FENCED_FAILOVER": "I_UNDERSTAND_FENCED_DR",
        },
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )
    assert failover.returncode == 0
    assert failover.stdout.index("fence server-1") < failover.stdout.index("pg_ctl -D")
    assert "No commands were executed" in failover.stdout

    rejoin = subprocess.run(
        ["bash", str(DR / "failover-rejoin.sh"), "rejoin"],
        env={
            **os.environ,
            "DRY_RUN": "1",
            "FENCE_PRIMARY_COMMAND": "witness fence server-1",
            "CONFIRM_FENCED_FAILOVER": "I_UNDERSTAND_FENCED_DR",
        },
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )
    assert rejoin.returncode == 0
    assert "reclone/rejoin old primary" in rejoin.stdout
    assert "pgbackrest --stanza=shuttleworks check" in rejoin.stdout

    refused = subprocess.run(
        ["bash", str(DR / "restore-drill.sh")],
        env={**os.environ, "DRY_RUN": "0", "RESTORE_DRILL_TARGET": "scheduler"},
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )
    assert refused.returncode == 2
    assert "refusing restore drill target" in refused.stderr


def test_templates_make_backup_and_no_automatic_promotion_non_negotiable():
    env = (DR / "primary-standby.env.example").read_text()
    pgbackrest = (DR / "pgbackrest.conf.example").read_text()
    docs = (ROOT / "docs/how-to/postgres-disaster-recovery.md").read_text()
    assert "AUTOMATIC_FAILOVER=false" in env
    assert "PGBACKREST_REPO1_TYPE=s3" in env
    assert "repo1-retention-full=4" in pgbackrest
    assert "archive-async=y" in pgbackrest
    assert "archive_mode=on" in pgbackrest
    assert "archive_command='pgbackrest --stanza=shuttleworks archive-push %p'" in pgbackrest
    assert "Server 2 is a warm physical\nstandby" in docs
    assert "not a backup" in docs
    assert " ".join(docs.split()).find(
        "Automatic two-node promotion is therefore not implemented"
    ) >= 0


def test_pitr_and_rejoin_contracts_keep_live_data_out_of_the_drill():
    restore = (DR / "restore-drill.sh").read_text()
    failover = (DR / "failover-rejoin.sh").read_text()
    assert "restore to an isolated clean target" in restore
    assert '[[ "$TARGET" != "scheduler" && "$TARGET" != "production" ]]' in restore
    assert "pgbackrest --stanza=\"$STANZA\" check" in restore
    assert "reclone/rejoin old primary" in failover
    assert "systemctl stop shuttleworks-api shuttleworks-worker" in failover
    assert "pg_ctl -D /var/lib/postgresql/data promote" in failover
    assert "AUTOMATIC_FAILOVER=false" in (DR / "primary-standby.env.example").read_text()


def test_restore_drill_refuses_live_looking_target():
    script = (DR / "restore-drill.sh").read_text()
    assert "RESTORE_DRILL_TARGET is required outside dry-run" in script
    assert '"scheduler"' in script
    assert '"production"' in script
