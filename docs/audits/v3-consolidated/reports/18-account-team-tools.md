# Work package 18 — finish account, team, tools and settings

Plan: `docs/audits/v3-consolidated/plan.md` §3 X12 (locked forms hide Save,
show the action the operator can take), X16; §4 rows "Destructive/recovery
copy", "Errors", "Empty states"; §7 "Evidence that must still be obtained"
(operator sign-in; account security/session actions; actual tool/guard
behavior). Findings routed here: V3-OC04.1, V3-OC25.1, V3-OC29.1, V3-OC30.1
(full fix), OC01 (evidence-only, no numbered defect), V3-OC26.1 (verify only
— already fully applied by package 05). Builds on package 05 (module-disable
copy, mail wrappers returning bool) and package 08 (`FormActions` locked
state; V3-OC04.1's disabled-Save-with-no-reason already fixed there, this
package finishes the reorder).

Baseline: repo HEAD `ba700fd8` at session start; branch
`feat/surface-book-remediation` (shared with many concurrently-running
packages — see "Concurrency" below). Not committed per instructions.

## Scope actually touched

- `apps/console/src/modules/settings/GlobalSettingsPage.tsx` — `ProfilePage`
  locked-state reorder (V3-OC04.1).
- `apps/console/src/modules/settings/SharingTab.tsx` — invitation heading,
  empty-state copy, and capability-gated delivery-mode picker (V3-OC25.1).
- `apps/console/src/modules/settings/GeneralSettingsTab.tsx` — status label,
  archive footnote, shared date formatter (V3-OC29.1).
- `apps/console/src/app/workspace/ModuleUnavailablePanel.tsx` — unavailable-
  reason title, reason copy, and button label (V3-OC30.1).
- `apps/api/src/identity/auth_routes.py` — new `UserDTO.emailConfigured`
  field, wired in both `_user_dto` and `/auth/me`'s bootstrap-identity
  fallback.
- `apps/console/src/api/dto.ts` (hand-reconciled) + regenerated
  `dto.generated.ts` via `make generate-api` (byte-identical to what was
  already committed at HEAD — see "Notes" below).
- Tests: `GlobalSettingsPage.test.tsx`, `SharingTab.test.tsx`,
  `GeneralSettingsTab.test.tsx`, new `DangerZoneTab.test.tsx`,
  `ModuleUnavailablePanel.test.tsx`, `AppShell.guard.test.tsx` (comment only),
  `LoginPage.test.tsx`, `tests/backend/test_auth_endpoints.py`.
- `docs/audits/v3-consolidated/ledger/18-strings.md` (new).

**Read, verified against backend, left unchanged:**
- `apps/console/src/modules/settings/DangerZoneTab.tsx` — archive/delete
  copy already states what changes, what is retained, and reversibility
  accurately (see per-finding evidence below); added a test file to lock it
  rather than editing the component.
- `apps/console/src/modules/settings/ModulesSettingsTab.tsx` +
  `ModuleCatalogRow.tsx` — V3-OC26.1 fully applied by package 05 (verified:
  no "Clear its data before disabling it" text remains; row/modal state one
  truthful, state-dependent consequence).
- `apps/console/src/platform/auth/LoginPage.tsx` — already renders a
  truthful, real sign-in form for both auth modes; only added test coverage
  for the local-mode/session-present redirect path that had none.
- `apps/api/src/identity/invites.py`, `apps/api/src/workspaces/tournaments.py`
  (invite-creation route, `delete_tournament`), `apps/api/src/core/email.py`,
  `apps/api/src/core/tournament_phase.py` — read to verify the invitation
  and archive/delete claims; not modified.

**Explicitly not touched** (other agents' concurrent scope, per the
task's exclusion list): `ActivityTab.tsx`, `SyncBackupsTab.tsx`,
`SyncReconciliationPanel.tsx`, `PublicationSettings.tsx`,
`apps/console/src/modules/setup/**`, the entrant tier, bracket/meet rows.

## Per-finding acceptance

### V3-OC04.1 — Local profile

Acceptance: "In this local-operator state the first actionable control is
sign-in, and unavailable edits are visibly explained."

Before: the locked note ("Profile editing unlocks once you sign in…") and
its sign-in link sat *below* the read-only avatar and fields — the page's
apparent first task was reading/editing a form, with the real next step
(sign in) buried at the bottom. Package 08 already hid the dead "Save
changes" button for this state (its report explicitly deferred the
reorder to this package).

After: a lead block — "Sign in with an account to edit your profile." plus
a "Sign in" link to `/login` — renders immediately under the page header,
before the avatar and the disabled fields. Evidence:
`GlobalSettingsPage.test.tsx`'s `V3-OC04.1` describe block asserts the
prompt precedes the "Full name" field via
`Node.compareDocumentPosition`, and that Save/Change-photo stay absent.

### V3-OC25.1 — Team access

Acceptance: "Action, helper, and empty-state labels match the chosen
invitation delivery method."

Before: the section eyebrow said "COLLABORATOR INVITES" while the empty
list said "No invite links yet." regardless of the selected delivery mode,
and the mode picker (email vs. link) was offered unconditionally even
though local mode's email backend (`core/email.py`'s `console` backend)
only logs the message — no operator anywhere ever receives it.

After:
- Eyebrow renamed to "INVITATIONS".
- Empty-state text now follows the selected mode: "No invitations sent
  yet." (email) / "No invitation links created yet." (link).
- The delivery-mode radio choice itself is now gated on a real backend
  capability: `authMode === 'cloud' && user.emailConfigured`. Local mode
  and cloud mode without SMTP configured render link-only, with no picker
  to reconcile against a delivery method that cannot happen.
- New backend field `UserDTO.emailConfigured` (`settings.email_backend ==
  "smtp"`) makes this capability visible to the console; verified with
  `test_email_configured_reflects_the_real_delivery_backend`
  (monkeypatches `email_backend` between `console`/`smtp` and checks
  `/auth/me`).

Evidence: `SharingTab.test.tsx`'s new `V3-OC25.1` describe block covers
all three capability states (local, cloud without mail, cloud with mail)
plus the heading rename.

### V3-OC29.1 — Workspace settings

Acceptance: "The section uses the same date and status conventions as
Overview; the archive and delete consequences remain distinct."

Before: `GeneralSettingsTab.tsx` labeled the derived-state row "Lifecycle",
said "To retire the workspace, use Archive below," and rendered
`tournamentDate` as a raw ISO string.

After: label is "Tournament status"; footnote is "Archive this workspace
to remove it from the active list."; the date renders through the shared
`formatDateTime(date, 'date_with_year')` formatter (new file
`apps/console/src/lib/formatDateTime.ts` — the plan's X6 formatter, not
previously used from this surface).

`DangerZoneTab.tsx`'s archive/delete copy was verified against the backend
rather than changed:
- Delete: `TournamentsRepo.delete` (`apps/api/src/repositories/local.py:
  305-312`) cascades `match_states` + `tournament_backups` + `members` +
  `invite_links` via FK `ondelete='CASCADE'` — matching "Permanently
  removes the workspace, its members, invites, and all data. Can't be
  undone." exactly, and already pinned server-side by
  `tests/backend/test_tournaments.py::test_delete_cascades_backups`.
- Archive: no route anywhere gates public display or member access on
  `status == 'archived'` — the only place `archived` is read is
  `apps/api/src/core/tournament_phase.py:65`, purely for the derived
  lifecycle label. "Hide it from the active list. Unarchive any time." is
  the whole truth; the copy correctly implies no other effect and full
  reversibility. New `DangerZoneTab.test.tsx` locks this (asserts the
  archive row's text says nothing about public/member effects, and that
  the delete confirmation modal repeats the same consequence sentence
  the row states).

### V3-OC30.1 — Entries unavailable

Acceptance: "The explanation and button name the same destination and
that destination offers a useful next step."

Before: `resolveActivePane` (`AppShell.tsx`) already special-cased
`onGoToPrimary` to navigate to `/administration/modules` when
`reason === 'unavailable'` — but `ModuleUnavailablePanel`'s button label
still read "Go to {primaryLabel}" (e.g. "Go to Setup · General"), and the
reason copy separately told the operator to "Open Administration ·
Modules" — two different destinations named in the same panel, only one
of which the button actually visited.

After:
- Title, for this reason only: "{label} isn't available for this
  tournament type" (was the generic "…isn't available in this
  workspace").
- Reason copy shortened to state only the fact ("This workspace type does
  not include this module."), no longer naming a navigation destination
  itself — the button is now the one place that does.
- Button label, for this reason only: "View available tools" (routes to
  Administration · Modules, matching what `onGoToPrimary` already did).

Evidence: new case in `ModuleUnavailablePanel.test.tsx` asserts the
"Setup · General" label never appears as a button name in this state, and
that clicking "View available tools" invokes `onGoToPrimary`.
`AppShell.guard.test.tsx`'s logic-level assertions were unaffected (no
behavior change to `resolveActivePane`); one stale comment corrected.

### V3-OC26.1 — Tool availability and data consequences (verify only)

Acceptance: "The displayed consequence, confirmation, and actual disable
behavior agree; preservation and deletion are never implied
simultaneously." Fully applied in package 05 (`05-false-claims.md`): the
`blockedReason` instructing operators to "Clear its data before disabling
it" was removed from `ModulesSettingsTab.tsx`; `ModuleCatalogRow.tsx`'s
row/modal state one truthful, state-dependent consequence with no
"ownership" jargon. Re-verified here by reading current source — no
regression.

### OC01 — Operator sign-in (evidence gap, plan §7)

Not a numbered finding — plan.md §6 lists it only as an
"Evidence/state coverage" gap ("Workspaces shown; sign-in not reached").
Verified both states render truthfully:
- **Local mode**: `LoginPage`'s `if (session) return <Navigate .../>` means
  the bootstrap session (always present locally) never sees the sign-in
  wall — new test locks this.
- **Cloud mode, signed out**: the real email/password sign-in, create-
  account, and forgot-password form renders; already covered by
  `LoginPage.test.tsx`'s eight pre-existing tests (untouched).

No copy changes were required; this closes the evidence gap the plan
flagged rather than fixing a defect.

## Concurrency note

This branch had multiple agents committing throughout the session (HEAD
moved from `ba700fd8` to `ae9a07d3` — packages 10a, 11, 15, 16, 19, 20, 22
landed mid-session). `SharingTab.tsx` in particular was being actively
edited by a concurrent package-16 agent (venue-board renaming) while this
package edited its invitation section; the two sets of changes landed on
disjoint lines with no conflicts, confirmed by diff inspection before
committing test fixes. One transient test-run failure (`tsc -b`
flagging an unused import in `BracketRunControls.tsx`, outside this
package's scope) resolved itself on a subsequent run once that concurrent
edit completed.

`dto.generated.ts` already contained the exact `emailConfigured` field
this package adds, committed at HEAD, even though HEAD's
`auth_routes.py` source did not define it — an artifact of an earlier
`make generate-api` run (by this session, before a compaction boundary,
or by another agent converging on the same field name/shape
independently). Running `make generate-api` at the end of this package
reproduced a byte-identical file, so there is nothing new to reconcile.

## Commands run (verbatim results)

`.venv/bin/pytest tests/backend/test_auth_endpoints.py
tests/backend/test_invites.py tests/backend/test_tournaments.py
tests/backend/test_tournament_setup.py -q`
→ **117 passed in 173.10s**

`.venv/bin/pytest tests/backend/test_auth_endpoints.py
tests/backend/test_invites.py -q -p no:xdist`
→ **34 passed in 53.48s**

`.venv/bin/ruff check apps/api tests/backend`
→ **All checks passed!**

`cd apps/api/src && ../../../.venv/bin/lint-imports --config
../.importlinter`
→ **Contracts: 15 kept, 0 broken.**

`npm --prefix apps/console run test:run -- src/modules/settings src/app
src/modules/hub`
→ **30 files, 242 tests passed.**

`npm run lint:scheduler`
→ **0 errors, 136 warnings** (all pre-existing, none in files this
package touched).

`npx tsc -b apps/console`
→ clean (one transient unrelated error in a concurrently-edited file,
resolved on rerun — see "Concurrency note").

## Evidence gaps this package makes capturable (plan §7)

- **Operator sign-in**: both local-mode (redirect, no wall) and cloud-mode
  (real form) states are now under test — see OC01 above. A live
  browser/screenshot capture of the cloud-mode form is still open (this
  package added no new browser evidence, only automated test coverage).
- **Account security/session actions**: `SecurityPage`'s locked/unlocked
  states and `SessionsPage`'s sign-out were read and left unchanged (no
  routed finding); they already follow the same locked-copy pattern this
  package applied to Profile. Not separately re-verified with a live
  capture.
- **Actual tool/guard behavior**: `ModuleUnavailablePanel`'s `unavailable`,
  `disabled`, and `not-enabled` reasons are now verified against
  `resolveActivePane`'s real routing logic (not just described), closing
  the specific "Setup · General" button-vs-destination mismatch. The
  `dependency` and `permission` reasons were not exercised by any routed
  finding and are unchanged.

## Debt logged / deferred

None newly logged. The pre-existing debt entries from package 05 (public
`Contact.public` column unreachable from the UI; partner-invite delivery
failure has no entrant-facing recovery path) are unrelated to this
package's scope and were left as-is.

One observation not covered by any routed finding, noted here rather than
fixed (out of scope — touches a deliberately-documented seam): 
`apps/api/src/workspaces/tournaments.py`'s `create_invite_link` calls
`core/email.py`'s `send_email` directly and does not catch its exception,
even though the invite row is already committed to the database before
the send is attempted. An SMTP failure at that point 500s the request and
the console shows "The invite could not be created" even though the
invite row (and its link-mode fallback) actually exists. `core/email.py`'s
own docstring says this is intentional ("invite create surfaces
[failure]"), so changing it would be a deliberate design change beyond
this package's findings, not a copy fix.
