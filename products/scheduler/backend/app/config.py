"""Application settings loaded from environment variables.

Per ``docs/shuttleworks-tech-stack.md``: a Pydantic ``BaseSettings`` model
that reads ``DATABASE_URL`` / ``ENVIRONMENT`` / ``CORS_ORIGINS`` and
friends from the process environment, falling back to a ``.env`` file in
the working directory.

Single source of truth for every URL, DB path, port, and key the
backend reads at runtime. Step 1 introduced ``database_url``; Step 3
widened the surface to cover host/port/data_dir/log_level so the only
remaining env-var reads in the codebase are this module.
"""
from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide configuration. One source of truth for env vars."""

    # ---- Database ------------------------------------------------------
    database_url: str = "sqlite:///./local.db"

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

    # Immediate peers whose ``CF-Connecting-IP`` header may be believed
    # (see ``app/client_ip.py``). Empty = trust nothing, which is the
    # right default and keeps local mode from ever reading the header.
    # Set this to the cloudflared connector's address behind a tunnel;
    # never to a wildcard, which would make the header a throttle
    # bypass. Same JSON-list-or-comma-separated parsing as CORS_ORIGINS.
    trusted_proxy_ips: Annotated[list[str], NoDecode] = []

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

    # ---- Solve jobs & worker runtime (SP-CLOUD-1) ----------------------
    # The embedded worker runs the job loop inside the API process
    # (local mode, zero-config). Cloud mode turns it off and runs
    # ``python -m worker`` containers against the same DATABASE_URL.
    embedded_worker: bool = True
    # One solve owns its CPU allocation — two concurrent solves on one
    # node degrade both. Raise only on machines with headroom to spare.
    worker_concurrency: int = 1
    # Stable identity stamped into ``solve_jobs.claimed_by``. Blank →
    # derived at startup as ``<hostname>-<pid>``.
    worker_id: str = ""
    # Determinism defaults persisted into every job's ``params`` at
    # submit (Rule 5): fixed seed, single search worker, and a
    # deterministic-time budget as the binding stop criterion. The
    # wall-clock ceiling is an outer safety kill only — far above the
    # deterministic budget so it never binds on a healthy run.
    solve_random_seed: int = 42
    solve_num_workers: int = 1
    solve_max_deterministic_time: float = 60.0
    solve_wall_clock_ceiling_seconds: float = 300.0
    # Child-process address-space cap (enforced on Linux via
    # ``resource.setrlimit``; logged-off on Windows dev).
    solve_memory_limit_mb: int = 1024
    # A running job whose heartbeat is older than the lease returns to
    # the queue (bounded by ``max_attempts``) — how a dead worker's job
    # survives. Heartbeats are emitted every few seconds, so 30 s means
    # several missed beats before a reap.
    job_lease_seconds: float = 30.0
    job_max_attempts: int = 2
    # Terminal jobs are pruned after this window (AIP-151's operation
    # expiry rule of thumb) so the table stays small forever.
    job_retention_days: int = 30
    # Worker claim-poll cadence. Plain short-interval polling — portable
    # to SQLite and sufficient at solves-per-day throughput.
    job_poll_interval_seconds: float = 1.0

    # ---- Auth & sessions (SP-CLOUD-2) ---------------------------------
    # ``local`` — the zero-friction solo-operator mode: requests without
    # a session resolve to the bootstrap local identity; no signup, no
    # email, no network. ``cloud`` — real accounts required; a request
    # without a valid session cookie is 401. Explicit mode beats the old
    # implicit "SUPABASE_URL is blank" keying.
    auth_mode: str = "local"  # local | cloud
    session_ttl_days: float = 30.0
    session_cookie_name: str = "sw_session"
    # Secure flag on the session cookie. Default off so plain-HTTP local
    # dev works; cloud deployments MUST serve HTTPS and set this true
    # (enforced by the cloud validator below).
    session_cookie_secure: bool = False
    # Blank = host-only cookie (the right default).
    session_cookie_domain: str = ""
    # Credential-endpoint throttle: after ``auth_throttle_max_failures``
    # failed attempts inside the window, the key (account or IP) is
    # locked for ``auth_throttle_lock_seconds`` (doubling per further
    # failure, capped at 15 min).
    auth_throttle_max_failures: int = 5
    auth_throttle_window_seconds: float = 900.0
    auth_throttle_lock_seconds: float = 60.0
    # Password policy per NIST 800-63B: length only, no composition
    # rules, no rotation.
    password_min_length: int = 8
    password_max_length: int = 128
    # Password-reset token lifetime (delivery rides the email seam).
    reset_token_ttl_minutes: float = 60.0
    # ---- Email seam (SP-CLOUD-2 Phase 3) ------------------------------
    # console = log the message (local default, tests); smtp = generic
    # SMTP (cloud). No provider SDKs — Rule 3 keeps local offline.
    email_backend: str = "console"  # console | smtp
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "ShuttleWorks <no-reply@localhost>"
    smtp_use_tls: bool = True
    # Public origin used to build absolute links in emails (invite /
    # reset URLs). Blank = relative links (local mode).
    public_app_origin: str = ""
    # Cloud email invites expire; local link invites may be eternal.
    invite_ttl_days: float = 14.0

    @field_validator("cors_origins", "trusted_proxy_ips", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: Any) -> Any:
        """Accept comma-separated as well as JSON-list env-var inputs."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def _enforce_cloud_secrets(self) -> "Settings":
        # In cloud mode the bootstrap-identity fallback is unacceptable
        # — every request would silently act as the local operator.
        # Refuse to start unless real accounts + secure cookies + a
        # real database are configured.
        if self.environment != "cloud":
            return self
        missing: list[str] = []
        if self.database_url.startswith("sqlite"):
            missing.append("DATABASE_URL (must be a postgres URL)")
        if self.auth_mode != "cloud":
            missing.append("AUTH_MODE=cloud (real accounts required)")
        if not self.session_cookie_secure:
            missing.append("SESSION_COOKIE_SECURE=true (HTTPS-only cookies)")
        # The console email backend writes full messages — including
        # raw reset/invite tokens — into the log stream. Fine locally;
        # in a real cloud deployment that is credential leakage plus
        # silent non-delivery, so refuse to start without SMTP.
        if self.email_backend != "smtp":
            missing.append("EMAIL_BACKEND=smtp (console would log live tokens)")
        elif not self.smtp_host:
            missing.append("SMTP_HOST")
        if missing:
            raise ValueError(
                "ENVIRONMENT=cloud requires: "
                + ", ".join(missing)
                + ". Set these via your deployment host's secret manager."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
