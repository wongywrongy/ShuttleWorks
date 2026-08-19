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
the repo root with `testpaths=["tests"]`, so `simulator/` is
structurally outside it, and the sim has its own `requirements.txt`.

## Quickstart

```bash
# one-time: deps into the repo venv (httpx + pytest)
pip install -r simulator/requirements.txt

# against a backend you already run on :8600 (the local-dev recipe)
make sim SCENARIO=small-meet SEED=42

# fully isolated: boots its own backend (fresh sqlite, free port), tears down after
make sim-ephemeral SCENARIO=bracket FORMAT=de

# against the Docker stack (backend on :8000)
make sim SIM_URL=http://localhost:8000

# raw CLI (equivalent)
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
| `demo`       | **seeds a whole product, not one tournament** — 8 realistic workspaces of 73–110 matches each (788 total), 4 module sets, a 516-person designed pool over 22 clubs, all 6 draw formats, 2 solved league meets, a floor mid-session, 2 live public entry pages + 1 deliberately closed |

### The `demo` scenario

Populates a **fresh** database for a walkthrough. It is a seeder that
happens to be a scenario: every write still goes through `SimClient`, so
5xx are findings and the meet solves still run `check_schedule` plus the
solve-twice determinism check.

```bash
# a fresh database is a precondition, not a nicety — see below
make sim SCENARIO=demo SEED=2026 SIM_URL=http://localhost:8600
```

The report's `note:` lines ARE the deliverable: one per workspace with its
id, module set and URL, plus every display token and entry-page slug.

**Scale, and what pays for it.** 788 matches across eight workspaces, 390
distinct people drawn from a 516-row designed pool, ~2000 requests, ~3½
minutes wall on a laptop. Most of that is CP-SAT: the 73-match league meet
solves in ~27 s and returns `feasible` rather than `optimal` — it spends
its whole deterministic-time budget without proving optimality, while still
assigning every match with no court overlap and no player double-booked.
The 24-match one takes ~11 s. Both run **twice**, because the determinism
invariant re-solves and compares. `solverTimeLimitSeconds` in a workspace's
`meet` block is the knob (it maps to `max_deterministic_time`, so the stop
criterion is host-speed-independent and the re-solve still matches).

**Dates agree with floor state.** `_event_is_open` measures a deadline
against the wall clock, so an entry page can only be seeded live — and a
live entry window on a tournament that finished in February is a
contradiction on screen. Workspaces that are played out are dated in the
recent past, the mid-session one is dated today, and the three with entry
pages are dated ahead with their deadlines in front of them. Every date is
inside 2026, so the owner's tournament names stay literally true.

**Not idempotent, deliberately.** Re-running creates eight *more*
workspaces — `POST /tournaments` has no natural key and inventing one here
would be the simulator asserting a product rule that does not exist. Two
things additionally bite on a second run against the same database:
entry-page slugs are globally unique (409, reported not swallowed), and
`entrant_signup_max_per_ip` is 8 per hour against a throttle table that
lives in that same database. Point it at an empty one.

Under `AUTH_MODE=cloud` the same scenario additionally seeds **six real
organisations**: one registered operator account per org, each creating its
own workspaces, followed by a `tenancy` phase that checks each director sees
only their own events on `GET /tournaments` and gets a **404 — never 403** on
a neighbour's workspace. See "Auth" below.

**Three things it discovered about the product, none worked around:**

- `entries` is in `CLOUD_ONLY_MODULES` and cannot be enabled under
  `AUTH_MODE=local` (ruling D2). The scenario asks, takes the 400, retries
  without it and says so. The public entry page still works — nothing about
  it is module-gated — but the operator's Entries desk tab is absent from
  the nav by design. Under `AUTH_MODE=cloud` the module is accepted and the
  desk appears; the refusal branch simply never fires.
- A draw cannot be created empty to receive entries: `POST /bracket` wants
  ≥2 participants (≥4 for `de`), while the commit seam needs the draw to
  already exist. Hence two direct entries per entries-fed event.
- `bracket_size` is fixed when the draw is created, so an entries-fed draw
  must declare the field it expects rather than deriving it from its
  founding participants. Each event therefore declares `entry_slots` =
  `bracket_size` minus its direct seeding, so the draw arrives exactly full
  and opens with no byes.
- Entries are **singles-only** (`entry_type` doubles is E3), so a doubles
  draw gets no entry event. Doubles still exist — as team participants with
  `members`, which the bracket adapter expands back to two engine players.
  That expansion is why the participant id is `slug_of(name)` on both sides
  of the singles/doubles line: a person entered in Men's Singles *and*
  Men's Doubles is one engine player and cannot be put on two courts at once.
- The per-IP budgets decided the *shape* of the seeding rather than being
  raised for it. Eight entrant accounts is exactly
  `entrant_signup_max_per_ip`; 130 entry players reach the desk in **10**
  club-ordered squad submissions against `entries_max_per_ip`'s 20 per 10
  minutes, because one form legitimately carries a squad
  (`services/entry_form.parse_players`). Only `REGISTRATION_MAX_PER_IP`
  still binds — six organisations against a shipped budget of five — and
  that is raised on the deployment, never bypassed here.

## Auth

The simulator is a real client and gets no exemption from the auth contract.

- **`AUTH_MODE=local` (default)** — nothing to do. A credential-less request
  resolves to the bootstrap operator.
- **`AUTH_MODE=cloud`** — every route 401s without a session, so
  `ScenarioRunner` asks `GET /auth/me` and, when the deployment declines to
  name anyone, signs in via `SimClient.sign_in` (login first, register if the
  account is new). `httpx.Client`'s cookie jar *is* the session transport, and
  `sign_in` also switches on `X-ShuttleWorks-CSRF: 1`, which the middleware
  requires of every cookie-carrying write.

Two rules worth knowing before writing a scenario:

- **A second client is not a second identity.** Use `client.clone()` for "a
  second director's laptop" or the Display polling surface — it copies the
  cookie jar. A bare `SimClient(...)` has an empty jar, which under cloud mode
  is *nobody*, and the tenant-scoped routes will 401. Construct a bare one
  only when a separate principal is the point (the entrant accounts and the
  per-organisation operators in `demo`).
- **The entrant clients deliberately do NOT send the CSRF header.** Their form
  posts prove CSRF the way an unhydrated browser form must — with the
  cookie-derived double-submit token in `SimClient.form_csrf`. Setting the
  header on them would silently retire that second channel from the run.

**Throttles apply, are not worked around, and decide which call you make.**
Two per-IP budgets, both charged by *failures*: a failed login — and a
`400 AUTH_EMAIL_TAKEN` from register — charge the shared **credential** bucket
(5 per 15 min, 60s doubling lock), while a successful register charges the
separate **registration** bucket (`REGISTRATION_MAX_PER_IP`, 5 per hour). So
probing in the wrong direction is not free and there is no order that suits
both situations:

- `sign_in` (login, then register) — for an identity reused across many runs
  against a long-lived database. The runner's own operator uses this.
- `register` — for seeding N brand-new accounts into a fresh database. `demo`
  uses this; login-probing six new orgs would lock the address out at the
  fifth, before the fourth organisation existed.

Seeding six organisations from one host needs `REGISTRATION_MAX_PER_IP` raised
on the *deployment* (the default 5 locks on the fifth), never bypassed here.

`EphemeralServer` runs uvicorn with `cwd=backend/`, so it reads `backend/.env`
— on a machine configured for cloud mode, `--ephemeral` is cloud mode too.
That is handled by the same runner check, so nothing needs to know.

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
cd simulator
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
