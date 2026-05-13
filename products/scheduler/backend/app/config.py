"""Application settings loaded from environment variables.

Per ``docs/shuttleworks-tech-stack.md``: a Pydantic ``BaseSettings`` model
that reads ``DATABASE_URL`` / ``SUPABASE_URL`` / ``SUPABASE_ANON_KEY`` /
``ENVIRONMENT`` / ``CORS_ORIGINS`` from the process environment, falling
back to a ``.env`` file in the working directory.

Step 1 of the cloud-prep migration introduces this module and the
``database_url`` setting only; the remaining fields are declared up front
so later steps (Supabase Auth in Step 4, deployment config in Step 8)
don't have to widen the schema mid-step.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide configuration. One source of truth for env vars."""

    # Database
    database_url: str = "sqlite:///./local.db"

    # Supabase (populated in Step 4)
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Deployment metadata
    environment: str = "local"  # local | cloud

    # CORS — overridable via env var with a JSON list
    # (e.g. CORS_ORIGINS='["https://app.example.com"]').
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
