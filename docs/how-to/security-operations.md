# Security operations

Owner: platform-oncall. The repository maintainer coordinates incidents and
assigns the identity, sync and release responsibilities below. This runbook is
an implementation aid; no deployment rotation or incident exercise is recorded
by its existence.

## Secret inventory

Record actual deployment locations and last rotation dates in the deployment's
restricted secret manager. Never add values, recovery codes, recipient addresses
or private key material to this table or an issue. Settings are defined in
`apps/api/src/core/config.py`; mounted-file support does not mean every current
Compose input is file-backed.

| Secret class | Consumers / configuration | Owner | Rotation and verification |
| --- | --- | --- | --- |
| Application database credential | API and worker `DATABASE_URL_FILE`; Postgres password file | platform-oncall | Issue replacement DB credentials with equivalent grants, update API/worker mounts, restart clients and prove readiness and a transactional write before retiring the old login. Changing a mount alone does not change an existing Postgres role password. |
| Operations bearer | `OPS_TOKEN_FILE`; health probes and monitoring | platform-oncall | Replace the token and all probe mounts together, restart consumers, verify the old token is refused and the new token reaches protected health. Public `/health` must still return status only. |
| SMTP credentials | `SMTP_PASSWORD_FILE`, SMTP username; API mail delivery | identity-module-owner | Issue provider replacement, update API, deliver a synthetic account email through the intended recipient mailbox, revoke old credential. Never inspect delivered tokens in application logs. |
| Turnstile server secret | `TURNSTILE_SECRET_KEY_FILE`; signup verification | identity-module-owner | Rotate at the provider, update API, prove a fresh challenge succeeds and a replay/invalid challenge fails. The site key is public configuration, not a secret. |
| Cloudflare tunnel token | Self-host `CLOUDFLARE_TUNNEL_TOKEN` currently appears in container arguments | platform-oncall | Rotate the tunnel credential at the provider, update connector, prove both origins route correctly, revoke old credential. Moving this input to a token file remains deployment debt. |
| Cloud authority Ed25519 private key | `AUTHORITY_SIGNING_KEY_FILE`; cloud grant issuer | sync-module-owner | Follow the authority section below. Its paired verification key is public; key authenticity and distribution still matter. |
| Event-node Ed25519 private key | `NODE_SIGNING_KEY_FILE`; enrolled device readiness proof | sync-module-owner | Fence/return the affected node's authority, revoke its enrollment, enroll its replacement public key and prove possession before issuing another grant. |
| Authority capability | `SYNC_AUTHORITY_CAPABILITY_FILE`; sync client and offline session bootstrap | sync-module-owner | Close/fence the old epoch through audited authority operations, issue the replacement capability once and prove the old capability is rejected. Copying a file does not transfer authority. |
| Recovery passphrase | `BACKUP_PASSPHRASE_FILE`; scheduler and recovery CLI | platform-oncall | Create and restore-test a bundle under the new passphrase before retiring old generations. Keep old decryption material in restricted escrow until every retained old bundle expires; changing the active passphrase does not re-encrypt old bundles. |
| TLS private keys | LAN server key; OTLP client/server keys | platform-oncall | Replace certificate/key pairs atomically, verify SAN/chain/expiry and both HTTPS origins or mTLS export, then revoke old certificates. Keep TLS minimum at 1.2 or 1.3. |
| Telemetry database credential | Collector `POSTGRES_TELEMETRY_PASSWORD` | platform-oncall | Replace the read-only monitoring login and Collector configuration, verify database metrics resume, revoke old login. |
| Human session, reset and verification bearers | Identity tables; host-only cookies and one-use email links | identity-module-owner | Revoke affected sessions and outstanding reset/verification credentials through the identity service. Passwords are changed through the Argon2id service; never set a raw hash by hand. |
| Display and invitation capabilities | Display management, workspace sharing and partner invitations | identity-module-owner | Revoke affected links and issue replacements. Hash-at-rest and finite-lifetime remediation remains incomplete for display/staff invitation links; nginx redaction does not close that storage gap. |
| Release publishing identity | GitHub Actions OIDC; registry permissions | release-owner | There is no persistent cosign signing password. Revoke compromised workflow/app access, protect release refs, rebuild from a reviewed commit and verify signature plus exact-source provenance before installation. |

## Authority signing key rotation

The current verifier accepts one configured public key. A live key replacement
while old epochs remain open is **not a supported rotation procedure**. Preserve
the old key pair until the sync owner has reconciled every open epoch, returned
or fenced its authority, and verified the audit history and acknowledged sequence.
Then replace the cloud private key and every node's trusted public key, restart
consumers, and issue fresh grants. Verify old grants fail and newly signed grants
succeed. Never delete authority history to make verification succeed.

Overlapping key IDs, retirement conditions tied to open epochs, emergency key
revocation and individually authenticated offline operators remain P08/P10 work.
If an old private key is compromised, stop new checkouts and isolate affected
nodes while the maintainer coordinates containment; normal planned rotation
cannot make already issued offline authority disappear from a disconnected node.

## Incident response

1. **Open a restricted record.** Record discovery time, affected deployment and
   source revision, symptom, incident lead and next update time. Use opaque
   internal identifiers; keep personal records, cookies, capability URLs and
   raw mail out of the incident narrative.
2. **Contain the specific surface.** The platform owner can remove public ingress
   or stop the affected service. The identity owner revokes affected sessions or
   links. The sync owner accounts for disconnected nodes and fences epochs through
   audited operations. Preserve acknowledged local operations before replacing a
   node. Do not assume stopping cloud ingress stops offline writes.
3. **Preserve evidence.** Save relevant safe structured logs, deployment revision,
   signed release evidence and audit transition identifiers in restricted storage.
   Take an encrypted backup when needed. Give incident evidence its own authorized
   retention and access policy; do not copy entire participant exports into tickets.
4. **Assess scope and communication.** Determine affected people, data categories,
   interval and unauthorized actions from evidence. The maintainer coordinates
   organizer communication and applicable reporting obligations. Track uncertainty
   explicitly; absence of a log entry is not evidence that no access occurred.
5. **Recover and verify.** Rotate affected credentials using the inventory, deploy
   a reviewed fix through release verification, restore only into an isolated
   target first, reconcile authority and run the affected negative controls. Check
   erasure/retention state before returning restored participant data to service.
6. **Close with evidence.** Record impact, timeline, containment and restore results,
   residual uncertainty and an owner/test for every follow-up. Resume public traffic
   only after the maintainer records the concrete readiness result. Schedule an
   exercise for any step that could not be rehearsed.

## Edge logging

`infra/nginx/log-redaction.conf` omits queries, Referer, cookies, IP and user-agent
fields and masks capability path families, including browser `/invite/` and
`/e/partner/` links. Runtime nginx error logs are disabled because that log channel
cannot redact request URLs. Status, upstream status and timing remain in the safe
access log; startup `nginx -t` failures remain visible. Application/email logging
needs separate remediation; this policy does not sanitize those channels.

## Verify a release before installing

With authenticated Docker/gh and cosign installed, prepare the three image digests:

```bash
.venv/bin/python tools/verify-release.py FULL_40_CHARACTER_COMMIT_SHA --output verified-release.env
```

The command resolves the source-SHA tags, verifies cosign's GitHub release-workflow
identity and GitHub SLSA provenance for that exact source commit, then atomically
writes the env file. Any registry, signature or provenance failure exits non-zero
before writing it. This does not deploy. A deployment uses that file with
`infra/compose/docker-compose.release.yml`; `TAG=latest` cannot select an image.
Do not construct the digest file by hand or treat a previous successful file as
evidence for a failed verification of a different commit.

## Rehearse recovery

Run the credential-free synthetic drill from the repository root:

```bash
.venv/bin/python tools/recovery-drill.py --report /tmp/recovery-drill.json
```

For deployment evidence, supply `--database` with an event-node SQLite path and
`--passphrase-file` with its restricted passphrase file. The command snapshots the
source read-only, restores into a temporary replacement directory, checks the
snapshot digest and SQLite integrity, and rejects wrong keys and modified
ciphertext. Its report contains counts and check results, not tenant identifiers
or row contents. Temporary databases and bundles are removed on exit.

The [recorded synthetic run](../reviews/recovery-drill-2026-09-13.json) does not
replace a deployed event-node drill or [Postgres PITR rehearsal](postgres-disaster-recovery.md).
Confirm both `ShuttleWorksBackupStale` and `ShuttleWorksBackupRestoreFailed` load
in the monitoring deployment and reach the intended receiver; local rule parsing
alone does not prove alert delivery.
