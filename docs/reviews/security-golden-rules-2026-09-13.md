# ShuttleWorks security golden-rules verification — 2026-09-13

Repository: `wongywrongy/ShuttleWorks`. Reviewed source commit:
`612010173b464980787935269d88dcdc46e84804` (main, prototype baseline).
Branch: `security/golden-rules-review-2026-09-13`. Review date: 2026-09-13 UTC.

Read first: `CLAUDE.md`, `CODE_HEALTH.md`, `SECURITY.md`,
`docs/explanation/security-threat-model.md`, and
`docs/reference/security-threat-model.json`; also read `CONTRIBUTING.md` and the
debt log before editing. This is a verification pass. **No application,
infrastructure, test, or workflow fixes were made.** Only this review, the
register's `principles`, and the debt log change.

## Verdict convention and scope

- **PASS:** the requested control was located and applicable executable evidence
  ran successfully. This is a source verification, not certification of a deployment.
- **FAIL:** code/configuration contradicts a requested rule. Existing tests may
  pass while proving the conflicting behavior; their success is not a rule PASS.
- **NO-TEST:** the required property has no adequate committed executable check
  or required rehearsal evidence. Partial checks are named rather than credited
  as complete. Each missing check is proposed in the debt log.

The rule verdict is conservative across its subchecks. Findings are evaluated
against the twelve rules in this brief, including where existing policy deliberately
permits different behavior. A policy exception is recorded, not silently used to
change the requested rule. `enforcedBy` in the register identifies the enforcing
code for the implemented portions; `gaps` and `verdict` qualify that evidence.

Read-only inventories covered all 167 OpenAPI operations, the 26-entry
`PUBLIC_BY_DESIGN` register, effective router dependencies, ORM foreign keys,
request/response schema references, production browser storage calls, all four
workflows, every Compose image declaration, and all six nginx fragments. Form
handlers and custom validators were also read because OpenAPI alone does not
represent their validation. Temporary scripts used only synthetic data and
isolated databases; they are investigative probes, not new CI regression tests.
No live application, customer database, release, or deployment was changed.

## Findings table

| Rule | Verdict | Enforcement / finding file | Test / executable evidence | One-line note |
| --- | --- | --- | --- | --- |
| R1 | PASS | `apps/api/src/core/dependencies.py`, `core/main.py` | `tests/backend/test_auth_surface.py`, `test_tenant_isolation.py`, `test_cross_principal_sessions.py`; entrant draft tests | Server session/principal resolution covers protected routes; browser storage contains UI state/drafts, not credentials. |
| R2 | FAIL | `apps/api/src/core/dependencies.py:348`, `identity/invites.py:170` | `tests/backend/test_tenant_isolation.py::test_member_role_gates_still_403_not_404`; temporary four-way byte probe | Insufficient roles return 403; multiple not-found formats exist; no committed four-way byte test. |
| R3 | FAIL | `apps/api/src/db/models.py:954`, `core/dependencies.py:308` | `tests/backend/unit/test_baseline_schema.py`, `tests/backend/test_host_split.py` | Role CHECK/types/origins work; the strict composite-FK criterion has one single-column operation-child exception. |
| R4 | FAIL | `apps/api/src/db/models.py:476`, `:1490`; `infra/nginx/http-shared.conf` | Session hash tests; `tests/backend/test_display_public.py`; synthetic storage comparison | Display and invite capabilities are stored raw; nginx logs raw request URLs; local mail logs token-bearing bodies. |
| R5 | FAIL | `apps/api/src/sync/service.py:875`, `:1403` | `tests/backend/unit/test_event_node_identity.py`, `test_authority_lifecycle.py`, `test_state_transition_history.py`; checkout probe | Signed/fenced authority works, but checkout and other epoch creation paths omit transition audit rows. |
| R6 | PASS | `apps/api/src/core/config.py:559`, `core/main.py:161`, `sync/compatibility.py`; Collector configs | `test_config.py`, `test_sync_compatibility.py`, `test_migration_startup.py`; native Collector validation | Cloud/test-key refusal, quarantine, invalid-TLS refusal, and nonzero migration failure are enforced. |
| R7 | FAIL | `apps/api/src/competition/routes.py:19`, `meet/schedule_director.py:67`, `bracket/brackets.py:223` | `tests/backend/test_input_limits.py`, `test_derived_output_encoding.py`, `test_entrant_auth_routes.py` | Global body/encoding controls work; free-text field gaps remain and operator registration lacks Turnstile. |
| R8 | FAIL | `infra/nginx/lan-tls.conf`, `docs.conf`; `.github/workflows/ci.yml` | `apps/entrant/tests/ingress.test.ts` (77 passed); six local `nginx -t` checks | Product-tier headers pass; LAN-generated errors lack headers, docs use a subset, and CI has no nginx syntax gate. |
| R9 | FAIL | `infra/compose/`, `.github/workflows/security.yml` | `tools/tests/release-workflow.test.mjs`; complete workflow/image inventory | Release provenance/signing and all 40 action pins exist; mutable Compose images and broad permissions remain. |
| R10 | FAIL | `apps/api/src/display/display.py:242`, `entries/entries_json.py:408`, `ops/health.py:151` | `tests/backend/test_money_and_retention.py` (D7), `test_publication_matrix.py`, `test_health_surface.py`; public-schema/projection probes | Public Any/untyped mappings and availability leak remain; health exposes role/version; retention is manual. |
| R11 | NO-TEST | `apps/api/src/recovery/bundles.py`, `tools/demo-compose.sh:456`, `infra/postgres/restore-drill.sh` | `tests/backend/unit/test_recovery_bundle.py`, `test_backup_scheduler.py`; `promtool check rules` | Encryption/isolated restore and both alerts work; no dated operational restore-drill record was found. |
| R12 | NO-TEST | `tests/backend/unit/test_security_threat_model.py` | Both existing register tests pass even with principles deleted or malformed | All 11 threats have owners, but CI does not validate any of the new principles. |

Paths shortened in this table are expanded in the corresponding sections below.

## R1

**The server decides identity on every request. Browser storage is never authority.**

**PASS.** `apps/api/src/core/dependencies.py:73` resolves `AuthUser` from a
server-side `auth_sessions` row on each request. `get_current_entrant` reads the
separate `entrant_sessions` table and returns `AuthEntrant`. Offline sessions
resolve a hashed token with tournament/epoch scope; local bootstrap is an explicit
server-configured exception and is disabled on event nodes. No client-stored
user/org ID is used as the authenticated principal.

`apps/api/src/core/main.py:538` binds operator routers to `_AUTH_DEP` or
`_EVENT_DATA_DEP`; solve jobs, display management, and tournament routes additionally
carry their role dependencies. The effective dependency inventory found **133
protected human operations** after public, ops-token, and four device-capability
exceptions. All tournament-path human operations contain
`require_tournament_access[...]`. The one apparent direct-dependency exception,
`POST /e/api/submit/{slug}`, calls `get_current_entrant(request, repo)` inside
`entrant_or_back_to_form` (`apps/api/src/entries/entries_json.py:1158`), before
submission. Its HTML-only 303 wrapper does not invent an identity.

`apps/api/src/workspaces/tournaments.py:495` derives the creation org with
`ensure_user_personal_org_id(user_uuid, user.email)`. Member-management
`user_id` path parameters identify the **target member**, behind an owner gate;
they are not the caller. Entrant submission/receipt ownership resolves from the
entrant session. The four node protocol operations excluded by
`tests/backend/test_tenant_isolation.py::NODE_CAPABILITY_OPERATIONS` use signed
grants/device capabilities, not human-session identity.

Production `localStorage` / `sessionStorage` findings, including Zustand's
implicit persistence:

| Path | Stored value / authority check |
| --- | --- |
| `apps/console/src/store/preferencesStore.ts:23` | `scheduler-app-preferences`: theme/density only; `partialize` is explicit. |
| `apps/console/src/components/control-plane/denseData.ts:340` | Saved filters/views; user/workspace IDs namespace the key, not authorization. |
| `apps/console/src/hooks/useListScrollRestore.ts:8` | Numeric scroll position. |
| `apps/entrant/public/assets/entry-wizard.js:139` | Allowlisted entry draft fields and partner selections; not session cookies, CSRF, or reviewed-quote credentials. |
| `apps/entrant/public/assets/receipt.js:442` | Removes the corresponding draft. |

Other matches are comments, documentation, or tests. IndexedDB command queues in
`apps/console/src/lib/commandQueue.ts` and `bracketCommandQueue.ts` were also
checked: persistence queues commands, whose replay still uses server auth.

**Tests:** `tests/backend/test_auth_surface.py` sweeps registered routes in cloud
auth mode; `tests/backend/test_tenant_isolation.py` sweeps tournament routes;
`tests/backend/test_cross_principal_sessions.py` proves principal separation.
`apps/entrant/tests/entry-wizard.script.test.ts` checks that draft storage excludes
the server-reviewed credential and that restore does not restore consent/quote.
These run in the backend and entrant gates. This evidence does not imply MFA or
short-lived sessions; those are separately confirmed open below.

## R2

**Absence is indistinguishable from denial. Out-of-tenant, out-of-role, and unpublished all answer a byte-identical 404.**

**FAIL.** `require_tournament_access` builds the expected tournament 404 for an
unknown workspace/non-member, then explicitly returns 403 with the required and
actual role for a known member. This is deliberate existing policy, directly
pinned by `tests/backend/test_tenant_isolation.py::test_member_role_gates_still_403_not_404`
and `tests/backend/test_auth_seams_characterization.py::test_an_insufficient_role_is_403_because_membership_is_already_known`.
It conflicts with this review's R2.

The synthetic four-way check used an authenticated non-member, then accepted a
viewer invitation and attempted the same PATCH. A private entry-page lookup was
the unpublished case. Actual results:

| Case | Status | Exact response body |
| --- | --- | --- |
| Missing tournament | 404 | `{"detail":{"code":"TOURNAMENT_NOT_FOUND","message":"Tournament not found"}}` |
| Foreign tournament | 404 | `{"detail":{"code":"TOURNAMENT_NOT_FOUND","message":"Tournament not found"}}` |
| Insufficient role | 403 | `{"detail":"Role 'viewer' is insufficient (requires 'operator')"}` |
| Unpublished/private entry page | 404 | `{"detail":{"code":"TOURNAMENT_NOT_FOUND","message":"Tournament not found"}}` |

The `(status_code, content)` set has two members, so the byte-equivalence
requirement fails. Dynamic transport headers/request IDs were not treated as
body equality. The committed tests do **not** supply the requested four-way
proof: `test_invite_oracle.py` covers nonexistent/revoked/expired and compares
`repr(r.json())`; `test_entries_page_api.py` compares unknown/closed parsed JSON.
Neither is a four-state byte comparison. A temporary probe does not close this
**NO-TEST subcheck** (SGR-20260913-02).

There is no single universal not-found seam. `entries/entries_public.py::_not_found`
and `display/display.py::_resolve` use the tournament envelope, while
`identity/invites.py::_invite_not_found` uses `INVITE_NOT_FOUND`;
`_require_invite_owner` uses plain `"invite not found"`. Bracket routes in
`apps/api/src/bracket/brackets.py` (e.g. 1121, 2053, 2540) and application services
in `apps/api/src/bracket/application.py` raise plain-string resource-specific
404s. `sync/service.py` also uses protocol-specific 404 codes. Framework unmatched
routes are another not-found path. Unpublished collection endpoints deliberately
return 200 with `published:false` (for example the draws index), proven by
`tests/backend/test_entries_site_api.py::test_unpublished_draws_answer_an_explicit_false_envelope`;
that is another literal R2 exception.

All explicit 401/403 emitters were located with AST inspection as well as grep:

| Emitter and affected route family | Justification / R2 disposition |
| --- | --- |
| `core/dependencies.py:133,299` — protected operator/entrant routes | Missing sessions yield 401 before resource lookup, independent of tenant existence; existing auth policy, literal R2 exception. |
| `core/dependencies.py:348` — every insufficient tournament role | Returns role-bearing 403; direct R2 failure. |
| `identity/invites.py:188,194` — `DELETE /invites/{token}` | Nonexistent token gets 404, non-owner gets 403; reveals token existence to a signed-in non-owner and fails R2. |
| `identity/invites.py:261`; `workspaces/tournaments.py:1412` — invite accept/create | Defensive malformed server principal checks, not client tenant authority; normal session UUIDs cannot take this branch. Still a separate 403 path. |
| `workspaces/tournaments.py:495` — create workspace | Defensive invalid principal 401; no existing scoped resource is looked up. |
| `core/main.py:441`; `entries/entries_json.py:1018` — cookie writes/native forms | CSRF failure returns 403 before resource access; justified request-authenticity refusal, not a tenant-existence answer. |
| `entries/entries_me.py:880,1141` — withdraw/erase; `entries/partner_routes.py:307` — accept partner | Unverified entrant gets 403 before own-entry/token resolution; verification policy, no valid-vs-missing resource distinction at that branch. Literal out-of-role rule differs. |
| `identity/auth_routes.py:276,343`; `identity/entrants_routes.py:790` — login/change password | Invalid credentials return 401; not tenant lookup routes. |
| `identity/entrants_routes.py:651` — signup | Turnstile refusal 403; public account-creation abuse control, not a tenant resource. |
| `ops/health.py:117` — ready/deep/metrics/backups | Wrong/missing ops token gets uniform 403; operational endpoints are not tenant scoped. |
| `sync/routes.py:71,76` — device capability routes | Missing bearer credential gets 401; distinct machine-principal protocol. |
| `sync/routes.py:207,258` — offline-session create/bootstrap | Invalid offline scope gets 403; explicit device/session issuance rejection. |
| `sync/service.py:315,333,372,616,778,781` — checkout/import/ready/device enrollment checks | Not enrolled/revoked device, invalid ready proof/signature, or node-key mismatch get protocol 403. Human checkout routes first apply session/membership; import/bootstrap are machine-authenticated. These are protocol exceptions, not a universal 404 seam. |
| `sync/service.py:978,1053,1846`; `sync/reconciliation.py:204` — ready/active-authority operations/ingest/status | Invalid capability gets protocol 403; missing/inactive authority has different protocol errors. The stronger resource-indistinguishability rule is not enforced on this plane either. |

Paths in this table are relative to `apps/api/src/`.

## R3

**Least privilege by construction. Roles are a CHECK-constrained ladder; entrant and operator principals are distinct types on distinct origins; cross-tenant references are refused by composite FKs.**

**FAIL against the strict structural criterion; no cross-tenant FK exploit was demonstrated.**
`apps/api/src/db/models.py:468` defines `ck_tournament_members_role` over
viewer/operator/owner. `core/dependencies.py:308` ranks them 0/1/2 and all human
`tournament_id` operations carry that gate. `identity/invites.py:110` duplicates
the same ladder for acceptance; revocation compares `role != "owner"` directly.
These special invitation operations authenticate a session; the ladder is not
literally one shared definition everywhere.

`AuthUser` and `AuthEntrant` are separate types backed by separate tables/cookies.
`core/config.py` refuses domain-scoped cookies and wildcard credentialed CORS;
`infra/nginx/console.conf` and `play.conf` listen on 8080/8081. Hostnames remain
configuration. Tests: `tests/backend/test_host_split.py`,
`test_cross_principal_sessions.py`, the role matrix in `test_tournaments.py`, and
`tests/backend/unit/test_baseline_schema.py::test_enum_checks_reject_unknown_values`
(the tournament-members case). Schema parity compares actual FK/CHECK definitions
to ORM metadata; PostgreSQL parameterizations require `TEST_POSTGRES_URL`.

The metadata inventory found **23 composite foreign-key constraints**. The
complete single-column intra-tournament-child list is:

| FK | Source | Assessment |
| --- | --- | --- |
| `sync_outbox.operation_id → event_operations.operation_id` | `apps/api/src/db/models.py:954` | Single-column operation-child reference. `sync_outbox` has no independent `tournament_id`: ownership is inherited through the globally unique operation ID. Log the requested composite-key debt, but do not claim it permits choosing two mismatched tournament IDs. Proposed test: round-trip outbox ownership and reject any future independent tenant mismatch (SGR-20260913-03). |

For completeness, five adjacent single-column references are to **global**
principals/catalogs, not another tournament's child:
`competition_events.format_version_id → event_format_versions.id`,
`offline_operator_sessions.user_id → users.id`,
`player_representatives.account_id → entrant_accounts.id`,
`submissions.account_id → entrant_accounts.id`, and
`tournament_members.user_id → users.id`. `event_format_versions.scoring_profile_version_id`
also references the global `scoring_profile_versions.id` catalog. These are not
composite-tenancy defects.

The 27 ordinary parent FKs to `tournaments.id` belong to `bracket_events`,
`cloud_event_projections`, `commands`, `competition_audit`, `competition_events`,
`display_tokens`, `entries`, `entry_events`, `entry_pages`, `entry_players`,
`event_operations`, `invite_links`, `match_states`, `matches`, `meet_events`,
`offline_operator_sessions`, `solve_jobs`, `state_transitions`, `submissions`,
`sync_checkpoints`, `sync_inbox`, `sync_quarantine`, `tournament_authority_epochs`,
`tournament_authority_transitions`, `tournament_backups`, `tournament_members`, and
`workspace_modules`. A root tournament reference is naturally single-column;
these are not references between tenant children. No additional single-column
child-to-child FK was found in ORM metadata or the baseline migration.

## R4

**Secrets are never stored or logged in clear. Passwords Argon2id; every bearer token stored as a hash; plaintext exists only in the one response that issues it.**

**FAIL.** Password hashing is Argon2id (`identity/auth.py::_hasher`,
`hash_password`, `verify_password`). Session/reset/verification/partner tokens
use SHA-256, but not every bearer capability follows that design.

| Stored credential | Write path under `apps/api/src/` | Result |
| --- | --- | --- |
| `auth_sessions.token_hash` | `identity/auth.py::create_session → _hash_token` | PASS; raw-session non-storage test exists. |
| `users.reset_token_hash` | `identity/auth.py::issue_reset_token → _hash_token` | PASS; cleared on consume. |
| `entrant_sessions.token_hash` | `identity/entrants.py::create_session → _hash_token` | PASS; raw-token test exists. |
| `entrant_accounts.verify_token_hash`, `.reset_token_hash` | `identity/entrants.py` issuance through imported `_hash_token` | PASS; cleared on consume. |
| `partner_invitations.token_hash` | `entries/partners.py` issuance through `_hash_token` | PASS; expiry and invalidation checked by service tests. |
| `offline_operator_sessions.token_hash` | `identity/offline_sessions.py::_digest` | SHA-256, a separate helper rather than `_hash_token`; cryptographic criterion passes, single-helper criterion differs. |
| `tournament_authority_epochs.capability_digest` | `sync/service.py::capability_digest` | SHA-256, compared with `hmac.compare_digest`; separate helper. |
| `display_tokens.token` | `display/display.py` → repository get/create/rotate | **FAIL:** stored raw, returned again on every owner GET. Synthetic probe compared stored value to issued token: equal. |
| `invite_links.id` | `workspaces/tournaments.py::create_invite_link` → repository invite creation | **FAIL:** UUID itself is the bearer token and primary key, returned on resolve/list; synthetic stored-ID comparison: equal. |

The inventory searched token-named columns **and** capability/digest/id issuance
paths. `Entry.manage_token_hash` survives only in historical comments; the column
is gone. CSRF proofs and Turnstile responses are request validation material,
not persistent session bearer columns. File-backed machine/signing secrets are
separate from bearer-token database storage and require key custody (see known items).

The issue-once claim is explicitly contradicted by
`tests/backend/test_display_public.py::test_token_minted_once_and_rotatable`, which
requires repeat retrieval to return the same token. Display tokens have no expiry
column; link-style operator invites use `expires_at=None` and
`test_link_invite_still_eternal` pins that ruling. Email invites do expire.

Logger inspection found no direct raw-token argument in the identity/partner/sync
issuance logger calls; reset issuance logs user ID/expiry. However,
`core/email.py:89` logs the entire email `body` in the console backend, including
verification/reset/invite links passed by callers. `_enforce_cloud_secrets` rejects
that backend in cloud mode; local mode still violates the literal no-clear-logging
rule. Telemetry allowlists/Collector attribute deletion are not a general log
redaction module.

**Nginx redaction is FAIL, not NO-TEST.** No `log_format` or `access_log`
override exists in the six files in `infra/nginx/`. The inspected local nginx base image's
`/etc/nginx/nginx.conf` defines `log_format main` containing `$request` and
`$http_referer`, with `access_log ... main`; this is combined-style logging even
though its format name is `main`. `/display/`, `/invites/`, `/partners/`, and
query `?token=` are therefore not masked, including proxied `/api/`/`/e/api/`
forms. Referrer policy does not redact the server access log.

**Tests:** `tests/backend/unit/test_auth_service.py::test_argon2id_hash_roundtrip`,
`unit/test_auth_characterization.py::test_the_raw_session_token_is_never_stored`,
`tests/backend/test_entrant_auth_routes.py::test_the_raw_token_is_not_what_the_database_stores`,
`unit/test_offline_operator_sessions.py`, and display/partner tests run in the gate.
**NO-TEST subcheck:** no regression sends sentinel capabilities through each edge
path/query and asserts absence from access/error logs. SGR-20260913-04.

## R5

**Authority is explicit, signed, and audited. One node and epoch hold write authority under an Ed25519 grant; every state change records its actor.**

**FAIL for audit completeness.** `sync/authority.py` is a facade; the actual
signing/verification code is `apps/api/src/sync/service.py::_authority_grant`
(Ed25519 over canonical JSON) and `_verify_authority_grant` (checks tournament,
node, epoch, checkpoint digest/schema, allowed command classes, then signature).
Ready proof binds the enrolled node key. `_active_authority`, capability/epoch
checks, and the live-authority unique index in `db/models.py` fence concurrent or
stale writers. Tests: `tests/backend/unit/test_event_node_identity.py`,
`test_ready_proof.py`, `test_sync_protocol.py`, `test_sync_concurrency.py`,
`test_cloud_write_authority.py`, and `test_authority_lifecycle.py`.

`sync/service.py::_append_transition` persists `AuthorityTransition` with actor,
device, reason, epochs, and evidence; return and planned transfer call it, and
`sync/recovery.py` uses it for lost-node recovery. **`begin_checkout` does not**:
it commits a new authority epoch and only increments the telemetry counter
`record_authority_transition("checkout")`. A counter is not an audit row.
`ensure_local_authority` also creates an epoch without that audit record;
`import_checkpoint` can create the receiving node's epoch without one. The
synthetic `begin_checkout` probe observed epoch 1 and **0 → 0** rows in
`tournament_authority_transitions`.

`state_transitions` exists (`db/models.py::StateTransition`).
`core/state_machine.py::apply` validates and returns a record; the caller must
persist it in the same transaction. All production calls of this particular
primitive were read:

| Caller under `apps/api/src/` | Audit behavior |
| --- | --- |
| `entries/lifecycle.py::transition_entry` | Calls `record.persist(session)` whenever attached to a session. |
| `operations/match_state.py::transition_match` | Same-session persistence; a same-state no-op returns without a transition. |
| `solve_rail/solve_jobs.py::_transition` | Persists for attached ORM rows; detached validation produces no DB row. |
| `solve_rail/solve_jobs.py::claim_next` | Chained `apply(...).persist(session)`, with worker ID. |
| `workspaces/workspace_modules.py` | Chained same-session persistence. |

Other methods named `apply` are application services, not this primitive. Detached
objects and refused/no-op transitions intentionally have no persisted transition.
`core/dependencies.py` stages operator/entrant actor identity in session info;
explicit worker IDs are supplied on claim. `actor_id` can still be null, and this
is not evidence that **every ordinary entity write** has a person-specific audit
record. `tests/backend/unit/test_state_transition_history.py` proves persisted
sequences, actor attribution, no-op behavior, and rollback atomicity;
`tests/backend/test_state_transition_routes.py` covers the read surface.
**NO-TEST subcheck:** comprehensive audit assertions for initial checkout/import/
standalone epochs and actor completeness are absent. SGR-20260913-05.

## R6

**Fail closed. Missing or test-grade secrets stop startup; unknown wire versions quarantine; invalid TLS minimums refuse; a failed migration exits non-zero.**

**PASS for the requested seams.** `apps/api/src/core/config.py::_enforce_cloud_secrets`
rejects cloud SQLite, local auth, insecure session cookies, console email, absent
SMTP host/ops token, and missing or Cloudflare test Turnstile keys. The worker
profile deliberately validates only its database requirements. Authority-profile
key-file settings are required by `_enforce_authority_key_custody`; private/public
key material is loaded and validated by the signing/verification code when used.
This is not a claim that every possible weak value in every secret setting has
a universal strength detector.

`sync/compatibility.py` accepts only explicit wire version 1 and rejects bools as
integer versions. `sync/service.py` uses that predicate before applying incoming
operations and creates quarantine evidence for unsupported operations.
`tests/backend/unit/test_sync_compatibility.py::test_unsupported_operation_version_is_quarantined_before_application`
proves this path; unsupported checkpoint import is refused rather than interpreted.

The Collector templates set `min_version` from
`OTEL_GATEWAY_TLS_MIN_VERSION` (default `1.2`). `.github/workflows/ci.yml` runs
native validation and requires `SSL3` to fail. The review executed **both**
`infra/otel/collector-event-node.yaml` and `collector-cloud.yaml`: TLS `1.2`
returned 0, and `SSL3` returned 1 with `invalid TLS min_version: unsupported TLS
version: "SSL3"`. These used dummy CI values with networking disabled; no gateway
or database was contacted.

`core/main.py:161` logs a migration exception and **re-raises**. The former
logged-and-continue risk is closed. `tests/backend/unit/test_migration_startup.py::test_broken_revision_exits_nonzero_and_backs_up_committed_wal`
launches a real interpreter with a deliberately broken revision, asserts nonzero
exit, and checks the preserved committed WAL data. Other startup tests reject FK
corruption even at schema head. Configuration tests include
`tests/backend/unit/test_config.py::test_cloud_mode_refuses_cloudflare_turnstile_test_keys`,
`test_cloud_mode_refuses_console_email_backend`, and the cloud API/worker cases
in `tests/backend/test_health_surface.py`.

## R7

**Every input is bounded; every output is encoded for where it lands. Body and field limits; Turnstile on signup; CSV/.ics/email-header encoding at the derived surface.**

**FAIL for complete field coverage and the all-signups interpretation.**
`apps/api/src/core/body_limit.py::BodyLimitMiddleware` counts received bytes,
including absent/lying Content-Length, and is installed globally/outermost in
`core/main.py:530`. `core/limits.py` defines the 4 MB ceiling, `StrictModel`
(`extra="forbid"`), bounded text aliases and collection sizes.
`tests/backend/test_input_limits.py` exercises oversized/chunked body refusal,
unknown fields, overlong names/list sizes, and protected state-version fields.

A recursive request-schema inventory produced 125 route/field occurrences
without `maxLength`; these are **not 125 vulnerabilities**. Fixed-width regexes
(HH:mm, hex color, currency), custom `Representation` validation, and `FormatId`
registry validation provide bounds/vocabularies not represented as `maxLength`.
Uploads are governed by the global byte ceiling. After reading the declarations,
these free-text/string-element gaps remain:

| DTO fields | Source under `apps/api/src/` | Gap |
| --- | --- | --- |
| `EventRequest.formatKey`, `genderCategory`, `ageGroup`, `level`, `bracketEventId`, `meetEventId` | `competition/routes.py:19` | Plain strings/optional strings; only `categoryCode` has an explicit text limit. |
| `DirectorAction.reason` | `meet/schedule_director.py:67` | Unbounded optional free text on a live tenant-scoped director action. |
| `Disruption.playerId`, `matchId`, `fromTime`, `toTime`, `reason`; `RepairRequest.nowIso` | `meet/schedule_repair.py:74` | Plain optional strings; repair DTO is also consumed by the live proposal path. |
| `WarmRestartRequest.nowIso` | `meet/schedule_warm_restart.py:73` | Plain optional timestamp string. |
| `ParticipantIn.members[]`, `entryPlayerId` | `bracket/brackets.py:223` | Element strings and provenance ID unbounded; members list itself has no ceiling here. |
| `EventUpsertIn.discipline` | `bracket/brackets.py:557` | Plain string instead of bounded `Code`. |
| `ImportEventIn.round_labels[]` | `bracket/brackets.py:631` | List length bounded, individual labels unbounded. |
| `EntryImportPlayerDTO.partners{}` values | `entries/entries_routes.py:231` | Dictionary count bounded, nested reference values are plain strings. |

The body ceiling limits total exposure, but does not satisfy per-field bounds.
`config: dict` and similar open maps also need explicit schemas or bounded nested
validation; a global byte cap is not proof of every leaf's contract.
**NO-TEST subcheck:** no recursive all-request-DTO free-text bound regression.

`identity/entrants_routes.py::signup` calls `verify_turnstile` server-side and
refuses missing/failed/unreachable challenges before account creation.
`tests/backend/test_entrant_auth_routes.py` and `unit/test_turnstile.py` exercise
that behavior. `identity/auth_routes.py::register` has account/IP/signup throttles
but **no Turnstile**. It sits on the operator origin, normally behind Access;
that is a deployment mitigation, not Turnstile on every signup route. This is
recorded as a scope/policy decision rather than changing either signup flow.

Derived output controls pass: `apps/api/src/bracket/io/export_schedule.py::_csv_safe`
neutralizes formula prefixes, `_ics_escape` handles CR/LF and RFC5545 characters,
and `apps/api/src/core/email.py::_header_safe` flattens/truncates subject headers.
`tests/backend/test_derived_output_encoding.py` exercises actual exports/mail
construction and malicious inputs, not just helper presence. R7 debt:
SGR-20260913-07.

## R8

**The edge is a control. Security headers on every nginx level with always; script CSP without unsafe-inline; HSTS on HTTPS; the public tier on its own port with the stricter policy; server_tokens off.**

**FAIL for complete edge/CI coverage.** The product console/play server blocks
and all their locations include `security-headers.conf`. All seven security
headers in that snippet use `always`. Script CSP excludes `unsafe-inline` and
`unsafe-eval`; inline **styles** remain a declared exception. Signup alone gains
the Turnstile script/frame origin. `http-shared.conf` sets `server_tokens off`,
conditionally maps HTTPS-forwarded requests to HSTS, and uses port 8081 for the
public `DENY`/`frame-ancestors 'none'` policy; the console uses port 8080 and
SAMEORIGIN. Both now use `connect-src 'self'`.

`apps/entrant/tests/ingress.test.ts`: **77 passed**, within the full 1,249-test
entrant gate. `tests/backend/unit/test_lan_tls_config.py` checks LAN TLS bindings.
These passing tests do not cover every nginx deployment surface.

| Fragment | Syntax check | Header/control result |
| --- | --- | --- |
| `infra/nginx/console.conf` | PASS | Shared headers at server and every location. |
| `infra/nginx/play.conf` | PASS | Shared headers at server and every location; separate public port/policy. |
| `infra/nginx/http-shared.conf` | PASS | HTTP-context maps/zones/server tokens; no location blocks. |
| `infra/nginx/security-headers.conf` | PASS | Snippet checked in a server with real shared maps; every security header has `always`. |
| `infra/nginx/docs.conf` | PASS | No shared snippet/CSP/HSTS; three static headers only. `SECURITY.md` excludes the internal docs container, but this fails the literal every-level rule. |
| `infra/nginx/lan-tls.conf` | PASS | TLS1.2/1.3 and server tokens off, but neither server/location supplies security headers; upstream headers do not cover edge-generated 502/504/errors. |

No `.github/workflows/*` step runs `nginx -t`, and no CI nginx stub includes were
found. Therefore the requested **CI syntax control is absent**. To still perform
the local gate, each fragment was mounted read-only into a network-disabled
nginx container with `events {}`/`http {}` wrappers, its actual shared maps/snippet
where applicable, loopback DNS stubs for backend, entrant, and frontend, and a disposable
LAN certificate. All six `nginx -t -c /review/wrappers/<fragment>` invocations
returned 0. The local image ID was
`sha256:2ddec616f1cb58bcac057aa388f28cb81e35137641ef4226d321714499329bd1`.
Syntax validation does not prove header delivery on an error response.
**NO-TEST subchecks:** native nginx validation in CI and real LAN error-header
coverage. SGR-20260913-08.

## R9

**Nothing runs that was not built from a verified commit. SHA image tags, SBOM, SLSA provenance, cosign, SHA-pinned actions, least-privilege workflow permissions.**

**FAIL overall; publication controls are present.**
`.github/workflows/publish-release.yml` accepts exact semver or a 40-hex commit,
checks out/resolves that revision, and waits for the latest CI **and security**
run on that exact commit to succeed. It publishes `sha-<40hex>` plus exact-semver
tags, BuildKit SPDX SBOM / `provenance: mode=max`, GitHub build provenance, and
cosign signatures over the digest; cosign verifies the workflow/OIDC identity.
`.github/workflows/security.yml` provides CodeQL, dependency review, npm audit,
pip-audit, blocking Trivy high/critical scans, and a source SBOM. Source workflow
verification is not evidence that this review performed a release or fetched an
attestation from a registry.

Every workflow was read, not just the two named in the brief:

| Workflow | `uses:` lines | Immutable 40-hex references | Top-level permissions |
| --- | ---: | --- | --- |
| `.github/workflows/ci.yml` | 15 | All | `contents: read` |
| `.github/workflows/security.yml` | 15 | All | `contents: read`, `security-events: write` |
| `.github/workflows/publish-release.yml` | 7 | All | actions/contents read; packages, attestations, and id-token write |
| `.github/workflows/phase4-observability-rehearsal.yml` | 3 | All | `contents: read` |

**40/40 action references are SHA-pinned; 4/4 workflows declare permissions.**
However, security's top-level `security-events: write` is inherited by npm-audit,
python-audit, sbom, and aggregate jobs that do not need it. Dependency review
requests `pull-requests: write` while no PR-comment option is configured. These
are least-privilege findings, not missing-permissions findings.

Every non-digest Compose image declaration:

| File under `infra/compose/` | Image |
| --- | --- |
| `docker-compose.dev.yml`, `docker-compose.cloud.yml`, `docker-compose.selfhost.yml`, `demo.override.yml` | `postgres:16-alpine` |
| `docker-compose.lan-tls.yml` | `nginxinc/nginx-unprivileged:alpine` |
| `docker-compose.event-node.yml`, `docker-compose.observability-rehearsal.yml` | `otel/opentelemetry-collector-contrib:0.155.0` |
| `docker-compose.selfhost.yml` | `cloudflare/cloudflared:2026.8.3` |
| `docker-compose.release.yml` (three images) | `ghcr.io/${OWNER:-misogyu}/scheduler-{backend,entrant,frontend}:${TAG:?...}` |

Version tags remain movable at a registry unless pinned by digest; `alpine` and
`16-alpine` are explicitly rolling. The release Compose interpolation only
requires **nonempty TAG**: it does not enforce its human-readable “tested semver
or commit-SHA” message, so `TAG=latest` also parses. Build-based development,
selfhost, worker, and event-node stacks can build the working tree without a
verified-commit gate. No Compose deployment hook verifies cosign/provenance before
starting images; verification occurs at publication. A SHA-shaped tag is also a
registry tag, not intrinsically an immutable digest.

`tools/tests/release-workflow.test.mjs` passes and proves the declared publication
mechanisms by source assertions; it scans only CI/security/publish, so the fourth
workflow was independently scanned in this review. Its TAG test only checks that
the interpolation is required and lacks a `latest` default. It does not prove
arbitrary mutable TAG values are refused. **NO-TEST subchecks:** all-Compose
immutability/admission and least-privilege job permissions. SGR-20260913-09.

## R10

**Hold the minimum, for the minimum time, and let it be erased. Public serializers are allow-lists; retention purges contact data; erasure scrubs the person and keeps the record.**

**FAIL.** A recursive traversal of successful public JSON response schemas
followed nested refs, list items, unions, and dictionary values. In addition to
literal `Any`, bare dictionaries with `additionalProperties: true` are untyped
pass-through surfaces. The failing public models/routes are:

| Public route | Exact untyped field / model gap | Source |
| --- | --- | --- |
| `GET /display/{token}/state` | `DisplayStateDTO.config`, `.groups`, `.players`, `.matches`, `.schedule`, `.scheduleIsStale` are all `Any`. | `apps/api/src/display/display.py:242` |
| `GET /display/{token}/bracket` | `TournamentOut.events[].EventOut.config: dict`; `TournamentOut.results[].ResultOut.score: Optional[dict]`. | `apps/api/src/bracket/brackets.py:367,395` |
| `GET /e/api/page/{slug}` | `EntryPageProjection.policy.disciplineCaps` comes from `PolicyDTO.disciplineCaps: Optional[dict]`. | `apps/api/src/entries/entries_json.py:408` |
| `POST /auth/request-password-reset` | Return annotation is bare `dict`, not an explicit DTO. | `apps/api/src/identity/auth_routes.py:364` |
| `POST /e/account/request-password-reset` | No response model/return DTO; successful JSON schema is `{}`. | `apps/api/src/identity/entrants_routes.py:949` |
| `GET /health` | No explicit DTO; returns `status`, `version`, and `role`. | `apps/api/src/ops/health.py:151` |

The full public response inventory appears below. DTO key-set tests exist, but
checking only the top-level keys of `DisplayStateDTO` does not constrain fields
inside `players` or `config`. The synthetic fixture put a player with
`availability=[{"start":"09:00","end":"10:00"}]` in tournament state and then
performed an anonymous display GET; that exact availability list appeared in
`players[0].availability`. This confirms the supplied known item remains open.
`tests/backend/test_publication_matrix.py` and `test_display_public.py` can pass
with this gap: their selected fixtures/forbidden keys are not a recursive schema
ban. `test_health_surface.py::test_liveness_is_dependency_free` even requires the
extra `role` key, so it contradicts the requested status-only policy.

Retention is implemented and executable, but **operator-invoked**:
`POST /tournaments/{tournament_id}/entries/retention-sweep` in
`entries/entries_routes.py:691` calls `entries/retention.py::sweep_workspace`.
There is no periodic/background/cron caller in the repository. Missing
`retention_days` intentionally means never swept. The route docstring explicitly
rejects unattended purging. The tests prove the action when invoked, not that a
production retention schedule runs or that contacts have been purged there.

D7 is enforced by `entries/retention.py::erase_account_data`: it scrubs account
identity/contact/credentials, revokes sessions, scrubs represented players, keeps
account/submission/entry identities and director records, and rebuilds public
projection. `tests/backend/test_money_and_retention.py::test_erasure_scrubs_the_person_and_keeps_the_director_s_records`
is the requested end-to-end D7 test. Its sibling tests cover sign-out, account
lockout, idempotency, and the unverified-account refusal. Retention due/not-due/
no-policy/account-preservation cases are in the same file;
`tests/backend/unit/test_public_projection_erasure.py` checks erased entrants and
reserves disappear from public projection.

**NO-TEST subchecks:** recursive public DTO enforcement including dictionary
values, private availability sentinels, status-only liveness, and scheduled
retention evidence. SGR-20260913-10.

## R11

**Recovery is encrypted, verified, and rehearsed. AES-GCM bundles under a passphrase-derived key; restore drill; backup-stale and restore-failed alerts.**

**NO-TEST for the required operational rehearsal/last-run record.** The crypto
and isolated restore subchecks pass. `apps/api/src/recovery/bundles.py` derives a
32-byte key with scrypt (`n=2**15, r=8, p=1`) from a passphrase of at least 12
bytes, uses a fresh salt/nonce and authenticated AES-GCM, checks manifest/database
hashes, and restores through a staged path into a new destination. It rejects a
wrong passphrase, modified ciphertext, and an existing destination.
`tests/backend/unit/test_recovery_bundle.py`: **4 passed**, including isolated
clean-destination preflight. `test_backup_scheduler.py`: **3 passed**, covering
verified generations, isolated restore testing, visible secret/source failure,
and opportunistic offsite handoff.

`tools/demo-compose.sh::restore_drill` exists and actually restores a PostgreSQL
dump to a disposable DB, compares row counts/schema revision, and drops that DB.
It prints a success message; no dated run artifact from that script was found in
the repository. `infra/postgres/restore-drill.sh` is a **checklist/preflight**:
even `DRY_RUN=0` only runs `pgbackrest check` and delegates the restore command.
The monthly runbook is `docs/how-to/postgres-disaster-recovery.md:90`. Script
presence and a unit-test restore are not a recorded timed deployment rehearsal.
This review did not run commands against the live demo or production database.
No claim is made that an unrecorded operational drill never occurred.

Both required alerts exist and load:
`ShuttleWorksBackupStale` and `ShuttleWorksBackupRestoreFailed` in
`infra/observability/prometheus-rules.yaml`. Native
`promtool check rules /rules/prometheus-rules.yaml` returned **SUCCESS: 18 rules
found**, including those two. `tests/backend/unit/test_operational_telemetry.py`
also checks rule/dashboard shape and runbook annotations. This establishes loadable
rules, not installed production routing, metric availability, or delivery of a
real alert. SGR-20260913-11 proposes an isolated drill with a dated manifest and
alert firing/resolution evidence.

## R12

**Every rule has an executable check and every threat has an owner.**

**NO-TEST for principles coverage.** All **11 existing threats** have owners,
controls, and existing evidence paths. Their two tests in
`tests/backend/unit/test_security_threat_model.py` pass and run in CI's backend
job. `npm run test:docs` covers documentation/release tooling, **not this register**;
the named register check is the Python file.

Neither existing register test reads `principles`. The review independently
validated the twelve unique IDs R1–R12 and every `enforcedBy`/`evidence` file path,
then pointed the unchanged register test functions at temporary copies:

| Temporary register mutation | Result from both existing tests |
| --- | --- |
| Delete `principles` entirely | PASS |
| Replace it with `[{"id":"R999","enforcedBy":null,"evidence":["missing-test.py"]}]` | PASS |

The mutations never touched the repository register. This demonstrates an actual
coverage gap, not an inference from a green test. The review adds the requested
principles and honest verdicts, but does not expand the gate in a verification-only
pass. SGR-20260913-12 proposes exact ID/schema/path/owner/verdict validation with
negative controls. NO-TEST subchecks from other rules are separately recorded in
`docs/reference/debt-log.md`, each with proposed executable evidence.

## Supplied known items — confirmed status

| Known item | Status on reviewed commit | Located evidence / disposition |
| --- | --- | --- |
| No operator/owner MFA; ASVS L2 authentication claim | **Open** | `SECURITY.md` claims L2 for authentication/session/access/validation while its known-gaps section accepts no MFA. `identity/auth_routes.py::login` authenticates password only; no MFA enrollment/challenge dependency found. The supplied L2 gap remains; this pass does not certify ASVS conformance. SGR-20260913-K1. |
| 30-day operator session, no idle timeout, no sensitive-action reauthentication | **Open** | `core/config.py:269` defaults `session_ttl_days=30.0`; `identity/auth.py::resolve_session` checks absolute expiry/revocation and only updates `last_seen_at` after 300 seconds. That update is not an idle-expiry rule. Export, workspace deletion, member role change, authority transfer, and display-token issuance have session/role/authority checks but no fresh-password/MFA challenge. Confirmation booleans on transfers are not reauthentication. SGR-20260913-K1. |
| No security alerts in `prometheus-rules.yaml` | **Partly closed** | `ShuttleWorksAuthorityRejections` and `ShuttleWorksCertificateExpiring` now exist, alongside the two recovery alerts; all 18 rules load. No login-failure/credential-stuffing or privilege-change detection rule was found. SGR-20260913-K2. |
| No log redaction module | **Open for general/access logs; telemetry filtering exists** | `core/telemetry/privacy.py` allowlists attributes and Collector templates delete sensitive fields. Neither redacts nginx request URLs or the console-email log body. R4 / SGR-20260913-04. |
| No secrets inventory or rotation runbooks; authority key rotation across open epochs undesigned | **Open in the requested comprehensive sense; certificate procedure exists** | `docs/how-to/observability-runbook.md:117` describes TLS certificate rotation, so “no rotation runbooks at all” is no longer accurate. No central secrets inventory or authority-key overlap/retirement procedure found. `sync/service.py::_public_verification_key` loads one key; grants carry `keyId` but verification does not select an epoch-key ring. SGR-20260913-K3. |
| No Dependabot, CI secret scanning, Semgrep, DAST | **Open** | `dependabot.yml` is absent from `.github/`; all four workflows were checked. CodeQL, dependency review, npm/pip audit, Trivy vulnerability scan and SBOM exist, but no explicit secret-scanning, Semgrep or DAST job is configured. Repository-hosted secret-scanning settings were not inferred from workflow absence. SGR-20260913-K4. |
| No incident-response runbook | **Open for security incidents; operational runbooks exist** | Observability, event-node reliability, and PostgreSQL DR documents give operational response steps; `SECURITY.md` gives reporting contact. No security incident procedure covering triage, containment, credential revocation, evidence preservation, notifications, and recovery ownership was found. SGR-20260913-K5. |
| Capability URLs logged by nginx defaults | **Open, confirmed** | No format override; inspected base image uses combined-style `main` containing `$request` and `$http_referer`. Exact format name is `main`, not `combined`. R4. |
| `DisplayStateDTO` nested Any; players.availability reaches board | **Open, confirmed** | Six literal Any fields; synthetic anonymous GET returned availability. Additional untyped public mappings are named under R10. |
| Display / link-invite tokens eternal by default | **Open by existing ruling** | `display_tokens` has no expiry; link-style invite `expires_at=None`, with `test_link_invite_still_eternal` preserving the policy. Email/partner/reset/session tokens have separate finite lifetimes. Do not silently change the lifetime ruling in this pass; reassess/document it with the R4 storage redesign. |

Source paths without a repository prefix in this table are under `apps/api/src/`.
Known policy/operational gaps carry proposed owners and tests in the debt log;
those assignments are proposed responsibilities, not newly accepted risk exceptions.

## Public response-model inventory

The following is the complete 26-route public allowlist from
`tests/backend/test_auth_surface.py::PUBLIC_BY_DESIGN`, cross-checked with the
actual successful OpenAPI responses. No-JSON/redirect-only responses have no JSON
DTO to inspect. `Any` findings include untyped mapping values recursively.

| Route | Success JSON model | Schema finding |
| --- | --- | --- |
| `GET /display/{token}/bracket` | `TournamentOut` | FAIL — named under R10 |
| `GET /display/{token}/match-states` | `dict[str, DisplayMatchStateDTO]` | Explicit typed projection |
| `GET /display/{token}/state` | `DisplayStateDTO` | FAIL — named under R10 |
| `GET /display/{token}/summary` | `DisplaySummaryDTO` | Explicit typed projection |
| `GET /e/api/config` | `EntrantConfigDTO` | Explicit typed projection |
| `GET /e/api/page/{slug}` | `EntryPageProjection` | FAIL — named under R10 |
| `GET /e/api/page/{slug}/draws` | `DrawsIndexDTO` | Explicit typed projection |
| `GET /e/api/page/{slug}/draws/{draw_key}` | `DrawDetailDTO` | Explicit typed projection |
| `GET /e/api/page/{slug}/matches` | `ScheduleMatchesDTO` | Explicit typed projection |
| `GET /e/api/page/{slug}/players` | `PlayersDTO` | Explicit typed projection |
| `GET /e/api/page/{slug}/players/{person_key}` | `PlayerPageDTO` | Explicit typed projection |
| `GET /e/api/pages` | `SeasonListDTO` | Explicit typed projection |
| `GET /e/api/partner-invites/{token}` | `PartnerInviteDTO` | Explicit typed projection |
| `GET /health` | `No DTO ({})` | FAIL — named under R10 |
| `GET /invites/{token}` | `InviteResolveDTO` | Explicit typed projection |
| `POST /auth/login` | `UserDTO` | Explicit typed projection |
| `POST /auth/logout` | `No success JSON body declared` | No JSON DTO required |
| `POST /auth/register` | `UserDTO` | Explicit typed projection |
| `POST /auth/request-password-reset` | `bare dict` | FAIL — named under R10 |
| `POST /auth/reset-password` | `No success JSON body declared` | No JSON DTO required |
| `POST /e/account/login` | `EntrantDTO` | Explicit typed projection |
| `POST /e/account/logout` | `No success JSON body declared` | No JSON DTO required |
| `POST /e/account/request-password-reset` | `No DTO ({})` | FAIL — named under R10 |
| `POST /e/account/reset-password` | `No success JSON body declared` | No JSON DTO required |
| `POST /e/account/signup` | `SignupResponse` | Explicit typed projection |
| `POST /e/account/verify` | `No success JSON body declared` | No JSON DTO required |

## Validation record

All executions below occurred on 2026-09-13 UTC against the reviewed application
source. The register check was also run after adding the principles.

| Gate / command | Result |
| --- | --- |
| `.venv/bin/pytest tests/backend -n 4 --junitxml=/tmp/shuttleworks-security-2026-09-13/backend-parallel.xml` | **PASS: 2,529 passed, 84 skipped, 9 warnings; 750.54 s.** All 2,613 cases collected. All skips require `TEST_POSTGRES_URL`, including the cloud worker smoke case. PostgreSQL-specific execution is not claimed. |
| `npm --prefix apps/entrant run test:run` | **PASS: 58 files, 1,249 tests; 89.42 s.** Includes 77 ingress tests. |
| Six fragment-specific `nginx -t` checks | **PASS: 6/6**, with temporary wrappers described under R8. No CI stub exists to reuse. |
| `npm run test:docs` | **PASS: 58 passed, 6 skipped, 0 failed**, 64 cases. Skips are optional browser capture tests. |
| `.venv/bin/pytest tests/backend/unit/test_security_threat_model.py -q` | **PASS: 2 passed** after register edit; does not cover principles. |
| `docker run --rm --network none -v "$PWD/infra/observability:/rules:ro" --entrypoint promtool prom/prometheus:v3.5.0 check rules /rules/prometheus-rules.yaml` | **PASS: 18 rules load**, including both required backup alerts. |
| Native Collector `validate --config=...` on both production templates | **PASS:** each returns 0 for TLS1.2 and 1 for invalid SSL3, with explicit TLS-version errors. |
| `TAG=latest docker compose --env-file /dev/null -f infra/compose/docker-compose.release.yml config --images` | **R9 failure reproduced:** command returns 0 and renders three `:latest` application images. This only parsed configuration. |
| Temporary four-way response/storage/projection/checkout probes | **R2/R4/R5/R10 failures corroborated**, with synthetic data; results recorded in those sections. |
| `npm run docs:paths` / `npm run docs:build` | **PASS:** live source references and VitePress links/build validate. |
| Temporary register mutations | **R12 gap corroborated:** missing/malformed principles leave both register tests green. |

Initial sandbox attempts encountered denied Vite socket binds/AnyIO test-client
limitations; the docs subprocess gate also failed there. The same gates passed
on the host with reviewed escalation. The initial serial backend run was stopped
and restarted with the repository-supported four-worker configuration; the table
reports only the completed full run. No unrelated failure was “fixed” to obtain
a green gate. The docs gate rewrites a generated string-ledger `scan.json`; that
incidental output was restored to the reviewed commit and is excluded from this PR.

Selected security test-file results extracted from the completed JUnit report:

| Test path | Passed | Skipped |
| --- | ---: | ---: |
| `tests/backend/test_auth_surface.py` | 9 | 0 |
| `tests/backend/test_tenant_isolation.py` | 4 | 0 |
| `tests/backend/test_host_split.py` | 25 | 0 |
| `tests/backend/test_cross_principal_sessions.py` | 11 | 0 |
| `tests/backend/test_invite_oracle.py` | 6 | 0 |
| `tests/backend/test_display_public.py` | 22 | 0 |
| `tests/backend/unit/test_auth_service.py` | 40 | 10 |
| `tests/backend/unit/test_auth_characterization.py` | 16 | 0 |
| `tests/backend/unit/test_baseline_schema.py` | 11 | 11 |
| `tests/backend/unit/test_event_node_identity.py` | 3 | 0 |
| `tests/backend/unit/test_authority_lifecycle.py` | 11 | 0 |
| `tests/backend/unit/test_state_transition_history.py` | 4 | 0 |
| `tests/backend/unit/test_config.py` | 14 | 0 |
| `tests/backend/unit/test_sync_compatibility.py` | 20 | 0 |
| `tests/backend/unit/test_migration_startup.py` | 5 | 0 |
| `tests/backend/test_input_limits.py` | 17 | 0 |
| `tests/backend/test_derived_output_encoding.py` | 22 | 0 |
| `tests/backend/test_money_and_retention.py` | 20 | 0 |
| `tests/backend/unit/test_public_projection_erasure.py` | 2 | 0 |
| `tests/backend/test_health_surface.py` | 26 | 0 |
| `tests/backend/unit/test_recovery_bundle.py` | 4 | 0 |
| `tests/backend/unit/test_backup_scheduler.py` | 3 | 0 |
| `tests/backend/unit/test_postgres_dr_assets.py` | 8 | 0 |
| `tests/backend/unit/test_operational_telemetry.py` | 5 | 0 |
| `tests/backend/unit/test_security_threat_model.py` | 2 | 0 |

### Reproducing the investigative checks

- Enumerate the effective router dependency graph and compare it with
  `PUBLIC_BY_DESIGN`, `OPS_TOKEN_GATED`, and `NODE_CAPABILITY_OPERATIONS` from the
  existing surface/isolation tests; explicitly follow `entrant_or_back_to_form`.
- Iterate `db.models.Base.metadata.tables[*].foreign_key_constraints`, checking
  both source and referenced table scope, not just columns named `token` or
  `tournament_id`. Compare to baseline DDL using `test_baseline_schema.py`.
- Traverse `app.openapi()` successful JSON schemas for every public allowlist
  entry, recursively following `$ref`, `properties`, `items`, unions and
  `additionalProperties`. `{}` schemas and unconstrained map values are gaps.
- For the R2/R4/R10 probe, use `tests/backend/_helpers.py::isolate_test_database`
  with a temporary directory, register an owner, create one tournament/display
  token/viewer invite and a private entry page. Compare issued capabilities with
  ORM storage. Store a synthetic player availability list; clear cookies and GET
  the public display. Register another account; PATCH a random/foreign tournament,
  accept the viewer invite, repeat PATCH, then GET the private page. Compare raw
  response `content` and status, not parsed JSON. Never use a customer database.
- For R5, call `sync.service.begin_checkout` on that isolated local-mode workspace
  and count `AuthorityTransition` rows before/after. The probe needs no real
  signing material or production node.
- For R12, load the existing test module, replace its `MODEL` variable with a
  temporary JSON path, and call both unchanged test functions with principles
  removed, then malformed. The invalid forms and results are recorded under R12.

Local raw execution logs/JUnit/inventories were retained under
`/tmp/shuttleworks-security-2026-09-13/` for this session; that temporary directory
is not a durable release artifact. The durable evidence here is the commands,
source/test paths, counts, exact non-secret response bodies, and findings above.

## Review disposition

**2 PASS, 8 FAIL, 2 NO-TEST.** Passing test gates do not make the golden rules
compliant: some tests deliberately preserve conflicting policy, and other
assertions stop at a shallower boundary than the rule requires. Remediation and
policy decisions remain in `docs/reference/debt-log.md` under SGR-20260913 IDs.
The existing threat entries were left intact; this review's per-principle verdicts
must not be replaced by the older threat-level “mitigated” labels when assessing
these findings. This review does not authorize merging the PR or deploying fixes.
