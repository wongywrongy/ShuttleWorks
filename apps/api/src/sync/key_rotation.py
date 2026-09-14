"""Read-only retirement evidence; publication requires quiesced grant issuance."""
from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from repositories.local import LocalRepository
from sync.errors import ProtocolError


def retirement_candidate(
    repo: LocalRepository,
    *,
    retiring_key_id: str,
    active_key_id: str,
    trusted: dict[str, Ed25519PublicKey],
) -> bytes:
    if active_key_id not in trusted or retiring_key_id not in trusted:
        raise ProtocolError(409, "authority_rotation_unknown_key", "Both signing identities must be trusted")
    if retiring_key_id == active_key_id:
        raise ProtocolError(409, "authority_rotation_active_signer", "The current signing key cannot be retired")
    # Unattributed/untrusted legacy grants must be reconciled, not guessed to use a
    # different key. Closed/recovered rows remain intact as historical evidence.
    if repo.authority_key_has_open_epochs(retiring_key_id, trusted):
        raise ProtocolError(409, "authority_rotation_open_epochs", "Open authority epochs still require reconciliation")
    return b"".join(key.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    ) for fingerprint, key in sorted(trusted.items()) if fingerprint != retiring_key_id)
