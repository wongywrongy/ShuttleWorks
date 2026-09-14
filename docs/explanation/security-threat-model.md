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

Cloud and node operators complete app-owned MFA. Password-stage cookies cannot
operate a workspace. Each node operator enrolls a separate password and factor
using a private, one-use activation credential issued by a trusted local OS
administrator; the shared authority capability cannot establish an individual.
Operator sessions have a twelve-hour absolute limit and a one-hour idle limit;
sensitive actions require proof within five minutes. Password changes, reset and
MFA grants serialize on the account so concurrent grants cannot escape revocation.
The [security operations runbook](../how-to/security-operations.md) describes key
custody and audited local recovery, including outstanding operational rehearsals.

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

The register's `principles` array tracks exactly R1–R12 with `enforcedBy` and
`evidence` paths, owner, dated review, verdict and residual debt. CI rejects
missing/duplicate rules, malformed evidence and unsupported PASS claims. The
[baseline review](../reviews/security-golden-rules-2026-09-13.md) is preserved;
the [implementation review](../reviews/security-remediation-2026-09-13.md) records
later changes and distinguishes synthetic checks from operational rehearsals.
