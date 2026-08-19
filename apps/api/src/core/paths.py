"""Shared filesystem helpers: the tree's roots, and the data directory.

The data directory is resolved from ``core.config.settings.data_dir``;
``BACKEND_DATA_DIR`` is honoured as a legacy alias by ``Settings`` itself via
the field's env alias (case-insensitive name match) so existing dockerfiles and
make targets keep working.

The ROOT constants below exist because four modules were each counting parent
directories to the same two places, and they did not even agree on how
(``parents[1]`` in one, ``parent.parent` in another). SP-REORG-1 moved every one
of them one level deeper, which changed what those counts meant without
changing a single one of them. Counted once, named, and imported.
"""
from __future__ import annotations

from pathlib import Path

from core.config import settings

#: ``apps/api/src`` — the sys.path root. Packages are imported relative to this.
SRC_ROOT = Path(__file__).resolve().parents[1]
#: ``apps/api`` — holds alembic.ini, the Dockerfile and the requirements files.
API_ROOT = SRC_ROOT.parent
#: Alembic's config file and its script tree, which sit on opposite sides of
#: that boundary: the ini stays with the app, the migrations moved under src/.
ALEMBIC_INI = API_ROOT / "alembic.ini"
ALEMBIC_SCRIPTS = SRC_ROOT / "alembic"
#: Data files shipped inside the kernel package.
WORDLISTS = SRC_ROOT / "core" / "wordlists"


def data_dir() -> Path:
    """Return the configured data directory as a ``Path``."""
    return Path(settings.data_dir)


def ensure_data_dir() -> Path:
    """Make sure the data directory exists and return its path."""
    d = data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d
