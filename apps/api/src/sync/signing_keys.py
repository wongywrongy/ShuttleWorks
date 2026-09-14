"""Bounded, local Ed25519 trust bundles for overlapping authority key rotation."""
from __future__ import annotations

import base64
import hashlib
from pathlib import Path
import re

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import UnsupportedAlgorithm

MAX_TRUST_BYTES = 16_384
MAX_TRUST_KEYS = 16
_PUBLIC_PEM = re.compile(
    rb"-----BEGIN PUBLIC KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----",
)


def decode_key_material(raw: bytes) -> bytes:
    if len(raw) == 32:
        return raw
    value = raw.strip()
    if len(value) in (64, 128):
        try:
            return bytes.fromhex(value.decode("ascii"))
        except (ValueError, UnicodeDecodeError):
            pass
    try:
        decoded = base64.urlsafe_b64decode(value + b"=" * (-len(value) % 4))
        if len(decoded) in (32, 64):
            return decoded
    except (ValueError, TypeError):
        pass
    return value


def key_id(key: Ed25519PublicKey) -> str:
    return hashlib.sha256(key.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw,
    )).hexdigest()[:16]


def read_verification_keys(path: str | Path) -> dict[str, Ed25519PublicKey]:
    with Path(path).open("rb") as source:
        raw = source.read(MAX_TRUST_BYTES + 1)
    if len(raw) > MAX_TRUST_BYTES:
        raise ValueError("Authority trust bundle exceeds its size limit")
    if b"-----" in raw:
        blocks = _PUBLIC_PEM.findall(raw)
        if not 1 <= len(blocks) <= MAX_TRUST_KEYS or _PUBLIC_PEM.sub(b"", raw).strip():
            raise ValueError("Expected a bounded bundle of public PEM keys")
        try:
            keys = [serialization.load_pem_public_key(block) for block in blocks]
        except UnsupportedAlgorithm as exc:
            raise ValueError("Unsupported authority verification key") from exc
    else:
        keys = [Ed25519PublicKey.from_public_bytes(decode_key_material(raw))]
    trusted = {}
    for key in keys:
        if not isinstance(key, Ed25519PublicKey):
            raise ValueError("Authority verification requires Ed25519 keys")
        fingerprint = key_id(key)
        if fingerprint in trusted:
            raise ValueError("Duplicate authority verification key")
        trusted[fingerprint] = key
    return trusted
