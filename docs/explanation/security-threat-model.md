# Security threat model

The machine-readable risk register is
`docs/reference/security-threat-model.json`. It covers every trust surface
required by the long-term plan: the cloud control plane, event node, sync
protocol, venue LAN, backups, installer/update channel, and operator devices.

The central trust decision is that checkout transfers one tournament's write
authority to one enrolled node and epoch. Cloud sessions do not become node
credentials, browser storage is never authoritative, telemetry is never part
of command success, and neither a reachable LAN nor possession of a public
display URL grants operator authority.

Each threat names its STRIDE category, severity, repository controls,
executable evidence, owner, and residual risk. A `critical` or `high` item may
ship only when it is mitigated or the named owner records an explicit release
exception. `Partially-mitigated` is intentionally not another spelling of
done: it identifies a repository control whose production effectiveness still
depends on certificate distribution, credential custody, supported hardware,
or a rehearsed response.

## Trust boundaries

1. The public internet and cloud edge terminate before authenticated control
   plane routes and tenant-scoped repositories.
2. Checkout crosses from cloud identity into a signed checkpoint, enrolled
   node identity, authority capability, and epoch.
3. The venue LAN terminates at the TLS edge. Clear-text application ports stay
   on loopback, and the event-node API requires an event-scoped credential.
4. Reconnection crosses the ordered sync boundary. The cloud validates the
   device, epoch, sequence, schema, operation identity, and payload before
   changing its projection.
5. Backup and release artifacts cross into operator-controlled storage. Their
   confidentiality, integrity, compatibility, and origin must be verified
   before restore or installation.

## Review and evidence

Review the register before every release candidate and whenever a trust
boundary changes. CI checks its coverage and verifies that every entry has an
owner and executable or inspectable evidence. That check does not replace a
penetration test, hostile-LAN exercise, live-event rehearsal, or production
risk review; those remain Phase 5 exit criteria.
