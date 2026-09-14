"""RFC 6238 vectors and principal-bound encrypted authenticator seeds."""
import uuid

import pytest

from identity.mfa_crypto import (
    FactorSecretError, decrypt_factor, encrypt_factor, matching_counter,
    new_recovery_codes, normalize_recovery_code, totp_code,
)

SECRET = b"12345678901234567890"


@pytest.mark.parametrize("timestamp,expected", [
    (59, "94287082"), (1111111109, "07081804"), (1111111111, "14050471"),
    (1234567890, "89005924"), (2000000000, "69279037"), (20000000000, "65353130"),
])
def test_totp_matches_rfc_6238_sha1_vectors(timestamp, expected):
    # https://www.rfc-editor.org/rfc/rfc6238.html#appendix-B
    assert totp_code(SECRET, timestamp, digits=8) == expected


def test_totp_expires_at_step_boundary_and_cannot_reuse_an_accepted_counter():
    code = totp_code(SECRET, 59)
    assert matching_counter(SECRET, code, 59, after_counter=-1) == 1
    assert matching_counter(SECRET, code, 59, after_counter=1) is None
    assert matching_counter(SECRET, code, 60, after_counter=-1) is None
    assert matching_counter(SECRET, totp_code(SECRET, 60), 60, after_counter=1) == 2


@pytest.mark.parametrize("code", ["", "12345", "1234567", "１２３４５６", "123 456"])
def test_totp_only_accepts_six_ascii_digits(code):
    assert matching_counter(SECRET, code, 59, after_counter=-1) is None


def test_seed_encryption_uses_random_nonces_and_authenticates_its_owner_and_scope():
    key = b"k" * 32
    user = uuid.uuid4()
    envelope = encrypt_factor(SECRET, key, user_id=user, scope="cloud")
    assert SECRET not in envelope
    assert envelope != encrypt_factor(SECRET, key, user_id=user, scope="cloud")
    assert decrypt_factor(envelope, key, user_id=user, scope="cloud") == SECRET
    for other_key, other_user, other_scope in [
        (b"x" * 32, user, "cloud"), (key, uuid.uuid4(), "cloud"), (key, user, "node:example"),
    ]:
        with pytest.raises(FactorSecretError, match="unavailable"):
            decrypt_factor(envelope, other_key, user_id=other_user, scope=other_scope)
    changed = envelope[:-1] + bytes([envelope[-1] ^ 1])
    with pytest.raises(FactorSecretError, match="unavailable"):
        decrypt_factor(changed, key, user_id=user, scope="cloud")


def test_recovery_codes_have_unique_128_bit_lookup_values():
    codes = new_recovery_codes()
    canonical = [normalize_recovery_code(code) for code in codes]
    assert len(codes) == len(set(canonical)) == 8
    for code, value in zip(codes, canonical):
        assert len(value) == 32
        assert normalize_recovery_code(code.upper()) == value
        assert normalize_recovery_code(value) == value
    assert normalize_recovery_code("0" * 31) is None
    assert normalize_recovery_code("x" * 32) is None
