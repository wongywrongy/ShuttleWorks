# e2e — Playwright smoke tests

End-to-end tests for the tournament scheduler. Runs against the nginx-served Docker build (what actually ships), not the Vite dev server.

## Prerequisites

- Docker Desktop running
- Node 20+

## Run

```bash
# from repo root
make test-e2e            # normal: docker compose up -d + tests + down
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
├── global-setup.ts     # docker-compose up + health probe
├── global-teardown.ts  # docker-compose down
├── playwright.config.ts
├── tests/
│   └── 00-sanity.spec.ts
└── fixtures/           # canned tournaments (later)
```
