# Tournament Prototype

A self-contained, full-stack prototype layered on top of `scheduler_core`:

- `tournament/` — Python adapter that turns standard tournament formats
  (single elimination, round robin) into the engine's `Match` /
  `ScheduleConfig` inputs and drives layered round-by-round scheduling.
- `backend/` — minimal FastAPI app that wraps the adapter. Single
  in-memory tournament; no persistence.
- `frontend/` — Vite + React + Tailwind UI with three views (Draw,
  Schedule, Live) and a traffic-light status bar.

Nothing in this prototype touches the BTP dual-meet product on `main` /
`dev2`; it lives entirely on the `tournament-prototype` branch.

## Quick start

### Docker (recommended)

One command brings up the prod-style stack (nginx + FastAPI):

```bash
cp .env.example .env       # one-time, can be skipped to use defaults
make up
```

Frontend at <http://localhost:5174>, backend at
<http://localhost:8765>. The compose project name defaults to
`tournament`, so this stack coexists with the BTP stack
(project name `btp`, ports 80 / 8000) on the same Docker daemon —
both can run side-by-side.

For hot reload during dev (source-mounted, Vite HMR, uvicorn --reload):

```bash
make dev          # foreground; Ctrl-C tears it down
```

Other targets: `make down`, `make logs`, `make ps`, `make rebuild`,
`make clean`. `make test` runs the full pytest suite inside the
backend container.

### Bare-metal (no Docker)

Two terminals from the worktree root:

```bash
# Terminal 1 — backend
python -m venv .venv
.venv/bin/pip install -e ".[dev,backend]"
make bare-backend
```

```bash
# Terminal 2 — frontend
cd frontend && npm install && cd ..
make bare-frontend
```

The UI is at <http://localhost:5173>; the Vite proxy forwards
`/tournament` and `/healthz` to `127.0.0.1:8765` by default. Set
`VITE_PROXY_TARGET=http://...:1234` to point at a different backend.

> **Port note.** The Docker stack uses `5174` (frontend) and `8765`
> (backend) so it doesn't collide with the BTP product (which uses
> `80` and `8000`) when both are running.

## What the UI does

- **Setup** (shown when no tournament exists) — pick format, paste
  participants (one per line, in seed order for SE), set courts and
  slot length, click *Generate draw*.
- **Draw tab** — bracket tree (SE) or per-round pool grid (RR). Click
  a side of any cell with both participants resolved to record that
  side as the winner. Winners propagate to the matching slot on the
  next-round cell.
- **Schedule tab** — Court × time-slot grid coloured by state (sky
  = ready, amber = live, emerald = done). The *Schedule next round*
  button calls the solver on whatever is currently ready.
- **Live tab** — Per-match table with *Start* / *Finish* / *Reset*
  actions and inline *A wins / B wins* for ready matches; sorted by
  state so live matches surface first.

The top bar holds the global traffic-light counter (done / live /
ready / pending) and the Reset button (clears the tournament).

## Tests

```bash
.venv/bin/pytest                  # all tests, ~6s
.venv/bin/pytest tests/tournament  # adapter only, <1s
.venv/bin/pytest tests/backend     # API smoke
```

Layout:

- `tests/test_*.py` — the original 54 engine tests, untouched.
- `tests/tournament/` — bracket generation, RR pairing, advancement,
  adapter, layered scheduler driver.
- `tests/backend/` — FastAPI end-to-end smoke (create → schedule →
  record → re-schedule).

## How dependencies on R32 → R16 are enforced

The engine doesn't know about brackets — `Match` has no precedence
field. The adapter sidesteps this by **layered scheduling**:

1. `schedule_next_round` collects PlayUnits whose feeders all have
   results (or whose dependencies are empty for round robin).
2. It advances `current_slot` past the latest already-assigned match.
3. It sets every player's availability window to
   `[(current_slot, total_slots)]` so the engine refuses to place
   the new wave before `current_slot`.
4. The engine solves; the adapter writes the resulting assignments
   back into `TournamentState`.

That's why each call to `Schedule next round` only fills in the
matches that can actually be paired. Reporting a result advances
the bracket and unblocks the next wave.

## Architecture

```
┌────────── frontend/ ──────────┐    ┌────── backend/ ──────┐
│  React + Vite + Tailwind      │    │  FastAPI (in-memory) │
│  Draw / Schedule / Live tabs  │ →  │  /tournament,        │
│  Polled fetches every 2.5s    │    │  /tournament/results │
└────────────┬──────────────────┘    └────────────┬─────────┘
             │ HTTP                               │ pure dataclasses
             ▼                                    ▼
                              ┌────── tournament/ ──────┐
                              │  formats: SE + RR       │
                              │  draw, advancement       │
                              │  state, adapter          │
                              │  scheduler (driver)      │
                              └────────────┬─────────────┘
                                           │ scheduler_core API
                                           ▼
                                ┌── scheduler_core/ ──┐
                                │  CP-SAT engine      │
                                └─────────────────────┘
```

Anything outside `scheduler_core/` is prototype-scoped and
disposable. The engine itself stays unmodified.
