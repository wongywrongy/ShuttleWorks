# Stable LAN origin with TLS

The normal local stack remains HTTP. For a phone, tablet, or kiosk on a LAN,
use the opt-in `lan-tls` Compose overlay with a certificate issued by a local
CA (or another CA trusted by every client). Do not commit certificates or
private keys to this repository.

The profile publishes two stable origins: `https://shuttleworks.local:8443`
for the operator console and `https://shuttleworks-play.local:8444` for the
entrant surface. Add both names to the LAN DNS (or each client’s hosts file)
and ensure the certificate SANs cover the names.

```sh
export LAN_TLS_CERT_FILE=/secure/path/shuttleworks-lan.crt
export LAN_TLS_KEY_FILE=/secure/path/shuttleworks-lan.key
tools/lan-tls-preflight.sh
docker compose -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.lan-tls.yml \
  --profile lan-tls up -d
```

The proxy binds to `127.0.0.1` by default. To share it on a trusted LAN,
explicitly set `LAN_TLS_BIND_ADDR` to the host’s LAN address and configure the
host firewall. Never use `0.0.0.0` casually. `LAN_TLS_APP_PORT` and
`LAN_TLS_PLAY_PORT` can change host ports without changing the certificate
names or application origins.

The preflight checks that files exist, the certificate is valid for at least
seven days, its SAN contains both stable names, and the private key
matches. It does not generate or persist key material. Removing the overlay
returns to ordinary HTTP local compose behavior.

When this overlay is enabled, the base console’s clear-text ports are replaced
with loopback-only bindings and both application tiers use secure cookies.
This prevents the TLS profile from accidentally leaving an HTTP route open to
the venue LAN.
