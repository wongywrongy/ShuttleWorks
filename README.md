# CP-SAT Tournament Scheduling — Monorepo

Two products sharing one CP-SAT engine, both built to run on the operator's
laptop during a tournament day.

| Product | Port | What it does |
| ------- | ---- | ------------ |
| **[Scheduler](./products/scheduler)** | <http://localhost> | Single-day inter-school dual / tri-meet operator tool: court assignments, drag-to-reschedule, proposal/repair pipeline, live SSE solver progress, TV display, suggestions inbox. |
| **[Tournament](./products/tournament)** | <http://localhost:5174> | Bracket draws + multi-event tournament management: BWF-conformant single-elimination, round robin, import/export, live advancement. |

Both depend on the shared [`scheduler_core/`](./scheduler_core) — a pure-Python
CP-SAT engine with no HTTP / no I/O. Build your own product on top by importing
its dataclasses; the two products in this repo are the worked examples.

---

## Quick start

Requires Docker (with Compose v2). For dev-server modes, also Node 20+.

Pick one:

```bash
make scheduler          # → http://localhost  (port 80, backend on :8000)
make tournament         # → http://localhost:5174  (backend on :8765)
make both               # run them side-by-side on one Docker daemon
make stop               # stop both
make help               # full target list
```

Each product is namespaced (Compose project + host ports) so `make both`
just works on one machine. No flag-juggling, no port collisions.

---

## Layout

```
scheduler_core/                shared CP-SAT engine (pure Python, no HTTP)
├── domain/                    dataclasses + sport-agnostic model
├── engine/                    CP-SAT backend + constraint plugins
└── README.md                  engine docs + plugin contract

products/
├── scheduler/                 day-of operator tool (BTP)
│   ├── backend/               FastAPI app + api routes + services + badminton adapter
│   ├── frontend/              React 19 + Zustand + dnd-kit
│   ├── e2e/                   Playwright specs
│   ├── tests/                 backend + solver tests
│   ├── docker-compose.yml     prod stack
│   ├── Makefile               product-local targets
│   └── README.md              product docs
│
└── tournament/                bracket-draws tool (prototype)
    ├── backend/               FastAPI for events + draws
    ├── frontend/              React + Tailwind UI
    ├── tournament/            draw + advancement + format modules
    ├── docker-compose.yml     prod stack
    ├── docker-compose.dev.yml hot-reload override
    ├── Makefile               product-local targets
    └── README.md              product docs

examples/                      engine usage examples (product-agnostic)
docs/                          shared project planning artifacts
Makefile                       top-level chooser (this is what most people use)
```

---

## Tech stack

- **Engine** — Python 3.11 · Google OR-Tools (CP-SAT) · pure dataclasses
- **Scheduler** — FastAPI · React 19 · TypeScript · Vite · Zustand · Tailwind · dnd-kit · Radix · SSE
- **Tournament** — FastAPI · React · TypeScript · Vite · Tailwind
- **Persistence** — JSON files with atomic writes + rolling backups (scheduler), in-memory state (tournament)
- **Deployment** — Docker Compose per product (nginx → FastAPI). Side-by-side coexistence via env-namespaced Compose project + host ports.

---

## Working in the code

For a deeper read of either product:

- [`products/scheduler/README.md`](./products/scheduler/README.md) — features, dev workflow, proposal pipeline, suggestions inbox
- [`products/scheduler/BACKEND.md`](./products/scheduler/BACKEND.md) — FastAPI routes, request lifecycle, how to add an endpoint or a constraint
- [`products/scheduler/FRONTEND.md`](./products/scheduler/FRONTEND.md) — shell + tabs, store split, theme system
- [`products/tournament/README.md`](./products/tournament/README.md) — engine consumption, bracket draws, multi-event
- [`products/tournament/USAGE.md`](./products/tournament/USAGE.md) — using the shared engine from your own code
- [`scheduler_core/README.md`](./scheduler_core/README.md) — engine internals: variables, constraints, soft penalties

---

## Status

Works as designed for **a single operator running one tournament from one
laptop**. Multi-worker / multi-user / internet-facing deployments need
additional work — see the architecture caveats in
[`products/scheduler/BACKEND.md`](./products/scheduler/BACKEND.md).
