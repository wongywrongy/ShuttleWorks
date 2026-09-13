# ShuttleWorks

ShuttleWorks is a tournament control plane for school meets and bracket
tournaments. It gives a director one workspace for setup, scheduling, live
court operations, public results, and online entries.

The local deployment runs on the director’s machine with SQLite as its source
of truth. Operators can use another browser on the trusted LAN, while the
public display and entrant site read the same event state. A self-hosted cloud
profile adds Postgres, real accounts, and a worker behind a Cloudflare Tunnel.
See the [deployment guides](./docs/how-to/deploy.md).

## Product surfaces

The `/` operator console is a workspace hub. Each workspace enables the
modules needed for that event:

| Module | Purpose |
| --- | --- |
| **Meet** | Build rosters and produce CP-SAT-optimised court schedules for inter-school meets. |
| **Bracket** | Create and manage BWF-style draws, seeding, advancement, imports, and exports. |
| **Operations** | Plan courts and run matches with live state, commands, and conflict handling. |
| **Display** | Show read-only live matches, draws, and results on a TV or projector. |
| **Entries** | Collect public tournament entries and commit confirmed entries into the operator roster. Cloud mode only. |

Operations is always available. Meet, Bracket, Display, and Entries are enabled
per workspace. The public entrant site is the separate React Router application
under `/e/`; it provides discovery, tournament details, draws, schedules,
regulations, player profiles, and the entry journey. Public display URLs use a
workspace capability token and do not require operator authentication.

The Meet and Bracket modules share
[`packages/scheduler-core`](./packages/scheduler-core), a pure-Python CP-SAT
engine with no HTTP or storage dependencies. The [system overview](./docs/explanation/architecture/system-overview.md)
describes the module boundaries and runtime.

## Quickstart

Requirements: Docker with Compose v2. Node 24+ is needed for Vite development
and the documentation site. Python 3.12 is needed for backend tests.

```bash
git clone https://github.com/wongywrongy/ShuttleWorks.git
cd ShuttleWorks
make scheduler
```

Open these local surfaces:

| Surface | URL |
| --- | --- |
| Operator console | <http://localhost> |
| FastAPI and Swagger UI | <http://localhost:8000/docs> |
| Entrant site | <http://localhost:8081/e/> |
| Documentation | <http://localhost:8082> |

Local mode uses a synthetic bootstrap operator, SQLite, and an embedded worker;
it does not need an account, email, or internet access. Stop the stack with
`make stop`.

For frontend work with hot reload:

```bash
make scheduler-dev       # API in Docker, console on http://localhost:5173
make full-dev            # console on :5173 and entrant SSR on :5174
```

Useful checks and maintenance commands are listed by `make help`:

```bash
make check
npm run docs:paths
npm run docs:build
```

## Demo and review

PDF surface books (requires Tailscale access):

- [Operator console PDF](http://100.68.168.126:8093/operator-console-surface-book.pdf)
- [Public entrant PDF](http://100.68.168.126:8093/public-entrant-surface-book.pdf)

The repeatable Tailscale demo uses the production application path with a
dedicated Postgres data directory and private `100.64.0.0/10` bindings:

```bash
make demo-update        # verified backup, build current source, preserve data
make demo-status
make surface-books-url # download base URL after publishing books
```

Use [Publish a demo review](./docs/how-to/publish-demo-review.md) to seed a
review fixture, capture the canonical operator and entrant surface books, and
serve their manifests, HTML, and PDFs for review. The fixture and capture
tooling record the effective demo instant and build provenance.

## Documentation

The [`docs/`](./docs) VitePress site is the source of truth for architecture,
contracts, operations, and extension work.

- [Quickstart](./docs/tutorials/quickstart.md)
- [System overview](./docs/explanation/architecture/system-overview.md)
- [Data flow](./docs/explanation/architecture/data-flow.md)
- [Entrant tier](./docs/explanation/architecture/entrant-tier.md)
- [Module contracts](./docs/reference/contracts/index.md)
- [Install local mode](./docs/how-to/install-local.md)
- [Install self-hosted mode](./docs/how-to/install-selfhost.md)
- [Running locally](./docs/how-to/running-locally.md)
- [Add a module](./docs/how-to/add-a-module.md)
- [Repository layout](./docs/reference/repo-layout.md)
- [Known debt](./docs/reference/debt-log.md)

## Repository layout

```text
apps/console/       React operator console
apps/entrant/       React Router SSR public site under /e/
apps/api/           FastAPI backend, persistence, and solve rail
packages/           design system, scheduler core, and shared contracts
infra/compose/      local, development, cloud, and demo Compose profiles
simulator/          internal workflow and fixture tooling
tools/              API, documentation, and surface-review tooling
tests/              backend and end-to-end tests
docs/               current VitePress documentation and review records
```

The local write path remains usable when the internet is unavailable. Back up
the local `data/` directory before an event and after important changes; see
[local installation](./docs/how-to/install-local.md) for restore guidance.

Development references: [API](./apps/api/README.md),
[console](./apps/console/FRONTEND.md), [scheduler core](./packages/scheduler-core/scheduler_core/README.md),
and [code intelligence](./docs/how-to/code-intelligence.md). The repository’s
canonical routes and module contracts are documented in the
[surface map](./docs/reference/surface-map.md).
