# e2e — Playwright tests

End-to-end tests for the tournament scheduler. The maintained browser coverage
has two owners with separate runners: entrant layout evidence runs against the
managed compose stack, while operator/Operations interaction smoke runs against
a prepared harness-enabled preview fixture in CI.

## Two test layers — both required

| layer | validates | owner and runner |
|---|---|---|
| **unit** (vitest) | LOGIC — a reducer, a selector, a component given props | `apps/console/src/**/__tests__`, `apps/entrant/tests/` |
| **entrant evidence** | public entrant layout, IA, CSP and security headers at real widths | `tests/10-entrant-r11-evidence.spec.ts`, managed compose / local dev origins |
| **interaction smoke** | operator/Operations UI presses, live transitions, viewer read-only behavior and public display | `tests/interaction-smoke.spec.ts`, CI prepared fixture |

The interaction layer exists because the unit layer **structurally cannot** catch
its bug class: unit tests mock the handlers and the stores, so a component can be
green in isolation while the real app is broken. Not hypothetical — with a fully
green 1 100-test unit suite, a `viewer` saw the entire editing UI live (every
press 403'd and left the board diverged from the server), the Run view's Undo
buttons 409'd on every press behind a misleading "version mismatch" toast, one
rejected roster delete poisoned the whole-blob autosave so *all* later edits
failed until reload, and a Plan-timeline chip's selection was wiped by the 2.5 s
poll so it looked like a dead button.

Write-up: `docs/history/programs/design-plan/INTERACTION_FINDINGS.md`. Static census of
every interactive element: `docs/history/programs/design-plan/INTERACTION_INVENTORY.md`.

### Running the interaction smoke suite

It asserts on the **error harness** (`apps/console/src/platform/errorHarness.ts`),
which must be compiled in — that's what lets a failure name the button that broke
instead of just "something threw".

```bash
# 1. seed the fixtures — prints `tid=…`, `viewerTid=…` and `displayToken=…`
node tests/e2e/interaction-sweep/seed-smoke.mjs http://localhost:8600

# 2. there is no HTTP path to a viewer role (the creator is always written as
#    `owner`, and no endpoint mutates a member's role), so the fixture writes
#    the row the API won't. Run it AFTER seeding, never before.
python tests/e2e/interaction-sweep/make-viewer.py apps/api/src/smoke.db <viewerTid>

# 3. the suite asserts on the error harness (apps/console/src/platform/errorHarness.ts),
#    which must be compiled in — that's what lets a failure name the button that
#    broke instead of just "something threw".
VITE_ERROR_HARNESS=1 npm --prefix apps/console run build
# 4. Serve that preview in another shell before running the browser suite.
(cd apps/console && VITE_API_PROXY_TARGET=http://localhost:8600 npx vite preview --port 4173 --strictPort --host 127.0.0.1)
# 5. Run from the repo root after the preview is accepting connections.
E2E_BASE_URL=http://localhost:4173 SMOKE_TID=<tid> SMOKE_VIEWER_TID=<viewerTid> \
SMOKE_DISPLAY_TOKEN=<displayToken> npm --prefix tests/e2e run test:interaction-smoke
```

- `SMOKE_TID` — **required**. It used to default to a hardcoded id, and that
  fallback hid a broken seed script for a whole session: against a workspace that
  doesn't exist the app renders an error page with almost no controls, so "press
  everything" pressed nothing and the suite passed **vacuously**. Both the crawl
  and the viewer test now assert they found controls at all. A gate that goes
  green when its fixture is missing is worse than no gate.
- `SMOKE_VIEWER_TID` — a workspace the caller only has `viewer` on (step 2). The
  suite fails fast without it; CI always sets it.
- `SMOKE_DISPLAY_TOKEN` — a capability token for the seeded owner workspace;
  the display flow fails fast without it and verifies the live board plus the
  deterministic invalid-link terminal state.

Note `vite preview` binds IPv6 — reach it as `localhost`, not `127.0.0.1`.

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
- Node 22+

## Run

```bash
# from repo root; these run serially because the Playwright config has one worker
make test-e2e            # entrant evidence only; managed compose stack
make test-e2e-rebuild    # entrant evidence only; force image rebuild first
make full-dev            # operator :5173 + entrant :5174 (backend must be on :8600)
make test-e2e-dev        # entrant evidence against those dev origins

# or directly
cd tests/e2e
npm ci
npx playwright install --with-deps chromium
npm run test:entrant-evidence
npm run test:interaction-smoke  # only with the prepared harness fixture
```

## Environment variables

| var | default | effect |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost` | frontend origin under test |
| `E2E_PLAY_BASE_URL` | `http://localhost:8081` | entrant origin for the evidence spec |
| `E2E_MANAGE_STACK` | `1` | set `0` to skip `docker-compose up/down` (use when stack is already running) |
| `E2E_REBUILD` | `0` | set `1` to force `--build` on compose up |
| `E2E_KEEP_STACK` | `0` | set `1` to skip `docker-compose down` on teardown |

## Layout

```
tests/e2e/
├── global-setup.ts       # docker-compose up + health probe
├── global-teardown.ts    # docker-compose down
├── playwright.config.ts
├── interaction-sweep/       # prepared fixture seed and diagnostic crawler
└── tests/
    ├── 10-entrant-r11-evidence.spec.ts  # public entrant compose/dev evidence
    └── interaction-smoke.spec.ts        # CI-owned operator/Operations smoke
```

The two maintained specs are invoked explicitly and serially by their owner
scripts. The retired numbered operator specs and screenshot capture are not
discovered by any runner; their unique behavior remains owned by backend/unit
tests or the interaction smoke flows described above.
