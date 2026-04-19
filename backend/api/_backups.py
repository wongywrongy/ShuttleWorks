"""Rolling backup helpers for the persisted JSON state.

Every write to ``tournament.json``, ``match_states.json`` (and future
peers) is preceded by a copy of the current file into
``./data/backups/<stem>-<iso>.json``. We keep the last ``KEEP`` backups
per stem and prune older ones on each rotation.

The module is deliberately file-shaped (not a class): endpoints call
``create_backup(path)`` before atomic write, ``list_backups(stem)`` for
the restore UI, ``restore_backup(stem, filename)`` to overwrite the
live file from a chosen backup, and ``read_with_recovery(path)`` to
load a payload while auto-repairing corrupted files from the most
recent *readable* backup.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator, List, Optional, Tuple

KEEP = 10  # rolling window size per stem

log = logging.getLogger("scheduler.backups")


def backup_dir(data_dir: Path) -> Path:
    """Return ``./data/backups`` ensuring it exists."""
    d = data_dir / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _utc_stamp() -> str:
    # Filename-safe ISO — colons are illegal on Windows.
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")


def _validate_filename(filename: str) -> None:
    """Reject anything that could let a caller escape the backup dir.

    Checks the raw string BEFORE path construction so symlink races
    and unicode-normalisation tricks can't open a window. Callers are
    responsible for the follow-up ``.resolve()`` prefix check in
    ``restore_backup``.
    """
    if not isinstance(filename, str) or not filename:
        raise FileNotFoundError("invalid backup name")
    if "/" in filename or "\\" in filename:
        raise FileNotFoundError("invalid backup name")
    if ".." in filename:
        raise FileNotFoundError("invalid backup name")
    if "\x00" in filename:
        raise FileNotFoundError("invalid backup name")
    if any(ord(c) < 32 for c in filename):
        raise FileNotFoundError("invalid backup name")
    if not filename.endswith(".json"):
        raise FileNotFoundError("invalid backup name")


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


def iter_backups_by_mtime_desc(data_dir: Path, stem: str) -> Iterator[Path]:
    """Yield backup paths for ``stem`` in newest-first order."""
    dirp = backup_dir(data_dir)
    files = [
        p for p in dirp.iterdir()
        if p.name.startswith(f"{stem}-") and p.suffix == ".json"
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    yield from files


def list_backups(data_dir: Path, stem: str) -> List[dict]:
    """Return [{filename, sizeBytes, modifiedAt}] newest first."""
    out: List[dict] = []
    for p in iter_backups_by_mtime_desc(data_dir, stem):
        try:
            stat = p.stat()
        except OSError:
            continue
        out.append(
            {
                "filename": p.name,
                "sizeBytes": stat.st_size,
                "modifiedAt": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )
    return out


def latest_backup(data_dir: Path, stem: str) -> Optional[Path]:
    """Return the newest backup path for ``stem`` (or None)."""
    return next(iter_backups_by_mtime_desc(data_dir, stem), None)


def restore_backup(data_dir: Path, live_path: Path, filename: str) -> Path:
    """Atomically overwrite ``live_path`` with the chosen backup.

    Hardened against path traversal in three layers:
      1. Raw string validation of ``filename`` (no separators, traversal,
         control chars, null bytes) BEFORE constructing a Path.
      2. A ``.resolve(strict=True)`` check that the resolved source lives
         under the resolved backup dir — catches symlink swaps.
      3. The existence check is baked into ``strict=True``.
    """
    _validate_filename(filename)
    dirp = backup_dir(data_dir)
    src = dirp / filename
    try:
        src_resolved = src.resolve(strict=True)
    except (FileNotFoundError, OSError) as exc:
        raise FileNotFoundError(filename) from exc

    dirp_resolved = dirp.resolve(strict=True)
    # Enforce containment: the source MUST be inside the backup dir.
    try:
        src_resolved.relative_to(dirp_resolved)
    except ValueError as exc:
        raise FileNotFoundError(filename) from exc

    # Snapshot the current file before we stomp it, so a bad restore is
    # still recoverable.
    if live_path.exists():
        create_backup(data_dir, live_path)

    tmp = live_path.with_suffix(".restore.tmp")
    shutil.copy2(src_resolved, tmp)
    os.replace(tmp, live_path)
    return live_path


def read_with_recovery(
    data_dir: Path,
    live_path: Path,
    parse: Callable[[bytes], dict] | None = None,
) -> Tuple[dict, Optional[str]]:
    """Load ``live_path`` or iterate backups newest-first until one parses.

    Returns ``(payload, recovered_filename_or_None)``. Uses ``parse`` if
    given, else ``json.loads``. A *single* corrupt backup no longer
    blocks recovery — older backups are tried in order.

    Raises ``FileNotFoundError`` when no file (live or backup) exists,
    and ``ValueError`` when *every* candidate fails to parse.
    """
    parser = parse or (lambda b: json.loads(b.decode("utf-8")))
    # 1. Try the live file first.
    if live_path.exists():
        try:
            with open(live_path, "rb") as f:
                return parser(f.read()), None
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
            log.warning("live %s unreadable (%s); falling back to backups", live_path.name, e)
    # 2. Iterate backups newest → oldest; promote the first readable one.
    errors: List[str] = []
    for candidate in iter_backups_by_mtime_desc(data_dir, live_path.stem):
        try:
            with open(candidate, "rb") as f:
                payload = parser(f.read())
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError, OSError) as e:
            errors.append(f"{candidate.name}: {e}")
            log.warning("backup %s unreadable (%s); trying next", candidate.name, e)
            continue
        # Promote to live so subsequent reads hit the repaired file.
        try:
            restore_backup(data_dir, live_path, candidate.name)
        except OSError as e:
            log.warning("promotion of %s failed: %s", candidate.name, e)
        log.warning("recovered %s from backup %s", live_path.name, candidate.name)
        return payload, candidate.name

    if not live_path.exists() and not errors:
        raise FileNotFoundError(str(live_path))
    raise ValueError(
        f"no readable copy of {live_path.name}; {len(errors)} backup(s) failed"
    )
