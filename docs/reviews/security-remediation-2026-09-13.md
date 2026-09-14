# Security remediation evidence — 2026-09-13

This records the September 13–14 implementation deliveries from the [23-package program](../reference/security-debt-remediation.md).
It does **not** close that program or reconcile all 268 historical debt entries.
The [original golden-rule review](security-golden-rules-2026-09-13.md) remains the
immutable baseline. Verdicts below describe residual rule compliance, not whether
the new code compiles. Independent review is pending. Current hosted CI must pass
before this draft is ready for review; recorded runs apply only to their exact
source revisions.

## Findings table

| Rule | Verdict | Enforcement files | Executable evidence | Remaining finding / outcome |
| --- | --- | --- | --- | --- |
| R1 | PASS | `core/dependencies.py`, `core/main.py` | `tests/backend/test_auth_surface.py`, `test_cross_principal_sessions.py` | Existing session authority retained; MFA/session-strength debt is tracked separately. |
| R2 | PASS | `core/error_codes.py`, `core/dependencies.py`, `core/main.py`, `sync/routes.py` | `tests/backend/test_tenant_isolation.py`, `test_invite_oracle.py` | Role, missing and unpublished denials converge; collection gates run before cache validators and entrant SSR maps publication races to the same 404. |
| R3 | FAIL | `core/roles.py`, `db/models.py`, `identity/invites.py` | `tests/backend/test_host_split.py`, `unit/test_baseline_schema.py` | One shared role ladder; sole-parent outbox exception has executable ownership evidence and remains distinct from literal composite-FK compliance. |
| R4 | PASS | `infra/nginx/log-redaction.conf`, `core/log_redaction.py`, `core/email.py`, `core/tokens.py`, `repositories/local.py`, `display/display.py`, migration `0005` | `tools/check-nginx.sh`, `tests/backend/test_invites.py`, `test_display_public.py`, `unit/test_log_redaction.py`, `unit/test_email_transport.py`, `unit/test_baseline_schema.py` | Staff/display credentials are hashed, finite and issued once; API/nginx/email logging controls pass. Independent review remains pending. |
| R5 | FAIL | `sync/service.py`, `alembic/versions/0002_authority_creation_audit.py` | `tests/backend/unit/test_sync_protocol.py`, `test_authority_lifecycle.py`, `test_checkpoint_import.py` | Epoch creation is audited; complete actor/lifecycle coverage remains; key overlap and retirement checks are implemented, with deployed rehearsal pending. |
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
on a hand-maintained protected-router list. P08 adds the stronger session
controls described below; rollout and operational evidence remain open.

The September 14 P08 foundation adds encrypted, principal/scope-bound TOTP
seeds, a bounded file-only AES key ring, hashed single-use recovery codes and
an actor-attributed factor lifecycle. SQL and transaction reservations live in
`repositories/mfa.py`; `identity/mfa.py` owns policy. Migration `0006` creates the
factor tables, adds session assurance fields and caps old sessions at twelve
hours from original issue, preserving shorter deadlines. It does not mark any
existing session as MFA-authenticated. Commit `08b1c2fc` contains these
service/storage controls. Its hosted CI and security checks pass, including
backend, frontend, browser, entrant, secret scan and Compose checks.
Pending enrollment is bound to its initiating server-session UUID, both in
the row and the authenticated encryption context. A second session cannot
confirm it, even with the current correct OTP; the original session can.

Negative controls remove password proof, replacement freshness, enrollment
expiry, TOTP/recovery replay refusal, actor-history persistence, session
revocation, seed owner binding and predictable-key refusal. Every corresponding
check fails. The original enrollment-expiry test was inadequate: its old OTP
also failed after the guard was removed. It now supplies a current valid OTP
after the enrollment window; removing the deadline fails that assertion.
Production sessions disable autoflush, so the factor reservation explicitly
flushes staged consumption before refreshing within a composed transaction.
The regression verifies that a second call cannot restore an already consumed
counter from the database. Runtime policy helpers separately cover the exact
12-hour, one-hour and five-minute boundaries; passing those helpers is not
reported as API enforcement.

The final foundation run passes **66 factor, migration and schema cases across
SQLite and PostgreSQL**, including production-style sessions with autoflush and
expiration-on-commit disabled. A further **79 crypto, key-file, lifetime-policy,
register, graph and architecture checks** pass. Fourteen guard-removal controls
fail as intended. The import gate keeps all 15 contracts; Ruff passes across the
repository. Documentation passes 62 checks with six optional skips and builds.
The HTTP/UI implementation now limits cloud and node password-stage cookies to
MFA ceremonies. Confirmation rotates the cookie atomically with proof consumption;
new cookies retain the original absolute deadline. Reads never count as activity.
Sensitive-action checks run after tenant/role denial, so freshness does not expose
a foreign workspace. Nineteen route cases cover exports, backup/restore, workspace
and member changes, display issue, node enrollment and authority changes. Client
spreadsheet serialization also waits for a fresh server check.

Migration `0007` adds hashed, ten-minute, one-use individual node activation,
bound by composite foreign keys to the member and authority epoch. A trusted local
OS administrator creates the private activation file. Shared authority capability
bootstrap cannot set a person's password or grant MFA assurance. Node users choose
their own password and authenticator; cloud credentials never enter a checkpoint.
Node denial tests compare missing, foreign (including another owned workspace) and
downgraded-member responses byte for byte. Local administrator recovery requires an
explicit reset option and reason, revokes all credentials, records node-attributed
history and requires individual activation again. This is not a remote reset API.

The independent fresh-context review identified one P1 race: password reset/change
selected old sessions while a concurrent MFA proof could insert a replacement that
survived revocation. Three regression cases failed before the fix. All credential
operations now reserve the account before the factor, refresh password/reset-token
state, and serialize grants with revocation. The follow-up review found no further
confirmed bypass or inconsistent lock ordering; its interleave concern prompted a
bounded wait for the competing proof before releasing the reset transaction.

Executed September 14 evidence (final broad backend gates still pending):

- 71 authentication/factor/HTTP cases pass, with 19 PostgreSQL legs skipped in
  that SQLite-focused run. The password-race cases pass after the fix.
- All 2,429 console tests pass. Lint has zero errors (156 existing warnings);
  dependency boundaries have zero errors (13 existing warnings).
- All 1,254 entrant tests pass, including ingress checks. Its explicit browser
  spec inventory now includes the new operator MFA journey.
- The isolated real-browser journey passes again after the account-reservation fix: password-only denial, enrollment,
  issue-once recovery codes, trusted activity, idle expiry, recovery sign-in and
  preservation of the same unsent password form. It uses a disposable database,
  random private key, loopback ports and teardown of only its own processes.
- Nine backend guard removals reached assertion failures and restored exact source:
  pending identity, fresh proof, revocation/absolute/idle/expiry compare-and-swap,
  activation secret, node workspace binding and administrator session revocation.
  Removing the shared account reservation also makes all three password-reset/
  change/login race checks fail. Five console guard removals likewise failed for export freshness, draft retention,
  different-user isolation, stale identity replies and terminal public polling.
- Every nginx fragment parses with CI stub includes. Native app/LAN/docs header,
  error-response and token-redaction checks pass. Compose parses all seven standalone
  stacks and the combined event-node override. Documentation checks and build pass.

Key-use inventory, safe encryption-key retirement, production handoff and
lost-factor/disconnected/reconnection rehearsals remain open. Foundation hosted CI
certifies `08b1c2fc` only; the later runtime changes still need their own hosted CI.

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

The September 14 collection delivery denies unpublished draws, players and
schedules with the same 404 as a missing slug. The schedule gate runs before
revision/ETag handling, so a previously published validator cannot yield 304.
`test_public_collection_denial.py` failed on all three old 200 contracts before
the fix. Published empty collections retain 200; result suppression within a
published draw retains the existing allow-listed projection.

The entrant loader also catches a publication withdrawal between its metadata
and projection reads. All four new real-SSR race cases failed with 500 before
the change and now produce byte-identical missing-page HTML. Schedule denial has
the same rendered control. The affected backend run passes 98 tests; the complete
entrant suite passes 1,254 tests, plus lint and the production/type build.
SGR-20260913-02 is implementation-verified; independent review remains pending.

## R3

`core/roles.py` is the shared viewer/operator/owner ladder used by dependencies
and invite acceptance. The database role CHECK and distinct principal/origin
tests remain in place. The PostgreSQL partition passed 199 tests with one skip.

`SyncOutbox.operation_id` remains the sole single-column reference to a
tournament-owned child without an independent tenant column on the outbox.
`test_tournament_child_foreign_keys_preserve_scope` inventories every migrated
child reference, pins the sole-parent exception and refuses independent outbox
scope. `test_outbox_inherits_one_parent_and_cascades_only_that_tenant` proves
orphan rejection and two-tenant ownership/cascade isolation. Disabling SQLite FK
enforcement makes the orphan assertion fail; adding an unscoped child reference
makes the inventory check fail. This verifies the approved
structural exception; it is not represented as literal composite-FK PASS. The
complete schema/migration run passes all 32 cases across SQLite and PostgreSQL.

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
runtime test to fail. The separate application formatter below covers API logs.

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
`unit/test_repositories.py` and `unit/test_baseline_schema.py`.

The 2026-09-14 follow-up stores staff invitation digests through `core/tokens.py`,
with independent IDs for owner management. Creation returns the link once;
listings and public resolution never return it. Migration 0004 replaces old raw
IDs and hashes their original values so existing links retain their expiry and
revocation state. This changes logical rows, not historical backups or storage
pages. The HTTP regression failed on raw-ID storage before implementation.
The Sharing UI keeps an issued link only in memory, including after a failed list
refresh; remounting or changing workspaces discards it.

Display links now have the same issue-once contract. Owner GET returns only
status/deadlines, explicit POST issues or replaces, and DELETE revokes without
replacement. Every lookup hashes the supplied token and rejects the exact expiry
before reading cached projection data. The mutation transaction appends an
actor-attributed `display_capability` transition without recording the bearer.
Removing hashing, expiry enforcement or audit persistence independently fails the
HTTP safety regression; the metadata-GET test failed before implementation.

Migration 0005 replaces raw storage with a digest and non-null deadline. Dated
links stop at midnight after the event's final day plus seven full venue-local
calendar days (including DST); undated/malformed legacy links expire at migration
time and require an explicit replacement deadline. It preserves creation times.
The complete schema/migration suite passed all 28 cases across SQLite/PostgreSQL.
The focused display/projection/expiry run passed 71 tests with 14 optional dialect
skips, supplied by that separate database run. Later owner and fixture checks pass.

The console never reloads an old bearer. Sharing keeps a newly issued URL only in
the current view, and Board settings previews that same URL. The legacy preview
entry redirects to Board settings. Replacement/revocation retain confirmation;
workspace changes reset both the issued URL and confirmation. Expired event
windows explain why a new link cannot be issued. Overview reads only active status.

The frozen-date browser fixture uses a clearly labelled synthetic credential
seed restricted to fixture-up's marked temporary SQLite database. It stores only
hashes, records its actor and grants 24 hours on the real clock; ordinary API
issuance continues to refuse ended events. Its owner-only temporary manifest is
test delivery material. The complete disposable fixture, ten account journeys and
review extras passed on ports 18770–18772 and cleaned up afterward.

Executed follow-up: 127 backend invite/oracle/repository/schema tests passed
(13 PostgreSQL cases skipped in that invocation); the disposable PostgreSQL
invocation then passed all 26 schema tests across both dialects. Shared hashing
consumers passed 92 tests (10 optional dialect skips). The console passed 33
Sharing/status tests and its production build. Removing the late-response guard
made the UI regression fail; the restored implementation passes. All 15 backend
import contracts and the 62 documentation checks pass (six pre-existing skips).

Console email now records only skipped delivery, without message fields. SMTP
failures expose a fixed `EmailDeliveryError`, suppressing provider replies from
caller exception logs. Both log-sentinel tests failed before implementation and
pass afterward. The email/configuration/output-encoding suite passed 81 tests;
the final transport/capture checks passed seven tests after provider-error
sanitization. A disposable fixture on ports 18760–18762 completed all ten real
account journeys and review extras, then cleaned up. Its SMTP sink accepts only
synthetic `example.test` recipients, retains at most 256 messages of 64 KiB each
in memory, and exposes only loopback ports. Tools no longer scrape API logs.

Direct API text logs now use a wrapper around the existing formatter; worker and
sync entry points install the same wrapper. It handles uvicorn's positional
access records and full exception output, and telemetry sanitizes preformatted
templates too. Twenty-four redaction/telemetry tests passed, including a real
isolated uvicorn process. Disabling formatter installation made that live test
fail on capability and query sentinels; normal paths and status codes remain in
the log. Arbitrary unlabelled secrets in free text still require call-site review.

Startup settings also hide input values in validation errors, which can occur
before log redaction is installed. A misplaced-secret input failed the previous
behavior and passes with `hide_input_in_errors=True`. The Sharing view discards
late revocation responses after a workspace switch; its regression also failed
before the guard was added and passes with the fix.

Debt DL-190 is also addressed: the public bracket client no longer converts 404
to a successful empty result. Terminal denial clears the projection and stops
polling, while network failures retain it and recover. The test drives the real
client's status policy and failed before the fix. Forty-two display/client tests
and the console build pass. An absent draw and a revoked link both remain 404;
an unconfigured public board therefore needs a reload after configuration.

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
operators remain P08/P10 work.

The September 14 authority-key delivery accepts a bounded PEM trust bundle,
selects the exact issuer key fingerprint, and refuses missing/forged IDs and malformed
trust. Both old and new real checkout grants import after the signer changes.
The retirement checker refuses the active signer and open, unattributed or unknown-key
epochs, preserving closed/recovered history. Its CLI uses read-only database
connections and creates only a new candidate file; publication requires quiesced
issuance across every cloud process. It does not deploy trust or fence offline nodes.

The six initial overlap/key-ID/bundle regressions failed before implementation.
Removing the open-epoch guard fails four retirement cases; removing the active-signer
guard fails its check. CLI checks prove existing trust files survive and invalid
database credentials do not enter output. A deployed rotation and emergency
revocation rehearsal remain unverified; R5 stays FAIL for the residual actor/lifecycle
work, not because a candidate file is mistaken for operational completion.

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
controls pass, and the source scan reports zero findings. Only the finding count
is printed; raw reports are temporary and never uploaded. Five focused
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

## September 13 validation and remaining program

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

P03, P05 and P07 repository implementation is present. P01/P02/P04/P06/P09/P10/P13/
P14/P23 are partial; P08/P11/P12/P15–P22 remain incomplete. The pre-existing user fix in
`apps/api/Dockerfile` is included intact and credited separately because the image
must copy the competition package imported by the application. No deployment/reset,
merge or external incident communication was performed.

## Follow-up verification — 2026-09-14

The final 2026-09-13 hosted run found a flaky privacy assertion and a CodeQL
logging alert in `tools/check-source-secrets.py`. A controlled digest containing
`2012` reproduces the privacy-test failure; the corrected assertion validates the
64-character SHA-256 fingerprint separately while retaining the URL field/value
checks. CI now prints only the scanner finding count, because filenames can also
carry secrets. A synthetic sensitive filename fails the old output path and is
absent from the corrected gate output. No scanner suppression was added.

The September 14 follow-up passes 2,511 backend tests in the parallel partition
(13m58s) and 201 tests in the isolated PostgreSQL partition (one expected skip).
The earlier full run's three logging failures exposed a standard `LogRecord.message`
compatibility requirement. The formatter now preserves that derived field with
redacted text; the added regression fails without it and the full rerun passes.
The disposable mail fixture also completed all ten account journeys and review
fixture preparation using loopback SMTP, with no mail content written to logs.

P13 dependency remediation updates Vitest, its mocker and coverage provider to
4.1.11 ([advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)),
Vite 7's esbuild to 0.28.1 ([advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr)),
and ExcelJS's UUID dependency to 11.1.1 ([advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)).
VitePress retains its supported Vite 6 / esbuild 0.25.12 combination, outside the
affected range. A root ExcelJS tooling dependency makes its scoped UUID override
effective despite the reproduced npm workspace override bug (SMV2-4).

Clean `npm ci`, the resolved dependency graph and `npm audit` pass with zero
findings, including development dependencies. Vitest 4 passes all 2,400 console
and 1,249 entrant tests. Its new spy reuse behavior requires explicit per-test
call-history clearing; module mock implementations and all assertions are retained.
Test-only Node types and precise callback mock signatures restore TypeScript checks.
ExcelJS data-bar UUID generation and XLSX round-trip validation pass. These are
branch results, not a claim that default-branch hosted alerts have closed.

The display follow-up passes all 2,405 console tests and its production build,
lint and dependency boundaries (zero errors; 154/13 existing warnings). Documentation
passes 62 checks with six skips and builds; all 15 backend import contracts pass.
The register's 18 checks pass with R4's enforcement and executable evidence updated.
Removing either the late-issuance guard or workspace confirmation reset makes its
Sharing regression fail. The frozen fixture grant tests pass and reject unmarked
databases without touching them.

Hosted CI on `38cf18e1` passed the frontend, entrant, browser, docs, Compose,
observability and security jobs, but backend collection failed because the live
logging test imported undeclared `httpx`. Commit `bf2655d0` uses the declared
`httpx2` transport; all 14 logging checks pass locally. Hosted success for that
correction and the subsequent display commit must be verified separately.

The final display backend partition passes **2,527 tests in 14m21s**. Its one
pre-existing SQLAlchemy warning concerns a duplicate cascade DELETE expectation.
The separately executed httpx2 logging test supplies the collection-fix evidence.
The R2 collection follow-up was tested separately after this run's collection;
its 98-test backend and 1,254-test entrant results are recorded under R2.

The instrumented browser rerun passes all **eight console contracts and 23
accessibility checks**. The initial run's eight failures each reported the missing
`VITE_ERROR_HARNESS` flag because a normal bundle had been reused; rebuilding with
the wrapper's required instrumentation resolved them without relaxing assertions.

The final display PostgreSQL partition passes **203 tests with one expected skip**
in 4m05s. Hosted security, frontend, entrant, browser, docs, Compose and
observability checks pass on `a33538cd`; its backend job was still running when
the collection follow-up began. These results do not certify later source changes.

Collection/outbox documentation passes 62 checks (six optional skips), the
production docs build and all 18 threat-register checks. Ruff passes across the
repository. The documentation subprocess check requires the host environment.


The authority-key PostgreSQL partition passes **225 tests with one expected skip**
in 7m04s, including retirement and CLI write-refusal checks on both databases.
The repository boundary check initially caught the new retirement SQL in the sync
module. Those reads now live in `repositories/local.py`; the architecture inventory
passes without increasing its counts, and all 15 import contracts pass. The initial
broad run was stopped at 470 passes for that correction; it is not counted as a
complete gate. The final backend partition passes **2,545 tests in 15m13s**, with one existing
SQLAlchemy cascade warning, against the corrected authority implementation.
The 36 focused crypto/CLI/architecture/register checks pass; the binary-key test
fails before its raw-byte preservation fix. Removing read-only connection mode
makes the CLI write-refusal test fail. Documentation passes 62 checks with six skips
and its production build.


P01 historical reconciliation: DL-083's point-cap field already exists in the
Setup and engine schemas/UI; its backend round-trip/bounds cases pass in the full
backend run and both engine forms pass their focused tests. DL-086's venue timezone
already flows through `display/display.py` summary and the shared public board to
`MeetDisplayPage`; the backend summary and venue-clock assertions pass. DL-085's
unreachable `display-config` switch case is already deleted; the surrounding
workspace routing checks pass, without claiming a dedicated dead-code reachability
check. The focused console run for these areas passes 47 tests. DL-090's short
submission reference is already minted, unique and consumed by the receipt route;
`unit/test_short_reference.py` passes in the full backend run. DL-091's AST scan
already ignores prose while counting executable blob/SQL references; all three
architecture-inventory checks pass. These are verified historical fixes, not new
implementations in this delivery.

Hosted CI and security now pass on the exact authority-key commit `b40defc8`
(CI run `34829926566`, security run `34829926651`), including backend, frontend,
entrant, browser contracts, docs, Compose and observability jobs. This resolves
the earlier pending hosted result for that commit and does not certify the
subsequent MFA branch.
