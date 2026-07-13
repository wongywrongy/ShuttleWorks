# e2e — Playwright tests

End-to-end tests for the tournament scheduler. Runs against the
nginx-served Docker build (what actually ships), not the Vite dev
server.

## Two test layers — both required

| layer | validates | where |
|---|---|---|
| **unit** (vitest) | LOGIC — a reducer, a selector, a component given props | `frontend/src/**/__tests__` |
| **interaction smoke** | that PRESSING the UI in a real composition doesn't break | `tests/interaction-smoke.spec.ts` |

The interaction layer exists because the unit layer **structurally cannot** catch
its bug class: unit tests mock the handlers and the stores, so a component can be
green in isolation while the real app is broken. Not hypothetical — with a fully
green 1 100-test unit suite, a `viewer` saw the entire editing UI live (every
press 403'd and left the board diverged from the server), the Run view's Undo
buttons 409'd on every press behind a misleading "version mismatch" toast, one
rejected roster delete poisoned the whole-blob autosave so *all* later edits
failed until reload, and a Plan-timeline chip's selection was wiped by the 2.5 s
poll so it looked like a dead button.

Write-up: `design-plan/INTERACTION_FINDINGS.md`. Static census of every
interactive element: `design-plan/INTERACTION_INVENTORY.md`.

### Running the interaction smoke suite

It asserts on the **error harness** (`frontend/src/platform/errorHarness.ts`),
which must be compiled in — that's what lets a failure name the button that broke
instead of just "something threw".

```bash
VITE_ERROR_HARNESS=1 npm --prefix ../frontend run build   # harness in the build
E2E_BASE_URL=http://localhost:4173 npx playwright test tests/interaction-smoke.spec.ts
```

- `SMOKE_TID` — seeded workspace to sweep (defaults to the mid-day meet sim).
- `SMOKE_VIEWER_TID` — a workspace the caller only has `viewer` on. The
  viewer-gating test **skips** without it; set it in CI to keep that covered.

**Fatal:** an uncaught error, an unhandled rejection, a React error-boundary
catch, or a native dialog (`window.confirm` is banned — it also blocks the event
loop and would hang the run).

**Deliberately not fatal on its own:** `console.error`. Three benign sources
would otherwise keep the suite permanently red, and an always-red suite gets
ignored: the browser's resource log for `GET /bracket` → 404 (means "no bracket
yet"; the client maps 404 → `null` on purpose), a stale suggestion `Apply` →
409/410 (handled — row dropped, info toast), and React dev warnings. If you add a
benign source, filter it there **and say why** — don't loosen the fatal set.

### The exploratory sweep (diagnostic, not a gate)

`interaction-sweep/` is the heavier crawler that produced the original audit. It
presses every element across every view in a state matrix (double-fire, network
failure, empty data, viewer role, early-click) and writes JSON to `results/`
(gitignored):

```bash
node interaction-sweep/sweep.mjs --pass all
node interaction-sweep/analyze.mjs        # triage table
```

## Prerequisites

- Docker Desktop running
- Node 20+

## Run

```bash
# from repo root
make test-e2e            # docker compose up -d + tests + down
make test-e2e-rebuild    # force rebuild of images first
make test-e2e-dev        # point tests at Vite dev (http://localhost:5173) — requires `make dev` running

# or directly
cd e2e
npm ci
npx playwright install --with-deps chromium
npm test
```

## Environment variables

| var | default | effect |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost` | frontend origin under test |
| `E2E_MANAGE_STACK` | `1` | set `0` to skip `docker-compose up/down` (use when stack is already running) |
| `E2E_REBUILD` | `0` | set `1` to force `--build` on compose up |
| `E2E_KEEP_STACK` | `0` | set `1` to skip `docker-compose down` on teardown |

## Layout

```
e2e/
├── global-setup.ts       # docker-compose up + health probe
├── global-teardown.ts    # docker-compose down
├── playwright.config.ts
├── fixtures/             # canned tournaments + helpers
└── tests/
    ├── 00-sanity.spec.ts                # shell, tabs, /display, /health
    ├── 02-inline-roster.spec.ts         # add school + player without dialogs
    ├── 03-auto-generate-matches.spec.ts # inline auto-gen flow
    ├── 04-solve-happy-path.spec.ts      # SSE HUD populates from /schedule/stream
    ├── 05-drag-reschedule.spec.ts       # feasible drop pins + re-solves; conflict shows infeasible
    ├── 06-persistence.spec.ts           # /tournament-state survives a reload
    └── 07-schedule-xlsx-import.spec.ts  # disaster-recovery import path
```

The numeric prefix is sort-order only; specs are independent and
Playwright runs them in parallel.
