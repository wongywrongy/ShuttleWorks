# Operations

Day-two running of a self-hosted deployment: upgrades, rollback, logs, health,
and the two alerts worth configuring.

Assumes [Install: self-hosted](/how-to/install-selfhost).

## Health endpoints

| Endpoint | Answers | Use it for |
|---|---|---|
| `GET /health` | Is the process up? | Liveness. **Dependency-free on purpose** — it stays green during a database outage, because killing a container whose database is down turns a recoverable outage into a restart loop. |
| `GET /health/ready` | Is the database reachable *and* the schema at the expected revision? | Readiness. 503 when either is false. This is the one to gate a deploy on. |
| `GET /health/deep` | Readiness, plus data-dir writability and solver import | What the container `HEALTHCHECK` calls. Also carries `schemaVersion` for the app's status popover. |
| `GET /health/metrics` | Queue depth, oldest-queued age, per-worker heartbeat age | The two alerts below. Also the liveness signal for a remote worker, which has no container healthcheck. |

::: warning `/health` is public; the other three need the ops token
`ready`, `deep` and `metrics` carry operational detail — worker identities,
live job ids, queue depth, the deployed schema revision — so they require
`X-ShuttleWorks-Ops-Token` whenever `OPS_TOKEN` is set, which the cloud API
profile **requires**. Every command on this page therefore sends it:

```bash
export OPS=$(cat /opt/ShuttleWorks/secrets/ops_token)
curl -s -H "X-ShuttleWorks-Ops-Token: $OPS" http://localhost:8000/health/ready
```

A bare `curl` answers `403` — that is the guard working, not an outage.
`/health` stays credential-free on purpose: a liveness probe that can return
"unauthorized" is indistinguishable from a dead process, and an orchestrator
would restart a container it should have left alone.
:::

::: warning Do not publish these through the tunnel
They carry operational detail — worker ids, queue shape. The Cloudflare ingress
rule points at the application only; scrape these over the tailnet.
:::

A `503` from readiness tells you which half failed:

```json
{"status":"not_ready","databaseReachable":false,"databaseError":"OperationalError: …"}
{"status":"not_ready","databaseReachable":true,"schemaRevision":"n7e1…","expectedRevision":"p9a3…","schemaCurrent":false}
```

The second is a deploy that skipped migrations — the database answers queries
and will fail on the first new column.

## The two alerts worth having

### 1. Queue rising with nothing claiming it

The failure that is invisible from outside: the API stays perfectly healthy
while nothing gets solved. Users see spinners; monitoring sees green.

```
queued > 0  AND  running == 0  AND  oldestQueuedAgeSeconds > 300
```

Causes, in rough order of likelihood: every worker is down; workers cannot reach
Postgres; the worker role lost its grants on `solve_jobs`; `EMBEDDED_WORKER` was
set false on the primary with no remote worker to take over.

### 2. Per-worker heartbeat age

```
lastHeartbeatAgeSeconds > JOB_LEASE_SECONDS      # default 30
```

That worker is about to have its job reaped. One occurrence is a blip; a
repeating pattern for one `workerId` is a sick machine or a flaky link, and the
job is being re-solved from scratch each time.

### Wiring it up

`/health/metrics` returns plain JSON, so any collector that can scrape an HTTP
endpoint and parse JSON works — no exporter to install. If you already run an
OTLP collector, point a scrape job at it over the tailnet and map:

| JSON field | Metric |
|---|---|
| `queued`, `running`, `succeeded`, `failed` | gauges, by status |
| `oldestQueuedAgeSeconds` | gauge (seconds) |
| `workers[].lastHeartbeatAgeSeconds` | gauge, labelled by `workerId` |

The shape maps onto Prometheus without changing the endpoint, if one ever
appears.

## Upgrades

```bash
cd /opt/ShuttleWorks
./backup.sh                                   # always first
git pull
docker compose -f infra/compose/docker-compose.selfhost.yml up -d --build
```

::: danger `--build` is not optional
`docker compose up -d api` **reuses the existing image**. Without `--build` your
code change does not ship, the container comes up healthy, and you conclude the
change did not work. This has caught people on this codebase repeatedly.
:::

### Migration ordering with a remote worker present

The API is the only process that migrates, in its startup lifespan. Workers wait
for the schema instead of racing it. So:

1. **Stop remote workers** — or leave them; they will idle harmlessly against
   the old schema until the API finishes.
2. **Upgrade the primary first.** It applies migrations.
3. **Then upgrade the workers.**

Upgrading a worker *first* is the ordering to avoid: new worker code may expect
columns the not-yet-migrated database does not have.

Watch the API for `alembic_upgrade_head_complete`, then confirm:

```bash
curl -s -H "X-ShuttleWorks-Ops-Token: $OPS" \
  http://localhost:8000/health/ready | grep -o '"schemaCurrent":[a-z]*'
```

## Rollback

Application rollback is a redeploy of the previous tag:

```bash
git checkout <previous-tag>
docker compose -f infra/compose/docker-compose.selfhost.yml up -d --build
```

::: warning Schema rollback is not a supported path
Migrations have downgrades and they are tested, but rolling a schema backwards
with live data is a restore, not a downgrade. If a migration is the problem,
restore from the pre-upgrade dump.

Which is why `./backup.sh` runs *before* `git pull`, every time.
:::

`v0.1.0` is the tagged first deployable state and a known-good fallback.

## Logs

```bash
cd /opt/ShuttleWorks
docker compose -f infra/compose/docker-compose.selfhost.yml logs -f api
docker compose -f infra/compose/docker-compose.selfhost.yml logs -f postgres
docker compose -f infra/compose/docker-compose.selfhost.yml logs -f cloudflared
# on the worker host:
docker compose -f infra/compose/docker-compose.worker.yml logs -f
```

Logger names worth grepping: `scheduler.solve_worker` (claims, completions,
discarded results), `scheduler.auth` (identity), `scheduler.health`,
`scheduler.worker` (standalone startup).

Every request carries an `X-Request-ID`, echoed in error responses — the fastest
way to tie a user's report to a log line.

## Routine checks

| When | What |
|---|---|
| Daily (automated) | `./backup.sh`, copied off-host and encrypted |
| Weekly | `/health/metrics` — any worker with a persistently high heartbeat age |
| Monthly | `./restore-drill.sh` — a backup you have never restored is a hypothesis |
| After any reboot | `curl -sf https://<hostname>/api/health` — confirm unattended recovery. **`/api/health`, not `/health`**: nginx proxies only `/api/*`, so every other path falls through to the SPA and `/health` answers `200` with `index.html` whatever state the backend is in |
| After adding a worker | The [failure drill](/how-to/add-a-worker#the-failure-drill) |

## Things that look broken but are not

- **A discarded completion in the worker log**
  (`discarding completion for job …: lease now held by …`) is the duplicate-write
  guard doing its job after a worker lost the database mid-solve. The job was
  re-run elsewhere and exactly one result landed.
- **A re-solve producing a different schedule from a months-old run.** Since
  SP-CLOUD-3 the engine sorts its model-build iteration, which changed
  constraint creation order and therefore CP-SAT's tie-breaking. Same input
  still gives the same output *today*, on every host; it just may not match what
  the same input gave before that change. Objective values are unaffected.
- **`/health` green while `/health/ready` is 503.** Correct and deliberate: the
  process is alive, its database is not.
