"""Framework logging. Non-noisy hooks; never log full request bodies by default."""

import logging

logger = logging.getLogger("scheduler_core")


def log_build_start(match_count: int, player_count: int, slot_count: int, resource_count: int) -> None:
    logger.debug(
        "build_start match_count=%s player_count=%s slot_count=%s resource_count=%s",
        match_count, player_count, slot_count, resource_count,
    )


def log_build_end(match_count: int) -> None:
    logger.debug("build_end match_count=%s", match_count)


def log_solve_start() -> None:
    logger.debug("solve_start")


def log_solve_end(status: str, runtime_ms: float, assignment_count: int) -> None:
    logger.debug("solve_end status=%s runtime_ms=%.2f assignment_count=%s", status, runtime_ms, assignment_count)


def log_solution_extraction(assignment_count: int, moved_count: int, locked_count: int) -> None:
    logger.debug("solution_extraction assignment_count=%s moved_count=%s locked_count=%s", assignment_count, moved_count, locked_count)


def log_infeasible_diagnostics(reason_count: int, reasons_preview: list[str]) -> None:
    preview = reasons_preview[:5] if reasons_preview else []
    logger.debug("infeasible_diagnostics reason_count=%s preview=%s", reason_count, preview)
