"""Rolling backup helpers for the persisted JSON state.

Every write to ``tournament.json`` (and future peers) is preceded by a copy
of the current file into ``./data/backups/<stem>-<iso>.json``. We keep the
last ``KEEP`` backups per stem and prune older ones on each rotation.

The module is deliberately file-shaped (not a class): the endpoints call
``create_backup(path)`` before atomic write, ``list_backups(stem)`` for the
restore UI, and ``restore_backup(stem, filename)`` to overwrite the live
file from a chosen backup.
"""
from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

KEEP = 10  # rolling window size per stem


def backup_dir(data_dir: Path) -> Path:
    """Return ``./data/backups`` ensuring it exists."""
    d = data_dir / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _utc_stamp() -> str:
    # Filename-safe ISO — colons are illegal on Windows.
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")


def create_backup(data_dir: Path, live_path: Path) -> Optional[Path]:
    """Copy ``live_path`` into the backup dir, then prune older ones.

    Returns the backup path, or ``None`` if the live file doesn't exist.
    """
    if not live_path.exists():
        return None
    stem = live_path.stem  # e.g. "tournament"
    dst = backup_dir(data_dir) / f"{stem}-{_utc_stamp()}.json"
    shutil.copy2(live_path, dst)
    _prune(data_dir, stem)
    return dst


def _prune(data_dir: Path, stem: str) -> None:
    dirp = backup_dir(data_dir)
    files = sorted(
        (p for p in dirp.iterdir() if p.name.startswith(f"{stem}-") and p.suffix == ".json"),
        key=lambda p: p.stat().st_mtime,
    )
    # oldest first; drop everything beyond the newest KEEP
    for old in files[:-KEEP]:
        try:
            old.unlink()
        except OSError:
            pass


def list_backups(data_dir: Path, stem: str) -> List[dict]:
    """Return [{filename, sizeBytes, modifiedAt}] newest first."""
    dirp = backup_dir(data_dir)
    files = [
        p for p in dirp.iterdir()
        if p.name.startswith(f"{stem}-") and p.suffix == ".json"
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return [
        {
            "filename": p.name,
            "sizeBytes": p.stat().st_size,
            "modifiedAt": datetime.fromtimestamp(
                p.stat().st_mtime, tz=timezone.utc
            ).isoformat(),
        }
        for p in files
    ]


def latest_backup(data_dir: Path, stem: str) -> Optional[Path]:
    dirp = backup_dir(data_dir)
    candidates = [
        p for p in dirp.iterdir()
        if p.name.startswith(f"{stem}-") and p.suffix == ".json"
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def restore_backup(data_dir: Path, live_path: Path, filename: str) -> Path:
    """Atomically overwrite ``live_path`` with the chosen backup.

    Raises ``FileNotFoundError`` if the backup doesn't exist under
    ``./data/backups`` (defence against path traversal — we only honour
    filenames from ``list_backups``).
    """
    # Strict whitelist: filename must exist in the backup dir *as-is*.
    dirp = backup_dir(data_dir)
    src = dirp / filename
    # Reject anything that tried to escape the backup dir.
    src_resolved = src.resolve()
    if dirp.resolve() not in src_resolved.parents or not src_resolved.exists():
        raise FileNotFoundError(filename)

    # Snapshot the current file before we stomp it, so a bad restore is
    # still recoverable.
    if live_path.exists():
        create_backup(data_dir, live_path)

    tmp = live_path.with_suffix(".restore.tmp")
    shutil.copy2(src_resolved, tmp)
    os.replace(tmp, live_path)
    return live_path
