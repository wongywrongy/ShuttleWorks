"""Contract test for ``shared/schedule_slots.py`` (D10, contract §3.3, §10).

Asserts the new single authority reproduces the exact outputs of the three
implementations it replaces — ``entries_site.py:_hhmm_plus``,
``entries_site.py:_slot_time`` and ``workspace_signals.py:_slot_time_label``
— over a slot/interval matrix including a midnight crossing, and pins the
``slot_approved`` / ``slot_pending`` predicate (contract §3.1).
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from shared.schedule_slots import (
    add_minutes_wrapping,
    slot_approved,
    slot_pending,
    slot_time_from_start,
    slot_wall_clock,
)


# ---- add_minutes_wrapping / slot_wall_clock agree with the old three ------


def _old_hhmm_plus(day_start: str, minutes: int) -> str:
    h, m = day_start.split(":")
    total = (int(h) * 60 + int(m) + minutes) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _old_slot_time(start_time, interval_minutes, slot_id):
    if slot_id is None or start_time is None:
        return None
    minutes = slot_id * interval_minutes
    base = start_time
    return _old_hhmm_plus(f"{base.hour:02d}:{base.minute:02d}", minutes)


def _old_slot_time_label(day_start, interval, slot):
    if not day_start:
        return None
    try:
        h, m = str(day_start).split(":")[:2]
        base = int(h) * 60 + int(m)
    except (ValueError, TypeError):
        return None
    total = base + max(0, int(slot or 0)) * max(0, int(interval or 0))
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


@pytest.mark.parametrize(
    "day_start,minutes",
    [
        ("09:00", 0),
        ("09:00", 30),
        ("09:00", 90),
        ("23:30", 45),  # midnight crossing
        ("00:00", 1439),
        ("14:15", 600),
    ],
)
def test_add_minutes_wrapping_matches_old_hhmm_plus(day_start, minutes):
    assert add_minutes_wrapping(day_start, minutes) == _old_hhmm_plus(day_start, minutes)


@pytest.mark.parametrize(
    "hour,minute,interval,slot_id",
    [
        (9, 0, 30, 0),
        (9, 0, 30, 3),
        (23, 30, 15, 3),  # midnight crossing
        (9, 0, 30, None),
    ],
)
def test_slot_time_from_start_matches_old_slot_time(hour, minute, interval, slot_id):
    start = SimpleNamespace(hour=hour, minute=minute)
    assert slot_time_from_start(hour, minute, slot_id, interval) == _old_slot_time(
        start, interval, slot_id
    )


def test_slot_time_from_start_is_none_without_a_slot():
    assert slot_time_from_start(9, 0, None, 30) is None


@pytest.mark.parametrize(
    "day_start,interval,slot",
    [
        ("09:00", 30, 0),
        ("09:00", 30, 3),
        ("23:30", 15, 3),  # midnight crossing
        (None, 30, 0),
        ("", 30, 0),
        ("bogus", 30, 0),
        ("09:00", None, None),
        ("09:00", 30, -1),
    ],
)
def test_slot_wall_clock_matches_old_slot_time_label(day_start, interval, slot):
    assert slot_wall_clock(day_start, slot, interval) == _old_slot_time_label(
        day_start, interval, slot
    )


def test_slot_wall_clock_wraps_a_later_day_instead_of_clamping():
    # A day-five 09:00 assignment (slot 480 on a 1-minute grid from
    # midnight) still reads 09:00, not a clamped 23:59.
    assert slot_wall_clock("00:00", 4 * 24 * 60 + 9 * 60, 1) == "09:00"


# ---- slot_approved / slot_pending -----------------------------------------


def test_slot_approved_is_true_only_for_a_real_value():
    assert slot_approved("10:00") is True
    assert slot_approved(0) is True
    assert slot_approved(None) is False


def test_slot_pending_is_the_exact_inverse():
    for value in (None, "10:00", 0, ""):
        assert slot_pending(value) is (not slot_approved(value))
