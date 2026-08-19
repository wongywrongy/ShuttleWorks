"""Repo-root pytest config.

Pytest config lives in the root ``pyproject.toml`` and the canonical
invocation is a bare ``pytest``. This root-level conftest exists to stop
pytest auto-discovery from walking into the archive.

It is still load-bearing after SP-REORG-1 even though ``testpaths``
now bounds collection: ``collect_ignore_glob`` is what protects the
explicit invocations (``pytest archive/...``, ``pytest .``) that
``testpaths`` does not cover.

PR 4 of the backend-merge arc moved the old tournament product to
``archive/tournament-pre-merge/``. The archived ``conftest.py`` +
``tests/`` would otherwise be picked up by pytest's directory walk,
fail to import (sys.path bridges no longer resolve), and break the
collection step before any real tests run.
"""

collect_ignore_glob = ["archive/**"]
