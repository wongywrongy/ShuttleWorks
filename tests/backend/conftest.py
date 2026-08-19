"""Shared pytest setup for the backend test suite.

Pytest's rootdir is the repository root. The FastAPI app and its
adapter / api / services packages live under ``apps/api/``; we insert
that directory at the front of ``sys.path`` at conftest load time so
every test can do ``from app.X import Y`` and friends without local
sys.path manipulation. We also add this directory to ``sys.path`` so
test modules can ``from _helpers import isolate_test_database``.

The insert is still required after SP-REORG-1. It exists because the API
is a set of top-level packages (``app``, ``api``, ``services``, ...) that
are imported by those bare names, not because the old tree was ambiguous,
so moving the tree did not remove the need for it. Phase 3 is what can
retire it: once the API is one importable root, this becomes a single
path entry or nothing at all.

``scheduler_core`` is installed as a regular package via its own
``pyproject.toml`` and reaches every test through site-packages.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest


_TESTS_DIR = Path(__file__).resolve().parent          # tests/backend
_REPO_ROOT = _TESTS_DIR.parents[1]                    # the repository root
_API_ROOT = str(_REPO_ROOT / "apps" / "api")

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
    `from api.<module> import router` immediately afterwards.
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
