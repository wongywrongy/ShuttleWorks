"""Cross-cutting constants used by the FastAPI layer.

Currently exports the ``MatchAction`` enum (Step C of the
architecture-adjustment arc) and the action → target-status map the
command processor uses to translate operator commands into state
machine transitions.

The transition table itself (``VALID_TRANSITIONS``) lives in
``services.match_state`` next to the assertion that consumes it; the
action mapping is a separate concern (operator-facing vocabulary)
that the prompt names this module for.
"""
from __future__ import annotations

from enum import Enum

from database.models import MatchStatus


class MatchAction(str, Enum):
    """Operator-facing names for the legal state transitions.

    Each value maps to exactly one target ``MatchStatus`` via
    :data:`ACTION_TO_TARGET_STATUS`. The command processor reads the
    target from the map, then calls ``assert_valid_transition`` to
    verify the move is legal from the current status — the caller
    does *not* specify ``next_status`` directly.
    """

    CALL_TO_COURT = "call_to_court"   # scheduled → called
    START_MATCH = "start_match"       # called → playing
    FINISH_MATCH = "finish_match"     # playing → finished
    RETIRE_MATCH = "retire_match"     # playing → retired
    UNCALL = "uncall"                 # called → scheduled


ACTION_TO_TARGET_STATUS: dict[MatchAction, MatchStatus] = {
    MatchAction.CALL_TO_COURT: MatchStatus.CALLED,
    MatchAction.START_MATCH: MatchStatus.PLAYING,
    MatchAction.FINISH_MATCH: MatchStatus.FINISHED,
    MatchAction.RETIRE_MATCH: MatchStatus.RETIRED,
    MatchAction.UNCALL: MatchStatus.SCHEDULED,
}
