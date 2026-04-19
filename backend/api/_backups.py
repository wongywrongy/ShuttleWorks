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

import hashlib
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator, List, Optional, Tuple

KEEP = 10  # rolling window size per stem

log = logging.getLogger("scheduler.backups")

# Field name inserted at the top level of every persisted payload. Its
# value is the SHA-256 of the payload JSON with the checksum field
# removed and replaced by the literal string ``"<pending>"`` (so the
# hash is deterministic regardless of how the serialiser orders keys
# relative to the checksum slot). Chosen to be underscore-prefixed so
# it sorts out-of-the-way and is unlikely to collide with a real
# domain key.
INTEGRITY_FIELD = "_integrity"
INTEGRITY_PLACEHOLDER = "<pending>"


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


def _compute_integrity(payload: dict) -> str:
    """SHA-256 over the payload with the integrity field stubbed out.

    The checksum must be deterministic regardless of where the key
    lands in a JSON document, so we temporarily replace it with a
    fixed placeholder before hashing. Uses sort_keys=True so dict
    iteration order doesn't affect the hash.
    """
    stubbed = {**payload, INTEGRITY_FIELD: INTEGRITY_PLACEHOLDER}
    canonical = json.dumps(stubbed, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def stamp_integrity(payload: dict) -> dict:
    """Return ``payload`` with ``INTEGRITY_FIELD`` set to its SHA-256.

    Mutates a shallow copy, not the original. Callers write this to
    disk so a later reader can detect truncation, corruption, or tamper
    even when the JSON still parses.
    """
    stamped = {**payload, INTEGRITY_FIELD: _compute_integrity(payload)}
    return stamped


def verify_integrity(payload: dict) -> Optional[str]:
    """Check the payload's ``INTEGRITY_FIELD`` against its recomputed
    SHA-256. Returns None on success, or a short reason string on
    failure.

    Backwards-compatible: a payload with no integrity field is treated
    as valid — older files written before the integrity stamp landed
    must continue to load. A failure is reported only when a field is
    present but doesn't match the computed hash.
    """
    claimed = payload.get(INTEGRITY_FIELD)
    if claimed is None:
        return None  # legacy file; treat as valid
    if not isinstance(claimed, str):
        return "non-string integrity field"
    stripped = {k: v for k, v in payload.items() if k != INTEGRITY_FIELD}
    expected = _compute_integrity(stripped)
    if expected != claimed:
        return "checksum mismatch"
    return None


def atomic_write_json(live_path: Path, payload: dict) -> None:
    """Write ``payload`` to ``live_path`` atomically with full durability.

    The steps:
      1. Stamp ``INTEGRITY_FIELD`` onto the payload so readers can
         detect corruption beyond JSON-parse errors.
      2. Serialise to a sibling ``.tmp`` file under the live path's
         parent (so the rename stays on the same filesystem).
      3. ``flush()`` + ``os.fsync()`` on the tmp fd so the data is on
         disk — not just in the kernel buffer — before we swap.
      4. ``os.replace`` for the atomic rename.
      5. ``fsync`` the containing directory so the rename itself is
         durable across a power loss.

    Leaves the tmp file cleaned up on any error path.
    """
    stamped = stamp_integrity(payload)
    tmp = live_path.with_suffix(live_path.suffix + ".tmp")
    try:
        # ``os.open`` + fd instead of ``open()`` so we can fsync cleanly.
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            data = json.dumps(stamped, indent=2, ensure_ascii=False).encode("utf-8")
            os.write(fd, data)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, live_path)
        # Best-effort dir fsync so the rename entry is durable too.
        try:
            dir_fd = os.open(live_path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            # Some filesystems (e.g. tmpfs, some Windows setups) don't
            # support dir fsync. The rename itself is still atomic.
            pass
    except OSError:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise


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

    def try_parse(p: Path) -> dict:
        """Parse + verify integrity. Raises ValueError on either
        malformed JSON or a present-but-mismatched checksum."""
        with open(p, "rb") as f:
            payload = parser(f.read())
        if not isinstance(payload, dict):
            raise ValueError(f"{p.name}: payload is not a JSON object")
        mismatch = verify_integrity(payload)
        if mismatch is not None:
            raise ValueError(f"{p.name}: {mismatch}")
        # Strip the integrity field before returning so downstream
        # Pydantic models and migration code don't have to know about
        # it. Legacy files without the field are returned as-is.
        payload.pop(INTEGRITY_FIELD, None)
        return payload

    # 1. Try the live file first.
    if live_path.exists():
        try:
            return try_parse(live_path), None
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
            log.warning("live %s unreadable (%s); falling back to backups", live_path.name, e)
    # 2. Iterate backups newest → oldest; promote the first readable one.
    errors: List[str] = []
    for candidate in iter_backups_by_mtime_desc(data_dir, live_path.stem):
        try:
            payload = try_parse(candidate)
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
