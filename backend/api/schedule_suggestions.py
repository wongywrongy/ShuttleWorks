"""Suggestions inbox: routes + speculative-solve handler.

The handler is built per-app at startup (`build_handler`). It runs
inside the SuggestionsWorker's task. Phase 2.3 adds the optimize
handler logic; Phase 3 adds the HTTP routes.

This file currently exposes a stub handler so the lifespan can
boot the worker — replacing it with the real handler is Task 2.3.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI

import app.scheduler_core_path  # noqa: F401
from scheduler_core.engine.cancel_token import CancelToken
from services.suggestions_worker import (
    HandlerFn,
    TriggerEvent,
    TriggerKind,
)

router = APIRouter(prefix="/schedule/suggestions", tags=["schedule-suggestions"])
log = logging.getLogger("scheduler.suggestions")


def build_handler(app: FastAPI) -> HandlerFn:
    """Factory: returns a handler fn closed over `app` for the worker.

    Phase 2.3 fills in the real OPTIMIZE handler that runs a
    warm-restart against the current persisted state and stamps a
    Suggestion if the result improves on the live schedule. Until
    then this stub logs and returns — the worker stays alive but
    no suggestions are produced.
    """
    async def handler(event: TriggerEvent, token: CancelToken) -> None:
        log.debug(
            "suggestions: stub handler skipping kind=%s fingerprint=%s",
            event.kind, event.fingerprint,
        )
    return handler
