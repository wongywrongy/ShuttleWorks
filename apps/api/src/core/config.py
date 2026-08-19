"""Application settings loaded from environment variables.

Per ``docs/tech-stack.md``: a Pydantic ``BaseSettings`` model
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
from pathlib import Path
from typing import Annotated, Any

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from core.limits import MAX_REQUEST_BODY_BYTES


class Settings(BaseSettings):
    """Process-wide configuration. One source of truth for env vars."""

    # ---- Database ------------------------------------------------------
    database_url: str = "sqlite:///./local.db"

    # ---- Deployment metadata ------------------------------------------
    environment: str = "local"  # local | cloud
    log_level: str = "info"

    # Which kind of process this is. `api` serves HTTP (and, in local
    # mode, hosts the embedded solve worker). `worker` is the standalone
    # `python -m worker` container, which serves no HTTP, sets no
    # cookies, and sends no mail.
    #
    # It exists so `_enforce_cloud_secrets` can validate what a process
    # actually uses. Without it a worker-only host has to carry SMTP
    # credentials and cookie settings it will never read, purely to get
    # past startup — and fake credentials in a config file are how real
    # ones eventually end up there.
    #
    # `worker.py` sets this itself before importing config, so the
    # compose file does not have to; setting it explicitly is supported
    # and preferred for clarity.
    process_role: str = "api"  # api | worker

    # ---- Network ------------------------------------------------------
    # ``host``/``port`` are used by the ``python -m core.main`` entry
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
    # (see ``core/client_ip.py``). Empty = trust nothing, which is the
    # right default and keeps local mode from ever reading the header.
    # Set this to the cloudflared connector's address behind a tunnel;
    # never to a wildcard, which would make the header a throttle
    # bypass. Same JSON-list-or-comma-separated parsing as CORS_ORIGINS.
    trusted_proxy_ips: Annotated[list[str], NoDecode] = []

    # Ceiling on a single request body, enforced by
    # ``core.body_limit.BodyLimitMiddleware``. Default in ``core/limits.py``
    # (4 MB — ~200x the largest observed real state blob). Exposed as a
    # setting because the binding case is the whole-document state PUT,
    # and an installation running genuinely large events is the one that
    # would need to raise it. Lowering it is always safe.
    max_request_body_bytes: int = MAX_REQUEST_BODY_BYTES

    # ---- Operational endpoints ----------------------------------------
    # Shared secret guarding /health/ready, /health/deep and
    # /health/metrics. NOT /health — liveness must stay credential-free
    # or a probe failure becomes indistinguishable from a dead process,
    # and an orchestrator kills a container it should have left alone.
    #
    # Those three carry operational detail: worker identities, live job
    # ids, queue depth, the deployed schema revision. None of it is a
    # credential, all of it is a free map of the private topology for
    # anyone who asks. The module docstring in ``ops/health.py`` used to
    # say "must not be published through the tunnel" — but the shipped
    # ingress publishes one hostname wholesale, so the only thing
    # enforcing that sentence was the sentence. This is the enforcement.
    #
    # Blank = guard disabled, which is correct for local mode (one
    # operator, one laptop, no ingress) and for the plain-HTTP compose
    # stacks whose Docker HEALTHCHECKs curl /health/deep. The cloud API
    # profile requires it (see ``_enforce_cloud_secrets``).
    # ``OPS_TOKEN_FILE`` is supported, like every other secret here.
    ops_token: str = ""

    # ---- Filesystem ----------------------------------------------------
    # Writable directory for runtime artifacts (SQLite when the URL
    # points at a relative file, future upload caches, etc.). The
    # ``/health/deep`` probe checks this is writable.
    # ``BACKEND_DATA_DIR`` is honoured as a legacy alias so the existing
    # docker-compose.yml and pytest fixtures keep working without a
    # rename.
    data_dir: str = Field(
        default="/core/data/",
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
    # implicit blank-secret keying it replaced.
    auth_mode: str = "local"  # local | cloud
    session_ttl_days: float = 30.0
    session_cookie_name: str = "sw_session"
    # Secure flag on the session cookie. Default off so plain-HTTP local
    # dev works; cloud deployments MUST serve HTTPS and set this true
    # (enforced by the cloud validator below).
    session_cookie_secure: bool = False
    # Blank = host-only cookie (the right default).
    session_cookie_domain: str = ""
    # The ENTRANT session cookie (SP-E1-2 / ruling R10, D-A3). A distinct
    # name from the operator's, on the same host-only default: with
    # ``session_cookie_domain`` blank, ``app.*`` and ``play.*`` keep separate
    # cookie jars, which is the mechanism actually doing the scoping work.
    # The distinct NAME is what lets one application serve both hosts
    # without a request ever carrying an ambiguous credential.
    entrant_session_cookie_name: str = "sw_play_session"
    # Credential-endpoint throttle: after ``auth_throttle_max_failures``
    # failed attempts inside the window, the key (account or IP) is
    # locked for ``auth_throttle_lock_seconds`` (doubling per further
    # failure, capped at 15 min).
    auth_throttle_max_failures: int = 5
    auth_throttle_window_seconds: float = 900.0
    auth_throttle_lock_seconds: float = 60.0
    # Registration volume per client IP (SP-SEC-1 Phase 3, SEC-03). A
    # SEPARATE bucket from the credential throttle above, because the two
    # count different things: that one counts *failures* and a legitimate
    # user produces none, so folding successful registrations into it
    # would spend a lockout budget sized for typos. An hour-long window
    # suits the real pattern — a director registers once, occasionally
    # once more for a co-director on the same venue IP.
    registration_max_per_ip: int = 5
    registration_window_seconds: float = 3600.0
    registration_lock_seconds: float = 300.0
    # Concurrent queued/running solve jobs a single user may hold across
    # ALL their workspaces. The uq_solve_jobs_active partial index bounds
    # this per tournament; nothing bounded it per user, and the shipped
    # worker runs worker_concurrency=1, so N jobs across N attacker-owned
    # workspaces starve every legitimate solve behind them.
    max_active_solve_jobs_per_user: int = 3
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
    #
    # This is program invariant I1 — the domain is configuration, never
    # code — and it already existed before Entries needed it. The public
    # entry surface composes its links from here too rather than growing a
    # second, subtly different origin setting.
    public_app_origin: str = ""
    # Cloud email invites expire; local link invites may be eternal.
    invite_ttl_days: float = 14.0

    # ---- Entries: public write surface (SP-E1-1) -----------------------
    # Cloudflare Turnstile. The defaults are Cloudflare's **documented
    # dummy pair** — sitekey ``1x00000000000000000000AA`` /  secret
    # ``1x0000000000000000000000000000000AA`` — which always pass. That is
    # deliberate on three counts: development and CI never depend on a
    # network call to a third party; the *code path* under test is the real
    # one (the widget renders, the token posts, the server verifies), so
    # nothing about the integration is stubbed out; and a default that was
    # a real key would be a real key committed to a git repository. Real
    # keys arrive as Phase 2 deployment configuration.
    #
    # The always-FAIL secret (``2x0000000000000000000000000000000AA``) is
    # what the refusal tests configure, so both verdicts are exercised
    # against the same code.
    turnstile_site_key: str = "1x00000000000000000000AA"
    turnstile_secret_key: str = "1x0000000000000000000000000000000AA"
    # Submission volume per client IP for the public entry form. A THIRD
    # bucket, separate from the credential and registration triples above,
    # for the same reason those two are separate from each other: they
    # count different things and a shared budget lets one surface's abuse
    # lock a venue out of another. A club secretary entering a squad
    # legitimately submits many times in a sitting, so the budget is
    # roomier than registration's and the window shorter — enough to stop
    # an automated flood, not enough to interrupt a human doing bulk entry.
    entries_max_per_ip: int = 20
    entries_window_seconds: float = 600.0
    entries_lock_seconds: float = 300.0

    # ---- Entrant accounts (SP-E1-2, ruling R10) ------------------------
    # Entrant SIGNUP volume per client IP — a FOURTH bucket
    # (``esignup:<ip>``), for the reason the three above are separate from
    # each other and one more besides. The general reason: they count
    # different things, and a shared budget lets one surface's abuse close
    # another. The specific one: ``identity/auth_routes.py`` guards operator login with
    # ``ip:<ip>``, so an entrant-facing surface that charged the operator
    # bucket would let anyone on the internet lock a director out of their
    # own event from a public form. That is the failure mode
    # ``tests/unit/test_entrant_throttle_namespaces.py`` exists to refuse.
    #
    # Sized between registration's and entries': creating an account is
    # expensive (an Argon2id hash plus a row) and a human does it once, but
    # a family or a club secretary legitimately creates several from one
    # venue address in a sitting — so the budget is a small handful per
    # hour rather than registration's five, and the lock is short enough
    # that a mistake costs a coffee break rather than the entry deadline.
    entrant_signup_max_per_ip: int = 8
    entrant_signup_window_seconds: float = 3600.0
    entrant_signup_lock_seconds: float = 300.0
    # Entrant LOGIN failures reuse the credential triple above
    # (``auth_throttle_*``) — the same budget for the same kind of event —
    # but in their own key namespaces (``eacct:`` / ``eip:``). Same
    # numbers, different buckets: what must not be shared is the *budget*,
    # not the policy.

    @model_validator(mode="before")
    @classmethod
    def _read_file_backed_secrets(cls, values: Any) -> Any:
        """Support ``<VAR>_FILE`` alongside every ``<VAR>``.

        Docker secrets, systemd credentials, and Kubernetes secret mounts
        all deliver a secret as a file. Reading it here means a
        deployment never has to put the value in ``environment:``, where
        it shows up in ``docker inspect``, in process listings, and in
        whatever shipped those.

        This exists specifically so a compose file can have ONE source of
        truth for a shared secret. The self-host stack needs the Postgres
        password in two places — the database container and the API's
        ``DATABASE_URL`` — and injecting it as a file for one and an env
        var for the other is how the two silently drift apart. (Observed
        during Phase 3.6: they did.)

        ``<VAR>`` wins if both are set, so an explicit value always
        overrides. Whitespace is stripped, because every tool that
        writes these appends a trailing newline.
        """
        import os

        if not isinstance(values, dict):
            return values
        for name in cls.model_fields:
            env_file_key = f"{name.upper()}_FILE"
            path = os.environ.get(env_file_key)
            if not path or name in values or name.upper() in os.environ:
                continue
            try:
                values[name] = Path(path).read_text(encoding="utf-8").strip()
            except OSError as exc:
                raise ValueError(
                    f"{env_file_key}={path!r} could not be read: {exc}"
                ) from exc
        return values

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

        # A standalone worker validates only what it uses: the database.
        # It answers no requests, so there is no session cookie to
        # secure and no identity to resolve; it sends no mail, so SMTP
        # is meaningless to it. Demanding those would force a
        # worker-only host to invent credentials it never reads.
        if self.process_role == "worker":
            if self.database_url.startswith("sqlite"):
                raise ValueError(
                    "ENVIRONMENT=cloud requires: DATABASE_URL (must be a "
                    "postgres URL). A standalone worker shares the API's "
                    "database; SQLite is per-process and it would claim "
                    "jobs from an empty queue forever."
                )
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
        # A cloud API is behind an ingress, and an ingress publishes a
        # hostname, not a route list. Without this the operational health
        # endpoints are open to the internet.
        if not self.ops_token:
            missing.append("OPS_TOKEN (guards /health/ready|deep|metrics)")
        if missing:
            raise ValueError(
                "ENVIRONMENT=cloud requires: "
                + ", ".join(missing)
                + ". Set these via your deployment host's secret manager."
            )
        return self

    @property
    def session_cookie_names(self) -> tuple[str, ...]:
        """**The registry of cookies that authenticate a request.**

        One place names every session cookie the application sets, because
        two things have to agree about that list and they used to agree by
        coincidence: the code that *sets* a cookie, and the CSRF middleware
        that decides whether a write is cookie-authenticated.

        The trap this closes is written down in spec Q13 §2 and was found
        before it shipped: the middleware triggered on
        ``settings.session_cookie_name in request.cookies`` — a **single**
        name — so the day a second principal's cookie arrived under a second
        name, every write it authenticated would have fallen silently
        outside CSRF enforcement. Silently is the operative word: nothing
        fails, nothing logs, and the check that is supposed to be there
        simply is not.

        Adding a cookie that authenticates a request means adding it here.
        ``tests/test_csrf_cookie_registry.py`` derives the set of
        ``set_cookie`` calls in ``backend/api/`` from the source and fails if
        one names a cookie this property does not, so the requirement is
        enforced by the tree rather than by memory.
        """
        return (self.session_cookie_name, self.entrant_session_cookie_name)

    @property
    def csrf_relevant_cookie_names(self) -> tuple[str, ...]:
        """**The registry the CSRF middleware triggers on.**

        A superset of ``session_cookie_names``, and the difference is the
        point. ``session_cookie_names`` answers "does this request carry a
        credential" — a question about identity, read by anything that cares
        who the caller is. This answers "must this write prove it was sent
        deliberately", which is strictly wider: the pre-session
        ``sw_play_csrf`` nonce carries no identity at all, and a login or
        signup post holding it still has to present a matching token.

        Keeping them as two properties rather than one widened list is what
        stops the nonce from ever being mistaken for a credential by code
        reading the registry for the other reason. See
        ``core/form_csrf.py::PLAY_CSRF_COOKIE``.

        The import is deferred because ``core.form_csrf`` reads ``settings``
        at module scope. Deliberately importing the name rather than
        repeating the string: the constant there is the one the
        ``set_cookie`` call uses and the one
        ``tests/test_csrf_cookie_registry.py`` resolves out of the source, so
        a second copy here could drift — and the copy the middleware trusted
        would be the one the browser never received. (The ``set_cookie`` call
        itself now lives in the SSR tier under ruling R8-D; this file, that
        constant and the verification path are unchanged by that.)
        """
        from core.form_csrf import PLAY_CSRF_COOKIE

        return (*self.session_cookie_names, PLAY_CSRF_COOKIE)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()


def cloud_modules_enabled() -> bool:
    """Whether this deployment can operate ``CLOUD_ONLY_MODULES``.

    **Ruling D2: the predicate is AUTH_MODE, not ENVIRONMENT.** The Entries
    design originally keyed the cloud-only module rule on
    ``settings.environment == "cloud"``, which collides with the tree:
    ``docker-compose.cloud.yml`` deliberately runs ``ENVIRONMENT=local``
    (it is a smoke stack, and ``ENVIRONMENT=cloud`` trips the hard
    start-up validator above). ``AUTH_MODE`` is the honest signal — Entries
    is public self-service registration and is meaningless without real
    operator accounts, which is exactly what ``AUTH_MODE=cloud`` means. The
    smoke and self-host stacks both set it; plain local stacks do not.

    Read at call time, never captured at import, so a test can flip it with
    ``monkeypatch.setattr(settings, "auth_mode", …)`` — the pattern
    ``tests/unit/test_dependencies.py`` and ``tests/test_client_ip_trust.py``
    already use.
    """
    return settings.auth_mode == "cloud"
