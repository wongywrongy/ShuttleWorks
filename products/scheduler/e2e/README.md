# e2e — Playwright smoke tests

End-to-end tests for the tournament scheduler. Runs against the
nginx-served Docker build (what actually ships), not the Vite dev
server.

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
