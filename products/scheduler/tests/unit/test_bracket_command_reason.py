"""The record_result bracket command accepts a contingency `reason`.

Contract-only for now (spec 2026-07-14 §1): walkover routing already
exists; `retired` / `forfeit` ride the same result path and their
distinct routing semantics are deferred (debt-log). The model must
(a) accept the three reasons, (b) reject unknown ones, and
(c) normalize reason=="walkover" to walkover=True so the two fields
can't contradict.
"""
import uuid

import pytest
from pydantic import ValidationError

from app.schemas import BracketCommandRequest


def _body(**overrides):
    base = {
        "id": str(uuid.uuid4()),
        "kind": "record_result",
        "play_unit_id": "pu1",
        "winner_side": "A",
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("reason", ["walkover", "retired", "forfeit"])
def test_reason_accepted(reason):
    cmd = BracketCommandRequest(**_body(reason=reason))
    assert cmd.reason == reason


def test_reason_defaults_to_none():
    assert BracketCommandRequest(**_body()).reason is None


def test_unknown_reason_rejected():
    with pytest.raises(ValidationError):
        BracketCommandRequest(**_body(reason="rage_quit"))


def test_walkover_reason_forces_walkover_flag():
    cmd = BracketCommandRequest(**_body(reason="walkover", walkover=False))
    assert cmd.walkover is True
