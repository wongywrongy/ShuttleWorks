"""Opt-in wall clock for the private local demo environment.

Production always uses the real UTC clock. The override is intentionally
guarded by ``ENVIRONMENT=local`` and has no default; the tech-demo Compose
profile is the only shipped deployment that sets it.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone


def utcnow() -> datetime:
    raw = os.getenv("SHUTTLEWORKS_DEMO_NOW")
    if not raw:
        return datetime.now(timezone.utc)
    if os.getenv("ENVIRONMENT", "local").strip().lower() != "local":
        raise RuntimeError("SHUTTLEWORKS_DEMO_NOW is allowed only when ENVIRONMENT=local")
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeError("SHUTTLEWORKS_DEMO_NOW must be an ISO-8601 datetime") from exc
    if parsed.tzinfo is None:
        raise RuntimeError("SHUTTLEWORKS_DEMO_NOW must include a UTC offset")
    return parsed.astimezone(timezone.utc)


__all__ = ["utcnow"]
