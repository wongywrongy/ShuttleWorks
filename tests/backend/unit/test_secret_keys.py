import json
import secrets

import pytest

from core.secret_keys import (
    SecretKeyringError, create_secret_keyring, read_secret_keyring, secret_key_id,
)


def test_keyring_creation_is_private_exclusive_and_hides_material(tmp_path):
    path = tmp_path / "keys.json"
    key_id = create_secret_keyring(path)
    ring = read_secret_keyring(path)
    assert path.stat().st_mode & 0o777 == 0o600
    assert ring.active_id == key_id
    assert len(ring.active_key) == 32
    assert ring.active_key.hex() not in repr(ring)
    before = path.read_bytes()
    with pytest.raises(FileExistsError):
        create_secret_keyring(path)
    assert path.read_bytes() == before


@pytest.mark.parametrize("mutation", ["zero", "unknown-active", "wrong-id", "unknown-version", "boolean-version", "extra", "empty", "too-many", "oversized", "duplicate"])
def test_keyring_rejects_invalid_configuration(tmp_path, mutation):
    key = secrets.token_bytes(32)
    key_id = secret_key_id(key)
    payload = {"version": 1, "active": key_id, "keys": {key_id: key.hex()}}
    if mutation == "zero":
        key = bytes(32)
        payload = {"version": 1, "active": secret_key_id(key), "keys": {secret_key_id(key): key.hex()}}
    elif mutation == "unknown-active":
        payload["active"] = "unknown"
    elif mutation == "wrong-id":
        payload["keys"] = {"wrong-id": key.hex()}
    elif mutation == "unknown-version":
        payload["version"] = 2
    elif mutation == "boolean-version":
        payload["version"] = True
    elif mutation == "extra":
        payload["fallback"] = key.hex()
    elif mutation == "empty":
        payload["keys"] = {}
    elif mutation == "too-many":
        for _ in range(4):
            extra = secrets.token_bytes(32)
            payload["keys"][secret_key_id(extra)] = extra.hex()
    path = tmp_path / "bad.json"
    raw = json.dumps(payload)
    if mutation == "oversized":
        raw += " " * 4097
    elif mutation == "duplicate":
        raw = raw.replace('"version": 1', '"version": 1, "version": 1')
    path.write_text(raw)
    with pytest.raises(SecretKeyringError):
        read_secret_keyring(path)


def test_overlap_preserves_old_decryption_keys_while_new_writes_use_active_key(tmp_path):
    old, current = secrets.token_bytes(32), secrets.token_bytes(32)
    path = tmp_path / "overlap.json"
    path.write_text(json.dumps({
        "version": 1, "active": secret_key_id(current),
        "keys": {secret_key_id(old): old.hex(), secret_key_id(current): current.hex()},
    }))
    ring = read_secret_keyring(path)
    assert ring.active_key == current
    assert ring.key(secret_key_id(old)) == old
    with pytest.raises(SecretKeyringError, match="unavailable"):
        ring.key("unknown")
