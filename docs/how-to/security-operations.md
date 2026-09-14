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
| Operator authenticator encryption keys | API-only `MFA_KEYRING_FILE`; AES-GCM factor and pending-enrollment storage | identity-module-owner | Provision a separate random key ring per deployment. Preserve old keys while any active or pending factor, or retained backup, requires them. Never copy cloud factors or their encryption keys to an event node. See the provisioning section below. |
| Display and invitation capabilities | Display management, workspace sharing and partner invitations | identity-module-owner | Revoke affected links and issue replacements. Staff links expire within seven days; migrations 0004/0005 hash staff/display bearers. Save newly issued links before leaving Sharing; later reads cannot retrieve them. Dated display links stop seven venue-local calendar days after the event; undated legacy links expire during migration and require an explicit replacement deadline. Historical database files and backups can retain pre-migration credentials until their retention window ends. |
| Release publishing identity | GitHub Actions OIDC; registry permissions | release-owner | There is no persistent cosign signing password. Revoke compromised workflow/app access, protect release refs, rebuild from a reviewed commit and verify signature plus exact-source provenance before installation. |

## Operator authenticator key provisioning

Before starting a cloud or event-node API, create its private encryption file
from the repository root using the deployment's Python environment:

```sh
.venv/bin/python tools/operator-mfa-keyring.py secrets/operator_mfa_keys.json
```

The parent directory must already exist and be private. The command creates a
new file with mode `0600`, refuses to overwrite an existing file and prints only
the key identifier. Mount it at the API's `MFA_KEYRING_FILE` path; the cloud and
self-host Compose definitions use `secrets/operator_mfa_keys.json` by default.
Event nodes use a separately generated `secrets/node_operator_mfa_keys.json`.
Set the host file's owner to the API container UID 1001 while keeping it private.
Workers and sync processes do not receive this key. Startup refuses a missing,
unreadable, malformed or known-predictable key file; it never generates a
replacement that would strand existing factors.

Keep an encrypted, access-controlled copy alongside the deployment recovery
material. Database backups contain encrypted factors but cannot decrypt them
without these keys. The key-ring reader accepts up to four keys and writes with
the selected active key. A successful authenticator verification re-encrypts
an old factor with the active key; a recovery-code login alone does not do so.
Do not delete an old key based on elapsed time or one successful login. Key-use
inventory, bulk rewrapping and a rehearsed retirement procedure remain open;
the file format alone does not establish safe rotation.

## Individual offline operators

Import the workspace checkpoint and verify the node holds its active authority
epoch before enrolling a person. Their imported membership must be `operator`
or `owner`. Cloud passwords, authenticator seeds and recovery codes are never
copied to the node. Each person chooses a separate node password and enrolls an
authenticator on that node.

From the repository root, with the event-node API's database URL, deployment
profile and node ID in the environment, a trusted local OS administrator runs the
command below. It runs as the `admin` process role, so it does not need the API's
MFA key ring (a container path) on the host:

```sh
.venv/bin/python tools/node-operator-enrollment.py \
  --workspace WORKSPACE_UUID --operator USER_UUID --output /private/new-activation.json
```

The output must be a new file in a private directory. The command writes mode
`0600` and stores only the activation token's hash in the database. Deliver the
file to the identified person over a private channel within ten minutes. They
open the node console's `/node-enrollment?workspaceId=WORKSPACE_UUID`, enter the
email and activation token from the file, choose a password, and complete the
authenticator ceremony. Keep the recovery codes privately; the console presents
them once. Remove the activation file after handoff. Never put its token in a
URL, chat log or issue. Reissuing an unused activation invalidates its predecessor.

Subsequent node sign-in uses `/login?workspaceId=WORKSPACE_UUID&node=1` and that
person's node password plus authenticator or one-use recovery code. The shared
authority capability cannot enroll an individual or grant MFA assurance. Node
credentials grant access only to their workspace and active epoch.

If both the authenticator and recovery codes are lost, verify the person out of
band before local recovery. The same administrator command requires both
`--reset-existing` and `--reason 'Verified recovery reason'` to replace configured
credentials. This revokes the person's node password, factor, recovery codes and
all sessions, records the node identity and reason, and issues a new activation
file. It never grants an authenticated session. Without those explicit options,
the command refuses to reset an already configured account. There is no LAN
endpoint for administrator reset. An existing output path or failed transaction
leaves the previous credentials intact.

The person can change their node password or replace their authenticator from
Account security after fresh authentication. Cloud email password reset does
not recover node identity. Production handoff, lost-factor recovery and
disconnected/reconnection rehearsals remain required operational evidence.

## Authority signing key rotation

`AUTHORITY_SIGNING_PUBLIC_KEY_FILE` accepts a single existing PEM/raw/hex/base64
Ed25519 public key or a PEM bundle of up to 16 distinct Ed25519 public keys
(16 KiB maximum). The grant's key ID selects exactly one trusted key; missing,
unknown or forged IDs are refused. Malformed bundles fail closed at verification.
The signing file still holds exactly one private key. Public bundles never contain
private material and are distributed through the existing event-node public-key mount.

Planned rotation proceeds in this order:

1. Generate the replacement Ed25519 pair in the restricted key-management process.
   Record both public-key fingerprints and the rollout owner. Keep private material
   out of shell arguments, logs and this repository.
2. Distribute an old-plus-new public PEM bundle to every participating node, and to
   any cloud process that verifies checkpoint imports. Restart those consumers and
   prove both keys verify. Account for disconnected nodes before switching issuance;
   they retain their current epoch but cannot consume a new-key grant until updated.
3. Replace only the cloud issuer's private-key file, restart every issuer, and prove
   a newly issued grant names the new key. Existing epochs keep their original signed
   grants, actor history and sequence; rotation does not create a second write owner.
4. Return or fence all epochs using the retiring key through the existing audited
   authority operations. Reconcile their acknowledged operations first. Do not delete
   historical epochs or re-sign their stored evidence to make a check pass.
5. Pause checkout/transfer/recovery grant issuance across **every** cloud process.
   Using the cloud process's database and key-file configuration, run the read-only
   inventory and candidate tool from this checkout:

   ```bash
   .venv/bin/python tools/authority-keyring.py
   .venv/bin/python tools/authority-keyring.py --retire-key-id OLD_KEY_ID --output /tmp/reviewed-authority-trust.pem
   ```

   Configure `AUTHORITY_SIGNING_PUBLIC_KEY_FILE` to the current overlap bundle for
   this command. It refuses the active signer, unknown keys, any preparing/active
   epoch using the old key, and unattributed/untrusted open epochs. SQLite/PostgreSQL
   connections are read-only. It creates a new candidate file exclusively; it never
   overwrites live trust, modifies epochs or publishes a configuration.
6. Review the inventory and candidate, distribute the candidate to all consumers,
   restart, prove old-key import fails and new-key import succeeds, then resume
   issuance. Keep the public old-key material with restricted historical evidence
   for offline audit; remove it from live verification trust. Record the source
   revision, deployment identities, key IDs, epoch disposition and verification result.

The tool observes one database snapshot. It cannot fence another issuer, prove that
an offline node received a trust update, or authorize deletion of private material.
Issuance must remain paused between its check and distribution. This source delivery
has executable overlap/import/retirement controls; a deployed rotation rehearsal and
emergency revocation remain unverified P10/P14 work.

For compromise, stop new issuance and isolate affected nodes while the maintainer
coordinates containment. Planned rotation cannot revoke authority on a disconnected
node: fence its epoch centrally, preserve local operations for reconciliation, and
replace the node's trust before reconnecting it. Individual offline enrollment is described above; a disconnected recovery and
reconnection rehearsal remains open.

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
access log; startup `nginx -t` failures remain visible. API, worker and sync text
handlers install `core/log_redaction.py` after logging setup. It redacts capability
paths, query strings, credential headers/fields and URL credentials in messages
and tracebacks while retaining status and safe context. This is a guard for known
credential surfaces, not a classifier for arbitrary secrets in free text. Console
email records only skipped delivery, without recipient, subject or body; SMTP
provider errors become a fixed delivery error. Disposable journey fixtures use
`simulator/tournament_sim/mailbox.py`: loopback SMTP, synthetic recipients only,
bounded mail in memory, destroyed when the fixture exits. Never point it at live
accounts or use it as a production mail relay.

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
