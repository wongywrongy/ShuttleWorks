"""Shared pytest setup for the backend test suite.

Pytest's rootdir is the repository root. The API's domain packages live
under ``apps/api/src``, which is a sys.path ROOT rather than a package
(SP-REORG-1 R4), so we insert it at conftest load time and every test can
``from meet.schedule import ...`` or ``from core.config import ...`` by bare
name. We also add this directory, so test modules can
``from _helpers import isolate_test_database``.

Phase 3 reduced this from two entries to one meaningful one: there is now a
single API root instead of six sibling top-level packages. It cannot go to
zero while the suite imports the API by bare package name, which is the
same thing the API does to itself.

``scheduler_core`` is installed as a regular package via its own
``pyproject.toml`` and reaches every test through site-packages.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


_TESTS_DIR = Path(__file__).resolve().parent          # tests/backend
_REPO_ROOT = _TESTS_DIR.parents[1]                    # the repository root
_API_ROOT = str(_REPO_ROOT / "apps" / "api" / "src")

for entry in (str(_TESTS_DIR), _API_ROOT):
    if entry not in sys.path:
        sys.path.insert(0, entry)


# Re-export from _helpers so existing callers keep working.
from _helpers import isolate_test_database, purge_backend_modules  # noqa: E402


def reset_backend_test_env(extra_purge=()) -> None:
    """Convenience: purge cached backend modules so the next import is fresh."""
    purge_backend_modules(extra_purge)


@pytest.fixture
def backend_env(tmp_path, monkeypatch):
    """Opt-in fixture for backend (FastAPI router) tests.

    Sets up a fresh per-test SQLite database, rebinds the backend
    engine, and creates the schema. Tests using this fixture can
    `from <domain>.<module> import router` immediately afterwards.
    """
    yield isolate_test_database(tmp_path, monkeypatch)


# ---------------------------------------------------------------------------
# SP-CLOUD-4: PUT /tournaments/{id}/state requires an If-Match precondition.
#
# ~104 call sites across 44 test files write that blob, and not one of them is
# ABOUT concurrency — they are testing config locks, command replay, module
# summaries, the proposal pipeline. Requiring each to hand-manage a version
# would add ceremony to 104 tests to exercise a guard that one test file
# already covers properly.
#
# So the test client models what a real client does: it remembers the version
# it last saw and sends it. That is exactly the behaviour shipped in
# `api/client.ts` (`stateEtags`), which is what makes this an honest stand-in
# rather than a way of dodging the precondition.
#
# WHAT THIS DELIBERATELY DOES NOT DO: it never invents a version for a caller
# that supplied one. An explicit `If-Match` always wins, so a test can still
# drive a real conflict. And it only fills in for THIS route.
#
# The actual contract — 412 on a missing header, 409 with the current state on
# a stale one — is pinned in tests/test_concurrent_state_writes.py, which
# bypasses this shim by calling `client.request("PUT", ...)` directly. If you
# are adding a test about concurrency, use that file and that escape hatch;
# if you are adding a test that merely needs to save state, do nothing.
# ---------------------------------------------------------------------------
import re as _re  # noqa: E402

from starlette.testclient import TestClient as _TestClient  # noqa: E402

_STATE_PUT = _re.compile(r"^/tournaments/(?P<tid>[^/]+)/state(?:\?.*)?$")
_original_put = _TestClient.put


def _put_with_if_match(self, url, *args, **kwargs):
    match = _STATE_PUT.match(str(url))
    if match is not None:
        headers = dict(kwargs.get("headers") or {})
        if not any(k.lower() == "if-match" for k in headers):
            probe = self.get(
                f"/tournaments/{match.group('tid')}/state",
                # 204 is a real answer here: an empty workspace still has a
                # version, and its first save needs one.
                params=None,
            )
            etag = probe.headers.get("etag")
            if etag:
                headers["If-Match"] = etag
                kwargs["headers"] = headers
    return _original_put(self, url, *args, **kwargs)


_TestClient.put = _put_with_if_match
