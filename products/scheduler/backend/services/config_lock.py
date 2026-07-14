"""Scheduling-field classification behind the CONFIG_LOCKED contract.

The complement list (non-scheduling keys) lives in
``products/scheduler/shared/non-scheduling-keys.json`` — a single file
read by this module AND by the frontend parity test, so the two sides
cannot silently drift. Classification is fail-closed: any key not in
the exempt list is scheduling-relevant.
"""
from __future__ import annotations

import json
from pathlib import Path

_SHARED_JSON = (
    Path(__file__).resolve().parents[2] / "shared" / "non-scheduling-keys.json"
)

NON_SCHEDULING_KEYS: frozenset[str] = frozenset(
    json.loads(_SHARED_JSON.read_text(encoding="utf-8"))
)


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
