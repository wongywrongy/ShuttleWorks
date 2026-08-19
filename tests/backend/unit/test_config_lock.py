"""Unit tests for the scheduling-field classifier behind CONFIG_LOCKED.

The classifier is fail-closed: any config key NOT in the shared
non-scheduling-keys JSON is scheduling-relevant.
"""
from workspaces.config_lock import NON_SCHEDULING_KEYS, changed_scheduling_fields


def test_exempt_keys_do_not_classify():
    prior = {"scoringFormat": "badminton", "pointsPerSet": 21}
    incoming = {"scoringFormat": "simple", "pointsPerSet": 11}
    assert changed_scheduling_fields(prior, incoming) == []


def test_scheduling_key_change_is_reported():
    prior = {"defaultRestMinutes": 30, "scoringFormat": "badminton"}
    incoming = {"defaultRestMinutes": 15, "scoringFormat": "simple"}
    assert changed_scheduling_fields(prior, incoming) == ["defaultRestMinutes"]


def test_unknown_new_key_is_scheduling_fail_closed():
    assert changed_scheduling_fields({}, {"someFutureKnob": 3}) == ["someFutureKnob"]


def test_removed_key_counts_as_change():
    assert changed_scheduling_fields({"freezeHorizonSlots": 4}, {}) == ["freezeHorizonSlots"]


def test_none_configs_never_classify():
    assert changed_scheduling_fields(None, {"courtCount": 4}) == []
    assert changed_scheduling_fields({"courtCount": 4}, None) == []


def test_equal_values_do_not_classify():
    cfg = {"courtCount": 4, "breaks": [{"start": "12:00", "end": "13:00"}]}
    assert changed_scheduling_fields(cfg, dict(cfg)) == []


def test_json_is_the_source():
    # The frozenset must come from the shared JSON, not a parallel literal.
    assert "tvAccent" in NON_SCHEDULING_KEYS
    assert "courtCount" not in NON_SCHEDULING_KEYS


def test_http_error_extra_payload():
    from core.error_codes import ErrorCode, http_error

    exc = http_error(
        409,
        ErrorCode.CONFIG_LOCKED,
        "locked",
        extra={"fields": ["courtCount"], "schedules": ["meet"]},
    )
    assert exc.status_code == 409
    assert exc.detail["code"] == "CONFIG_LOCKED"
    assert exc.detail["fields"] == ["courtCount"]
    assert exc.detail["schedules"] == ["meet"]


def test_draw_started_code_exists():
    from core.error_codes import ErrorCode

    assert ErrorCode.DRAW_STARTED.value == "DRAW_STARTED"


def test_http_error_without_extra_is_unchanged():
    """Backward compatibility: omitting ``extra`` must keep the exact
    two-key wire shape existing callers (and the frontend interceptor)
    already depend on."""
    from core.error_codes import ErrorCode, http_error

    exc = http_error(409, ErrorCode.CONFIG_LOCKED, "locked")
    assert exc.status_code == 409
    assert exc.detail == {"code": "CONFIG_LOCKED", "message": "locked"}
