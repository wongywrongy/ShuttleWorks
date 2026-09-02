# Event-node reliability runbooks

Owner: event-operations. Platform-oncall owns the host and Collector. These
procedures are deliberately conservative: preserve the local database and
operation log before attempting repair, and never make a browser cache the
source of truth.

The guarded `GET /health/backups` endpoint reports last successful bundle,
path, free bytes, retained generation count, and restore-test status. It never
returns passphrases or database contents. A `disabled` response is expected on
cloud and unconfigured local profiles.

## Verify an offline package

The transport-neutral package prototype signs a manifest that hashes every
payload file. Build it only on the release host and keep the Ed25519 private
key outside the payload:

```bash
cd apps/api/src
../../../.venv/bin/python -m shuttleworks.event_node.package create \
  --source event-node-payload --output shuttleworks-event-node.tar.gz \
  --version 2.0.0 --private-key /run/secrets/event-node-release-signing.pem
```

On the target machine, verify before extracting or installing anything:

```bash
cd apps/api/src
../../../.venv/bin/python -m shuttleworks.event_node.package verify \
  --bundle shuttleworks-event-node.tar.gz \
  --public-key event-node-release-public.pem
```

This proves artifact authenticity and contents. It is not yet the signed and
notarized desktop installer, update supervisor, or LAN certificate ceremony.

## Preflight before checkout

1. Confirm the enrolled node ID, application/schema compatibility, operator
   access, solver availability, and at least 5 GiB free disk.
2. Verify the cloud endpoint and capability secret are reachable without
   logging the secret.
3. Create and verify a portable encrypted recovery bundle.
4. Run checkpoint import/integrity verification and record the checkpoint
   hash, authority epoch, and app version.
5. Confirm the local display, result entry, schedule, print/export, and backup
   paths with WAN access disabled. A green browser page alone is insufficient.
6. Start play only after the node reports `active` and the operator has a
   recorded recovery location.

Run the fast durability gate on a disposable path:

```bash
.venv/bin/python tools/event_node_acceptance.py \
  --database /tmp/shuttleworks-event-node-acceptance.sqlite3
```

The gate blocks outbound socket connections, commits one real event-node
mutation, rebuilds the database connection, deletes a simulated browser-cache
sentinel, and verifies normalized state plus operation/outbox durability. It
does not replace the 24-hour WAN-blocked soak, abrupt power-loss test, or the
full operator-function run on reference hardware.

## WAN outage during play

Keep operating locally. The node accepts tournament-critical commands and
the sync agent retries in the background. Do not refresh into the cloud host
or manually edit the outbox. Check local authority status, pending count, and
the last verified backup. When WAN returns, verify that batches acknowledge in
sequence; duplicate acknowledgements are safe and expected. Do not close the
authority until the cloud reports the declared final sequence.

## Normal return to cloud

1. Stop accepting new operator commands and record the node's final local
   sequence, active epoch, node/device IDs, and the deterministic cloud
   projection digest (authority epoch + final sequence + canonical projection
   data).
2. Restore WAN access and let the sync agent drain. Confirm the cloud's
   highest contiguous sequence equals the recorded final local sequence and
   the local outbox has acknowledged every operation through it.
3. Rebuild or inspect the cloud projection and compare the checkpoint hash,
   final sequence, representative result, match-state, bracket, and schedule
   facts. Compute the shared projection digest over its authority epoch, final
   contiguous sequence, and canonical projection data. Do not use a fresh
   browser rendering as the sole comparison.
4. Submit `POST /tournaments/{id}/authority/return` with the active node and
   epoch, capability, actor/device IDs, reason, declared final sequence,
   snapshot hash, and `confirmation=true`. The cloud rejects the return if the
   supplied digest does not match its drained projection, leaving node
   authority active.
5. Record the `return_to_cloud` transition evidence. Verify the node epoch is
   closed, the new cloud epoch is active, cloud mutations are writable again,
   and a late operation from the closed node is rejected/quarantined.

Never return authority while the cloud cursor trails the node. If sequence or
snapshot evidence disagrees, leave node authority active and follow the sync
gap/reconciliation procedure below.

## Disk and WAL pressure

Stop non-essential exports and telemetry first. Preserve SQLite, the
operation log, and verified backups. If free space approaches 5 GiB, take a
verified bundle to another disk and contact platform-oncall. Do not delete the
WAL, database, or outbox, and do not run an unbounded checkpoint during play.
After play, use the supported backup/checkpoint procedure and verify a clean
restore.

## Sync gap or quarantine

Inspect the stable error (`sequence_gap`, schema, epoch, capability, or
aggregate conflict) and the last common sequence. Leave the node outbox
intact and retry only after the cause is understood. A gap is not permission
to skip a sequence; quarantine is not permission to edit rows. Escalate with
epoch, sequence, schema version, and hashes only—never operation payloads or
participant data.

## Node replacement

1. If the old node is available, stop its sync agent and perform planned
   transfer after cloud acknowledgement.
2. If it is lost, preserve the latest verified backup and invoke the elevated
   lost-node recovery route with reason, device identity, declared sequence,
   and explicit confirmation.
3. Restore to a new destination path, verify integrity and operation counts,
   import the checkpoint/bundle, and run the offline preflight.
4. Start the replacement at a new authority epoch. Never run two nodes with
   the same active epoch.

## Checkout/reconnect/return rehearsal

Run the bounded service-level rehearsal without a live network or the HTTP
test harness:

```bash
PYTHONPATH=apps/api/src .venv/bin/pytest -q \
  tests/backend/unit/test_checkout_reconnect_return_rehearsal.py
```

It provisions signed authority and node identities, imports the checkpoint,
proves readiness, records two offline operations, drains the real outbox
selection/acknowledgement path into cloud ingestion, rebuilds the projection,
and returns authority. Assertions cover contiguous sequences, acknowledged
outbox rows, operation identity/count, and the audited return transition.
This is a deterministic service proof; deployed clean-machine, power-loss,
WAN-soak, and witnessed-approval rehearsals remain operational exit criteria.

## Restore

Restore only to a new path or clean machine. Verify the passphrase, checksum,
SQLite integrity, migration revision, and operation count before installation.
Keep the original database untouched until the restored process passes health
and a representative read/result/export check. A restore that has not been
tested on a clean destination is not evidence of recoverability.

Run the automated isolated restore gate without overwriting a live database:

```bash
cd apps/api/src
../../../.venv/bin/python -m recovery.cli preflight \
  --bundle /media/recovery/latest.swbackup \
  --passphrase-file /run/secrets/backup-passphrase
```

The command authenticates and checksums the bundle, restores into a temporary
clean path, runs SQLite integrity checks, and compares schema revision and
operation count with the manifest. A real replacement-machine rehearsal is
still required to prove the operational RTO.

## Encryption and key-management boundary

The bundle primitive provides authenticated encryption and refuses short or
incorrect passphrases. The scheduler reads `BACKUP_PASSPHRASE_FILE` only when
creating or verifying a bundle; it does not generate, escrow, rotate, or
recover that secret. Protecting the mounted file, separating it from the
backup media, rotating it under an operator-approved migration, and retaining
an emergency recovery copy belong to the host secret manager or deployment
operator. Losing the passphrase cannot be repaired by ShuttleWorks.
