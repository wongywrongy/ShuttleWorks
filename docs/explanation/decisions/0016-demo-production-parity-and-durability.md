# ADR 0016: The private demo follows the production application path

**Status:** Accepted — 2026-08-29

## Context

The Tailscale demo is long-lived sales and product evidence, not a disposable
developer fixture. A demo that uses SQLite or alternate application wiring can
look healthy while production-only migrations, SQL behavior, SSR, or container
boundaries are broken. Its populated historical dataset is also expensive to
recreate and must not disappear during a rebuild, repository cleanup, or an
operator mistake.

Perfect configuration equality is neither possible nor desirable. Production
terminates TLS through Cloudflare and requires real accounts and SMTP; the
private demo is reached only over a tailnet and intentionally offers
zero-friction bootstrap access.

## Decision

The demo inherits the default stack's production-built API, console, entrant,
nginx, Alembic migration, and embedded-worker paths. It uses the same Postgres
major as the canonical self-hosted production stack. Its only deliberate
differences are deployment configuration:

| Concern | Production | Private demo |
| --- | --- | --- |
| Application images and code | Production Dockerfiles | Same Dockerfiles |
| Database | Postgres 16 | Dedicated Postgres 16 |
| Schema ownership | API startup migrations | Same startup migrations |
| Ingress | Cloudflare Tunnel and TLS | Tailscale-bound HTTP ports |
| Authentication | Cloud accounts | Local bootstrap identity |
| Cookie transport | Secure | Insecure, because the tailnet demo is HTTP |
| Runtime state | Production bind mount | Separate marked demo bind mount |

The demo database is never shared with development or production. Generated
credentials are file-backed and live under the user's private state directory,
outside the source checkout.
Postgres is not published on a host port.

Database lifecycle commands are recovery-first:

- rebuild, stop, reset, and seed cleanup take a backup before changing state;
- each Postgres backup contains a custom-format database dump, cluster globals,
  row-count evidence, seed manifests, application revision, and checksums;
- a restore drill loads the archive into a throwaway database and compares the
  recorded counts;
- live restore drills the candidate and creates a fresh pre-restore backup;
- reset and live restore require explicit typed confirmation;
- live data is quarantined instead of recursively deleted.

Lifecycle and seed-write commands share one filesystem lock. Interrupted live
restores retain a recovery marker and exact temporary database names; a new
restore refuses to overwrite that evidence. The demo also clears the base
stack's optional developer env file so no direct database URL can outrank its
file-backed dedicated Postgres URL.

Backups default outside the checkout and outside live state. A daily persistent
systemd user timer is provided. This protects against container rebuilds,
repository cleanup, and operator errors; protection against host or disk loss
still requires `DEMO_BACKUP_DIR` to point at an encrypted off-host or separately
backed-up filesystem.

The rebuild path is provenance-checked. `demo-rebuild` requires a clean Git
checkout, pulls the pinned Postgres image and current base layers, and rebuilds
the application images with `--pull --no-cache` before recreating the complete
four-container demo. Application images receive an OCI revision label. Backup
metadata and `demo-status` retain/report the source revision, worktree state,
and image IDs/digests, so an operator can verify that the running containers
come from the intended commit without disturbing the Postgres bind mount.

`infra/compose/docker-compose.selfhost.yml` remains the canonical production
deployment definition. The demo override is not a second production stack.

## Consequences

- Demo behavior exercises the production database dialect and migration path.
- A clean demo start costs more than SQLite but is representative and bounded.
- Operators have one launcher for start, backup, verification, restore, and
  reset instead of ad-hoc Docker and database commands.
- Recovery is testable before an incident rather than inferred from a dump's
  existence.
- A clean revision and image identifiers make a demo rollout auditable; the
  remaining release-stack image-tag policy is intentionally separate.
- Local bootstrap auth is acceptable only because the launcher refuses a bind
  outside Tailscale's `100.64.0.0/10` range.
- The repository cannot honestly promise survival of physical disk loss until
  the configured backup destination is off-host.
