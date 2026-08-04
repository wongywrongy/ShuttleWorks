"""SimClient — the ONLY place HTTP happens in the simulator.

Thin, hand-written httpx wrapper over the backend API. Every call records
into :class:`ApiStats`; unexpected statuses raise :class:`ApiError`.
Retries cover transport errors only (connect/read timeouts) — an HTTP
response, even a 500, is never retried: a 5xx is a *finding* and fails the
run at report time.

Meet solves ride the async job rail (``POST /tournaments/{id}/solve-jobs``
+ polling — SP-CLOUD-1); bracket solves still use the synchronous
``POST /bracket/schedule-next``. Never the ``/stream`` SSE variants
(dev proxies buffer SSE).
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

import httpx

_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I
)


def _template(path: str) -> str:
    """Normalize concrete ids out of a path for stats keys — keeps the
    per-endpoint report readable AND makes byEndpoint deterministic across
    runs (the server generates tournament UUIDs)."""
    return _UUID_RE.sub("{id}", path)

# Statuses that chaos steps may legitimately expect.
OK = frozenset({200})
OK_OR_CREATED = frozenset({200, 201})


class ApiError(Exception):
    """An HTTP response outside the caller's expected-status set."""

    def __init__(self, method: str, url: str, status: int, body: str):
        self.method, self.url, self.status, self.body = method, url, status, body
        super().__init__(f"{method} {url} -> {status}: {body[:400]}")


@dataclass
class ApiStats:
    """Per-run request accounting, folded into the final report."""

    requests: int = 0
    by_status: dict[int, int] = field(default_factory=dict)
    by_endpoint: dict[str, int] = field(default_factory=dict)
    server_errors: list[str] = field(default_factory=list)  # any 5xx — always a finding
    unexpected_4xx: list[str] = field(default_factory=list)  # 4xx not in the caller's expect set
    latency_total_ms: float = 0.0
    latency_max_ms: float = 0.0

    def record(self, method: str, path: str, status: int, ms: float, expected: bool) -> None:
        self.requests += 1
        self.by_status[status] = self.by_status.get(status, 0) + 1
        key = f"{method} {_template(path)}"
        self.by_endpoint[key] = self.by_endpoint.get(key, 0) + 1
        self.latency_total_ms += ms
        self.latency_max_ms = max(self.latency_max_ms, ms)
        if status >= 500:
            self.server_errors.append(f"{key} -> {status}")
        elif status >= 400 and not expected:
            self.unexpected_4xx.append(f"{key} -> {status}")


class SimClient:
    """Typed-ish wrapper over the backend HTTP API.

    ``base_url`` points straight at the backend (``http://localhost:8600``)
    or at the nginx prefix (``http://localhost/api``) — paths are joined
    verbatim either way. Local dev needs no auth (blank SUPABASE_URL =
    synthetic user); ``auth_token`` exists so a future authed environment
    needs no refactor.
    """

    #: transport-level retries (connect refused during server warmup etc.)
    TRANSPORT_RETRIES = 3

    def __init__(
        self,
        base_url: str,
        *,
        stats: Optional[ApiStats] = None,
        auth_token: Optional[str] = None,
        timeout: float = 60.0,  # /schedule solves synchronously
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.stats = stats if stats is not None else ApiStats()
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        self._http = httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout)

    def close(self) -> None:
        self._http.close()

    # ---- core request machinery -----------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        headers: Optional[dict[str, str]] = None,
        expect: Iterable[int] = OK,
    ) -> httpx.Response:
        expect = frozenset(expect)
        last_exc: Exception | None = None
        for attempt in range(self.TRANSPORT_RETRIES):
            start = time.perf_counter()
            try:
                resp = self._http.request(method, path, json=json, headers=headers)
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as exc:
                last_exc = exc
                time.sleep(0.25 * (attempt + 1))
                continue
            ms = (time.perf_counter() - start) * 1000
            # Stats key uses the *template-ish* path the caller passed.
            self.stats.record(method, path, resp.status_code, ms, resp.status_code in expect)
            if resp.status_code not in expect:
                raise ApiError(method, path, resp.status_code, resp.text)
            return resp
        raise ApiError(method, path, 0, f"transport failure after retries: {last_exc}")

    def _json(self, method: str, path: str, **kw) -> Any:
        resp = self.request(method, path, **kw)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # ---- health / workspace ----------------------------------------------

    def health(self) -> dict:
        return self._json("GET", "/health")

    def create_tournament(
        self,
        name: str,
        kind: str = "meet",
        modules: Optional[list[dict]] = None,
    ) -> dict:
        body: dict[str, Any] = {"name": name, "kind": kind}
        if modules is not None:
            body["modules"] = modules
        return self._json("POST", "/tournaments", json=body, expect=OK_OR_CREATED)

    def delete_tournament(self, tid: str) -> None:
        self.request("DELETE", f"/tournaments/{tid}", expect={204})

    def get_modules(self, tid: str) -> list[dict]:
        return self._json("GET", f"/tournaments/{tid}/modules")

    def patch_module(self, tid: str, module_id: str, status: str, config: Optional[dict] = None) -> dict:
        body: dict[str, Any] = {"status": status}
        if config is not None:
            body["config"] = config
        return self._json("PATCH", f"/tournaments/{tid}/modules/{module_id}", json=body)

    # ---- meet state / solve -----------------------------------------------

    def get_state(self, tid: str) -> Optional[dict]:
        return self._json("GET", f"/tournaments/{tid}/state", expect={200, 204})

    def put_state(self, tid: str, blob: dict) -> dict:
        return self._json("PUT", f"/tournaments/{tid}/state", json=blob)

    def solve(
        self,
        tid: str,
        config: dict,
        players: list[dict],
        matches: list[dict],
        *,
        poll_interval: float = 0.25,
        timeout: float = 120.0,
    ) -> dict:
        """Submit a solve job and poll it to a terminal status.

        SP-CLOUD-1 replaced the synchronous ``POST /schedule`` with the
        job rail; this drives the exact flow the frontend uses (submit →
        poll → read ``result``). ``infeasible`` returns the ScheduleDTO
        (its ``status`` says so — invariant checks treat it as a
        finding); ``failed``/``cancelled`` raise :class:`ApiError` so the
        run fails loudly.
        """
        job = self._json(
            "POST",
            f"/tournaments/{tid}/solve-jobs",
            json={"config": config, "players": players, "matches": matches},
            expect={202},
        )
        deadline = time.monotonic() + timeout
        terminal = {"succeeded", "failed", "infeasible", "cancelled"}
        while job["status"] not in terminal:
            if time.monotonic() > deadline:
                raise ApiError(
                    "GET", f"/tournaments/{tid}/solve-jobs/{job['id']}", 0,
                    f"solve job still {job['status']} after {timeout}s",
                )
            time.sleep(poll_interval)
            job = self._json("GET", f"/tournaments/{tid}/solve-jobs/{job['id']}")
        if job["status"] in ("succeeded", "infeasible"):
            return job["result"]
        raise ApiError(
            "GET",
            f"/tournaments/{tid}/solve-jobs/{job['id']}",
            0,
            f"solve job terminal status {job['status']}: {job.get('error')}",
        )

    def finalize_plan(self, tid: str, finalized: bool = True) -> dict:
        return self._json("POST", f"/tournaments/{tid}/plan-finalized", json={"finalized": finalized})

    # ---- operations (meet command queue + match states) --------------------

    def submit_command(self, tid: str, cmd: dict, *, expect: Iterable[int] = OK) -> httpx.Response:
        """POST one operator command. Returns the raw response so chaos
        steps can inspect 409 bodies; callers use ``.json()`` on 200."""
        return self.request("POST", f"/tournaments/{tid}/commands", json=cmd, expect=expect)

    def get_match_states(self, tid: str) -> dict:
        return self._json("GET", f"/tournaments/{tid}/match-states")

    def get_match_state(self, tid: str, match_id: str) -> tuple[dict, int]:
        """Single match state + its canonical version (from the ETag)."""
        resp = self.request("GET", f"/tournaments/{tid}/match-states/{match_id}")
        etag = (resp.headers.get("ETag") or '"0"').strip('"').removeprefix("W/").strip('"')
        return resp.json(), int(etag)

    def put_match_state(
        self,
        tid: str,
        match_id: str,
        body: dict,
        *,
        if_match: int,
        expect: Iterable[int] = OK,
    ) -> httpx.Response:
        return self.request(
            "PUT",
            f"/tournaments/{tid}/match-states/{match_id}",
            json=body,
            headers={"If-Match": f'"{if_match}"'},
            expect=expect,
        )

    # ---- bracket ------------------------------------------------------------

    def create_bracket(self, tid: str, body: dict) -> dict:
        return self._json("POST", f"/tournaments/{tid}/bracket", json=body, expect=OK_OR_CREATED)

    def get_bracket(self, tid: str) -> dict:
        return self._json("GET", f"/tournaments/{tid}/bracket")

    def generate_event(self, tid: str, event_id: str, wipe: bool = False) -> dict:
        return self._json(
            "POST", f"/tournaments/{tid}/bracket/events/{event_id}/generate", json={"wipe": wipe}
        )

    def schedule_next(self, tid: str) -> dict:
        return self._json("POST", f"/tournaments/{tid}/bracket/schedule-next")

    def bracket_match_action(self, tid: str, play_unit_id: str, action: str, slot: Optional[int] = None) -> dict:
        body: dict[str, Any] = {"play_unit_id": play_unit_id, "action": action}
        if slot is not None:
            body["slot"] = slot
        return self._json("POST", f"/tournaments/{tid}/bracket/match-action", json=body)

    def bracket_command(self, tid: str, body: dict, *, expect: Iterable[int] = OK) -> httpx.Response:
        return self.request("POST", f"/tournaments/{tid}/bracket/commands", json=body, expect=expect)

    def swiss_next_round(self, tid: str, event_id: str) -> httpx.Response:
        """409 is a legitimate answer here (all K rounds generated / round
        incomplete / non-progressive) — callers inspect the status."""
        return self.request(
            "POST",
            f"/tournaments/{tid}/bracket/events/{event_id}/rounds/next",
            expect={200, 409},
        )
