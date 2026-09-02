"""Fail-open event-node backup scheduling and retention.

This module deliberately wraps ``recovery.bundles`` rather than teaching the
API request path about files, passphrases, or retention.  A scheduler failure
is observable through status/logs but never prevents a tournament command from
being served.  Offsite implementations must enqueue work and return; network
upload is not part of a local backup transaction.
"""
from __future__ import annotations

import logging
import shutil
import threading
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol

from recovery.bundles import create_bundle, inspect_bundle, preflight_bundle


log = logging.getLogger("scheduler.recovery")


class OffsiteUploadSink(Protocol):
    """Non-blocking handoff for an encrypted bundle.

    Implementations may persist a local upload queue, but must not wait for a
    WAN request.  A sink failure is swallowed by ``BackupScheduler``.
    """

    def enqueue(self, bundle_path: Path, manifest: dict[str, Any]) -> None:
        ...


class NullOffsiteUploadSink:
    """Default sink for installations without configured offsite storage."""

    def enqueue(self, _bundle_path: Path, _manifest: dict[str, Any]) -> None:
        return None


class CallbackOffsiteUploadSink:
    """Adapter for a host-owned, already asynchronous upload queue."""

    def __init__(self, callback: Callable[[Path, dict[str, Any]], None]) -> None:
        self._callback = callback

    def enqueue(self, bundle_path: Path, manifest: dict[str, Any]) -> None:
        self._callback(bundle_path, manifest)


@dataclass(frozen=True)
class BackupStatus:
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    last_path: Path | None = None
    last_manifest: dict[str, Any] | None = None
    last_error: str | None = None
    restore_test_status: str = "not_run"  # not_run | passed | failed
    generation_count: int = 0
    free_bytes: int | None = None
    last_reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return a UI/health-safe status projection without secrets."""
        return {
            "lastAttemptAt": self.last_attempt_at.isoformat() if self.last_attempt_at else None,
            "lastSuccessAt": self.last_success_at.isoformat() if self.last_success_at else None,
            "lastPath": str(self.last_path) if self.last_path else None,
            "lastManifest": self.last_manifest,
            "lastError": self.last_error,
            "restoreTestStatus": self.restore_test_status,
            "generationCount": self.generation_count,
            "freeBytes": self.free_bytes,
            "lastReason": self.last_reason,
        }


class BackupScheduler:
    """Own periodic and milestone backup work outside request transactions."""

    def __init__(
        self,
        *,
        source_database: Path,
        backup_directory: Path,
        passphrase_provider: Callable[[], bytes],
        interval_seconds: float = 3600.0,
        keep_generations: int = 2,
        restore_test: bool = True,
        offsite_sink: OffsiteUploadSink | None = None,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("interval_seconds must be greater than zero")
        self.source_database = source_database.resolve()
        self.backup_directory = backup_directory.resolve()
        self.passphrase_provider = passphrase_provider
        self.interval_seconds = interval_seconds
        self.keep_generations = max(2, keep_generations)
        self.restore_test = restore_test
        self.offsite_sink = offsite_sink or NullOffsiteUploadSink()
        self._status = BackupStatus()
        self._status_lock = threading.Lock()
        self._run_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def status(self) -> BackupStatus:
        with self._status_lock:
            return self._status

    def status_dict(self) -> dict[str, Any]:
        return self.status.as_dict()

    def start(self) -> threading.Thread:
        """Start the daemon scheduler; startup never performs network I/O."""
        if self._thread is not None and self._thread.is_alive():
            return self._thread
        self._stop.clear()
        self._thread = threading.Thread(
            target=self.run_forever,
            name="shuttleworks-backup",
            daemon=True,
        )
        self._thread.start()
        return self._thread

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(0.0, timeout))

    def run_forever(self) -> None:
        """Run periodic work until stopped; every iteration is fail-open."""
        while not self._stop.is_set():
            self.run_once(reason="interval")
            self._stop.wait(self.interval_seconds)

    def trigger_milestone(self, milestone: str = "milestone") -> bool:
        return self.run_once(reason=f"milestone:{milestone}")

    def trigger_event_close(self) -> bool:
        return self.run_once(reason="event_close")

    def run_once(self, *, reason: str = "manual") -> bool:
        """Create, verify, retain, and enqueue one bundle without raising.

        Returning ``False`` reports a backup attempt that failed before a
        verified artifact existed.  Callers may ignore the return value; the
        local tournament operation path is intentionally independent.
        """
        if not self._run_lock.acquire(blocking=False):
            return False
        attempted = datetime.now(timezone.utc)
        try:
            self.backup_directory.mkdir(parents=True, exist_ok=True)
            self._set_status(
                last_attempt_at=attempted,
                last_reason=reason,
                free_bytes=self._free_bytes(),
            )
            passphrase = self.passphrase_provider()
            if not passphrase:
                raise ValueError("backup passphrase is empty")
            stamp = attempted.strftime("%Y%m%dT%H%M%S%fZ")
            output = self.backup_directory / f"event-{stamp}.swbackup"
            create_bundle(
                source_database=self.source_database,
                output_path=output,
                passphrase=passphrase,
            )
            # Authentication, checksum, and the manifest/database size check
            # all run before this artifact is counted as a generation.
            verified_manifest = inspect_bundle(output, passphrase)
            restore_status = "not_run"
            restore_error: str | None = None
            if self.restore_test:
                try:
                    preflight_bundle(output, passphrase)
                    restore_status = "passed"
                except Exception as exc:  # pragma: no cover - exercised by injected failure
                    restore_status = "failed"
                    restore_error = type(exc).__name__
            self._rotate()
            self._set_status(
                last_success_at=attempted,
                last_path=output,
                last_manifest=verified_manifest,
                last_error=restore_error,
                restore_test_status=restore_status,
                generation_count=self._generation_count(),
                free_bytes=self._free_bytes(),
            )
            try:
                # This is a queue handoff, not an upload.  A broken or absent
                # sink cannot turn a successful local backup into a failure.
                self.offsite_sink.enqueue(output, verified_manifest)
            except Exception:
                log.warning("offsite backup enqueue failed", exc_info=True)
            return True
        except Exception as exc:
            self._set_status(
                last_error=type(exc).__name__,
                generation_count=self._generation_count(),
                free_bytes=self._free_bytes(),
            )
            log.warning("event-node backup attempt failed reason=%s", reason, exc_info=True)
            return False
        finally:
            self._run_lock.release()

    def _set_status(self, **changes: Any) -> None:
        with self._status_lock:
            self._status = replace(self._status, **changes)

    def _paths(self) -> list[Path]:
        return sorted(self.backup_directory.glob("event-*.swbackup"), reverse=True)

    def _generation_count(self) -> int:
        try:
            return len(self._paths())
        except OSError:
            return 0

    def _rotate(self) -> None:
        for stale in self._paths()[self.keep_generations :]:
            try:
                stale.unlink()
            except OSError:
                log.warning("could not rotate old backup path=%s", stale)

    def _free_bytes(self) -> int | None:
        try:
            return shutil.disk_usage(self.backup_directory).free
        except OSError:
            return None


def passphrase_file_provider(path: Path) -> Callable[[], bytes]:
    """Read a mounted secret per run; never log or cache key material."""
    def read() -> bytes:
        return path.read_bytes().rstrip(b"\r\n")
    return read
