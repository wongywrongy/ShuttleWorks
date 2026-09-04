# Deploy: start to finish

One linear path from a bare Ubuntu machine to a verified, publicly reachable
ShuttleWorks deployment. Run it top to bottom; every command is here in order.

For the company deployment, follow this page together with
[Configure the Yunavero production domain](/how-to/configure-yunavero-domain),
which fixes the operator and entrant hostnames without weakening their origin
boundary.

This page owns the **sequence**. Where a topic has real depth — the full
environment-variable reference, day-two operations, adding a second machine —
it links out rather than restating, so there is one source of truth per fact.

::: tip What you are building
```
Browser ──HTTPS──> Cloudflare edge ──tunnel──> cloudflared ──HTTP──> frontend
                                               (this host)          (nginx: SPA
                                                                     + /api/* →)
                                                                          │
                                                                         API
                                                                          │
                                                          Postgres 16 (tailnet-bound)
```
No inbound port. TLS terminates at Cloudflare's edge and the connector dials
outward. The `frontend` container is the single public origin: it serves the
app and proxies `/api/*` to the backend over the compose network.
:::

## 0. Decide: is this the right deployment?

**A Cloudflare Tunnel is required**, not recommended. Three things enforce it:

1. Compose refuses to interpolate `docker-compose.selfhost.yml` without
   `CLOUDFLARE_TUNNEL_TOKEN` — even if you name only `postgres api frontend` on
   the command line.
2. `frontend` publishes no host port. Without the connector nothing can reach
   it.
3. The cloud profile requires `SESSION_COOKIE_SECURE=true`, so the session
   cookie never travels over plain HTTP. A LAN-only `http://` deployment
   cannot log in.

**One operator, one machine?** Use [Install: local](/how-to/install-local)
instead — no accounts, no TLS, fully offline, and strictly simpler. Come back
here when two people need the same workspace.

**Have your own TLS terminator** (Tailscale Serve, an existing reverse proxy
with a real certificate)? Workable in principle: publish both of `frontend`'s
ports (8080 operator, 8081 public), point `APP_HOSTNAME` and `PLAY_HOSTNAME` at
the two hostnames they serve, and set `TRUSTED_PROXY_IPS` to whatever the API
sees as its peer. **Untested** — and §6 fails *open* if you
get it wrong, so treat step 10 as mandatory.

## 1. Prerequisites

- Ubuntu 24.04 with Docker Engine and the Compose plugin
- A domain on Cloudflare (any plan, including free)
- An SMTP account — cloud mode refuses to start without one, because the
  console email backend would write live invite and password-reset tokens into
  the log stream
- Tailscale (or equivalent) if a second machine will run workers
- A local filesystem path for the Postgres data directory. **Not** a synced or
  network path: `initdb` fails on those with `could not create directory
  .../pg_wal`.

## 2. Get the code

```bash
sudo mkdir -p /opt/ShuttleWorks
sudo chown "$USER" /opt/ShuttleWorks
cd /opt/ShuttleWorks
git clone <repo> .
```

Keep this **outside** any shared homelab tree such as `/opt/stacks/` or
`/opt/infra/`. A `docker compose down` from the wrong directory, or a prune
aimed at the homelab, must not be able to reach the product's database.

## 3. Secrets

Three files, never committed (`secrets/` is gitignored):

```bash
cd /opt/ShuttleWorks
mkdir -p secrets
openssl rand -base64 32 | tr -d '\n' > secrets/postgres_password
printf 'postgresql://scheduler:%s@postgres:5432/scheduler' "$(cat secrets/postgres_password)" \
  > secrets/database_url
openssl rand -hex 32 | tr -d '\n' > secrets/ops_token

chmod 700 secrets          # only you (and root) can traverse in
chmod 644 secrets/*        # readable by the container users
```

::: danger Lock the directory, not the files
Compose (non-swarm) bind-mounts each secret preserving its host ownership and
mode. The API runs as **UID 1001** (`app`) and Postgres as **UID 999**, so
`chmod 600` owned by your deploying user makes the files unreadable *inside*
the containers.

The failure is badly disguised: `_read_file_backed_secrets()` raises
`PermissionError`, which surfaces as a `ValueError` from a module-level
`Settings()` — so the API dies at **import** with what reads as a
*configuration* error naming `DATABASE_URL`, and the container restart-loops.
You will look at your `.env` for an hour.

The directory at `700` is what keeps the secrets private on the host. The files
being `644` inside it does not widen access to anyone who cannot already
traverse the directory.
:::

Both the API and Postgres read the password from the **same file**, so they
cannot drift apart. Nothing puts it in `docker inspect` or a process listing.

## 4. `.env`

```bash
cp .env.selfhost.example .env   # then edit
chmod 600 .env
```

Set at minimum: `APP_HOSTNAME` and `PLAY_HOSTNAME` (step 6), `SMTP_HOST`
(+ credentials), `CLOUDFLARE_TUNNEL_TOKEN` (step 6), `POSTGRES_BIND_ADDR`
(step 5), and `POSTGRES_DATA_DIR`.

`SESSION_COOKIE_DOMAIN` is not in that list and must not be added. Host-only
cookies are what keep the two hostnames apart as two browser origins, and the
API refuses to start if the variable has a value.

Leave **`TRUSTED_PROXY_IPS` unset** — it defaults to the stack's pinned subnet,
which is correct for a standard install. See step 9 if you changed the subnet.

The full variable reference, with the consequence of getting each one wrong,
lives in [Install: self-hosted §3](/how-to/install-selfhost#_3-env). Compose
fails fast on the required ones rather than booting into a broken state.

## 5. Postgres binding

::: danger `0.0.0.0` is a public database, whatever UFW says
Docker publishes ports by writing iptables rules **directly**, bypassing UFW.
A `0.0.0.0:5432->5432` mapping is reachable from the internet even when
`ufw status` shows the port closed. This is a routine way databases get found.
:::

```bash
tailscale ip -4                       # e.g. 100.101.102.103
echo 'POSTGRES_BIND_ADDR=100.101.102.103' >> .env
echo 'POSTGRES_DATA_DIR=/srv/shuttleworks/pgdata' >> .env
```

If no remote worker will ever connect, delete the `ports:` mapping from
`docker-compose.selfhost.yml` entirely — the API reaches Postgres over the
compose network and needs no published port. Compose refuses to start without
the variable, deliberately, so the choice is explicit.

## 6. Cloudflare Tunnel

Create a **named tunnel** (Zero Trust → Networks → Tunnels), put its token in
`.env` as `CLOUDFLARE_TUNNEL_TOKEN`, and add **two** public hostnames — two
ports of the same container:

```
${APP_HOSTNAME}    HTTP  →  frontend:8080     ← operator console + /api/
${PLAY_HOSTNAME}   HTTP  →  frontend:8081     ← public entrant site (/e/*)
```

Two hostnames because they must be two browser **origins**: origin is what
scopes cookies and storage, and `Path=` on a cookie is not enforced against
same-origin script. Put Cloudflare Access on `${APP_HOSTNAME}` and **never** on
`${PLAY_HOSTNAME}`.

::: danger Point both at `frontend`, never at `api`, never a wildcard
`frontend` serves the app *and* proxies onward, which is what `CORS_ORIGINS`,
`PUBLIC_APP_ORIGIN` and `PUBLIC_PLAY_ORIGIN` assume. Routing straight to
`api:8000` publishes a bare JSON API with no user interface.

A **wildcard** route publishes every service the connector can reach — on a
homelab box that means Home Assistant, media servers, dashboards, everything —
to the public internet through the same tunnel, unauthenticated. The tunnel's
blast radius is whatever you point it at.
:::

## 7. Pre-flight

Two checks that cost ten seconds and each pre-empt a confusing failure.

```bash
# a) Every compose file still parses with your .env in place.
docker compose -f infra/compose/docker-compose.selfhost.yml config >/dev/null && echo "compose OK"

# b) The secrets are readable INSIDE the container, as UID 1001.
docker compose -f infra/compose/docker-compose.selfhost.yml run --rm --no-deps \
  --entrypoint sh api -c 'cat /run/secrets/database_url >/dev/null && echo "secrets readable by uid $(id -u)"'
```

If (b) errors, go back to step 3 — it is the `chmod`, not your `.env`.

## 8. First run

```bash
docker compose -f infra/compose/docker-compose.selfhost.yml up -d --build
```

The API applies Alembic migrations in its startup lifespan — it is the only
process that ever does. Watch for `alembic_upgrade_head_complete`, then:

```bash
export OPS=$(cat /opt/ShuttleWorks/secrets/ops_token)
docker compose -f infra/compose/docker-compose.selfhost.yml exec api \
  python -c "import urllib.request,json,os; t=open('/run/secrets/ops_token').read().strip(); \
req=urllib.request.Request('http://localhost:8000/health/ready', headers={'X-ShuttleWorks-Ops-Token': t}); \
print(json.load(urllib.request.urlopen(req)))"
```

Expect `"status": "ready"` with `schemaRevision` equal to `expectedRevision`.

::: tip A bare `curl` to these answers 403 — that is the guard, not a fault
`/health` is public liveness. `/health/ready`, `/health/deep` and
`/health/metrics` carry worker identities, live job ids and the deployed schema
revision, so they require `X-ShuttleWorks-Ops-Token`, which the cloud profile
makes mandatory. Do not rely on the tunnel to hide them: it publishes a
hostname, not a route list.
:::

Then open `https://${APP_HOSTNAME}`, register the first account, and create the
first workspace. The first registered user is a normal account — there is no
superuser — and owns whatever they create.

## 9. `TRUSTED_PROXY_IPS` — the setting that fails open

Behind the tunnel every request reaches the API through a proxy, so the peer
address is identical for everyone. The credential throttle keys on the client
address, so if this setting does not match, **all users share one bucket**: the
fifth failed login from anyone on earth locks out everyone.

It must name the API's **immediate peer**, which is the `frontend` nginx
container — *not* cloudflared:

```
browser → cloudflared → frontend:8080 (nginx) → /api/* → backend:8000
```

The stack pins its compose network to `10.201.0.0/24` and the compose file
defaults this setting to that range, **so a standard install needs nothing
here.** Prefer the subnet over a container address: Docker reassigns container
IPs on `--force-recreate`, and a pinned literal that stops matching fails open,
silently. Both bare addresses and CIDR blocks are accepted.

`.env.selfhost.example` deliberately does not set it. Compose reads `.env`
*before* applying that default, so a value in the template beats the compose
file — which is how the template's `172.20.0.3`, an address from a subnet this
stack stopped using, disarmed the setting on every install until 2026-08-11.

If you changed the subnet, keep all **three** in step — the third lives in the
frontend image:

```bash
echo 'TRUSTED_PROXY_IPS=10.201.0.0/24' >> .env   # must match `networks:` in the compose file
```

`infra/nginx/console.conf` carries `set_real_ip_from
10.201.0.0/24`, which is how nginx decides whether to believe `CF-Connecting-IP`
for its own rate-limit zones and what it forwards to the API. It is baked into
the image, so a changed subnet needs an edit there and a rebuild, or nginx keys
every zone on the connector — the same collapse, one layer up.

::: danger Do not "fix" a mismatch with uvicorn `--proxy-headers`
It is the reflex when deploying behind a proxy, and it silently breaks this.
`--proxy-headers` rewrites `request.client.host` from `X-Forwarded-For`, so the
peer compared against `TRUSTED_PROXY_IPS` becomes the *claimed* client address,
the trust check never matches, and you are back to one global bucket with no
error anywhere. The two mechanisms defeat each other.
:::

## 10. The two verifications that cannot be skipped

Both failures are invisible until they hit real users. Do them now.

**a) Per-client throttling is actually live.**

1. From one network, fail four logins deliberately.
2. From a **different** network (a phone on cellular is ideal), log in normally.

If step 2 succeeds, per-client throttling works. If step 2 is throttled, the
header is not being read — recheck step 9 against the frontend container's
actual address:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  shuttleworks-frontend-1
```

**b) The machine actually recovers from a reboot.** See step 11 — configure the
unit, then reboot and verify. An unverified recovery path is an assumption.

## 11. Boot recovery

`restart: always` covers daemon restarts but not a host reboot unless Docker
itself starts.

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
WorkingDirectory=/opt/ShuttleWorks
ExecStart=/usr/bin/docker compose -f infra/compose/docker-compose.selfhost.yml up -d
ExecStop=/usr/bin/docker compose -f infra/compose/docker-compose.selfhost.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now shuttleworks
sudo reboot
# after it comes back:
curl -sf https://<your-hostname>/api/health && echo "API OK"
curl -sf -o /dev/null https://<your-hostname>/ && echo "APP OK"
```

::: warning Check `/api/health`, not `/health`
nginx only proxies `/api/*`; every other path falls through to the SPA, so
`/health` returns `index.html` with a cheerful `200` no matter what state the
backend is in. A check that cannot fail is worse than no check.
:::

## 12. Backups

Postgres is the source of truth. **Two dumps, not one:**

```bash
#!/usr/bin/env bash
# /opt/ShuttleWorks/backup.sh
set -euo pipefail
cd /opt/ShuttleWorks
OUT=/opt/ShuttleWorks/backups/$(date +%F)
mkdir -p "$OUT"

docker compose -f infra/compose/docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U scheduler -d scheduler | gzip > "$OUT/scheduler.sql.gz"

docker compose -f infra/compose/docker-compose.selfhost.yml exec -T postgres \
  pg_dumpall -U scheduler --globals-only | gzip > "$OUT/globals.sql.gz"
```

::: warning `pg_dumpall --globals-only` is not optional
Roles are **cluster-level** objects and are absent from a plain `pg_dump`. The
least-privilege worker role lives there. Restore without it and the worker
cannot authenticate.
:::

Schedule it, then run the **monthly restore drill** — a backup you have never
restored is a hypothesis. The drill script and its rationale are in
[Install: self-hosted → Backup and restore](/how-to/install-selfhost#backup-and-restore).

## 13. Optional: a second machine for solving

The primary runs an embedded worker, so this is only for offloading CP-SAT
compute. Full runbook, including the least-privilege database role and its
exact grants: [Add a worker machine](/how-to/add-a-worker).

One thing to know up front: a worker container carries **no healthcheck**, so
`docker ps` will not tell you whether it is working. That is deliberate — it
shares the backend image, whose `HEALTHCHECK` probes HTTP that `python -m
worker` does not serve. Queue metrics are a worker's liveness signal:

```bash
curl -s -H "X-ShuttleWorks-Ops-Token: $OPS" \
  http://localhost:8000/health/metrics | python3 -m json.tool
```

## Next

- [Operations](/how-to/operations) — upgrades, rollback, logs, and the two
  alerts worth configuring
- [Install: self-hosted](/how-to/install-selfhost) — the same deployment with
  the full environment reference and the longer rationale behind each danger
  block above
