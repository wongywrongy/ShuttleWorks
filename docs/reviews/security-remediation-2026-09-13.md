# Security remediation evidence — 2026-09-13

This is the first implementation delivery from the [23-package program](../reference/security-debt-remediation.md).
It does **not** close that program or reconcile all 268 historical debt entries.
The [original golden-rule review](security-golden-rules-2026-09-13.md) remains the
immutable baseline. Verdicts below describe residual rule compliance, not whether
the new code compiles. Independent review is pending. Hosted CI passed on the
first implementation commit; the later invitation/scanner additions need their
own hosted run (see R9 for the exact recorded revision).

## Findings table

| Rule | Verdict | Enforcement files | Executable evidence | Remaining finding / outcome |
| --- | --- | --- | --- | --- |
| R1 | PASS | `core/dependencies.py`, `core/main.py` | `tests/backend/test_auth_surface.py`, `test_cross_principal_sessions.py` | Existing session authority retained; MFA/session-strength debt is tracked separately. |
| R2 | FAIL | `core/error_codes.py`, `core/dependencies.py`, `core/main.py`, `sync/routes.py` | `tests/backend/test_tenant_isolation.py`, `test_invite_oracle.py` | Role and HTTP/protocol 404 envelopes converge; unpublished collections still have 200/`published=false` contracts. |
| R3 | FAIL | `core/roles.py`, `db/models.py`, `identity/invites.py` | `tests/backend/test_host_split.py`, `unit/test_baseline_schema.py` | One shared role ladder; sole-parent outbox FK exception still needs its dedicated invariant check. |
| R4 | FAIL | `infra/nginx/log-redaction.conf`, `core/capability_policy.py`, `repositories/local.py` | `tools/check-nginx.sh`, `tools/check-nginx-runtime.py`, `tests/backend/unit/test_invite_expiry.py` | Edge URL leakage and finite staff expiry addressed; raw display/invite storage, display expiry and console email bodies remain. |
| R5 | FAIL | `sync/service.py`, `alembic/versions/0002_authority_creation_audit.py` | `tests/backend/unit/test_sync_protocol.py`, `test_authority_lifecycle.py`, `test_checkpoint_import.py` | Epoch creation is audited; complete actor/lifecycle coverage and key rotation remain. |
| R6 | PASS | `core/config.py`, `core/main.py`, `sync/compatibility.py` | Existing startup, migration and compatibility suites | Existing fail-closed controls retained. |
| R7 | FAIL | `competition/routes.py`, `meet/schedule_director.py`, `meet/schedule_repair.py`, `bracket/brackets.py`, `entries/entries_routes.py` | `tests/backend/unit/test_golden_rule_input_bounds.py`, derived-output tests | Nested scalar/list/map references bounded; operator Turnstile and remaining input inventory still open. |
| R8 | PASS | All `infra/nginx/*.conf`, `docs/.vitepress/externalize-scripts.mjs` | Native syntax/runtime checks; `apps/entrant/tests/ingress.test.ts`; `tools/tests/docs-csp.test.mjs` | Operator/public/LAN/docs policies cover upstream and edge-generated failures. |
| R9 | FAIL | `.github/workflows/{ci,security,publish-release}.yml`, `infra/compose`, `tools/verify-release.py`, `tools/check-source-secrets.py` | `tools/tests/release-workflow.test.mjs`, `tests/backend/unit/test_release_admission.py`, `test_source_secret_scan.py` | Digest pins, source scanning and admission implemented; real signed-release installation and DAST unverified. |
| R10 | FAIL | `display/projection.py`, `display/display.py`, `identity/responses.py`, `ops/health.py` | `tests/backend/test_display_public.py`, `test_auth_surface.py`, `test_health_surface.py`, existing erasure tests | Recursive public schemas and status-only liveness implemented; purpose-based scheduled retention still missing. |
| R11 | NO-TEST | `recovery/bundles.py`, `tools/recovery-drill.py`, Prometheus rules | Recovery tests; [synthetic drill record](recovery-drill-2026-09-13.json); native `promtool` | Synthetic restore passes; deployed event-node/PITR recovery and alert delivery remain unrecorded. |
| R12 | PASS | `tests/backend/unit/test_security_threat_model.py`, `.github/workflows/ci.yml` | 18 register tests, including 15 malformed-register controls | Every rule has traceable executable evidence and an owner; incomplete operational checks remain linked debt. |

Unprefixed implementation paths in this table are under `apps/api/src/`.
Sibling test names in a cell are relative to the first test's directory.

## R1

Protected routes still derive their principal from server-side sessions through
`core/dependencies.py`. No browser-storage authority was introduced. The auth and
tenant inventories continue to derive the registered routes rather than relying
on a hand-maintained protected-router list. Operator MFA, idle expiry and fresh
authentication remain unfinished P08 work.

## R2

`resource_not_found()` defines the resource-denial envelope. Insufficient roles
and invite-owner denial use it; the application exception handler normalizes
framework/legacy HTTP 404s, and the sync error handler uses the same envelope for
protocol 404s. Authentication and CSRF failures retain their existing semantics.

`test_missing_foreign_role_and_unpublished_are_byte_identical` exercises actual
requests and compares status, raw bytes and content type. It includes a successful
viewer read to prove the guard has not simply denied every request. Legacy role
and not-found assertions were updated after the behavior changed; CSRF refusal
assertions were retained. The affected 276-test rerun passed.

Residual: `entries/entries_site.py` still returns `published=false` with 200 for
unpublished draw/player/schedule collections. Migrating those contracts and their
consumers is required for literal R2 compliance (SGR-20260913-02).

## R3

`core/roles.py` is the shared viewer/operator/owner ladder used by dependencies
and invite acceptance. The database role CHECK and distinct principal/origin
tests remain in place. The PostgreSQL partition passed 199 tests with one skip.

`SyncOutbox.operation_id` remains the sole single-column reference to a
tournament-owned child without an independent tenant column on the outbox.
No new escape was demonstrated. The approved structural exception needs an
explicit parent-ownership invariant test; it is not represented as literal
composite-FK PASS.

## R4

The nginx log format records method, masked normalized path, status, bytes and
timings. It excludes queries and Referer entirely and masks `/display/`,
`/invite/`, `/invites/`, `/partners/` and `/e/partner/` families, including API
prefixes. Tests send synthetic capabilities through path/query/Referer fields,
exercise 502 and 429 responses, and require both positive log output and absence
of the sentinel.

Nginx runtime error logging is disabled because that channel cannot redact URLs;
safe upstream status/timing fields remain available, and startup syntax failures
remain visible. Removing redaction in a temporary source copy caused the native
runtime test to fail. This controls nginx only. Raw display/staff invite bearer
storage, repeated token disclosure and `core/email.py` console bodies remain open.

Staff invitations now expire seven days after creation regardless of delivery
mode. The repository caps supplied deadlines and the acceptance guard rejects
null expiry and the exact deadline. Migration 0003 caps existing links at their
original creation plus seven days, preserving shorter deadlines and all rows;
the database refuses null expiry. Four new safety cases failed before the change.
The migration suite passed 24 tests across SQLite and PostgreSQL, including a
previous-schema negative control that accepts null expiry before upgrade and
rejects it afterwards. Evidence under `tests/backend/`:
`unit/test_invite_expiry.py`,
`test_display_public.py::test_link_invite_expires_after_seven_days`,
`unit/test_repositories.py` and `unit/test_baseline_schema.py`. Display capability
expiry, hashed invitation/display storage and one-time issuance remain open.

## R5

Checkout, checkpoint import and local initialization now append creation rows to
`tournament_authority_transitions` in the epoch's transaction. Authenticated actor
context is used when present; node/system actions are identified as such rather
than inventing a human actor. Migration `0002` extends the transition-type CHECK.
Existing rollback/transfer/return tests were updated to preserve the creation
row while checking that a failed later transition adds no history.

The workspace document CAS was also corrected: a conditional SQL UPDATE reserves
the next version before roster/projection mutation. Its stale-session regression
failed before the fix, then passed with the concurrency/commit-seam suite (18
tests). Repository method complexity fell from 21 to 18. Writers explicitly
omitting a precondition still have last-write-wins semantics.

Residual: nullable/unattributed state actors, unregistered lifecycle domains,
complete creation-path negative controls, individually authenticated offline
operators and overlapping authority signing-key rotation remain P08/P10 work.

## R6

Cloud secret validation, migration failure exit, unknown-wire quarantine and
Collector minimum TLS rejection retain their existing enforcement paths. Native
Collector checks from the baseline accepted TLS 1.2 and refused SSL3. No runtime
startup bypass was added by the implementation.

## R7

Competition request fields, schedule director/repair/warm-restart identifiers,
reasons and timestamps, bracket members/labels/discipline and entry-import partner
references now use the shared limits vocabulary. Twenty-one positive/oversize
field tests pass. Generated API contracts were regenerated.

The broader input inventory still needs reconciliation: fixed-format regexes
bound many strings even without a JSON-schema `maxLength`, while some free text
and arbitrary mappings remain. Operator signup still lacks Turnstile. Existing
CSV/ICS/email-header encoding remains covered by its original tests.

## R8

Every nginx fragment passes native `nginx -t` using CI stub hosts, includes and an
ephemeral certificate. The LAN edge now owns headers on both TLS ports, hides
upstream duplicates, sets HSTS and selects the stricter public policy on 8444.
Docs includes the common policy at server/location levels. Its VitePress
bootstrap scripts are externalized into content-hashed assets during build.

Native runtime checks pass for app, LAN and docs, including 200/404/429/502 paths,
exactly one copy of each required header and no inline/eval script allowance.
Removing `always` in a temporary source copy produced a header-test failure on
502. All 77 entrant ingress tests pass. The documentation build and script-order/
JSON-preservation test pass. The checks are wired into CI.

## R9

Compose third-party images are pinned to registry digests resolved from the
previously selected versions. Release Compose requires three explicit digests;
`TAG` is no longer an image selector. `tools/verify-release.py` resolves source-SHA
tags and verifies both cosign release-workflow identity and GitHub SLSA provenance
for the exact source commit before atomically producing the env file. Fifteen
admission tests cover success, failure at each external step and invalid source
revisions. These use command doubles and do not establish a live signed-artifact
happy path. The current admission identity accepts semver-tag workflow runs;
manual-dispatch artifacts need a separately verified identity/provenance policy.

Security write permissions are limited to SARIF-producing jobs. Dependabot is
configured for Actions, npm and Python. CI no longer duplicates feature-branch
push and PR runs and cancels obsolete PR work. SQLite tests run with four workers;
the shared Postgres partition remains serial. The measured prior CI bottleneck
was backend tests (about 42 minutes). The first implementation commit
`8c8493756ed80fe3141cf21f2f023c56aa419d92` passed every hosted check; its
[backend job](https://github.com/wongywrongy/ShuttleWorks/actions/runs/34744047786/job/103688533790)
took 16m58s. This is one observed run, with later invitation/scanner additions
requiring their own hosted validation.

`tools/check-source-secrets.py` scans the checked-out commit with a digest-pinned
Trivy image, without container network access. Its live synthetic-token and empty
controls pass, and the source scan reports zero findings. Only file/line/rule
metadata is printed; raw reports are temporary and never uploaded. Four focused
tests cover report projection, scanner failure, unknown schema and disabled
detection. The source scan is included in the required security aggregate. This
covers the committed tree with Trivy's built-in rules and exclusions, not Git
history or every possible credential format.

DAST, disposition of Semgrep, and live release installation/refusal evidence
remain open. No release was published or deployed.

## R10

Meet display config, people, matches and schedules now have explicit nested
allow-lists. Bracket config, participants, play units, scores and result reasons
have a separate public projection; private person/entry provenance and arbitrary
score metadata are filtered. Operator match notes are excluded from public
match-state responses. The console adapter supplies neutral private defaults to
shared read-only board helpers without requesting private data.

The two password-reset request endpoints now declare `AcceptedDTO`, entry
discipline caps are typed, and `/health` returns exactly `{"status":"healthy"}`.
The route-derived schema scan covers all 26 public-by-design routes and finds no
untyped success-response fields. Its mutations reject untyped scalars, maps and
array elements. Private sentinel tests exercise actual public HTTP responses. Both passed in an
isolated source copy and failed with leaked sentinels when its nested models were
changed from `extra="ignore"` to `extra="allow"`; workspace code was untouched.
The focused public/auth/health run passed 137 tests; all 195 display UI tests and
the full 2,395-test console suite passed.

Purpose-based organizer retention selection, scheduled audited purges and overdue
detection remain open. Existing record-preserving erasure is retained; the new
projection work does not establish retention compliance.

## R11

`tools/recovery-drill.py` creates an AES-GCM bundle through the existing recovery
implementation, restores it into an isolated directory, verifies the exact
snapshot digest and SQLite integrity, rejects wrong keys and modified ciphertext,
and verifies temporary-data cleanup. The dated JSON record includes elapsed time
and source hashes and clearly labels its synthetic scope. Real event-node copies
can be supplied with a passphrase file without overwriting the source.

Native `promtool` loads all 18 rules, including backup-stale and restore-failed.
Rule loading is not alert delivery evidence. Deployed event-node/PITR restore,
alert firing/resolution and incident tabletop evidence remain NO-TEST debt under
SGR-20260913-11/K5. The new [security operations runbook](../how-to/security-operations.md)
records the secret inventory, containment responsibilities and current rotation
limitations without claiming those operational exercises occurred.

## R12

The CI register validator now requires exactly R1–R12, unique IDs, nonempty owners,
valid verdicts/dates, review anchors, repository-contained enforcement/evidence
files and debt links for unresolved rules. PASS requires executable test evidence.
Fifteen mutations demonstrate rejection of missing/malformed principles, missing
owners/paths, unregistered debt and unsupported PASS evidence. Threat ownership
validation remains in the same suite. All 18 register checks pass.

## Validation and remaining program

- Complete backend rerun: 2,590 passed, 84 skipped in 13m01s. The separate
  PostgreSQL gate supplies the skipped dialect evidence; the additional CI partition
  invariant passed in its focused run.
- Follow-up parallel partition after finite staff expiry: 2,483 passed in 12m41s.
  Five later tests (four source-scanner guards and a creation-time default) passed
  separately; the latest repository/expiry/scanner set passed 69 tests. Both staff
  delivery modes also passed exact seven-day HTTP assertions. The intermediate
  removal of the partner TTL setting caused five failures; restoring its partner-
  only use resolved them before this passing run.
- Latest PostgreSQL partition: 199 passed, one expected SQLite-leg skip in
  3m28s, using an isolated disposable DB; all 2,488 non-shared cases were deselected.
- Console: 2,395 tests passed; production build passed; lint and dependency checks
  have zero errors (154 existing lint warnings and 13 dependency warnings).
- Entrant: final complete rerun passed all 1,249 tests, including ingress and
  updated digest-based deployment contracts.
- Backend import contracts: 15 kept, zero broken. Ruff and documentation paths pass.
- Documentation: 62 passed, six skipped; final build passed. The scanner test now
  writes its ledger into a temporary directory and leaves the tracked artifact intact.
- The exact CI Compose validation step passes against temporary configuration and
  dummy secret files. No application stack was started by that check.
- Native nginx: seven fragments plus app, LAN and docs runtime checks pass; two removed-
  guard experiments fail as expected. Prometheus: 18 rules load.
- Recovery: synthetic drill and existing encryption/restore/scheduler tests pass.
- Backend image: built successfully and imported `core.main` in an isolated
  network-disabled container, including the user-provided competition COPY fix.
- Source-secret scanning: zero findings on committed source, with live synthetic
  detection and empty controls; no raw secret report retained.

P03 and P07 repository implementation is present. P01/P02/P04/P05/P06/P09/P10/P13/
P14/P23 are partial; P08/P11/P12/P15–P22 remain incomplete. The pre-existing user fix in
`apps/api/Dockerfile` is included intact and credited separately because the image
must copy the competition package imported by the application. No deployment/reset,
merge or external incident communication was performed.
