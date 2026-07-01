# Quickstart

ShuttleWorks running on your machine in a couple of minutes. For the full
reference (dev mode, ports, cloud mirror, tests) see
[Running locally](/getting-started/running-locally).

## Prerequisites

- **Docker** with Compose v2.
- (Dev mode + docs only) **Node 20+**.

## Run it

**1.** Clone and enter the repo.

```bash
git clone https://github.com/wongywrongy/ShuttleWorks.git
cd ShuttleWorks
```

**2.** Start the stack from the repo root.

```bash
make scheduler
```

**3.** Open the app at **<http://localhost>**. The interactive API docs (Swagger
UI) are at **<http://localhost:8000/docs>**.

That's it — the stack runs **local-only** by default: SQLite is the source of
truth, no cloud, a synthetic dev user. Stop it with `make stop`.

## Live-reload (dev) mode

For frontend work with hot module reload:

```bash
make scheduler-dev      # Vite dev server → http://localhost:5173
```

Vite proxies `/api/*` to the backend container, so front and back share an
origin just like production.

::: tip Windows: port 8000 in use?
Some Windows setups reserve port 8000. Remap the backend host port:

```bash
BACKEND_HOST_PORT=8600 make scheduler   # backend → http://localhost:8600
```
:::

## Next

- [What ShuttleWorks is](/getting-started/what-is-shuttleworks) — the product and its vocabulary
- [Repo layout](/getting-started/repo-layout) — where code lives
- [Extending ShuttleWorks](/how-to/add-a-module) — add your first module
