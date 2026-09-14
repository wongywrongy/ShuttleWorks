"""MFA cryptographic primitives; persistence must consume counters/codes atomically.

TOTP uses RFC 6238 SHA-1, six digits and only the current 30-second server
time step. Factor seeds are AES-256-GCM encrypted and bound to their principal
and deployment scope. No function here logs or persists a plaintext secret.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import math
import re
import secrets
import struct
import uuid

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TOTP_PERIOD = 30
TOTP_SECRET_BYTES = 20
RECOVERY_CODE_COUNT = 8
_ENVELOPE_VERSION = b"\x01"
_RECOVERY_CODE = re.compile(r"(?:[0-9a-fA-F]{32}|(?:[0-9a-fA-F]{8}-){3}[0-9a-fA-F]{8})")


class FactorSecretError(ValueError):
    """A fixed error message never includes key material or provider details."""


def new_totp_secret() -> bytes:
    return secrets.token_bytes(TOTP_SECRET_BYTES)


def display_secret(secret: bytes) -> str:
    if len(secret) != TOTP_SECRET_BYTES:
        raise FactorSecretError("Invalid authenticator seed")
    return base64.b32encode(secret).decode("ascii")


def _associated_data(user_id: uuid.UUID, scope: str) -> bytes:
    if not scope or len(scope) > 128:
        raise FactorSecretError("Invalid authenticator scope")
    return f"shuttleworks:mfa:v1:{user_id}:{scope}".encode("utf-8")


def encrypt_factor(secret: bytes, key: bytes, *, user_id: uuid.UUID, scope: str) -> bytes:
    if len(secret) != TOTP_SECRET_BYTES or len(key) != 32:
        raise FactorSecretError("Invalid authenticator key material")
    nonce = secrets.token_bytes(12)
    return _ENVELOPE_VERSION + nonce + AESGCM(key).encrypt(
        nonce, secret, _associated_data(user_id, scope),
    )


def decrypt_factor(envelope: bytes, key: bytes, *, user_id: uuid.UUID, scope: str) -> bytes:
    if len(envelope) != 49 or envelope[:1] != _ENVELOPE_VERSION or len(key) != 32:
        raise FactorSecretError("Authenticator seed is unavailable")
    try:
        return AESGCM(key).decrypt(envelope[1:13], envelope[13:], _associated_data(user_id, scope))
    except InvalidTag:
        raise FactorSecretError("Authenticator seed is unavailable") from None


def _counter(now: float) -> int:
    if not math.isfinite(now) or now < 0:
        raise ValueError("Invalid authenticator time")
    counter = math.floor(now / TOTP_PERIOD)
    if counter >= 2**64:
        raise ValueError("Invalid authenticator time")
    return counter


def totp_code(secret: bytes, now: float, *, digits: int = 6) -> str:
    """Eight-digit mode exists for the RFC test vectors; verification uses six."""
    if len(secret) != TOTP_SECRET_BYTES or digits not in (6, 8):
        raise ValueError("Invalid authenticator parameters")
    digest = hmac.digest(secret, struct.pack(">Q", _counter(now)), hashlib.sha1)
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**digits).zfill(digits)


def matching_counter(secret: bytes, code: str, now: float, *, after_counter: int) -> int | None:
    """Return a new matching counter; the caller must reserve it with database CAS."""
    if not isinstance(code, str) or re.fullmatch(r"[0-9]{6}", code) is None:
        return None
    counter = _counter(now)
    if counter <= after_counter:
        return None
    return counter if hmac.compare_digest(totp_code(secret, now), code) else None


def new_recovery_codes() -> list[str]:
    # Each code carries 128 random bits, so a standard bearer-token digest is
    # appropriate. Consumers use core.tokens._hash_token after normalization.
    codes = [secrets.token_hex(16) for _ in range(RECOVERY_CODE_COUNT)]
    return ["-".join(code[i:i + 8] for i in range(0, 32, 8)) for code in codes]


def normalize_recovery_code(value: str) -> str | None:
    if not isinstance(value, str) or len(value) > 64:
        return None
    value = value.strip()
    return value.replace("-", "").lower() if _RECOVERY_CODE.fullmatch(value) else None
