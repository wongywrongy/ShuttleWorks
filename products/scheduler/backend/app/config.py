"""Application settings loaded from environment variables.

Per ``docs/shuttleworks-tech-stack.md``: a Pydantic ``BaseSettings`` model
that reads ``DATABASE_URL`` / ``SUPABASE_URL`` / ``SUPABASE_ANON_KEY`` /
``ENVIRONMENT`` / ``CORS_ORIGINS`` and friends from the process
environment, falling back to a ``.env`` file in the working directory.

Single source of truth for every URL, DB path, port, and key the
backend reads at runtime. Step 1 introduced ``database_url``; Step 3
widened the surface to cover host/port/data_dir/log_level so the only
remaining env-var reads in the codebase are this module.
"""
from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide configuration. One source of truth for env vars."""

    # ---- Database ------------------------------------------------------
    database_url: str = "sqlite:///./local.db"

    # ---- Supabase (populated in Step 4) -------------------------------
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # ---- Deployment metadata ------------------------------------------
    environment: str = "local"  # local | cloud
    log_level: str = "info"

    # ---- Network ------------------------------------------------------
    # ``host``/``port`` are used by the ``python -m app.main`` entry
    # point and any local dev runner; the Docker image hardcodes
    # ``0.0.0.0:8000`` in its CMD because that's the contract the
    # compose port-binding relies on.
    host: str = "0.0.0.0"
    port: int = 8000

    # CORS — overridable via env var. Accepts either a JSON list
    # (``CORS_ORIGINS='["https://app.example.com"]'``) or a comma-
    # separated string (``CORS_ORIGINS=https://a.com,https://b.com``)
    # so operators can set it without escaping shell quotes.
    # ``NoDecode`` bypasses pydantic-settings' default JSON-decode of
    # complex-typed env vars so our validator below can decide which
    # format we received.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

    # ---- Filesystem ----------------------------------------------------
    # Writable directory for runtime artifacts (SQLite when the URL
    # points at a relative file, future upload caches, etc.). The
    # ``/health/deep`` probe checks this is writable.
    # ``BACKEND_DATA_DIR`` is honoured as a legacy alias so the existing
    # docker-compose.yml and pytest fixtures keep working without a
    # rename.
    data_dir: str = Field(
        default="/app/data",
        validation_alias=AliasChoices("DATA_DIR", "BACKEND_DATA_DIR"),
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: Any) -> Any:
        """Accept comma-separated as well as JSON-list env-var inputs."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
