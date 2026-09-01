# Add a worker machine

Join a second machine as **pure compute**. It runs solves and nothing else: no
API, no database, no migrations, no mail. It reaches the primary host's Postgres
over the tailnet under a role that can see the job queue and nothing else.

Assumes [Install: self-hosted](/how-to/install-selfhost) is already running.

## Why bother

`SOLVE_NUM_WORKERS` is pinned at 1 because determinism depends on
single-threaded search, so a solve uses one core no matter how many the machine
has. **Extra machines buy throughput, not latency** — more concurrent solves,
not faster ones — and RAM, not cores, is the practical ceiling on how many run
at once.

A second worker also gives the queue somewhere to fail over to: if one machine
dies mid-solve, its lease expires and another picks the job up.

## 1. Tailnet

Both machines on the same tailnet, and the worker able to reach the primary's
Postgres:

```bash
tailscale status                       # both hosts present
nc -vz <primary-tailnet-ip> 5432       # succeeds
```

If that connection is refused, `POSTGRES_BIND_ADDR` on the primary is probably
still loopback. Set it to the primary's tailnet address — **never `0.0.0.0`**,
which publishes the database to the internet regardless of UFW, because Docker
writes iptables rules directly.

## 2. Create the restricted role

On the **primary** host. These are the exact grants, enumerated from the code
and verified by running a real solve under them — not a guess at what might be
needed:

```sql
CREATE ROLE sw_worker LOGIN PASSWORD '<generate-a-strong-one>';
GRANT CONNECT ON DATABASE scheduler TO sw_worker;
GRANT USAGE ON SCHEMA public TO sw_worker;
GRANT SELECT, UPDATE, DELETE ON TABLE solve_jobs TO sw_worker;
```

```bash
cd /opt/ShuttleWorks
docker compose -f infra/compose/docker-compose.selfhost.yml exec -T postgres \
  psql -U scheduler -d scheduler <<'SQL'
CREATE ROLE sw_worker LOGIN PASSWORD 'CHANGE-ME';
GRANT CONNECT ON DATABASE scheduler TO sw_worker;
GRANT USAGE ON SCHEMA public TO sw_worker;
GRANT SELECT, UPDATE, DELETE ON TABLE solve_jobs TO sw_worker;
SQL
```

### Why exactly these, and no more

- **`solve_jobs` only.** The worker path touches one table. `worker.py`,
  `apps/api/src/solve_rail/solve_worker.py` and `apps/api/src/solve_rail/solve_jobs_routes.py` import only the
  `SolveJob` model, and `apps/api/src/solve_rail/solve_runner.py` and
  `apps/api/src/solve_rail/solve_child.py` have **no database imports at all** — the child
  receives its entire problem as JSON in a temp file. The API writes the full
  solve input into `solve_jobs` at submit time, so the worker never needs to
  look up a tournament, a member, or a user.
- **No `INSERT`.** The API enqueues. The worker claims, heartbeats, completes
  (all `UPDATE`) and prunes terminal rows (`DELETE`).
- **No `alembic_version` grant.** The worker waits for the schema by selecting
  from `solve_jobs`, not by reading the migration table. It never migrates —
  the API owns the schema, exactly once.
- **No grants on `users`, `auth_sessions`, `auth_throttle`, `orgs`,
  `org_members`, `tournament_members`, `invite_links`, `display_tokens`.**
  A compromised worker host cannot read a password hash, a session token, or a
  member list.

Verify the denial rather than assuming it:

```bash
docker compose -f infra/compose/docker-compose.selfhost.yml exec -T postgres \
  psql "postgresql://sw_worker:CHANGE-ME@localhost:5432/scheduler" \
  -c "SELECT count(*) FROM users;"
# ERROR:  permission denied for table users     ← this is the pass condition
```

::: warning Roles are cluster objects
`sw_worker` will **not** be in a plain `pg_dump`. Restoring without
`pg_dumpall --globals-only` gives you a database the worker cannot log into.
See [the backup section](/how-to/install-selfhost#backup-and-restore).
:::

## 3. Configure the worker host

```bash
sudo mkdir -p /opt/ShuttleWorks && sudo chown "$USER" /opt/ShuttleWorks
cd /opt/ShuttleWorks && git clone <repo> .
cp .env.worker.example .env
chmod 600 .env
```

Then edit it — the values that matter on a worker host:

```bash
PRIMARY_TAILNET_HOST=100.101.102.103
SW_WORKER_PASSWORD=CHANGE-ME
WORKER_ID=neo-1
WORKER_CONCURRENCY=2
SOLVE_MEMORY_LIMIT_MB=2048
```

To correlate this worker's solves with the API request that enqueued them, set
the same vendor-neutral OTLP base URL used by the API:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=https://telemetry.example.net:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20REDACTED
```

Leave the endpoint empty for the default fully-off behavior. An unreachable
receiver never prevents the worker from claiming or solving jobs. See
[application telemetry](/how-to/observability) for the emitted signals and
privacy/cardinality contract.

Set `WORKER_ID` explicitly. It is stamped into `solve_jobs.claimed_by` and shown
by `/health/metrics`, so a stalled lease points at a machine by name instead of
a hostname-plus-random-suffix.

Size `WORKER_CONCURRENCY` against RAM, not cores: each concurrent solve is one
child process capped at `SOLVE_MEMORY_LIMIT_MB`.

**No SMTP, no cookie settings, no `AUTH_MODE`.** A worker answers no requests
and sends no mail, and `_enforce_cloud_secrets` knows it — `worker.py` declares
`PROCESS_ROLE=worker` before config loads, and the worker profile validates only
the database configuration. If you find yourself adding placeholder SMTP
credentials to get past startup, something is wrong; that is how real
credentials end up on machines with no business holding them.

## 4. Start it

```bash
docker compose -f infra/compose/docker-compose.worker.yml up -d --build
docker compose -f infra/compose/docker-compose.worker.yml logs -f
```

Expect:

```
solve worker neo-1 started
solve worker up: id=neo-1 concurrency=2 db=100.101.102.103:5432/scheduler
```

## 5. Verify it is actually claiming work

A worker that connects but never claims looks identical to a healthy idle one.
And `docker ps` will not help you here: the worker container carries **no
healthcheck at all**. That is deliberate — it shares the backend image, whose
`HEALTHCHECK` probes `/health/deep` over HTTP, and `python -m worker` serves no
HTTP, so the probe could only ever report `unhealthy` forever. `.worker.yml`
disables it rather than shipping a permanently-red container. **Queue metrics
are the liveness signal for a worker, not container health.**

Submit a solve, then watch the queue from the **primary**:

```bash
# /health/metrics requires the ops token in cloud mode (SP-CLOUD-3). Without
# the header this answers 403 — that is the guard, not a fault.
curl -s -H "X-ShuttleWorks-Ops-Token: $(cat secrets/ops_token)" \
  http://localhost:8000/health/metrics | python3 -m json.tool
```

```json
{
  "queued": 0,
  "running": 1,
  "workers": [{"workerId": "neo-1", "jobId": "…", "lastHeartbeatAgeSeconds": 2.1}],
  "workerCount": 1
}
```

`workerId` appearing is the proof. If jobs stay `queued` with
`oldestQueuedAgeSeconds` climbing and `running` at 0, the worker is connected
but not claiming — check its logs for permission errors on `solve_jobs`.

## 6. The failure drill

Do this once, before you rely on it.

```bash
# On the primary: submit a solve long enough to interrupt.
# Then, on the worker host, cut it off mid-solve:
docker network disconnect bridge shuttleworks-worker-worker-1
```

Watch `/health/metrics` on the primary:

1. `lastHeartbeatAgeSeconds` for that worker climbs past `JOB_LEASE_SECONDS`
   (default 30).
2. The reaper returns the job to `queued`.
3. Another worker — or the primary's embedded one — claims and completes it.
4. **Exactly one completion lands.** When the disconnected worker reconnects and
   its child finishes, its result is discarded, because the lease is no longer
   its own. Its log says so:
   `discarding completion for job …: lease now held by …`

That last step is the one that matters and the easy one to miss: the child
process never touched the database, so it has no idea the queue moved on. Pinned
by `tests/backend/unit/test_lease_recovery.py`.

Reconnect with `docker network connect bridge shuttleworks-worker-worker-1`.

## Removing a worker

```bash
docker compose -f infra/compose/docker-compose.worker.yml down
```

Any job it held is reaped after the lease expires and re-run elsewhere. Then
revoke its access on the primary:

```sql
REVOKE ALL ON TABLE solve_jobs FROM sw_worker;
DROP OWNED BY sw_worker;
DROP ROLE sw_worker;
```

If several workers share the role, issue each machine its own
(`sw_worker_neo`, …) so one can be revoked without disturbing the rest.
