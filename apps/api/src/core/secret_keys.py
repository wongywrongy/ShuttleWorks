"""Bounded file-only symmetric key rings; their representation hides key material."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import secrets
from types import MappingProxyType
from typing import Mapping

MAX_KEYRING_BYTES = 4096
MAX_KEYRING_KEYS = 4


class SecretKeyringError(ValueError):
    pass


def secret_key_id(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()[:16]


class SecretKeyring:
    def __init__(self, active_id: str, keys: Mapping[str, bytes]):
        self.active_id = active_id
        self._keys = MappingProxyType(dict(keys))

    def __repr__(self) -> str:
        return f"SecretKeyring(active_id={self.active_id!r}, keys={len(self._keys)})"

    def key(self, key_id: str) -> bytes:
        try:
            return self._keys[key_id]
        except KeyError:
            raise SecretKeyringError("Required encryption key is unavailable") from None

    @property
    def active_key(self) -> bytes:
        return self.key(self.active_id)

    @property
    def key_ids(self) -> tuple[str, ...]:
        return tuple(self._keys)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise SecretKeyringError("Encryption key ring has duplicate fields")
        result[key] = value
    return result


def read_secret_keyring(path: str | Path) -> SecretKeyring:
    try:
        with Path(path).open("rb") as source:
            raw = source.read(MAX_KEYRING_BYTES + 1)
        if len(raw) > MAX_KEYRING_BYTES:
            raise SecretKeyringError("Encryption key ring exceeds its size limit")
        data = json.loads(raw, object_pairs_hook=_unique_object)
        if (
            not isinstance(data, dict) or set(data) != {"version", "active", "keys"}
            or type(data["version"]) is not int or data["version"] != 1
        ):
            raise SecretKeyringError("Encryption key ring format is invalid")
        encoded = data["keys"]
        if not isinstance(encoded, dict) or not 1 <= len(encoded) <= MAX_KEYRING_KEYS:
            raise SecretKeyringError("Encryption key ring key count is invalid")
        keys = {}
        for key_id, value in encoded.items():
            if not isinstance(value, str) or re.fullmatch(r"[0-9a-fA-F]{64}", value) is None:
                raise SecretKeyringError("Encryption key material is invalid")
            material = bytes.fromhex(value)
            if len(set(material)) == 1 or key_id != secret_key_id(material):
                raise SecretKeyringError("Encryption key identity or strength is invalid")
            keys[key_id] = material
        if not isinstance(data["active"], str) or data["active"] not in keys:
            raise SecretKeyringError("Active encryption key is unavailable")
        return SecretKeyring(data["active"], keys)
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError):
        raise SecretKeyringError("Encryption key ring cannot be loaded") from None


def create_secret_keyring(path: str | Path) -> str:
    """Create one private file exclusively and return only its public identifier."""
    key = secrets.token_bytes(32)
    key_id = secret_key_id(key)
    payload = {"version": 1, "active": key_id, "keys": {key_id: key.hex()}}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as target:
        json.dump(payload, target)
        target.write("\n")
    return key_id


def _load_for_update(path: str | Path) -> tuple[str, dict[str, bytes]]:
    ring = read_secret_keyring(path)
    return ring.active_id, {key_id: ring.key(key_id) for key_id in ring.key_ids}


def _replace_secret_keyring(path: str | Path, active_id: str, keys: Mapping[str, bytes]) -> None:
    """Atomically replace a ring, preserving its owner, and never widening its mode.

    The candidate is written exclusively beside the original, re-read through
    the same validator the API uses, then renamed over it. A crash leaves the
    original intact plus at most one stray private temporary file.
    """
    target = Path(path)
    original = target.stat()
    payload = {"version": 1, "active": active_id, "keys": {k: v.hex() for k, v in keys.items()}}
    candidate = target.with_name(f".{target.name}.{secrets.token_hex(4)}.tmp")
    fd = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(payload, output)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        read_secret_keyring(candidate)
        try:
            # Run as root for a ring owned by the API user (UID 1001): keep it readable there.
            os.chown(candidate, original.st_uid, original.st_gid)
        except PermissionError:
            pass
        os.replace(candidate, target)
    except BaseException:
        candidate.unlink(missing_ok=True)
        raise


def add_secret_key(path: str | Path) -> str:
    """Add a new, not-yet-active key. Promote it only after every API process restarts."""
    active_id, keys = _load_for_update(path)
    if len(keys) >= MAX_KEYRING_KEYS:
        raise SecretKeyringError("Encryption key ring is full; remove a retired key first")
    key = secrets.token_bytes(32)
    key_id = secret_key_id(key)
    keys[key_id] = key
    _replace_secret_keyring(path, active_id, keys)
    return key_id


def promote_secret_key(path: str | Path, key_id: str) -> None:
    active_id, keys = _load_for_update(path)
    if key_id not in keys:
        raise SecretKeyringError("Encryption key is not in this ring")
    if key_id != active_id:
        _replace_secret_keyring(path, key_id, keys)


def remove_secret_key(path: str | Path, key_id: str) -> None:
    """Drop a retired key. Callers must first prove no factor still references it."""
    active_id, keys = _load_for_update(path)
    if key_id not in keys:
        raise SecretKeyringError("Encryption key is not in this ring")
    if key_id == active_id:
        raise SecretKeyringError("The active encryption key cannot be removed")
    del keys[key_id]
    _replace_secret_keyring(path, active_id, keys)
