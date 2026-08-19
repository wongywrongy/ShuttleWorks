"""Deterministic per-label RNG streams.

Every consumer derives its own ``random.Random`` from the run seed plus a
label path (``derive_rng(seed, "roster")``, ``derive_rng(seed, "result",
match_id)``). Adding an RNG call in one module can therefore never shift
the sequence another module sees — the classic determinism trap in
simulation code.
"""
from __future__ import annotations

import random
import uuid
import zlib

#: Namespace for deterministic idempotency-key UUIDs (uuid5). Any fixed
#: UUID works; this one is arbitrary but stable forever.
SIM_UUID_NAMESPACE = uuid.UUID("f67c5c4e-4d1a-4b5e-9d2e-8a7b6c5d4e3f")


def derive_rng(seed: int, *labels: str) -> random.Random:
    """A ``random.Random`` seeded from ``seed`` + a label path."""
    key = f"{seed}/" + "/".join(labels)
    return random.Random(zlib.crc32(key.encode("utf-8")))


def command_uuid(seed: int, *parts: str) -> str:
    """Deterministic idempotency-key UUID for a command.

    Same (seed, parts) -> same UUID, which makes replay-idempotency checks
    trivial and whole runs reproducible.
    """
    return str(uuid.uuid5(SIM_UUID_NAMESPACE, f"{seed}:" + ":".join(parts)))
