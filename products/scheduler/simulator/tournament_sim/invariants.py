"""Invariant checks — the "testing suite" half of the simulator.

Each function returns a list of :class:`Violation`; scenarios append them
to ``ctx.violations``. Checks compare SERVER read-models against the sim's
:class:`~tournament_sim.ledger.SimLedger` — they never re-implement
product logic (standings math, advancement rules).
"""
from __future__ import annotations

from dataclasses import dataclass

from .client import SimClient
from .context import RunContext

#: formats whose end state is "exactly one champion decided by a final".
#: ONLY se/de: se units carry segment=None and de carries W/L/GF. monrad
#: (M/PLATE/P{lo}_{hi}) and compass (E/W/N/S/NE/NW/SE/SW) decide EVERY
#: position via their own segment finals — structurally "all units must
#: resolve", same as rr/swiss, so they take that branch instead. (Review
#: finding: with them in this set the champion check was vacuous for
#: monrad and validated compass's West consolation instead of East.)
KNOCKOUT_FORMATS = {"se", "de"}


@dataclass
class Violation:
    phase: str
    check: str
    detail: str

    def __str__(self) -> str:  # pragma: no cover - formatting
        return f"[{self.phase}] {self.check}: {self.detail}"


# ---- meet ----------------------------------------------------------------


def check_schedule(schedule: dict, config: dict, matches: list[dict], players: list[dict]) -> list[Violation]:
    """Post-solve sanity: feasibility, no court overlap, no player overlap."""
    v: list[Violation] = []
    status = schedule.get("status")
    if status not in ("optimal", "feasible"):
        v.append(Violation("solve", "solver-status",
                           f"status={status}, reasons={schedule.get('infeasibleReasons')}"))
        return v  # nothing else meaningful to check

    assignments = schedule.get("assignments") or []
    match_ids = {m["id"] for m in matches}
    seen: set[str] = set()
    court_windows: dict[int, list[tuple[int, int, str]]] = {}
    for a in assignments:
        mid = a["matchId"]
        if mid in seen:
            v.append(Violation("solve", "duplicate-assignment", mid))
        seen.add(mid)
        if mid not in match_ids:
            v.append(Violation("solve", "unknown-match", mid))
        court_windows.setdefault(a["courtId"], []).append(
            (a["slotId"], a["slotId"] + a.get("durationSlots", 1), mid)
        )

    unscheduled = set(schedule.get("unscheduledMatches") or [])
    missing = match_ids - seen - unscheduled
    if missing:
        v.append(Violation("solve", "match-not-assigned", ", ".join(sorted(missing))))

    for court, windows in court_windows.items():
        windows.sort()
        for (s1, e1, m1), (s2, e2, m2) in zip(windows, windows[1:]):
            if s2 < e1:
                v.append(Violation("solve", "court-overlap",
                                   f"court {court}: {m1} [{s1},{e1}) vs {m2} [{s2},{e2})"))

    # player double-booking
    by_match = {m["id"]: m for m in matches}
    player_windows: dict[str, list[tuple[int, int, str]]] = {}
    for a in assignments:
        m = by_match.get(a["matchId"])
        if not m:
            continue
        for pid in (m.get("sideA") or []) + (m.get("sideB") or []) + (m.get("sideC") or []):
            player_windows.setdefault(pid, []).append(
                (a["slotId"], a["slotId"] + a.get("durationSlots", 1), m["id"])
            )
    for pid, windows in player_windows.items():
        windows.sort()
        for (s1, e1, m1), (s2, e2, m2) in zip(windows, windows[1:]):
            if s2 < e1:
                v.append(Violation("solve", "player-overlap",
                                   f"player {pid}: {m1} overlaps {m2}"))
    return v


def _subset_eq(sent, got) -> bool:
    """True when everything the sim SENT survives in what the server
    returns. The server re-serializes blobs through Pydantic, adding
    Optional fields with ``None``/defaults — so strict equality would
    always fire; drift only counts when a *sent* value changed."""
    if isinstance(sent, dict):
        if not isinstance(got, dict):
            return False
        return all(_subset_eq(v, got.get(k)) for k, v in sent.items())
    if isinstance(sent, list):
        if not isinstance(got, list) or len(sent) != len(got):
            return False
        return all(_subset_eq(a, b) for a, b in zip(sent, got))
    return sent == got


def check_state_roundtrip(put_blob: dict, got_blob: dict) -> list[Violation]:
    """PUT -> GET round-trip: every sent value survives (subset semantics),
    modulo server-derived fields."""
    v: list[Violation] = []
    # version is server-stamped to CURRENT_TOURNAMENT_SCHEMA_VERSION on
    # every write (repositories/local.py::_stamp_payload) — derived too.
    DERIVED = {"updatedAt", "standings", "version"}
    for key, sent in put_blob.items():
        if key in DERIVED:
            continue
        if not _subset_eq(sent, got_blob.get(key)):
            v.append(Violation("state", "roundtrip-drift",
                               f"key {key!r} changed across PUT->GET"))
    return v


def check_meet_final(client: SimClient, ctx: RunContext) -> list[Violation]:
    """End of a meet run: every ledger match terminal + scores match."""
    v: list[Violation] = []
    states = client.get_match_states(ctx.tid) or {}
    for mid, rec in ctx.ledger.meet_matches.items():
        server = states.get(mid)
        if rec.status in ("finished", "retired"):
            if server is None:
                v.append(Violation("final", "missing-match-state", mid))
                continue
            # legacy vocab collapses retired -> finished
            if server.get("status") != "finished":
                v.append(Violation("final", "status-mismatch",
                                   f"{mid}: server={server.get('status')} ledger={rec.status}"))
            if rec.score is not None and server.get("score") != rec.score:
                v.append(Violation("final", "score-mismatch",
                                   f"{mid}: server={server.get('score')} ledger={rec.score}"))

    # standings internal consistency + reconciliation with ledger wins
    state = client.get_state(ctx.tid) or {}
    standings = state.get("standings") or []
    for row in standings:
        if row.get("wins", 0) + row.get("losses", 0) != row.get("matchesPlayed", 0):
            v.append(Violation("final", "standings-arithmetic", str(row)))
    scored = [r for r in ctx.ledger.meet_matches.values()
              if r.status == "finished" and r.score and r.score["sideA"] != r.score["sideB"]]
    total_wins = sum(row.get("wins", 0) for row in standings)
    if standings and total_wins != len(scored):
        v.append(Violation("final", "standings-total",
                           f"server total wins {total_wins} != ledger scored finishes {len(scored)}"))
    return v


# ---- bracket ---------------------------------------------------------------


def check_bracket_wave(dto: dict, scheduled_ids: list[str]) -> list[Violation]:
    """After a schedule-next wave: assignments exist and don't overlap.

    Overlap counts only when at least one side of the pair belongs to the
    CURRENT wave — finished assignments from earlier waves are history and
    two of them sharing a slot window is not this wave's defect.
    """
    v: list[Violation] = []
    current = set(scheduled_ids)
    assigned = {a["play_unit_id"]: a for a in dto.get("assignments") or []}
    for pu in scheduled_ids:
        if pu not in assigned:
            v.append(Violation("bracket-wave", "missing-assignment", pu))
    court_windows: dict[int, list[tuple[int, int, str]]] = {}
    for a in assigned.values():
        court_windows.setdefault(a["court_id"], []).append(
            (a["slot_id"], a["slot_id"] + a.get("duration_slots", 1), a["play_unit_id"])
        )
    for court, windows in court_windows.items():
        windows.sort()
        for (s1, e1, m1), (s2, e2, m2) in zip(windows, windows[1:]):
            if s2 < e1 and (m1 in current or m2 in current):
                v.append(Violation("bracket-wave", "court-overlap",
                                   f"court {court}: {m1} [{s1},{e1}) vs {m2} [{s2},{e2})"))
    return v


def check_bracket_final(client: SimClient, ctx: RunContext, fmt: str, event_id: str) -> list[Violation]:
    """End of a bracket event: results complete + consistent with ledger."""
    v: list[Violation] = []
    dto = client.get_bracket(ctx.tid)
    results = {r["play_unit_id"]: r for r in dto.get("results") or []}

    # every ledger result made it to the server, with the same winner
    for pu_id, rec in ctx.ledger.bracket_results.items():
        server = results.get(pu_id)
        if server is None:
            v.append(Violation("bracket-final", "missing-result", pu_id))
        elif server.get("winner_side") != rec.winner_side:
            v.append(Violation("bracket-final", "winner-mismatch",
                               f"{pu_id}: server={server.get('winner_side')} ledger={rec.winner_side}"))

    event = next((e for e in dto.get("events") or [] if e["id"] == event_id), None)
    if event is None:
        v.append(Violation("bracket-final", "missing-event", event_id))
        return v

    event_units = [u for u in dto.get("play_units") or [] if u["event_id"] == event_id]
    unresolved = [u["id"] for u in event_units if u["id"] not in results]
    if fmt in KNOCKOUT_FORMATS:
        # A champion exists: the unit with no dependents inside its segment
        # ('W'/None) has a result. Cheap proxy: max round_index of the main
        # segment resolved.
        main = [u for u in event_units if (u.get("segment") in (None, "W", "GF"))]
        if main:
            final_unit = max(main, key=lambda u: (u["round_index"], u["match_index"]))
            if final_unit["id"] not in results:
                v.append(Violation("bracket-final", "no-champion",
                                   f"{event_id}: final unit {final_unit['id']} unresolved"))
    else:  # rr / swiss / monrad / compass: every generated unit must resolve
        if unresolved:
            v.append(Violation("bracket-final", "unresolved-units",
                               f"{event_id}: {len(unresolved)} unresolved: {unresolved[:5]}"))
        if event.get("standings") is not None:
            played = sum(row.get("played", 0) for row in event["standings"])
            if played and played != 2 * len([u for u in event_units if u["id"] in results]):
                v.append(Violation("bracket-final", "standings-played-total",
                                   f"{event_id}: sum(played)={played} != 2*results"))
    return v


# ---- cross-cutting -----------------------------------------------------------


def check_display_consistency(client: SimClient, ctx: RunContext, *, meet: bool, bracket: bool) -> list[Violation]:
    """A FRESH read-only client sees the same terminal picture the ledger has.

    This is the Operations -> Display seam check: what a spectator's
    polling surface renders must agree with what the operator recorded.
    """
    from .client import SimClient as _C  # local to build an independent session

    v: list[Violation] = []
    fresh = _C(client.base_url, stats=ctx.client.stats)
    try:
        if meet:
            states = fresh.get_match_states(ctx.tid) or {}
            for mid, rec in ctx.ledger.meet_matches.items():
                if rec.status in ("finished", "retired"):
                    got = (states.get(mid) or {}).get("status")
                    if got != "finished":
                        v.append(Violation("display", "spectator-status-drift",
                                           f"{mid}: spectator sees {got!r}"))
        if bracket:
            dto = fresh.get_bracket(ctx.tid)
            results = {r["play_unit_id"] for r in dto.get("results") or []}
            for pu_id in ctx.ledger.bracket_results:
                if pu_id not in results:
                    v.append(Violation("display", "spectator-missing-result", pu_id))
    finally:
        fresh.close()
    return v


def check_api_hygiene(stats) -> list[Violation]:
    v: list[Violation] = []
    for entry in stats.server_errors:
        v.append(Violation("hygiene", "5xx", entry))
    for entry in stats.unexpected_4xx:
        v.append(Violation("hygiene", "unexpected-4xx", entry))
    return v
