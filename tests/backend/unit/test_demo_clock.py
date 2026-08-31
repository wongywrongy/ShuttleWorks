from datetime import datetime, timezone

import pytest

from core.demo_clock import utcnow


def test_demo_clock_uses_explicit_local_override(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("SHUTTLEWORKS_DEMO_NOW", "2026-07-31T13:15:00+08:00")

    assert utcnow() == datetime(2026, 7, 31, 5, 15, tzinfo=timezone.utc)


def test_demo_clock_is_forbidden_in_cloud(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "cloud")
    monkeypatch.setenv("SHUTTLEWORKS_DEMO_NOW", "2026-07-31T05:15:00Z")

    with pytest.raises(RuntimeError, match="only when ENVIRONMENT=local"):
        utcnow()


def test_demo_clock_requires_an_aware_timestamp(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("SHUTTLEWORKS_DEMO_NOW", "2026-07-31T05:15:00")

    with pytest.raises(RuntimeError, match="include a UTC offset"):
        utcnow()
