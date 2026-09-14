"""Redact credentials at the text-log output boundary, including tracebacks."""
from __future__ import annotations

import copy
import logging
import re

_CAPABILITY = re.compile(r"(?i)((?:/|%2f|%252f)(?:display|invites?|partners?)(?:/|%2f|%252f))[^\s?\#\"'<>]+")
_QUERY = re.compile(r"\?[^\s\"'<>]+")
_URL_CREDENTIALS = re.compile(r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s]+@")
_BEARER = re.compile(r"(?i)(\bBearer\s+)[^\s,\"'<>]+")
_COOKIE_HEADER = re.compile(r"(?im)(\b(?:set-)?cookie\s*:\s*)[^\r\n]+")
_SECRET_FIELD = re.compile(
    r"(?i)(\b(?:\w*_)?(?:token|secret|password|authorization|cookie|set-cookie)[\"']?\s*[:=]\s*)"
    r"(?:\"[^\"\r\n]*\"|'[^'\r\n]*'|[^\s,;]+)"
)


def redact_credentials(text: str) -> str:
    text = _URL_CREDENTIALS.sub(r"\1[redacted]@", text)
    text = _CAPABILITY.sub(r"\1[redacted]", text)
    text = _QUERY.sub("?[redacted]", text)
    text = _BEARER.sub(r"\1[redacted]", text)
    text = _COOKIE_HEADER.sub(r"\1[redacted]", text)
    return _SECRET_FIELD.sub(r"\1[redacted]", text)


class RedactingFormatter(logging.Formatter):
    """Preserve existing formats (including uvicorn's tuple args), then redact."""
    _shuttleworks_redaction = True

    def __init__(self, delegate: logging.Formatter | None):
        super().__init__()
        self.delegate = delegate or logging.Formatter()

    def format(self, record: logging.LogRecord) -> str:
        # Formatters cache exception text on the record. Do not hand another
        # handler a cached exception or mutate uvicorn's positional arguments.
        return redact_credentials(self.delegate.format(copy.copy(record)))


def install_log_redaction() -> None:
    """Install after console/uvicorn logging setup in API, worker and sync."""
    for name in (None, "uvicorn", "uvicorn.access", "uvicorn.error"):
        for handler in logging.getLogger(name).handlers:
            if not getattr(handler.formatter, "_shuttleworks_redaction", False):
                handler.setFormatter(RedactingFormatter(handler.formatter))
