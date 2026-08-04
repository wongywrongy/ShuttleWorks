# Install: self-hosted (Cloudflare Tunnel)

A linear runbook for standing up the multi-tenant deployment on a fresh Ubuntu
host. Follow it top to bottom.

The topology deliberately has **no VPS, no origin TLS terminator, and no
inbound port**. TLS terminates at Cloudflare's edge and the connector dials
outward, so the host exposes nothing to the internet.

```
Browser ──HTTPS──> Cloudflare edge ──tunnel──> cloudflared ──HTTP──> API
                                               (this host)         (this host)
                                                                       │
                                                       Postgres 16 (tailnet-bound)
                                                                       │
                                                       tailnet ────────┴──── remote worker
```

For a single offline machine, use [Install: local](/how-to/install-local)
instead — this guide is strictly more complexity.

## Prerequisites

- Ubuntu 24.04 with Docker Engine and the Compose plugin
- A domain on Cloudflare (any plan, including free)
- An SMTP account — cloud mode refuses to start without one, because the
  console email backend would write live invite and password-reset tokens into
  the log stream
- Tailscale (or equivalent) if a second machine will run workers

## 1. Directory layout

```bash
sudo mkdir -p /opt/shuttleworks
sudo chown "$USER" /opt/shuttleworks
cd /opt/shuttleworks
git clone <repo> .
```

Keep this **outside** any shared homelab tree such as `/opt/stacks/` or
`/opt/infra/`. A `docker compose down` run from the wrong directory, or a prune
aimed at the homelab, should not be able to reach the product's database.

## 2. Secrets

Two files, never committed (`products/scheduler/secrets/` is gitignored):

```bash
cd /opt/shuttleworks/products/scheduler
mkdir -p secrets
openssl rand -base64 32 | tr -d '\n' > secrets/postgres_password
printf 'postgresql://scheduler:%s@postgres:5432/scheduler' "$(cat secrets/postgres_password)" \
  > secrets/database_url
chmod 600 secrets/*
```

Both are injected as files rather than environment variables, so the password
never appears in `docker inspect` or a process listing. The API reads
`DATABASE_URL_FILE`; Postgres reads `POSTGRES_PASSWORD_FILE`.

**One file is the source of truth for the password.** Do not also set
`POSTGRES_PASSWORD` in `.env` — during development of this stack, having the
value in a file for one service and an env var for the other is exactly how they
drifted apart and the API failed to authenticate.

## 3. `.env`

```bash
cp backend/.env.example .env    # then edit
chmod 600 .env
```

### Reference

Verified against `backend/app/config.py`. "Required" means the process refuses
to start without it, or misbehaves in a way you will not notice.

| Variable | Default | Local | Cloud API | Worker | What breaks if wrong |
|---|---|---|---|---|---|
| `DATABASE_URL` | `sqlite:///./local.db` | – | **required** | **required** | Cloud mode refuses SQLite. A worker on SQLite polls an empty queue forever while jobs pile up elsewhere — silent no-op. |
| `ENVIRONMENT` | `local` | `local` | `cloud` | `cloud` | `cloud` turns on the fail-closed validator. Leaving it `local` in production silently accepts insecure cookies. |
| `AUTH_MODE` | `local` | `local` | **`cloud`** | not read | `local` on a public deployment means every anonymous request acts as the bootstrap operator. |
| `SESSION_COOKIE_SECURE` | `false` | `false` | **`true`** | not read | `false` lets the session cookie travel over plain HTTP. |
| `EMAIL_BACKEND` | `console` | `console` | **`smtp`** | not read | `console` prints live invite/reset tokens into the logs. |
| `SMTP_HOST` | `''` | – | **required** | not read | Startup fails. Invites and resets silently never arrive. |
| `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_USE_TLS` | `587` / `''` / `''` / `ShuttleWorks <no-reply@localhost>` | – | as your provider requires | not read | Mail silently fails. |
| `PUBLIC_APP_ORIGIN` | `''` | – | **required** | not read | Emailed invite/reset links come out relative and unclickable. |
| `CORS_ORIGINS` | localhost list | default | **your hostname** | not read | The browser blocks API calls. Never `*` — cookie auth requires an explicit allowlist. |
| `TRUSTED_PROXY_IPS` | `[]` (trust nothing) | leave empty | **connector IP** | not read | See §6 — this is the one that locks out every user at once. |
| `PROCESS_ROLE` | `api` | – | `api` | `worker` (set automatically) | Set by `worker.py` itself; only override to be explicit. |
| `EMBEDDED_WORKER` | `true` | `true` | `true` or `false` | n/a | `false` with no remote worker means jobs queue and never run. |
| `WORKER_CONCURRENCY` | `1` | `1` | `1` | tune | Concurrent solves compete for RAM; RAM is the ceiling, not cores. |
| `WORKER_ID` | `''` (derived) | – | – | optional | Only affects legibility of `/health/metrics`. |
| `SOLVE_MEMORY_LIMIT_MB` | `1024` | – | – | tune | Too low kills solves; enforced on Linux only. |
| `JOB_LEASE_SECONDS` | `30.0` | – | ✓ | ✓ | Too low reaps healthy jobs mid-solve; too high delays recovery from a dead worker. |
| `JOB_MAX_ATTEMPTS` | `2` | – | ✓ | ✓ | Bounds infra retries. |
| `JOB_RETENTION_DAYS` | `30` | – | ✓ | ✓ | Terminal jobs pruned after this. |
| `SOLVE_RANDOM_SEED` / `SOLVE_NUM_WORKERS` / `SOLVE_MAX_DETERMINISTIC_TIME` | `42` / `1` / `60.0` | – | ✓ | ✓ | **Do not change `SOLVE_NUM_WORKERS`.** Determinism depends on single-threaded search. |
| `SOLVE_WALL_CLOCK_CEILING_SECONDS` | `300.0` | – | ✓ | ✓ | Outer safety kill only; must stay well above the deterministic budget. |
| `AUTH_THROTTLE_MAX_FAILURES` / `_WINDOW_SECONDS` / `_LOCK_SECONDS` | `5` / `900` / `60` | ✓ | ✓ | not read | Credential-stuffing backoff. |
| `SESSION_TTL_DAYS` / `SESSION_COOKIE_NAME` / `SESSION_COOKIE_DOMAIN` | `30` / `sw_session` / `''` | ✓ | ✓ | not read | Blank domain = host-only cookie, which is the right default. |
| `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH` / `RESET_TOKEN_TTL_MINUTES` | `8` / `128` / `60` | ✓ | ✓ | not read | NIST 800-63B: length only. |
| `INVITE_TTL_DAYS` | `14.0` | ✓ | ✓ | not read | Email-invite expiry. |
| `DATA_DIR` | `/app/data` | ✓ | ✓ | ✓ | Runtime scratch; the readiness probe checks it is writable. |
| `LOG_LEVEL` / `HOST` / `PORT` | `info` / `0.0.0.0` / `8000` | ✓ | ✓ | ✓ | The image hardcodes its bind; `HOST`/`PORT` only affect `python -m app.main`. |
| `POSTGRES_DATA_DIR` | `./data/postgres` | – | compose-only | – | Must be a real local filesystem. `initdb` fails on synced/network paths. |
| `POSTGRES_BIND_ADDR` | none — **required** | – | compose-only | – | See §5. |
| `PUBLIC_HOSTNAME`, `CLOUDFLARE_TUNNEL_TOKEN` | none — **required** | – | compose-only | – | Compose refuses to start without them. |

Any variable also accepts a `<VAR>_FILE` form pointing at a file containing the
value; the file is read and stripped. `<VAR>` wins if both are set.

## 4. Cloudflare Tunnel

Create a **named tunnel** in the Cloudflare dashboard (Zero Trust → Networks →
Tunnels), copy its token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, and add a
public hostname.

::: danger The ingress rule points at the API container and nothing else
Set exactly one public hostname, routed to:

```
Service:  HTTP   →   api:8000
```

**Never route it at a shared reverse proxy, and never add a wildcard.** A
wildcard route publishes every service the connector can reach — on a homelab
box that means Home Assistant, media servers, dashboards, everything — to the
public internet through the same tunnel, with no authentication in front of it.
The tunnel's blast radius is whatever you point it at.
:::

## 5. Postgres binding

::: danger `0.0.0.0` is a public database, whatever UFW says
Docker publishes ports by writing iptables rules **directly**, bypassing UFW
entirely. A `0.0.0.0:5432->5432` mapping is reachable from the internet even
when `ufw status` shows the port closed, and this is a routine way databases get
found.
:::

Set `POSTGRES_BIND_ADDR` to this host's **tailnet** address:

```bash
tailscale ip -4                       # e.g. 100.101.102.103
echo 'POSTGRES_BIND_ADDR=100.101.102.103' >> .env
```

If no remote worker will connect, delete the `ports:` mapping from
`docker-compose.selfhost.yml` altogether — the API reaches Postgres over the
compose network and needs no published port at all. Compose refuses to start
without the variable set, deliberately, so the choice is explicit.

## 6. `TRUSTED_PROXY_IPS` — the one that bites

Behind the tunnel, every request arrives from the cloudflared container. The
credential throttle keys on the client address, so without this setting **all
users share one bucket**: the fifth failed login from anyone on earth locks out
everyone, doubling to a 15-minute cap.

Find the connector's address on the compose network and set it:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  shuttleworks-cloudflared-1
# → 172.20.0.5
echo 'TRUSTED_PROXY_IPS=172.20.0.5' >> .env
```

The API then reads `CF-Connecting-IP`, **but only when the request's immediate
peer is in that list**. A header trusted from anywhere would be worse than none:
an attacker could rotate it per request and never be throttled at all.

::: danger Do not add uvicorn `--proxy-headers`
It is the reflex when deploying behind a proxy, and here it silently breaks
things. `--proxy-headers` rewrites `request.client.host` from `X-Forwarded-For`,
so the peer compared against `TRUSTED_PROXY_IPS` becomes the *claimed* client
address, the trust check never matches, the header is ignored, and you are back
to one global throttle bucket — with no error anywhere.

The two mechanisms solve the same problem and defeat each other. Its other
purpose, fixing `request.url.scheme`, is moot: nothing in this backend reads the
request scheme. Cookie security is configuration (`SESSION_COOKIE_SECURE`), not
detection.
:::

### Day-one smoke check

Do this once, immediately after going live — it is the only way to notice the
failure, which is otherwise invisible until it hits real users:

1. From one network, fail four logins deliberately.
2. From a **different** network (phone on cellular is ideal), log in normally.

If step 2 works, per-client throttling is live. If step 2 is throttled, the
header is not being read — recheck `TRUSTED_PROXY_IPS` against the connector's
current address, which changes if the container is recreated.

## 7. First run

```bash
cd /opt/shuttleworks/products/scheduler
docker compose -f docker-compose.selfhost.yml up -d --build
```

The API applies Alembic migrations in its startup lifespan — it is the only
process that ever does. Watch for `alembic_upgrade_head_complete`, then:

```bash
docker compose -f docker-compose.selfhost.yml exec api \
  python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://localhost:8000/health/ready')))"
```

Expect `"status": "ready"` with `schemaRevision` equal to `expectedRevision`.

Then open `https://<your-hostname>`, register the first account, and create the
first workspace. The first registered user is a normal account — there is no
superuser — and owns whatever they create.

## 8. Boot recovery

Compose's `restart: always` covers daemon restarts but not a host reboot unless
Docker itself starts. Add a unit:

```ini
# /etc/systemd/system/shuttleworks.service
[Unit]
Description=ShuttleWorks
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/shuttleworks/products/scheduler
ExecStart=/usr/bin/docker compose -f docker-compose.selfhost.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.selfhost.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now shuttleworks
```

::: warning Reboot and verify before trusting it
```bash
sudo reboot
# then, after it comes back:
curl -sf https://<your-hostname>/health && echo OK
```
An unverified recovery path is an assumption, and the time to discover it was
wrong is not the morning of a tournament.
:::

## Backup and restore

Postgres is the source of truth. Two dumps, not one:

```bash
#!/usr/bin/env bash
# /opt/shuttleworks/backup.sh
set -euo pipefail
cd /opt/shuttleworks/products/scheduler
OUT=/opt/shuttleworks/backups/$(date +%F)
mkdir -p "$OUT"

docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U scheduler -d scheduler | gzip > "$OUT/scheduler.sql.gz"

docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_dumpall -U scheduler --globals-only | gzip > "$OUT/globals.sql.gz"
```

::: warning `pg_dumpall --globals-only` is not optional
Roles are **cluster-level** objects and are not in a plain `pg_dump`. The
least-privilege worker role (`sw_worker`) lives there. Restore without it and
you get a database that looks complete and that the worker cannot authenticate
to — a failure that surfaces only when the first solve is submitted.
:::

Copy both off the host, encrypted. A dump that only exists on the machine you
are protecting against is not a backup.

### Monthly restore drill

A backup you have never restored is a hypothesis.

```bash
#!/usr/bin/env bash
# /opt/shuttleworks/restore-drill.sh  — restores into a THROWAWAY database
set -euo pipefail
SRC=${1:?usage: restore-drill.sh /path/to/backup-dir}
cd /opt/shuttleworks/products/scheduler
C="docker compose -f docker-compose.selfhost.yml exec -T postgres"

$C psql -U scheduler -d postgres -c 'DROP DATABASE IF EXISTS drill;'
$C psql -U scheduler -d postgres -c 'CREATE DATABASE drill;'
gzip -dc "$SRC/globals.sql.gz"   | $C psql -U scheduler -d postgres || true
gzip -dc "$SRC/scheduler.sql.gz" | $C psql -U scheduler -d drill

echo "--- row counts in the restored copy ---"
$C psql -U scheduler -d drill -c \
  "SELECT 'tournaments' t, count(*) FROM tournaments
   UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'matches', count(*) FROM matches;"
$C psql -U scheduler -d postgres -c 'DROP DATABASE drill;'
echo "drill OK"
```

Non-zero counts that match production mean the backup is real. Put a calendar
reminder on it.

## Next

- [Add a worker](/how-to/add-a-worker) — join a second machine as compute
- [Operations](/how-to/operations) — upgrades, rollback, alerts
