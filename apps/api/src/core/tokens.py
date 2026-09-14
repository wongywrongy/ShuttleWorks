"""One-way storage for high-entropy bearer credentials."""
import hashlib


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
