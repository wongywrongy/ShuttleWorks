# Offline operator-function acceptance matrix

Status: authoritative acceptance contract for the current architecture slice.
Owner: event-operations. This matrix distinguishes a behavior that is
implemented and tested from a behavior that is only a target in the long-term
plan. “Cloud-only” means it may be unavailable during a WAN outage; it is not
part of the tournament-critical offline promise.

| Operator function | Concrete route/module | Cloud-only or tournament-critical | Current acceptance evidence | Status / remaining work |
|---|---|---|---|---|
| Workspace and tournament discovery | `GET /tournaments`, `workspaces/tournaments.py` | Tournament-critical for the checked-out event; cloud discovery is cloud-only | Local API and existing workspace route tests | Implemented locally; account/org discovery is cloud-only |
| Pre-event setup | `GET/PATCH /tournaments/{id}/setup/{section}`, `workspaces/setup.py` | Cloud-only before checkout; checkpointed and frozen after checkout | Setup route/schema, lifecycle-fence, and checkpoint import tests | Implemented; cloud and event-node preparation writes are rejected once checkout begins |
| Entrant submission and withdrawal | `POST /e/api/submit/{slug}`, `POST /e/api/me/entries/{id}/withdraw`, and operator desk routes | Cloud-only before checkout; policy-frozen during active checkout | Entrant lifecycle/submission tests plus checkout-fence wiring tests | Submission, partner acceptance, entrant withdrawal, and operator-desk roster mutations are uniformly frozen at checkout; enabling LAN intake would require explicit roster operation classes |
| Draw creation, validation, import, and export | `/tournaments/{id}/bracket/*`, `bracket/brackets.py` | Tournament-critical on the event node | Bracket route/repository/import, pin UoW, rollback, retry, and replay tests | Live pin/re-solve is atomic and replayable; destructive JSON/CSV imports are preparation-only and frozen at checkout; bracket create/delete and event-generation normalization remains TODO |
| Match calls, state, and results | `/tournaments/{id}/match-states/*`, `/bracket/.../results`, `operations/match_state_routes.py`, `operations/match_state_application.py`, `bracket/application.py` | Tournament-critical | Atomic normalized-state/result + operation/outbox tests, optimistic conflict, exact reset/replace/merge replay, rollback, retry, and route tests | Single-match state/result, canonical commands, reset, digest-bound replacement, and deterministic bulk merge use application/UoW boundaries |
| Schedule solve and repair | `/tournaments/{id}/solve-jobs/*`, `/tournaments/{id}/schedule/*`, `solve_rail/`, `meet/schedule_application.py` | Tournament-critical if the node has the solver/worker installed | Solve rail, worker, atomic proposal-commit, operation replay, rollback, and route-audit evidence | Persistent director/suggestion applies converge on the atomic proposal boundary and retired direct writers return `410`; long-running offline load and worker-failure rehearsal remain TODO |
| Public display and print/export | `/display/*`, bracket export routes, `display/` and `bracket/` | Tournament-critical over venue LAN; public cloud display may be stale | Display/export tests plus opt-in TLS Compose and certificate preflight tests | Local API path and stable TLS origins are implemented; signed installer, client CA distribution, firewall, and venue rehearsal remain TODO |
| Authority checkout and ready proof | `POST /tournaments/{id}/authority/{checkout,ready}`, `sync/` | Cloud control-plane operation required before play | Authority, enrolled-device, signed-grant, node proof-of-possession, and checkpoint import tests | Implemented with Ed25519 grants, signed ready proofs, and revocable organization-scoped device enrollment; the production enrollment ceremony remains an operational rollout task |
| Offline operator identity | `POST/DELETE /tournaments/{id}/authority/offline-session`, `POST .../bootstrap`, `identity/offline_sessions.py` | Tournament-critical after checkout | Policy import, capability-bound bootstrap, scope, digest-only storage, expiry, membership-change, authority-close, device, revocation, and CSRF-registry tests | Checked-out users/roles and event-scoped credentials are implemented; cloud credential material is excluded and anonymous local bootstrap is disabled on event nodes. OS credential custody and production onboarding rehearsal remain TODO |
| Checkpoint import and integrity | `POST /tournaments/{id}/authority/checkpoint/import`, `sync/service.py`; `recovery.cli preflight` | Tournament-critical during node preparation | Atomic corruption, idempotent import, and isolated clean-path restore-preflight tests | Automated preflight is implemented; reference-hardware import/restore timing and replacement-node rehearsal remain TODO |
| Operation upload and acknowledgement | `POST /sync/v1/tournaments/{id}/operations`, `sync/agent.py`; `rebuild_cloud_projection` | Cloud-only while WAN is unavailable; local acceptance is critical | Duplicate/gap/quarantine, correction-operation, retry, reconciliation-panel, checkpoint-plus-receipted-operation rebuild, schema compatibility, competing-authority, match-state import, and bracket-pin tests | Implemented for the covered bracket, match-state, and schedule projections; archived-binary and deployed live-event rehearsals remain required before a complete Phase 3 claim |
| Return, planned transfer, and lost-node recovery | `/authority/{return,transfer,recover}`, `sync/service.py` | Cloud/recovery control-plane operation; live node remains critical until complete | Lifecycle transition tests plus direct signed checkout→ready→offline→drain→rebuild→digest-confirmed-return rehearsal | Repository workflow implemented; witnessed approval, deployed hardware, signed handoff bundles, and WAN/power-loss rehearsal remain external evidence |
| Backup create/verify/restore | `recovery/cli.py`, `recovery/bundles.py`, `recovery/scheduler.py`; existing state backup routes | Tournament-critical | Encryption, corruption, destination-safety, scheduler retention, offsite-failure, isolated restore-preflight, and restore tests | Implemented with periodic/milestone scheduling, two-generation retention, verification, isolated clean-path preflight, restore testing, and a fail-open offsite sink; reference-hardware timed restore, production key custody, and offsite sink provisioning remain deployment tasks |
| Browser storage | IndexedDB command queue, `apps/console/src/lib/commandQueue.ts`; `tools/event_node_acceptance.py` | Never authoritative | Queue tests plus a WAN-blocked process-restart gate that deletes a browser-cache sentinel and verifies normalized state, immutable operation, and outbox persistence | Implemented as retry UX only; the deterministic gate is not a substitute for abrupt power-loss and reference-hardware soak testing |
| Identity, billing, organization administration | `identity/`, organization/admin routes | Cloud-only | Cloud auth and tenancy tests | Explicitly unavailable offline; no TODO for live event operation |
| Telemetry export | OTLP bootstrap and Collector configs | Cloud-only destination; local collection is best effort | Fail-open tests plus isolated outage/restart/drain rehearsal | Repository rehearsal implemented; production queue drain and capacity soak remain TODO |

## Release gate

An event-node release may claim offline readiness only when every row marked
tournament-critical is green in the event-node profile, and all rows marked
TODO are either completed or explicitly accepted as a release exception. A
cloud outage must not be used as evidence that a cloud-only function is
broken. Conversely, a cached browser screen is not evidence that a
tournament-critical function works.

The failure-path proof suite is
`tests/backend/unit/test_reliability_failure_paths.py`, supplemented by
`test_sync_protocol.py`, `test_checkpoint_import.py`,
`test_recovery_bundle.py`, `test_event_node_acceptance.py`, and the console
IndexedDB queue tests.
