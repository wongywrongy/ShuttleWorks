"""Stable synchronization protocol exceptions.

This module deliberately has no settings or persistence imports so test
fixtures may keep its class identity while refreshing the application graph.
"""
from __future__ import annotations

from typing import Any


class ProtocolError(Exception):
    def __init__(self, status_code: int, code: str, message: str, **detail: Any):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail

    def body(self) -> dict[str, Any]:
        return {"error": self.code, "message": self.message, **self.detail}


__all__ = ["ProtocolError"]
