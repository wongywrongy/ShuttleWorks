# tournament-sim — full-tournament workflow simulator

**Internal developer tool. Never shipped, never imported by product code.**

Drives a complete tournament lifecycle against a running ShuttleWorks
backend over the **real HTTP API** — create workspace → seed roster/draws →
CP-SAT solve → finalize plan → run every match through the Operations
command lifecycle → record bracket results/advancement → verify the
Display read-models against the simulator's own ledger.

## The hard boundary

The simulator talks to the backend **only over HTTP**. It never imports
`app`, `api`, `services`, `database`, `repositories`, `adapters`, or
`scheduler_core` — enforced by `tests/test_import_boundary.py` (ast-walks
the package; even a TYPE_CHECKING import fails). The ephemeral-server mode
launches uvicorn as a *subprocess*, which keeps the process boundary intact.

Nothing here enters the CI PR gate: the product suite's pytest rootdir is
`products/scheduler` with `testpaths=["tests"]`, so `simulator/` is
structurally outside it, and the sim has its own `requirements.txt`.

## Quickstart

```bash
# one-time: deps into the repo venv (httpx + pytest)
pip install -r products/scheduler/simulator/requirements.txt

# against a backend you already run on :8600 (the local-dev recipe)
make -C products/scheduler sim SCENARIO=small-meet SEED=42

# fully isolated: boots its own backend (fresh sqlite, free port), tears down after
make -C products/scheduler sim-ephemeral SCENARIO=bracket FORMAT=de

# against the Docker stack (backend on :8000)
make -C products/scheduler sim SIM_URL=http://localhost:8000

# raw CLI (equivalent)
cd products/scheduler
PYTHONPATH=simulator python -m tournament_sim run --scenario small-meet --seed 42 --base-url http://localhost:8600
PYTHONPATH=simulator python -m tournament_sim list
```

Exit code 0 ⇔ zero invariant violations and zero 5xx.

## Scenarios

| name | what it drives |
|---|---|
| `small-meet` | 2 groups, 4 singles matches, 2 courts — the vertical slice (<30s) |
| `full-meet`  | ~14 matches incl. doubles, lunch break, 4 courts, one mid-run postpone+reassign |
| `bracket`    | one event of `--format se\|rr\|swiss\|monrad\|compass\|de`, played to completion |
| `mixed`      | meet + bracket + display modules in ONE workspace, both engines verified |
| `chaos`      | replay idempotency, out-of-order 409, stale-version 409+recovery, retire, postpone/reassign, racing directors, bracket walkover |

## Determinism contract

Same `--seed` ⇒ identical run:

- every module draws from its own RNG stream (`derive_rng(seed, *labels)`),
  so adding a call in one place never shifts another's sequence;
- idempotency keys are `uuid5(namespace, seed:tid:match:action)` — replays
  are trivially reproducible;
- results come from a seeded Elo-lite model (per-match stream: play order
  doesn't matter);
- solves run with `deterministic: true, randomSeed: <seed>`, and the sim
  asserts solve-twice-equality as an invariant.

Reproducibility check: run twice with `--json out.json`, diff the two files
— identical apart from timing fields (or generate with
`report.to_json(include_timings=False)`).

## Pacing

- `--pace compressed` (default): no sleeps — a full tournament day in seconds.
- `--pace realtime:10`: sleeps scaled to the slot length at 10× speed, so you
  can watch the Display/Run surfaces evolve in a browser. Pair with the
  default keep-tournament behaviour (pass `--cleanup` to delete instead) and
  open the workspace in the UI against the same backend.

The backend has **no wall clock** in its match model — slots are abstract
indices and state only advances on explicit commands — so the sim owns
pacing completely.

## Invariants checked

- **solve**: feasible/optimal; per-court windows disjoint; no player
  double-booked; deterministic re-solve.
- **state**: PUT→GET round-trip (subset semantics — server-added defaults
  don't count as drift); `planFinalized` persists.
- **operations**: version increments by 1 per command; replay ⇒ 200 +
  `replay:true` + unchanged version; stale version / illegal transition ⇒ 409;
  terminal statuses + scores match the ledger; standings arithmetic +
  totals reconcile.
- **bracket**: wave assignments complete + non-overlapping; replayed
  `record_result` doesn't double-advance; knockout formats end with a
  resolved final; rr/swiss end fully resolved with standings consistent.
- **display**: a *fresh* read-only client (what the Display module is) sees
  the same terminal picture as the ledger.
- **hygiene**: zero 5xx, zero unexpected 4xx (chaos tags expected ones).

## Testing the tool itself

```bash
cd products/scheduler/simulator
pytest                      # boundary guard (fast) + ephemeral smoke (slow)
```

## Phase 2 — load testing (designed for, not built)

Actors are plain `(client, ctx)` functions with no global state, so a
locustfile is mostly glue:

```python
class SpectatorUser(HttpUser):
    wait_time = between(1, 3)
    def on_start(self):
        self.ctx = attach_to_tournament(LocustClientAdapter(self.client), TID)
    @task(10)
    def poll(self):
        Spectator.poll_match_states(LocustClientAdapter(self.client), self.ctx)
```

Remaining work: a `LocustClientAdapter` exposing `SimClient`'s method
surface over Locust's instrumented client, plus a `setup-load` subcommand
that seeds one big tournament and prints its tid. Uncomment `locust` in
`requirements.txt` when that lands.

## Troubleshooting

- **`connect refused`** — no backend at the target. Start one (`uvicorn
  app.main:app --port 8600` from `backend/`, repo venv) or use `--ephemeral`.
- **INFEASIBLE solve** — reported as a violation with the backend's
  reasons echoed; usually a factory config too tight (courts × day window
  vs match count).
- **409 storms** — the sim recovers from staleness by re-reading the
  match-state ETag; persistent 409s usually mean another client (the UI?)
  is mutating the same tournament mid-run.
- **Windows**: ephemeral teardown retries sqlite tmpdir deletion (WAL
  handles linger after kill); port conflicts are avoided by binding :0.
