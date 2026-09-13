# Security and debt remediation program

Approved 2026-09-13. Implementation is in progress. The [dated review](../reviews/security-golden-rules-2026-09-13.md) is an immutable baseline; current residual work remains in the [debt log](debt-log.md).

## Agreed policy

- Latest-version-only before launch; coordinated prototype resets are permitted. No reset or deployment of the shared demo is part of a source-code change.
- Meet and Bracket retain separate engines and write paths. Operations owns the common desk; convergence follows the existing module contracts.
- Staff invites last seven days. Display links end seven days after the event; undated events require an explicit expiry. Tokens are issued once, hashed at rest, renewable and revocable. Staff expiry is implemented with migration 0003 and both-dialect evidence; display expiry and hashed one-time issuance remain in P05.
- App-owned MFA for owner/operator privileges, including individually enrolled offline operators. Session absolute lifetime: 12 hours; idle lifetime: one hour; sensitive-action authentication age: five minutes. Polling is not human activity.
- Retention is finite and purpose-based: organizer selection before entry collection, automatic audited sweeps, manual early erasure, and overdue alerts. Account, event, log and backup lifetimes remain separate.
- CI uses focused blocking contracts; expensive browser, DAST and operational rehearsals run on schedule and before release. Release evidence must match the source revision.
- Existing passing characterizations are changed only when the corresponding behavior change is implemented. Accepted exceptions stay distinct from literal golden-rule PASS.

## Packages and dependencies

Owners name repository responsibilities; the maintainer coordinates delivery. Packages are bounded review units, not permission to rewrite adjacent domains.

| Package | Outcome | Owner | Depends on | Status |
| --- | --- | --- | --- | --- |
| P01 | Reconcile every debt entry | architecture | none | In progress |
| P02 | Shorten CI without losing coverage | release-owner | P01 | In progress |
| P03 | Validate golden-rule evidence | release-owner | none | Implemented; review pending |
| P04 | Uniform resource denial and role vocabulary | identity-module-owner | P03 | In progress |
| P05 | Hash and expire capabilities; redact logs | identity-module-owner / platform-oncall | P03 | In progress |
| P06 | Explicit public projections and bounded inputs | identity-module-owner | P03 | In progress |
| P07 | Edge headers and native nginx checks | platform-oncall | P02 | Implemented; review pending |
| P08 | App-owned MFA, sessions and recovery | identity-module-owner | P04, P05 | Pending |
| P09 | Atomic writes and concurrency | architecture | P03 | In progress |
| P10 | Authority history and key rotation | sync-module-owner | P09 | In progress |
| P11 | Canonical membership and persisted match outcomes | architecture | P09 | Pending |
| P12 | Purpose-based retention and erasure | identity-module-owner | P05, P11 | Pending |
| P13 | Verified release installation and dependency hygiene | release-owner | P02 | In progress |
| P14 | Recovery, mail delivery and operational rehearsals | platform-oncall | P08, P10, P12, P13 | In progress |
| P15 | Multi-day scheduling and solver behavior | scheduler-owner | P11 | Pending |
| P16 | Common Operations desk preserving engine boundaries | console-owner | P11, P15 | Pending |
| P17 | Entrant support and account journeys | entrant-owner | P06, P08, P11 | Pending |
| P18 | Boards, publication and public results | console-owner / entrant-owner | P05, P06, P15 | Pending |
| P19 | Opt-in profiles and additional competition formats | competition-owner | P11, P12, P17 | Pending |
| P20 | Shared generated contracts and dependency boundaries | architecture | P11 | Pending |
| P21 | Performance, streaming and fixture resilience | architecture | P09 | Pending |
| P22 | Accessibility, responsive presentation and design parity | console-owner / entrant-owner | P16, P18 | Pending |
| P23 | Tooling and documentation cleanup | architecture | P01 | In progress |

## Complete source-entry inventory

Each non-Closed section entry is assigned a stable inventory ID below. This includes historical resolutions embedded in those sections: **unreconciled does not mean still defective**. Reconciliation must cite current implementation and executable evidence before changing its disposition. Package routing is provisional triage, subject to source/test reconciliation. Existing debt IDs remain aliases; the inventory ID distinguishes duplicate legacy IDs such as D34 and L1.

| Inventory ID | Source section / original ID | Entry | Package | Disposition |
| --- | --- | --- | --- | --- |
| DL-001 | Security golden-rules verification (2026-09-13) / SGR-20260913-02 / R2 | core/dependencies.py returns role-bearing 403; invite revocation and bracket/protocol routes have different denial/not-found bodies. Existing oracle tests co… | P04 | Partly addressed; see current security review |
| DL-002 | Security golden-rules verification (2026-09-13) / SGR-20260913-03 / R3 | db/models.py::SyncOutbox.operation_id → event_operations.operation_id is the sole single-column intra-tournament-child FK. It inherits tenancy and has no ind… | P04 | Partly addressed; see current security review |
| DL-003 | Security golden-rules verification (2026-09-13) / SGR-20260913-04 / R4 | Raw display_tokens.token and invite_links.id bearer credentials are retrievable repeatedly. Nginx has no redacted log format; local core/email.py logs token-… | P05 | Partly addressed; see current security review |
| DL-004 | Security golden-rules verification (2026-09-13) / SGR-20260913-05 / R5 | sync/service.py::begin_checkout, ensure_local_authority, and receiving checkpoint import create epochs without tournament_authority_transitions. Initial-chec… | P10 | Partly addressed; see current security review |
| DL-005 | Security golden-rules verification (2026-09-13) / SGR-20260913-07 / R7 | Unbounded nested strings in competition EventRequest, director/repair actions, bracket members/labels/discipline, and entry-import partner references; operat… | P06 | Partly addressed; see current security review |
| DL-006 | Security golden-rules verification (2026-09-13) / SGR-20260913-08 / R8 | infra/nginx/lan-tls.conf relies on upstream headers, leaving edge-generated errors uncovered; docs uses a subset. No CI nginx -t step/stub includes exist. | P07 | Repository check implemented; review pending |
| DL-007 | Security golden-rules verification (2026-09-13) / SGR-20260913-09 / R9 | Compose images use mutable tags; TAG=latest renders successfully in release Compose. No deployment admission verifies signatures/provenance. Security workflo… | P13 | Partly addressed; see current security review |
| DL-008 | Security golden-rules verification (2026-09-13) / SGR-20260913-10 / R10 | Six DisplayStateDTO Any fields, untyped bracket config/score and entry disciplineCaps, two reset endpoints without explicit DTOs, public player availability,… | P12 | Partly addressed; see current security review |
| DL-009 | Security golden-rules verification (2026-09-13) / SGR-20260913-11 / R11 NO-TEST | Encryption/unit restore and both recovery alerts pass, but no dated operational restore-drill record was found. infra/postgres/restore-drill.sh only prefligh… | P14 | Partly addressed; see current security review |
| DL-010 | Security golden-rules verification (2026-09-13) / SGR-20260913-12 / R12 NO-TEST | tests/backend/unit/test_security_threat_model.py ignores principles; deleting or corrupting them leaves both tests green. Threat ownership validation already… | P03 | Repository check implemented; review pending |
| DL-011 | Security golden-rules verification (2026-09-13) / SGR-20260913-K1 / R1, R3, R12 | No operator MFA; 30-day absolute session, no idle expiry or reauthentication for export, delete, role change, authority transfer, or display-token issue. SEC… | P08 | Partly addressed; see current security review |
| DL-012 | Security golden-rules verification (2026-09-13) / SGR-20260913-K2 / R4, R12 | Authority-rejection/certificate alerts now exist, but no credential-stuffing/login-failure or privilege-change detection rules were found. Telemetry filterin… | P14 | Unreconciled |
| DL-013 | Security golden-rules verification (2026-09-13) / SGR-20260913-K3 / R4, R5, R12 | No comprehensive secrets inventory or authority signing-key rotation across open epochs. Certificate rotation has a runbook; grant verification still loads o… | P10 | Partly addressed; see current security review |
| DL-014 | Security golden-rules verification (2026-09-13) / SGR-20260913-K4 / R9, R12 | No Dependabot config, explicit CI secret scanning, Semgrep or DAST; CodeQL/dependency/vulnerability/SBOM controls exist. Hosted scanning settings were not in… | P13 | Partly addressed; see current security review |
| DL-015 | Security golden-rules verification (2026-09-13) / SGR-20260913-K5 / R11, R12 | No security incident-response runbook; reporting contact and operational recovery guides do not specify the complete security response. | P14 | Partly addressed; see current security review |
| DL-016 | State-machine v2 review (2026-09-13) / unnumbered | SMV2-1 — Competition is absent from the API import-linter package inventory. | P20 | Unreconciled |
| DL-017 | State-machine v2 review (2026-09-13) / unnumbered | SMV2-2 — Operations still uses done for aggregate booleans, counters, labels, and design tokens. | P16 | Unreconciled |
| DL-018 | State-machine v2 review (2026-09-13) / unnumbered | SMV2-3 — The broad CHECK coverage criterion includes two unplanned lifecycle domains. | P10 | Unreconciled |
| DL-019 | State-machine v2 review (2026-09-13) / unnumbered | SMV2-4 — High dependency advisory resolved for the prototype baseline (2026-09-13). | P13 | Unreconciled |
| DL-020 | Public refinement (2026-09-12) / PR-0912-1 | Entry page-weight budget re-derived 8 → 10 KB | P21 | Unreconciled |
| DL-021 | Public refinement (2026-09-12) / PR-0912-2 | Live running scores need desk data. | P11 | Unreconciled |
| DL-022 | Public refinement (2026-09-12) / PR-0912-3 | Currency on older submissions. | P17 | Unreconciled |
| DL-023 | Public refinement (2026-09-12) / PR-0912-4 | Player directory length on a phone. | P22 | Unreconciled |
| DL-024 | Public refinement (2026-09-12) / PR-0912-5 | Tab strip below 390 px. | P22 | Unreconciled |
| DL-025 | Public refinement (2026-09-12) / PR-0912-6 | Stale cross-reference: | P17 | Unreconciled |
| DL-026 | Operator/public remediation (2026-09-08) / OPR-0908-1 | Dropping the year from seeded titles makes two pairs of demo workspaces share a display name | P18 | Unreconciled |
| DL-027 | Operator/public remediation (2026-09-08) / OPR-0908-2 | The Setup general.name / general.publicName copy of the title cannot be repaired on a checked-out tournament | P10 | Unreconciled |
| DL-028 | Operator/public remediation (2026-09-08) / OPR-0908-4 | Display · Board now shows its title twice | P22 | Unreconciled |
| DL-029 | Operator/public remediation (2026-09-08) / OPR-0908-5 | Raw <input> elements still bypass the design-system TextField | P22 | Unreconciled |
| DL-030 | Operator/public remediation (2026-09-08) / OPR-0908-3 | publicName is written but dead on every read path. | P18 | Unreconciled |
| DL-031 | Operator/public remediation (2026-09-08) / OPR-0908-6 | The operator console cannot link to a public player profile. | P19 | Unreconciled |
| DL-032 | Operator/public remediation (2026-09-08) / OPR-0908-7 | A cross-tournament profile expands at most five other workspaces | P19 | Unreconciled |
| DL-033 | Operator/public remediation (2026-09-08) / OPR-0908-8 | POST /bracket/assign materializes an Operations matches.court_id row, and no API path un-materializes it while keeping the plan assignment. | P16 | Unreconciled |
| DL-034 | Operator/public remediation (2026-09-08) / OPR-0908-9 | Imported people correlate across tournaments by canonical NAME where the roster row carries no personId. | P11 | Unreconciled |
| DL-035 | Operator/public remediation (2026-09-08) / OPR-0908-11 | Closed 2026-09-08, verified on the demo. | P23 | Unreconciled |
| DL-036 | Operator/public remediation (2026-09-08) / OPR-0908-10 | A long single name breaks mid-word on the fullscreen venue board. | P18 | Unreconciled |
| DL-037 | Operator/public remediation (2026-09-08) / OPR-0908-12 | POST /bracket/events/{id}/generate cannot succeed on a workspace whose plan holds assignments for units with unresolved sides. | P11 | Unreconciled |
| DL-038 | Operator/public remediation (2026-09-08) / OPR-0908-13 | Closed 2026-09-08. | P23 | Unreconciled |
| DL-039 | Operator/public remediation (2026-09-08) / OUR-0909-1 | A schedule slot carries no DATE. | P15 | Unreconciled |
| DL-040 | Operator/public remediation (2026-09-08) / OUR-0909-2 | The MEET venue board has no court paging. | P18 | Unreconciled |
| DL-041 | Operator/public remediation (2026-09-08) / OUR-0909-3 | representation is not on the PUBLIC entrant projections. | P06 | Unreconciled |
| DL-042 | Operator/public remediation (2026-09-08) / OUR-0909-4 | Consolation is offered on single elimination only. | P19 | Unreconciled |
| DL-043 | Operator/public remediation (2026-09-08) / OUR-0909-5 | Scoring has two editors for one stored value. | P16 | Unreconciled |
| DL-044 | Operator/public remediation (2026-09-08) / OPR-0908-14 | Closed 2026-09-08. | P23 | Unreconciled |
| DL-045 | Operator/public remediation (2026-09-08) / OPR-0908-15 | Closed 2026-09-08. | P23 | Unreconciled |
| DL-046 | Security remediation (2026-09-07) / SEC-0907-1 | docker-compose.selfhost.yml still defaults TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY to Cloudflare's always-pass test pair | P06 | Unreconciled |
| DL-047 | v3 consolidated plan / V3-1 | Console still has ~90 opacity-N/disabled:opacity-N occurrences outside WP-06's owner-file list | P23 | Unreconciled |
| DL-048 | v3 consolidated plan / V3-2 | apps/console/src/platform/contracts/__tests__/inkContract.test.ts is a curated owner-file allowlist, not a codebase-wide ban. | P23 | Unreconciled |
| DL-049 | v3 consolidated plan / V3-3 | apps/entrant/public/assets/person-ref.js and apps/entrant/app/components/PersonRef.tsx are not actually duplicated "twins" | P11 | Unreconciled |
| DL-050 | Work package 01 — the shared tournament fixture / V3-01-1 | Workspace ids are not deterministic per seed key, and cannot be made so without an API change. | P23 | Unreconciled |
| DL-051 | Work package 01 — the shared tournament fixture / V3-01-2 | A two-court "double current" bracket conflict has no reachable HTTP write path | P23 | Unreconciled |
| DL-052 | Work package 01 — the shared tournament fixture / V3-01-3 | The frozen clock (SHUTTLEWORKS_DEMO_NOW) still has only one product call site | P15 | Unreconciled |
| DL-053 | Work package 01 — the shared tournament fixture / V3-01-4 | T029 (the "live" demo tournament) is checked out to an event-node authority epoch as a side effect of seeding | P10 | Unreconciled |
| DL-054 | Work package 03 — conflict recovery and live counts / V3-03-1 | resolve_court can only resolve a dispute where every claimant is a meet match. | P23 | Unreconciled |
| DL-055 | Work package 03 — conflict recovery and live counts / V3-03-2 | V3-OC18.1 (Plan toolbar internal-engine jargon) only received a minimal fix. | P23 | Unreconciled |
| DL-056 | Work package 03 — conflict recovery and live counts / P2-1 | The Live-day court-dispute card now issues only keep_and_unassign. | P16 | Unreconciled |
| DL-057 | Work package 03 — conflict recovery and live counts / P7-1 | workspaces/setup.py now imports SQLAlchemy directly | P23 | Unreconciled |
| DL-058 | Work package 03 — conflict recovery and live counts / P2-2 | A mixed-engine dispute is resolved by taking a claim off court, not by a recorded resolution. | P16 | Unreconciled |
| DL-059 | Work package 03 — conflict recovery and live counts / V3-03-3 | V3-OC19.2's headline fix is per-surface (Run), not global. | P23 | Unreconciled |
| DL-060 | Work package 04a — public court and schedule projection / V3-04-1 | No literal "Day to be confirmed" group heading exists for a schedule match with no date at all. | P23 | Unreconciled |
| DL-061 | Work package 04a — public court and schedule projection / V3-04-2 | V3-PE09.1's root cause investigation found no live backend defect | P23 | Unreconciled |
| DL-062 | Work package 10 — operator match rows and bracket geometry / V3-10-1 | A bracket doubles pair still resolves to ONE composite PersonRefDTO on the wire, not two stacked persons | P11 | Unreconciled |
| DL-063 | Work package 10 — operator match rows and bracket geometry / V3-10-2 | pending_member is still not populated on the bracket wire. | P23 | Unreconciled |
| DL-064 | Work package 10 — operator match rows and bracket geometry / V3-10-3 | names.ts (names.ts (formerly under apps/console/src/lib/)) is not deleted. | P23 | Unreconciled |
| DL-065 | Work package 10 — operator match rows and bracket geometry / V3-10-4 | modules/operations/opsBlock.ts's meetSide/operationalSide still hand-join names and use the literal 'TBD' sentinel | P23 | Unreconciled |
| DL-066 | Work package 10 — operator match rows and bracket geometry / V3-10-5 | BracketMatchesTab.tsx/MatchesSpreadsheet.tsx cannot fully satisfy match-card §3.1's "one participant per line" stacking | P23 | Unreconciled |
| DL-067 | Work package 10 — operator match rows and bracket geometry / V3-10-6 | Meet has no persisted match outcome independent of the score | P11 | Unreconciled |
| DL-068 | Work package 10 — operator match rows and bracket geometry / V3-11-1 | The entrant wire has no discriminated Side.unresolved (contract §2.1). | P23 | Unreconciled |
| DL-069 | Work package 10 — operator match rows and bracket geometry / V3-11-2 | The backend's short-form round spelling in unresolved-side placeholders ("Winner of R32 1") does not match the long-form round heading ("Round of 32") or the… | P17 | Unreconciled |
| DL-070 | Work package 10 — operator match rows and bracket geometry / V3-11-3 | docs/reference/contracts/match-card.md's aspirational tier-neutral MatchCardData (§2) is not what the entrant wire actually carries | P17 | Unreconciled |
| DL-071 | Work package 07 — typography, spacing and visual states / V3-07-1 | text-3xs (10px) is not fully retired | P23 | Unreconciled |
| DL-072 | Work package 07 — typography, spacing and visual states / V3-07-2 | text-2xs (11px) survives outside the numeric-tabular-data exception in three files this package's scope excludes | P23 | Unreconciled |
| DL-073 | Work package 07 — typography, spacing and visual states / V3-07-3 | Six entrant components still use text-2xs and tracking-[0.08em] | P23 | Unreconciled |
| DL-074 | Work package 07 — typography, spacing and visual states / V3-07-4 | TEXT_MUTED_2XS (apps/console/src/lib/utils.ts) is now a deprecated alias equal to TEXT_MUTED_XS | P23 | Unreconciled |
| DL-075 | Work package 07 — typography, spacing and visual states / V3-07-5 | R3's tone="routine" plain-text path was added to StatusPill/StatusBar and switched at the sites this package touched | P23 | Unreconciled |
| DL-076 | Work package 19 — backups, restore, sync / V3-19-1 | BackupEntryDTO carries matchCount/entryCount but no result count. | P14 | Unreconciled |
| DL-077 | Work package 19 — backups, restore, sync / V3-19-2 | apps/console/src/lib/formatDateTime.ts, the contract §7.3 tournament-timezone-aware formatting authority, does not exist yet | P10 | Unreconciled |
| DL-078 | Work package 20 — activity history readable / V3-20-1 | Field-level diffs are only recorded for setup.updated (section PATCHes) | P23 | Unreconciled |
| DL-079 | Work package 20 — activity history readable / V3-20-2 | _field_label is a generic camelCase/snake_case humanizer, not a curated per-field label map. | P23 | Unreconciled |
| DL-080 | Work package 20 — activity history readable / V3-20-3 | List/object-valued fields (courts, dailySessions, events, contacts) diff as whole-array old/new JSON | P23 | Unreconciled |
| DL-081 | Work package 15 — publication and entrant privacy / V3-15-1 | V3-OC13.2's acceptance also asks for distinct field-validation vs. image-fetch-failure messages | P23 | Unreconciled |
| DL-082 | Work package 13 — finish tournament setup / V3-13-1 | partnerRules (Setup → Entry rules → "Partner instructions") has no reader anywhere. | P06 | Unreconciled |
| DL-083 | Work package 13 — finish tournament setup / V3-13-2 | pointCap (ruling C3) was added only to the Setup rules section document | P23 | Unreconciled |
| DL-084 | Work package 13 — finish tournament setup / V3-13-3 | The out-of-window session conflict (SETUP_DATES_SESSION_OUT_OF_WINDOW, V3-OC07.1) renders as a page-level Notice naming the session, not literally inline nex… | P23 | Unreconciled |
| DL-085 | Work package 16 — venue-board publishing / V3-16-1 | WorkspaceShellSurface.tsx's case 'display-config': switch branch (renders DisplayConfig alone, without SharingTab) is dead code. | P18 | Unreconciled |
| DL-086 | Work package 17 — signage / V3-17-1 | The real venue timezone never reaches the board's wire data. | P18 | Unreconciled |
| DL-087 | Work package 17 — signage / V3-22-1 | The organizer's "report N minutes before their match is called" rule (V3-PE15.1) has no observable reference to bind it to. | P17 | Unreconciled |
| DL-088 | Work package 23 — account, confirmation and reset journeys / V3-23-1 | V3-PE23.2 (Turnstile's "For testing only" widget copy) cannot be retired from this package. | P23 | Unreconciled |
| DL-089 | Work package 23 — account, confirmation and reset journeys / V3-23-2 | tests/e2e/check-account-journeys.py deliberately does NOT re-verify "the old password is refused after a reset" over live HTTP | P17 | Unreconciled |
| DL-090 | Work package 24 — invitations, My entries and receipts / V3-24-1 | The short entry reference (V3-PE39.1 / plan §3 "Short entry reference") is designed here, not implemented. | P17 | Unreconciled |
| DL-091 | Work package 29 — structured sides on the wire / V3-29-1 | Closed 2026-09-08. | P23 | Unreconciled |
| DL-092 | Work package 29 — structured sides on the wire / V3-29-2 | apps/console/src/api/bracketDto.ts still carries the @deprecated side_a/side_b pre-joined fields. | P20 | Unreconciled |
| DL-093 | Work package 30 — short entry reference / V3-30-1 | An organizer cannot look up a quoted entry reference. | P17 | Unreconciled |
| DL-094 | Work package 30 — short entry reference / V3-30-2 | Migrations with row-level SQL are only exercised on SQLite by default. | P23 | Unreconciled |
| DL-095 | Work package 26a — console accessibility and responsive checks / V3-26-1 | tests/e2e/tests/console-a11y.spec.ts's Live-day dispute-block check (plan §6 item "keyboard, focus... errors") is best-effort, not verified against a real co… | P18 | Unreconciled |
| DL-096 | Work package 26a — console accessibility and responsive checks / V3-26-2 | No @axe-core/playwright in the e2e package's installed dependencies (tests/e2e/package.json) | P23 | Unreconciled |
| DL-097 | Work package 26a — console accessibility and responsive checks / V3-26-3 | The target-size and focus-visible contract tests (targetSizeContract.test.ts, focusVisibleContract.test.ts) are regex/heuristic source scans, not a layout en… | P22 | Unreconciled |
| DL-098 | Work package 26b — entrant accessibility and responsive checks / V3-26-4 | The "implicit CSS Grid/flex track defaults to min-width: auto" defect class found and fixed on Discovery, Tournament overview, Schedule and MatchCard (Season… | P23 | Unreconciled |
| DL-099 | Work package 26b — entrant accessibility and responsive checks / V3-26-5 | StatusChip (whitespace-nowrap + shrink-0, by design so a status word never wraps mid-phrase) forces a document-level horizontal scroll at 200% text zoom spec… | P23 | Unreconciled |
| DL-100 | Work package 26b — entrant accessibility and responsive checks / V3-26-6 | No @axe-core/playwright in the e2e package's installed dependencies (tests/e2e/package.json) | P23 | Unreconciled |
| DL-101 | Work package 26b — entrant accessibility and responsive checks / V3-26-7 | The backend's _locality() heuristic (apps/api/src/entries/entries_json.py, added in package 21) can embed a date range and event-code list into the locality … | P23 | Unreconciled |
| DL-102 | Work package 27b — evidence closure and recapture / V3-RT-1 | tests/e2e/tests/console-a11y.spec.ts's "Setup › Dates" surface (three assertions) is gated on getByTestId('setup-strip'), which SetupProduct.tsx only renders… | P21 | Unreconciled |
| DL-103 | Work package 27b — evidence closure and recapture / V3-RT-2 | Plan §7's "Operator sign-in" evidence gap (/ → sign-in form → successful sign-in → workspace hub) cannot be captured through the console's own /login route a… | P21 | Unreconciled |
| DL-104 | Open — needs an owner decision / D34 | Foundation publishes no bold Body or Label text style. | P22 | Unreconciled |
| DL-105 | Open — needs an owner decision / D35 | The public schedule shows "Schedule last updated" and filters on player, court and state. | P23 | Unreconciled |
| DL-106 | Open — needs an owner decision / D38 | Honours detail lost its public surface. | P18 | Unreconciled |
| DL-107 | Open — needs an owner decision / D36 | StatusPill and Select are console-only but live in the shared Figma Foundation. | P22 | Unreconciled |
| DL-108 | Open — needs an owner decision / D3 | The no-cross-product rule reports 16 warnings in three clusters | P20 | Unreconciled |
| DL-109 | Open — needs an owner decision / D4 | The Run nav item is two different surfaces. | P16 | Unreconciled |
| DL-110 | Open — needs an owner decision / D5 | seen_version is optional on POST /bracket/results | P09 | Unreconciled |
| DL-111 | Open — needs an owner decision / D6 | Two conflict dialects for one concept. | P09 | Unreconciled |
| DL-112 | Open — needs an owner decision / D10 | comingSoon keeps retired vocabulary alive in the contract. | P23 | Unreconciled |
| DL-113 | Open — needs an owner decision / D11 | Bracket POST /events/{id}/generate ignores the session solver config | P15 | Unreconciled |
| DL-114 | Open — needs an owner decision / D12 | Self-hosted first-run provisioning is throttled at four operator accounts per hour per IP. | P08 | Unreconciled |
| DL-115 | Open — needs an owner decision / D19 | Meet set-by-set scores do not persist server-side. | P11 | Unreconciled |
| DL-116 | Open — needs an owner decision / D14 | Should a scheduled — not per-PR — entrant e2e job exist? | P23 | Unreconciled |
| DL-117 | Open — needs an owner decision / D15 | --status-started (sky) reads as interactive next to the azure accent, and --module-meet is the accent hex. | P23 | Unreconciled |
| DL-118 | Open — needs an owner decision / D16 | The ready / live / complete Overview panels are minimal. | P16 | Unreconciled |
| DL-119 | Open — needs an owner decision / D21 | knip's 18 unused exported DTO types in the entrant tier want a policy call, not per-type deletion. | P20 | Unreconciled |
| DL-120 | Open — needs an owner decision / D22 | adopt_or_mint never updates gender on adoption. | P11 | Unreconciled |
| DL-121 | Open — needs an owner decision / D23 | The entrant tier's standings row is hand-written by necessity, and closing that needs a home for generated types. | P18 | Unreconciled |
| DL-122 | Open — needs an owner decision / D17 | An irreversible, backup-less delete of user data runs unattended at startup. | P14 | Implementation verified; see reconciled source entry; review pending |
| DL-123 | Open — needs an owner decision / D24 | A published draw's public URL can be silently re-keyed. | P18 | Unreconciled |
| DL-124 | Open — needs an owner decision / D25 | Bracket creation and cold hydration serialize two fields differently. | P23 | Unreconciled |
| DL-125 | Open — needs an owner decision / D26 | Global PlayerProfile v1 is blocked on an owner decision. | P19 | Unreconciled |
| DL-126 | Open — needs an owner decision / D27 | Meet roster normalization remains blob-backed. | P11 | Unreconciled |
| DL-127 | Open — needs an owner decision / D28 | Transactional email delivery is not production-proven. | P14 | Unreconciled |
| DL-128 | Open — needs an owner decision / D29 | Entrant identity polish remains deferred. | P23 | Unreconciled |
| DL-129 | Open — needs an owner decision / D30 | Compass/Monrad plate winners are not projected publicly. | P18 | Unreconciled |
| DL-130 | Open — needs an owner decision / D31 | docker-compose.release.yml is not the canonical production shape. | P13 | Unreconciled |
| DL-131 | Open — needs an owner decision / D32 | docker-compose.release.yml still references mutable image tags (default latest) rather than immutable digests. | P13 | Implementation verified; see reconciled source entry; review pending |
| DL-132 | Open — needs an owner decision / D33 | CI parses the demo configuration but does not run its backup/restore lifecycle. | P14 | Unreconciled |
| DL-133 | Open — genuinely large / L1 | GDPR tooling — the ENTRANT half is done (E5, 2026-08-22); the OPERATOR half is not. | P12 | Unreconciled |
| DL-134 | Open — genuinely large / L2 | upsert_data's compare-and-swap is identity-map-scoped, so it does not detect a cross-session concurrent write. | P09 | Implementation verified; see reconciled source entry; review pending |
| DL-135 | Open — genuinely large / L3 | DESIGN.md still enforces the retired brutalist direction. | P23 | Unreconciled |
| DL-136 | Open — genuinely large / L4 | 50 raw <input> elements remain outside TextField | P22 | Unreconciled |
| DL-137 | Open — genuinely large / L5 | Viewer read-only vocabulary — the surfaces that still render enabled and then no-op. | P22 | Unreconciled |
| DL-138 | Open — genuinely large / L6 | The documented remote worker is not deployed. | P14 | Unreconciled |
| DL-139 | Open — small and unscheduled / unnumbered | Audit follow-up: checked-out cloud publication still needs a real node/cloud convergence rehearsal. | P14 | Unreconciled |
| DL-140 | Open — small and unscheduled / unnumbered | Meet and Bracket queues duplicate IndexedDB plumbing. | P20 | Unreconciled |
| DL-141 | Open — small and unscheduled / unnumbered | Console export surface needs a consumer audit. | P23 | Unreconciled |
| DL-142 | Open — small and unscheduled / unnumbered | Working records still compete with current documentation. | P23 | Unreconciled |
| DL-143 | Open — small and unscheduled / unnumbered | The surface-book profile still names the Settings section "Administration". | P23 | Unreconciled |
| DL-144 | Open — small and unscheduled / unnumbered | A swiss draw's match reference uses elimination stage names on both tiers. | P17 | Unreconciled |
| DL-145 | Open — small and unscheduled / unnumbered | The public tier's SSR clock and the shared fixture's clock are different clocks. | P15 | Unreconciled |
| DL-146 | Open — small and unscheduled / unnumbered | tools/fixture-up.sh's account-journey check throttles itself on a cold database. | P17 | Unreconciled |
| DL-147 | Open — small and unscheduled / unnumbered | The regulations reader prints an authored document's first line twice. | P23 | Unreconciled |
| DL-148 | Open — small and unscheduled / unnumbered | No fixture ships a draw smaller than 32. | P21 | Unreconciled |
| DL-149 | Open — small and unscheduled / unnumbered | make fixture-down leaves the fixture's servers running, and the next fixture-up silently uses them. | P21 | Unreconciled |
| DL-150 | Open — small and unscheduled / unnumbered | Staff contact public field is now inert everywhere but the schema. | P23 | Unreconciled |
| DL-151 | Open — small and unscheduled / unnumbered | Partner-invite delivery failure has no entrant-facing recovery path. | P17 | Unreconciled |
| DL-152 | Open — small and unscheduled / unnumbered | D34 — production's backup commands remain prose, while the demo owns executable recovery tooling. | P14 | Unreconciled |
| DL-153 | Open — small and unscheduled / unnumbered | GET /tournaments/{id}/state recomputes meet standings per call | P18 | Unreconciled |
| DL-154 | Open — small and unscheduled / unnumbered | Bracket writes advance state_version without returning it. | P23 | Unreconciled |
| DL-155 | Open — small and unscheduled / unnumbered | A worker that loses its lease keeps solving to completion. | P21 | Unreconciled |
| DL-156 | Open — small and unscheduled / unnumbered | Nothing enforces "a streaming generator must not touch the repository". | P21 | Unreconciled |
| DL-157 | Open — small and unscheduled / unnumbered | A tournament has no end date, so the public calendar's "window" is one day. | P15 | Unreconciled |
| DL-158 | Open — small and unscheduled / unnumbered | SeasonRowDTO.status is a plain str. | P20 | Unreconciled |
| DL-159 | Open — small and unscheduled / unnumbered | DisplayStateDTO declares its key set but not its member types. | P06 | Implementation verified; see reconciled source entry; review pending |
| DL-160 | Open — small and unscheduled / unnumbered | ParticipantIn has no meta, so POST /bracket cannot carry sourceEntryId. | P23 | Unreconciled |
| DL-161 | Open — small and unscheduled / unnumbered | The FK drift test cannot compare ondelete, and covers ENTRIES_TABLES only. | P11 | Unreconciled |
| DL-162 | Open — small and unscheduled / unnumbered | The commit seam recognises "this human is already in the draw" by participant id only. | P23 | Unreconciled |
| DL-163 | Open — small and unscheduled / unnumbered | Every Entries adoption writes a keyed column under an unkeyed roster-blob row. | P11 | Unreconciled |
| DL-164 | Open — small and unscheduled / unnumbered | A person-refusal still leaves an orphan roster-blob row, and committed_player_id points at it. | P11 | Unreconciled |
| DL-165 | Open — small and unscheduled / unnumbered | A seam-built team name can exceed MAX_NAME, and the console cannot re-save the draw if it does. | P23 | Unreconciled |
| DL-166 | Open — small and unscheduled / unnumbered | /health/metrics is a full-table aggregate | P21 | Unreconciled |
| DL-167 | Open — small and unscheduled / unnumbered | A bracket command id is a global key, not a tenant-scoped one. | P09 | Unreconciled |
| DL-168 | Open — small and unscheduled / unnumbered | tournaments.status has no authority in code for its allowed set, so it could not be constrained with the other four. | P10 | Unreconciled |
| DL-169 | Open — small and unscheduled / unnumbered | Alembic revision ids have reached z0f5a1b3c9d2 and the single-letter prefix scheme is exhausted. | P23 | Unreconciled |
| DL-170 | Open — small and unscheduled / unnumbered | The migration schema snapshot covers the four rebuilt tables only, not the child tables whose FKs point into them. | P11 | Unreconciled |
| DL-171 | Open — small and unscheduled / unnumbered | MatchRepository.set_status still admits a raw string for a column the schema now CHECKs. | P23 | Unreconciled |
| DL-172 | Open — small and unscheduled / unnumbered | The code-field pin is repo-wide, and any unrelated future code will red it with a message that reads as a non-sequitur. | P06 | Unreconciled |
| DL-173 | Open — small and unscheduled / unnumbered | tournaments.kind carries a server default in the migration-built schema and only a Python-side default in the models — a create_all-vs-migration divergence, … | P23 | Unreconciled |
| DL-174 | Open — small and unscheduled / unnumbered | derive_modules(kind: Optional[str]) still tolerates a None kind the schema can no longer store. | P23 | Unreconciled |
| DL-175 | Open — small and unscheduled / unnumbered | The signed-in header shows the state, not the name. | P17 | Unreconciled |
| DL-176 | Open — small and unscheduled / unnumbered | The /e/ NOW strip omits the player count, because no public person-count projection exists. | P06 | Unreconciled |
| DL-177 | Open — small and unscheduled / unnumbered | Duplicate-person review has a flag and no resolver. | P11 | Unreconciled |
| DL-178 | Open — small and unscheduled / unnumbered | Partner acceptance still skips the OTHER two advisories the entry form applies. | P17 | Unreconciled |
| DL-179 | Open — small and unscheduled / unnumbered | POST /e/api/quote/{slug} echoes the whole posted body into its 303 Location, so entrant PII lands in a URL. | P23 | Unreconciled |
| DL-180 | Open — small and unscheduled / unnumbered | A THROTTLED entrant sign-in still paints raw JSON. | P23 | Unreconciled |
| DL-181 | Open — small and unscheduled / unnumbered | The entrant tier derives its own public origin from the client's Host header | P06 | Unreconciled |
| DL-182 | Open — small and unscheduled / unnumbered | The CSRF compare_digest comparison is duplicated | P23 | Unreconciled |
| DL-183 | Open — small and unscheduled / unnumbered | The receipt page is unverified. | P17 | Unreconciled |
| DL-184 | Open — small and unscheduled / unnumbered | find_for_account has zero production callers. | P23 | Unreconciled |
| DL-185 | Open — small and unscheduled / unnumbered | No CI guard for sport nouns in product copy (I1 domain-as-configuration). | P23 | Unreconciled |
| DL-186 | Open — small and unscheduled / unnumbered | Public player detail answers 422, not the uniform 404, for non-UUID keys. | P04 | Unreconciled |
| DL-187 | Open — small and unscheduled / unnumbered | Overview "Players entered" sums Entries-flow entryCount, which is 0 for imported tournaments whose Players tab lists hundreds. | P23 | Unreconciled |
| DL-188 | Open — small and unscheduled / unnumbered | Entry page renders "Sign out" unconditionally. | P17 | Unreconciled |
| DL-189 | Open — small and unscheduled / unnumbered | Operations' complete lifecycle matrix still has consumers outside the two SP-OPCON-1 gates. | P16 | Unreconciled |
| DL-190 | Open — small and unscheduled / unnumbered | useBracketDisplaySync still cannot see a revoked token. | P05 | Unreconciled |
| DL-191 | Open — small and unscheduled / unnumbered | The bracket person key is double-stored; the two copies are now asserted to agree, and a backfill still owes the blob. | P11 | Unreconciled |
| DL-192 | Open — small and unscheduled / unnumbered | The doubles participant picker has no remove/unpair affordance, and P5 took away the escape hatch. | P23 | Unreconciled |
| DL-193 | Open — small and unscheduled / unnumbered | commitPicks emits members: undefined rather than omitting the key. | P23 | Unreconciled |
| DL-194 | Open — small and unscheduled / unnumbered | PickedPair.members was widened to string[] / undefined, losing the compile-time exactly-two invariant. | P23 | Unreconciled |
| DL-195 | Open — small and unscheduled / unnumbered | A pre-roster-blob doubles-ONLY draw now migrates to an EMPTY roster. | P11 | Unreconciled |
| DL-196 | Open — small and unscheduled / unnumbered | DrawView.tsx renders a raw member id as a card line when the name map misses. | P23 | Unreconciled |
| DL-197 | Open — small and unscheduled / unnumbered | bracketDto.ts::Participant declares entryPlayerId but not sourceEntryId. | P20 | Unreconciled |
| DL-198 | Open — small and unscheduled / unnumbered | The Venue & schedule lock signal is meet-only. | P23 | Unreconciled |
| DL-199 | Open — small and unscheduled / unnumbered | Hard-lock read-only is visual, not semantic. | P22 | Unreconciled |
| DL-200 | Open — small and unscheduled / unnumbered | OverflowMenu disabled items still close the menu. | P23 | Unreconciled |
| DL-201 | Open — small and unscheduled / unnumbered | MatchesSpreadsheet.tsx is 430 lines against DESIGN.md's 300 limit | P23 | Unreconciled |
| DL-202 | Open — small and unscheduled / unnumbered | BracketDrawsTab.tsx is 1028 lines and BracketMatchDetailPanel.tsx 355 | P23 | Unreconciled |
| DL-203 | Open — small and unscheduled / unnumbered | A read-only Configuration cannot be read. | P22 | Unreconciled |
| DL-204 | Open — small and unscheduled / unnumbered | Eyebrow uppercases its text in JS as well as in CSS | P23 | Unreconciled |
| DL-205 | Open — small and unscheduled / unnumbered | The shell identity bar can disagree with the Overview about a workspace's name | P23 | Unreconciled |
| DL-206 | Open — small and unscheduled / unnumbered | The Hub's module glyphs have no legend for a sighted touch user. | P23 | Unreconciled |
| DL-207 | Open — small and unscheduled / unnumbered | Overview rail has no "last backup" row. | P14 | Unreconciled |
| DL-208 | Open — small and unscheduled / unnumbered | minContentWidth={760} on BracketDrawsTab is a hand-summed magic number | P23 | Unreconciled |
| DL-209 | Open — small and unscheduled / unnumbered | Gantt header time-labels may bleed | P23 | Unreconciled |
| DL-210 | Open — small and unscheduled / unnumbered | Standings and columns use different court-count bases. | P18 | Unreconciled |
| DL-211 | Open — small and unscheduled / unnumbered | Design-polish residuals | P23 | Unreconciled |
| DL-212 | Open — small and unscheduled / unnumbered | Cosmetic shortlist | P22 | Unreconciled |
| DL-213 | Open — small and unscheduled / unnumbered | Cleanup shortlist | P23 | Unreconciled |
| DL-214 | Open — small and unscheduled / unnumbered | Schema-vs-model drift is unchecked, and we know it exists. | P11 | Unreconciled |
| DL-215 | Open — small and unscheduled / unnumbered | docs:freshness tracked globs are too coarse. | P23 | Unreconciled |
| DL-216 | Open — small and unscheduled / unnumbered | VitePress docs don't yet cover SP-CLOUD-2 | P23 | Unreconciled |
| DL-217 | Open — small and unscheduled / unnumbered | Engine coverage tail | P23 | Unreconciled |
| DL-218 | Open — small and unscheduled / unnumbered | Frontend complexity is unmeasured | P23 | Unreconciled |
| DL-219 | Open — small and unscheduled / unnumbered | The operator SPA autosaves the state blob and re-normalizes seam-written data | P23 | Unreconciled |
| DL-220 | Open — small and unscheduled / unnumbered | packages/design-system/scripts/check-classes.mjs scans a path that no longer exists | P23 | Unreconciled |
| DL-221 | Open — small and unscheduled / unnumbered | The public display board overflows 390px horizontally by ~143px | P18 | Unreconciled |
| DL-222 | Open — small and unscheduled / unnumbered | Rows are never deleted. | P12 | Unreconciled |
| DL-223 | Open — small and unscheduled / unnumbered | The key is the primary key and it is plaintext. | P12 | Unreconciled |
| DL-224 | Open — small and unscheduled / unnumbered | A dev database can be stamped PAST a migration it never ran, and nothing notices. | P23 | Unreconciled |
| DL-225 | Open — small and unscheduled / unnumbered | uv.lock has no consumer anywhere in the tree. | P23 | Unreconciled |
| DL-226 | Open — small and unscheduled / unnumbered | The backend suite's sys.path insert can be demoted to config, and was not. | P23 | Unreconciled |
| DL-227 | Open — small and unscheduled / unnumbered | L1 — apps/api/src/core/form_csrf.py:161 imports identity.auth from inside a function. | P23 | Unreconciled |
| DL-228 | Open — small and unscheduled / unnumbered | L2 — apps/api/src/repositories/local.py:2350 imports operations.match_state from inside a method. | P23 | Unreconciled |
| DL-229 | Open — small and unscheduled / unnumbered | apps/api/src/solve_rail/solve_child.py imports meet.schedule. | P23 | Unreconciled |
| DL-230 | Open — small and unscheduled / unnumbered | Five modules are imported by three or more domains but are filed under one. | P23 | Unreconciled |
| DL-231 | Open — small and unscheduled / unnumbered | make generate-api exits 2 on Windows even when generation succeeds. | P23 | Unreconciled |
| DL-232 | Open — small and unscheduled / unnumbered | npm audit debt (verified 2026-09-03). | P13 | Unreconciled |
| DL-233 | Open — small and unscheduled / unnumbered | F-DM-28a — PlayerDTO.status / withdrawalReason / withdrawnAt are hand-only fields the backend refuses. | P20 | Unreconciled |
| DL-234 | Open — small and unscheduled / unnumbered | F-DM-28b — MatchStateDTO carries 9 hand-only fields. | P20 | Unreconciled |
| DL-235 | Open — small and unscheduled / unnumbered | F-DM-29 — four singletons on the same ratchet | P23 | Unreconciled |
| DL-236 | Open — small and unscheduled / unnumbered | Keys only is the oracle's ceiling, by ruling. | P23 | Unreconciled |
| DL-237 | Open — small and unscheduled / unnumbered | The allow-list is shared by both tiers and has no tier discriminator. | P23 | Unreconciled |
| DL-238 | Open — small and unscheduled / unnumbered | make generate-api calls bare python | P23 | Unreconciled |
| DL-239 | Open — small and unscheduled / unnumbered | apps/console/knip.json pins its $schema to knip@5 | P23 | Unreconciled |
| DL-240 | Open — small and unscheduled / unnumbered | F-DM-55 — match_states stores its timestamps as String, so time is not comparable in SQL on the Meet operational path. | P23 | Unreconciled |
| DL-241 | Open — small and unscheduled / unnumbered | F-DM-21 — Match.playerIds carries no source discriminator, so the double-booking guard cannot see a cross-namespace human. | P23 | Unreconciled |
| DL-242 | Open — small and unscheduled / unnumbered | F-DM-42 — the entrant tier models no submission type. | P23 | Unreconciled |
| DL-243 | Open — small and unscheduled / unnumbered | F-DM-47 — TournamentStatus / WorkspaceStatus are twins, and closing them is blocked on a direction ruling. | P23 | Unreconciled |
| DL-244 | Open — small and unscheduled / unnumbered | F-DM-50 — 11 wire-adjacent types are declared only in apps/console/src/api/client.ts, with no backend mirror and no oracle. | P20 | Unreconciled |
| DL-245 | Open — small and unscheduled / unnumbered | F-DM-51 — three hand-kept entry_pages views. | P23 | Unreconciled |
| DL-246 | Open — small and unscheduled / unnumbered | F-DM-56 — three operator-identity pointers carry no FK. | P11 | Unreconciled |
| DL-247 | Open — small and unscheduled / unnumbered | entry_events.meet_event_id is written only at creation, so IS NULL does not mean "unmapped". | P23 | Unreconciled |
| DL-248 | Open — small and unscheduled / unnumbered | Unassigned is a group name with product meaning and nothing reserves it. | P23 | Unreconciled |
| DL-249 | Open — small and unscheduled / unnumbered | A workspace already at MAX_GROUPS with no Unassigned row leaves a committed entrant pointing at a group that does not exist. | P23 | Unreconciled |
| DL-250 | Open — small and unscheduled / unnumbered | MeetEvent.slot_count has a Python-side default in the model and a server default in the migration | P23 | Unreconciled |
| DL-251 | Open — small and unscheduled / unnumbered | Deleting a division code and re-adding it loses any curated label. | P06 | Unreconciled |
| DL-252 | Open — small and unscheduled / unnumbered | The P7b backfill materialises every workspace blob in one pass. | P23 | Unreconciled |
| DL-253 | Open — small and unscheduled / unnumbered | apps/console/src/modules/entries/__tests__/entryDisplay.test.ts iterates a HARDCODED list of skip reasons | P18 | Unreconciled |
| DL-254 | Recorded deliberately — not defects, not scheduled / unnumbered | The public entrant origin trusts challenges.cloudflare.com on /e/signup, and only there. | P23 | Unreconciled |
| DL-255 | Recorded deliberately — not defects, not scheduled / unnumbered | No in-product off-site durability in local mode. | P23 | Unreconciled |
| DL-256 | Recorded deliberately — not defects, not scheduled / unnumbered | The entrant tier has no password-visibility affordance, deliberately. | P23 | Unreconciled |
| DL-257 | Recorded deliberately — not defects, not scheduled / unnumbered | The CSRF form channel depends on a Starlette internal. | P23 | Unreconciled |
| DL-258 | Recorded deliberately — not defects, not scheduled / unnumbered | bracket_results.reason is not mirrored anywhere | P06 | Unreconciled |
| DL-259 | Recorded deliberately — not defects, not scheduled / unnumbered | StandingRow's counter fields are optional in the OpenAPI schema and required in TypeScript — and that is correct. | P23 | Unreconciled |
| DL-260 | Recorded deliberately — not defects, not scheduled / unnumbered | DISPLAY_PRESETS / getPreset / DisplayPreset | P18 | Unreconciled |
| DL-261 | Recorded deliberately — not defects, not scheduled / unnumbered | slotToTime / formatSlotTime | P23 | Unreconciled |
| DL-262 | Recorded deliberately — not defects, not scheduled / unnumbered | 8 dto types read "unused" to knip and are kept on purpose | P20 | Unreconciled |
| DL-263 | Recorded deliberately — not defects, not scheduled / unnumbered | Grid-mode column default is responsive on the real board. | P18 | Unreconciled |
| DL-264 | Recorded deliberately — not defects, not scheduled / unnumbered | F-DM-44, F-DM-52 and F-DM-58 were considered by SP-DM-3 P9 and REFUSED as no-ops | P23 | Unreconciled |
| DL-265 | Recorded deliberately — not defects, not scheduled / unnumbered | meet_events.slot_count deliberately has NO CHECK (slot_count >= 0) | P23 | Unreconciled |
| DL-266 | Recorded deliberately — not defects, not scheduled / unnumbered | tournaments.kind is create-time immutable, so a bracket-born workspace can never publish as a meet. | P13 | Unreconciled |
| DL-267 | Recorded deliberately — not defects, not scheduled / unnumbered | test_entries_migration.py's downgrade control asserts containment where equality would hold. | P23 | Unreconciled |
| DL-268 | Open incident / unnumbered | 2026-08-11 · 118 × HTTP 500 under ordinary concurrency — unexplained, not reproduced, OPEN. | P09 | Unreconciled |

## Acceptance and evidence

Every implementation package records focused checks and negative controls for safety properties. Before release: full backend SQLite/Postgres suites; both frontend suites and builds; schema/contracts; native nginx/Collector/Prometheus validation; offline enrollment and reconnection; isolated DAST; encrypted recovery and incident-tabletop evidence; then a fresh twelve-rule review. No operational rehearsal is marked complete from a script merely existing.

### Current implementation evidence

- P03: 18 register tests pass, including deletion, duplication, malformed evidence, missing files and unsupported PASS negative controls. Remaining rule gaps are still open.
- Reconciliation observations: tournament end date and display-summary timezone already exist; baseline-schema coverage already compares all tables and FK deletion behavior. Older rows require narrowing against those implementations.
- P02 baseline: duplicate push/PR runs exist for the same source SHA; completed CI runs for 61201017 took approximately 38 and 42 minutes. The root and tests/e2e npm installs use distinct lockfiles and are both required.

The [implementation evidence](../reviews/security-remediation-2026-09-13.md)
records changes and residual security gaps. P03/P07 repository checks are
implemented, but independent review and hosted CI remain required. Other packages
are incomplete; this branch is the first delivery, not closure of the program.
Repository CAS complexity fell from 21 to 18 after replacing the cached version
comparison with an atomic database update; the stale-session test failed before
the fix and passed after it.

P23 tooling: the documentation scanner accepts `--output`; its tests use a temporary
directory and no longer rewrite the tracked ledger. Other P23 work remains open.
