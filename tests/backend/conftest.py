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


# ---------------------------------------------------------------------------
# Ruling D5: ``seen_version`` is mandatory on POST /bracket/results and
# POST /bracket/commands.
#
# Same situation the shim above was written for, and the same answer. Dozens
# of call sites across the suite record a bracket result on the way to testing
# something else — publication gates, standings, double-elimination shapes,
# event status flips — and not one of them is ABOUT concurrency. Requiring each
# to hand-manage a version would add ceremony everywhere to exercise a guard
# one test file already covers properly, and the version is not even guessable:
# advancement bumps the DOWNSTREAM matches' versions, so a literal would be
# wrong for every round after the first.
#
# So the test client models what a real client does: it reads the version off
# the draw the product is serving and sends it. That is exactly what the
# console does (`useBracketResultQueue` sends `pu.version`), which is what
# makes this an honest stand-in rather than a way of dodging the precondition.
#
# WHAT THIS DELIBERATELY DOES NOT DO: it never invents a version for a caller
# that supplied one, so a test can still drive a real stale-version conflict.
# And it only fills in for THESE two routes.
#
# The actual contract — 422 when the token is absent — is pinned in
# tests/backend/unit/test_bracket_result_optimistic.py, which bypasses this
# shim by calling `client.request("POST", ...)` directly. If you are adding a
# test about the precondition, use that file and that escape hatch; if you are
# adding a test that merely needs a result recorded, do nothing.
# ---------------------------------------------------------------------------
_BRACKET_WRITE = _re.compile(
    r"^/tournaments/(?P<tid>[^/]+)/bracket/(?:results|commands)(?:\?.*)?$"
)
_original_post = _TestClient.post


def _post_with_seen_version(self, url, *args, **kwargs):
    match = _BRACKET_WRITE.match(str(url))
    body = kwargs.get("json")
    if (
        match is not None
        and isinstance(body, dict)
        and "seen_version" not in body
        and body.get("play_unit_id")
    ):
        # 1 is the server's own assumption for an untouched match, and it is
        # what a unit the draw does not name (or no draw at all) must get:
        # otherwise a test about a 404 would be answered 422 by this shim
        # instead of reaching the handler it is about.
        version = 1
        draw = self.get(f"/tournaments/{match.group('tid')}/bracket")
        if draw.status_code == 200:
            for unit in draw.json().get("play_units") or []:
                if unit.get("id") == body["play_unit_id"]:
                    version = unit.get("version") or 1
                    break
        kwargs["json"] = {**body, "seen_version": version}
    return _original_post(self, url, *args, **kwargs)


_TestClient.post = _post_with_seen_version
