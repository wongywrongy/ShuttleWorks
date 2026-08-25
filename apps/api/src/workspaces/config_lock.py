"""Scheduling-field classification behind the CONFIG_LOCKED contract.

The complement list (non-scheduling keys) lives in
``packages/shared-contract/non-scheduling-keys.json`` — a single file,
now a versioned ``{$schema, version, keys}`` document (R-DM-8a), read by
this module AND by the console parity test, so the two sides cannot
silently drift. Classification is fail-closed: any key not in
the exempt list is scheduling-relevant.
"""
from __future__ import annotations

import json
from pathlib import Path

_SHARED_REL = Path("packages") / "shared-contract" / "non-scheduling-keys.json"


def _locate_shared() -> Path:
    """Find the shared contract file by walking up from this module.

    Deliberately NOT ``parents[N] / ...``. The old code counted three
    levels up, which worked in the repo and in the image only because the
    Dockerfile copied the file to ``/shared`` — a path chosen to make that
    one count come out right in a container whose tree is flatter than the
    repository's. Any move on either side silently breaks an index like
    that, and it breaks at import time, on a file the CONFIG_LOCKED
    contract depends on. Searching for the file instead of counting steps
    to it is correct in both layouts and stays correct through the next
    move; the image copies the package to ``/packages/shared-contract``,
    which this finds by walking up to ``/``.
    """
    here = Path(__file__).resolve()
    for base in here.parents:
        candidate = base / _SHARED_REL
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"{_SHARED_REL} not found above {here}")


_SHARED_JSON = _locate_shared()

# SP-DM-3 P2 (R-DM-8a) gave this file a version. Same rule as the blob
# columns: a file NEWER than this reader raises rather than being
# half-understood. Written inline rather than through
# ``db.blob_version.VersionedJSON`` - that guards a database column, this
# is a file read at import, and ``workspaces`` has no business importing a
# persistence type to check two integers.
_KNOWN_CONTRACT_VERSION = 1

_contract = json.loads(_SHARED_JSON.read_text(encoding="utf-8"))
_contract_version = _contract.get("version", 1)
if _contract_version > _KNOWN_CONTRACT_VERSION:
    raise RuntimeError(
        f"{_SHARED_JSON} is version {_contract_version}; this build knows "
        f"{_KNOWN_CONTRACT_VERSION}. Refusing to classify config keys against "
        "a contract it does not understand (CONFIG_LOCKED is fail-closed)."
    )

NON_SCHEDULING_KEYS: frozenset[str] = frozenset(_contract["keys"])


def changed_scheduling_fields(
    prior_cfg: dict | None, incoming_cfg: dict | None
) -> list[str]:
    """Names of scheduling-relevant config keys whose value changed.

    ``None`` on either side means "no comparable config" — nothing to
    lock against (matches the prior structural-fields guard, which only
    fired when both blobs carried a config dict).
    """
    if not isinstance(prior_cfg, dict) or not isinstance(incoming_cfg, dict):
        return []
    keys = (set(prior_cfg) | set(incoming_cfg)) - NON_SCHEDULING_KEYS
    return sorted(
        k for k in keys if prior_cfg.get(k) != incoming_cfg.get(k)
    )
