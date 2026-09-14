import json
import secrets

import pytest

from core.secret_keys import (
    MAX_KEYRING_KEYS, SecretKeyringError, add_secret_key, create_secret_keyring,
    promote_secret_key, read_secret_keyring, remove_secret_key, secret_key_id,
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


def test_rotation_adds_promotes_and_removes_keys_privately(tmp_path):
    import os
    import stat
    path = tmp_path / "keys.json"
    first = create_secret_keyring(path)
    second = add_secret_key(path)
    ring = read_secret_keyring(path)
    assert ring.active_id == first and set(ring.key_ids) == {first, second}
    promote_secret_key(path, second)
    assert read_secret_keyring(path).active_id == second
    remove_secret_key(path, first)
    assert read_secret_keyring(path).key_ids == (second,)
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert [p.name for p in tmp_path.iterdir()] == ["keys.json"]  # no stray candidates


def test_rotation_refuses_unsafe_changes(tmp_path):
    path = tmp_path / "keys.json"
    active = create_secret_keyring(path)
    with pytest.raises(SecretKeyringError, match="active"):
        remove_secret_key(path, active)
    with pytest.raises(SecretKeyringError, match="not in this ring"):
        promote_secret_key(path, "0" * 16)
    with pytest.raises(SecretKeyringError, match="not in this ring"):
        remove_secret_key(path, "0" * 16)
    for _ in range(MAX_KEYRING_KEYS - 1):
        add_secret_key(path)
    before = path.read_bytes()
    with pytest.raises(SecretKeyringError, match="full"):
        add_secret_key(path)
    assert path.read_bytes() == before


def test_interrupted_rotation_leaves_the_original_ring_intact(tmp_path, monkeypatch):
    import os
    path = tmp_path / "keys.json"
    create_secret_keyring(path)
    before = path.read_bytes()

    def crash(*_args):
        raise OSError("simulated power loss")
    monkeypatch.setattr(os, "replace", crash)
    with pytest.raises(OSError):
        add_secret_key(path)
    assert path.read_bytes() == before
    assert [p.name for p in tmp_path.iterdir()] == ["keys.json"]
