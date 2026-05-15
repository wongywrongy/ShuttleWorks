"""Repo-root pytest config.

Each product owns its own pytest config + test suite (see
``products/scheduler/pyproject.toml``); the canonical invocation is
``pytest products/scheduler/tests/``. This root-level conftest only
exists to stop pytest auto-discovery from walking into the archive
when somebody runs ``pytest`` at the repo root by mistake.

PR 4 of the backend-merge arc moved the old tournament product to
``archive/tournament-pre-merge/``. The archived ``conftest.py`` +
``tests/`` would otherwise be picked up by pytest's directory walk,
fail to import (sys.path bridges no longer resolve), and break the
collection step before any real tests run.
"""

collect_ignore_glob = ["archive/**"]
