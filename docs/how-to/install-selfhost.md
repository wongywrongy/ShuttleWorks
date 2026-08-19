# Install: self-hosted (Cloudflare Tunnel)

A linear runbook for standing up the multi-tenant deployment on a fresh Ubuntu
host. Follow it top to bottom.

The topology deliberately has **no VPS, no origin TLS terminator, and no
inbound port**. TLS terminates at Cloudflare's edge and the connector dials
outward, so the host exposes nothing to the internet.

```
Browser ──HTTPS──> Cloudflare edge ──tunnel──> cloudflared ──HTTP──> frontend
                                               (this host)          (nginx: SPA
                                                                     + /api/* →)
                                                                          │
                                                                         API
                                                                          │
                                                          Postgres 16 (tailnet-bound)
                                                                          │
                                                          tailnet ────────┴──── remote worker
```

The frontend is the single public origin: it serves the application and
proxies `/api/*` to the backend over the compose network. Nothing else is
reachable from the tunnel.

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
sudo mkdir -p /opt/ShuttleWorks
sudo chown "$USER" /opt/ShuttleWorks
cd /opt/ShuttleWorks
git clone <repo> .
```

Keep this **outside** any shared homelab tree such as `/opt/stacks/` or
`/opt/infra/`. A `docker compose down` run from the wrong directory, or a prune
aimed at the homelab, should not be able to reach the product's database.

## 2. Secrets

Three files, never committed (`secrets/` is gitignored):

```bash
cd /opt/ShuttleWorks
mkdir -p secrets
openssl rand -base64 32 | tr -d '\n' > secrets/postgres_password
printf 'postgresql://scheduler:%s@postgres:5432/scheduler' "$(cat secrets/postgres_password)" \
  > secrets/database_url
openssl rand -hex 32 | tr -d '\n' > secrets/ops_token

# Lock the DIRECTORY, not the files. Compose (non-swarm) bind-mounts each
# secret into the container preserving its host ownership and mode, and
# the API runs as UID 1001 (`app`) — so `chmod 600` owned by your
# deploying user makes the file unreadable inside the container. Postgres
# hits the same wall as UID 999.
chmod 700 secrets          # only you (and root) can traverse in
chmod 644 secrets/*        # readable by the container users
```

::: danger The failure this prevents is silent and misleading
With `chmod 600` on the files, `_read_file_backed_secrets()` raises
`PermissionError`, which surfaces as a `ValueError` from a module-level
`Settings()` — so the API dies at **import** with what looks like a
configuration error, naming the setting rather than the permission. The
container just restart-loops. If you see a config error naming
`DATABASE_URL` or `OPS_TOKEN` on a fresh install, check the mode here first.

The directory at `700` is what keeps the secrets private on the host; the
files being `644` inside it does not widen access for anyone who cannot
already traverse the directory.
:::

All three are injected as files rather than environment variables, so the values
never appear in `docker inspect` or a process listing. The API reads
`DATABASE_URL_FILE` and `OPS_TOKEN_FILE`; Postgres reads
`POSTGRES_PASSWORD_FILE`.

`ops_token` guards `/health/ready`, `/health/deep` and `/health/metrics`, which
report worker identities, live job ids, queue depth and the deployed schema
revision. Cloud mode refuses to start without it. `/health` (liveness) stays
open on purpose — a probe that cannot tell "unauthorized" from "dead" gets your
container restarted for a missing header.

**One file is the source of truth for the password.** Do not also set
`POSTGRES_PASSWORD` in `.env` — during development of this stack, having the
value in a file for one service and an env var for the other is exactly how they
drifted apart and the API failed to authenticate.

## 3. `.env`

```bash
cp .env.selfhost.example .env   # then edit
chmod 600 .env
```

`.env.selfhost.example` carries exactly the variables this stack's compose file
reads, each with the consequence of getting it wrong. Compose fails fast on the
required ones rather than booting into a broken state. The table below is the
wider backend reference — most of its rows have defaults you will not touch.

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
| `TRUSTED_PROXY_IPS` | `[]` (trust nothing) | leave empty | **compose subnet** (defaulted) | not read | See §6 — this is the one that locks out every user at once. Must match the API's peer (`frontend` nginx), not cloudflared. |
| `OPS_TOKEN` | `''` (guard off) | leave empty | **required** (`OPS_TOKEN_FILE`) | not read | Without it `/health/ready\|deep\|metrics` publish worker ids, live job ids and the schema revision to anyone who can reach the hostname. |
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
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare's **dummy always-pass pair** | leave | **real keys, once entries are public** | not read | The defaults always pass, which is right while nothing routes to `/e/` and wrong the moment something does — an always-pass challenge is no challenge. Get a pair from Cloudflare → Turnstile; the secret belongs in a secret file (`TURNSTILE_SECRET_KEY_FILE`), not in `.env`. |
| `ENTRIES_MAX_PER_IP` / `ENTRIES_WINDOW_SECONDS` / `ENTRIES_LOCK_SECONDS` | `20` / `600` / `300` | ✓ | ✓ | not read | The durable per-IP budget for public entry submissions, on its own `entry:` namespace so an entry flood cannot lock a venue out of signing in. Too low interrupts a club secretary entering a squad. |
| `DATA_DIR` | `/app/data` | ✓ | ✓ | ✓ | Runtime scratch; the readiness probe checks it is writable. |
| `LOG_LEVEL` / `HOST` / `PORT` | `info` / `0.0.0.0` / `8000` | ✓ | ✓ | ✓ | The image hardcodes its bind; `HOST`/`PORT` only affect `python -m app.main`. |
| `POSTGRES_DATA_DIR` | `./data/postgres` | – | compose-only | – | Must be a real local filesystem. `initdb` fails on synced/network paths. |
| `POSTGRES_BIND_ADDR` | none — **required** | – | compose-only | – | See §5. |
| `PUBLIC_HOSTNAME`, `CLOUDFLARE_TUNNEL_TOKEN` | none — **required** | – | compose-only | – | Compose refuses to start without them. |

Any variable also accepts a `<VAR>_FILE` form pointing at a file containing the
value; the file is read and stripped. `<VAR>` wins if both are set.

## 4. Cloudflare Tunnel

::: warning The tunnel is not optional in this stack
Two things make it required rather than recommended:

1. **Compose will not even load the file without a token.**
   `CLOUDFLARE_TUNNEL_TOKEN` is declared `:?`, so `docker compose -f
   docker-compose.selfhost.yml up -d` fails at interpolation — *even if you
   only name `postgres api frontend` on the command line*. Variable
   interpolation happens for the whole file before service selection.
2. **Nothing is reachable without it.** The `frontend` service publishes no
   host port by design; the connector reaches it over the compose network.
   Skipping cloudflared leaves the stack running and unreachable.

And if you worked around both, a third would stop you: the cloud profile
requires `SESSION_COOKIE_SECURE=true` (the startup validator refuses to boot
otherwise), so the session cookie is never sent over plain HTTP. A LAN-only
deployment on `http://` cannot log in.

**If you don't want a tunnel**, your options are:

- **A single operator on one machine** → [Install: local](/how-to/install-local).
  No accounts, no TLS, fully offline. This is the right answer for a solo
  director and is strictly simpler.
- **Another TLS terminator you already trust** (Tailscale Serve, an existing
  reverse proxy with a real certificate). Workable in principle — publish a
  port on `frontend`, point `PUBLIC_HOSTNAME` at that hostname, and set
  `TRUSTED_PROXY_IPS` to whatever address the API sees as its peer. **Not
  tested here**, and getting `TRUSTED_PROXY_IPS` wrong fails open (see §6), so
  verify with the day-one smoke check below before trusting it.
:::

Create a **named tunnel** in the Cloudflare dashboard (Zero Trust → Networks →
Tunnels), copy its token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, and add a
public hostname.

::: danger The ingress rule points at the frontend container and nothing else
Set exactly one public hostname, routed to:

```
Service:  HTTP   →   frontend:8080
```

Point it at `frontend`, **not** `api`. The frontend container serves the
application and proxies `/api/*` onward to the backend over the compose
network, so one origin serves both — which is what `CORS_ORIGINS` and
`PUBLIC_APP_ORIGIN` assume. Routing straight to `api:8000` publishes a bare
JSON API with no user interface.

**Never route it at a shared reverse proxy, and never add a wildcard.** A
wildcard route publishes every service the connector can reach — on a homelab
box that means Home Assistant, media servers, dashboards, everything — to the
public internet through the same tunnel, with no authentication in front of it.
The tunnel's blast radius is whatever you point it at.
:::

### 4a. Cloudflare Access, and the one route that must stay open

Registration is open by default: anyone who finds the hostname can create an
account. Until you have deliberately decided otherwise, put **Cloudflare
Access** in front of the hostname — it is free, takes about ten minutes, and is
reversible. It is the right posture for any deployment that has not been
penetration-tested.

::: danger Exclude the display routes or every spectator screen goes dark
An Access policy covering the whole hostname breaks the public display plane,
and it breaks it *at the event*, on the screens in the hall, in front of
everyone.

Two things must bypass the policy:

- `/api/display/*` — the projection API the boards poll
- `/display/*` — the SPA route the boards are pointed at

Both are capability URLs: unguessable 192-bit tokens, scoped to one workspace,
serving a strict projection with no operator material. That is the design —
they are *meant* to be openable by anyone holding the link, because the link
gets typed into a smart TV. Putting a login in front of them defeats their
only purpose.

Add both as Bypass rules in the Access application before the first event, and
re-check them after any Access policy edit.
:::

### 4b. The public entry surface (`/e/*`) — wired, not yet exposed

The Entries module adds a genuinely public surface. Since SP-PROGRAM-1 Phase 6
it is served by **two tiers behind one hostname** (ruling R8-A), and
`frontend/nginx.conf` is the only thing that knows there are two:

| Prefix | Served by | What lives there |
| --- | --- | --- |
| `/e/api/*` | FastAPI | the entrant JSON API — the page projection, the public config, the open-page list, the fee quote, and `POST /e/api/submit/{slug}`, which is the write |
| `/e/account/*` | FastAPI | the **entrant account** routes (`signup`, `login`, `logout`, `me`) added by SP-E1-2 — ruling R10, entrants have real accounts in their own tables with their own `sw_play_session` cookie, never `users`. These are **POST endpoints, not pages** |
| everything else under `/e/` | the `entrant` node service (React Router 7, SSR) | the **pages** a human opens: `/e/{slug}` off a poster, `/e/{slug}/receipt/{id}`, and `/e/signup` \| `/e/login`, whose forms POST to the FastAPI routes above |

Longest-prefix wins, so `/e/api/` and `/e/account/` reach FastAPI while a slug
falls through to node. `api` and `account` are reserved slugs on the node side
so a director cannot mint an entry page that collides with the split.

The edge configuration for all of it already exists in `frontend/nginx.conf`:
a `sw_entries` `limit_req` zone (**120 r/m, burst 30**, the same number
`sw_display` uses) applied at all four `/e/` locations, plus an explicit
`location /e/` block that also stops the SPA fallback swallowing entry links.

**The zone's size is set by the flow, not by the number of routes.** A
signed-out entrant's happy path is seven metered requests (page → signup page →
POST signup → back to the page → quote → POST submit → receipt), so the
original 20 r/m burst=5 gave a capacity of six: one reload or one mistyped
password was a `429`, and a second entrant behind the same venue NAT within
~18 s was a `429`. Do not lower it without re-counting that flow.

The zone stays under `/e/` rather than moving to `/api/` on purpose — `/api/`
is served on the Access-fronted operator hostname, and an entrant login behind
Cloudflare Access is an entrant login nobody can reach. The `Cookie` header is
rewritten on the way to node so only `sw_play_session` and `sw_play_csrf` get
through: the **operator** session is inadmissible on the entrant tier by
construction, not by convention.

The operator's entries desk needs nothing of its own: it is
`/tournaments/{id}/entries`, session-guarded, and rides the general `/api/`
block.

::: warning Activated at Phase 2 deployment, deliberately not before
`/e/` now **routes** in every stack that has a frontend — Phase 6 wired the
split above and added the `entrant` service to the base, release and selfhost
compose files. What has not happened is **exposure**: no hostname has been
published for it, and none should be until the public-exposure gate has been
passed. Turning it on is three changes, in this order — **and step 3 is
currently a known blocker, not an open question**:

1. **Real Turnstile keys** (`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`).
   The shipped defaults are Cloudflare's dummy always-pass pair.
2. **Ingress by hostname, not by another Access exclusion.** The entry page is
   served under its own public hostname with no Access policy attached — that
   is what keeps §4a's exclusion list from growing a `/entries/*` entry every
   time a public surface appears.
3. **The CSP question is answered: the policy admits Turnstile on one path.**
   SP-E1-2 moved the challenge off the entry page and onto entrant **signup**
   (ruling R10 — a puzzle in front of a route that already requires an account
   charges every honest entrant to slow an attacker who has already signed up).
   The entry page ships **no client JavaScript at all**: the React Router 7
   tier renders no `<Scripts/>`, the acknowledgment gate is the HTML `required`
   attribute, and the gender filtering and running fee total are server round
   trips rather than script. (Until SP-PROGRAM-1 Phase 6 the page was rendered
   by FastAPI and set its own `script-src 'none'` header; the header is now the
   shared nginx snippet's, and the page has nothing to run under it either
   way.) So there is nothing left on `/e/{slug}` for the intersection of the
   page policy and the nginx policy to break.

   **The signup page is a different story, and it cost a policy change.** It
   renders `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">`
   into its own markup. `security-headers.conf` used to send `script-src 'self'`
   for it too, so a real browser blocked the script, the widget never rendered,
   the form posted no `cf-turnstile-response`, and the server refused the empty
   token: **every entrant signup answered `403 AUTH_CHALLENGE_FAILED`** — and
   since entering a tournament requires a session and a session requires an
   account, the entrant surface was unusable end to end in any stack that served
   it. Found in Chromium and with curl against the containerised stack
   (SP-PROGRAM-1 Phase 6, Task 30) and fixed in Task 33.

   **The fix, and what it costs you.** `nginx.conf` now carries a
   `$sw_turnstile_origin` map that appends `https://challenges.cloudflare.com`
   to `script-src` and `frame-src` — the two directives Cloudflare
   [documents as required](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
   — **for `/e/signup` and no other path.** So the origin you host trusts one
   third-party script host, on one public page, and the operator console served
   from the same origin still gets `script-src 'self'` byte for byte. That
   scoping is not decoration: the two tiers share an origin, so a global
   widening would have handed the console a third-party script source it has no
   use for. Nothing about your Cloudflare account, DNS, tunnel or Access config
   changes — this is our own nginx header. `e2e/tests/10-entrant-r11-evidence.spec.ts`
   holds both halves: the widget must render with zero CSP violations, and no
   path other than `/e/signup` may name that host.
:::

Once the remediation in `SEC_PROGRESS.md` has landed and you want public
signup, the intended end state is **open registration with rate limiting**
(already implemented: a per-IP registration bucket, a per-user concurrent-solve
cap, and `limit_req` zones at the edge) rather than invite-only. Invite-only is
held in reserve for if abuse actually appears.

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

Behind the tunnel every request reaches the API through a proxy, so the peer
address is the same for everyone. The credential throttle keys on the client
address, so if this setting doesn't match **all users share one bucket**: the
fifth failed login from anyone on earth locks out everyone, doubling to a
15-minute cap.

**It must name the API's immediate peer, which is the `frontend` nginx
container — not cloudflared.** The request path is:

```
browser → cloudflared → frontend:8080 (nginx) → /api/* → backend:8000
```

cloudflared never talks to the API directly, so trusting *its* address means the
check never matches and the throttle collapses exactly as if the setting were
absent. (This guide said "connector IP" before 2026-08-05. That was wrong, and
wrong in the fail-open direction.)

The stack pins its network to `10.201.0.0/24` for this reason, and the compose
file defaults the setting to that range — **so on a standard install there is
nothing to set here.** Prefer the subnet over a container address: Docker
reassigns container IPs on `--force-recreate`, and a pinned literal that stops
matching fails open, silently.

`.env.selfhost.example` therefore does **not** set this variable, and that
absence is deliberate: compose interpolates `.env` *before* applying a `:-`
default, so anything the template says beats the compose file. Until
2026-08-11 the template shipped `TRUSTED_PROXY_IPS=172.20.0.3` — an address
from a subnet this stack no longer uses — and because §3's first step is
`cp .env.selfhost.example .env`, every install inherited a trust check that
could not match. Symptom: the failure this whole section describes, from day
one, with nothing in any log.

Only if you changed the subnet, keep all three in step:

```bash
echo 'TRUSTED_PROXY_IPS=10.201.0.0/24' >> .env   # must match `networks:` in the compose file
```

Both a bare address and a CIDR block are accepted.

::: warning The third place is inside the frontend image
`apps/console/nginx.conf` carries `set_real_ip_from
10.201.0.0/24`, which is how nginx decides whether to believe
`CF-Connecting-IP` for **its own** rate-limit zones (`sw_auth`, `sw_entries`,
`sw_display`) and what it then forwards to the API. It is baked into the
image, so changing the compose subnet without changing it there and rebuilding
leaves nginx keying every zone on the cloudflared connector — one bucket for
the whole internet again, one layer up. Same setting, three places:
`networks:`, `TRUSTED_PROXY_IPS`, `set_real_ip_from`.
:::

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
header is not being read — recheck `TRUSTED_PROXY_IPS` against the address the
API sees as its **immediate peer**, which is the `frontend` nginx container,
not cloudflared. Confirm it is inside the compose subnet:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  shuttleworks-frontend-1
```

## 7. First run

Check the secrets are readable **inside** the container before starting
anything. This is a ten-second check that pre-empts the most confusing
first-boot failure on this page:

```bash
cd /opt/ShuttleWorks
docker compose -f infra/compose/docker-compose.selfhost.yml run --rm --no-deps \
  --entrypoint sh api -c 'cat /run/secrets/database_url >/dev/null && echo "secrets readable by uid $(id -u)"'
```

If that errors instead of printing, revisit §2 — the API runs as UID 1001 and
cannot read a secret file owned by your deploying user with mode `600`. The
symptom otherwise is a container that restart-loops with a *configuration*
error naming `DATABASE_URL`, which sends you looking at the wrong thing
entirely.

```bash
docker compose -f infra/compose/docker-compose.selfhost.yml up -d --build
```

The API applies Alembic migrations in its startup lifespan — it is the only
process that ever does. Watch for `alembic_upgrade_head_complete`, then:

```bash
docker compose -f infra/compose/docker-compose.selfhost.yml exec api \
  python -c "import urllib.request,json; t=open('/run/secrets/ops_token').read().strip(); \
req=urllib.request.Request('http://localhost:8000/health/ready', headers={'X-ShuttleWorks-Ops-Token': t}); \
print(json.load(urllib.request.urlopen(req)))"
```

Expect `"status": "ready"` with `schemaRevision` equal to `expectedRevision`.
Without the header this answers `403` — that is the guard working, not a fault.

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
WorkingDirectory=/opt/ShuttleWorks
ExecStart=/usr/bin/docker compose -f infra/compose/docker-compose.selfhost.yml up -d
ExecStop=/usr/bin/docker compose -f infra/compose/docker-compose.selfhost.yml down
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
curl -sf https://<your-hostname>/api/health && echo "API OK"
curl -sf -o /dev/null https://<your-hostname>/ && echo "APP OK"
```

Check `/api/health`, **not** `/health`. nginx only proxies `/api/*`; every
other path falls through to the SPA, so `/health` would return `index.html`
with a cheerful `200` no matter what state the backend is in. A check that
cannot fail is worse than no check.

An unverified recovery path is an assumption, and the time to discover it was
wrong is not the morning of a tournament.
:::

## Backup and restore

Postgres is the source of truth. Two dumps, not one:

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
# /opt/ShuttleWorks/restore-drill.sh  — restores into a THROWAWAY database
set -euo pipefail
SRC=${1:?usage: restore-drill.sh /path/to/backup-dir}
cd /opt/ShuttleWorks
C="docker compose -f infra/compose/docker-compose.selfhost.yml exec -T postgres"

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
