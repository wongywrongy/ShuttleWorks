# Configure the Yunavero production domain

This runbook publishes ShuttleWorks on two deliberately separate origins:

```text
app.yunavero.com   → operator console and /api/ → frontend:8080
play.yunavero.com  → public entrant site /e/*  → frontend:8081
```

Cloudflare Access belongs on `app.yunavero.com` only. Never put Access on the
public entrant hostname, never use a wildcard hostname, and never configure a
shared cookie domain.

## 1. Prepare the deployment configuration

Copy the self-host template and retain its Yunavero hostnames:

```bash
cp infra/compose/.env.selfhost.example .env
chmod 600 .env
grep -E '^(APP_HOSTNAME|PLAY_HOSTNAME)=' .env
```

Expected output:

```text
APP_HOSTNAME=app.yunavero.com
PLAY_HOSTNAME=play.yunavero.com
```

Complete the remaining secrets and SMTP settings as described in
[Deploy: start to finish](/how-to/deploy). Keep the working SMTP mailbox and
the current security contact until Yunavero mail has passed SPF, DKIM, DMARC,
send, receive, and password-recovery tests.

## 2. Configure the named Cloudflare tunnel

In **Cloudflare Zero Trust → Networks → Tunnels**, create or open the named
tunnel and add exactly these public-hostname routes:

| Public hostname | Service |
| --- | --- |
| `app.yunavero.com` | `http://frontend:8080` |
| `play.yunavero.com` | `http://frontend:8081` |

Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. Cloudflare
creates the proxied DNS records for dashboard-managed public hostnames; confirm
both records are proxied before continuing.

Create a Cloudflare Access self-hosted application for
`app.yunavero.com` and restrict it to approved operators. Do not include
`play.yunavero.com` in that application or any broader wildcard policy.

## 3. Start and verify

```bash
docker compose --env-file .env \
  -f infra/compose/docker-compose.selfhost.yml config --quiet
docker compose --env-file .env \
  -f infra/compose/docker-compose.selfhost.yml up -d
docker compose --env-file .env \
  -f infra/compose/docker-compose.selfhost.yml ps
```

From a machine outside the server, verify DNS, TLS, and the origin split:

```bash
dig +short app.yunavero.com
dig +short play.yunavero.com
curl -sSIL https://app.yunavero.com/
curl -sSIL https://play.yunavero.com/e/
curl -sS -o /dev/null -w '%{http_code}\n' https://play.yunavero.com/api/auth/me
```

The operator URL must encounter the Access policy before the application. The
entrant page must load without Access. The public hostname's operator API probe
must not expose an authenticated operator response. In browser developer tools,
confirm operator cookies are host-only for `app.yunavero.com` and are absent
from requests to `play.yunavero.com`.

Complete an operator login/reset, an entrant signup/verification, and a doubles
partner invitation. Every generated link must use the appropriate hostname.

## 4. Roll back

If validation fails, remove or disable both tunnel public-hostname routes, then
restore the prior `APP_HOSTNAME`, `PLAY_HOSTNAME`, and tunnel token in `.env`.
Recreate the stack and repeat the original host's smoke checks. Do not weaken
Access, CORS, cookie scope, Turnstile, or TLS to keep a failed rollout online.

The apex `yunavero.com` remains reserved for a future company site and is not
served by the ShuttleWorks stack.
