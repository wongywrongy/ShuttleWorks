# Work package 05 — remove consequential false claims

Baseline `f5ccfcef`, branch `feat/surface-book-remediation`. Scope: staff privacy (V3-OC12.1), module disabling (V3-OC26.1), local saves/sync/backups, and email-confirmation claims, per `docs/audits/v3-consolidated/plan.md` §3/§4 and `maps/05-06-copy-contrast.md` Part A. Full string ledger: `docs/audits/v3-consolidated/ledger/05-strings.md`.

## Files changed

- `apps/console/src/modules/setup/SetupProduct.tsx` — removed the Public column and the "future public projection" paragraph from the Staff contacts section; replaced with one factual sentence.
- `apps/api/src/workspaces/setup.py` — `_IMPACT["people"]` no longer lists "public contact details".
- `apps/console/src/modules/settings/ModuleCatalogRow.tsx` — row impact line and "Review impact" modal now state one truthful, state-dependent consequence (has-data vs. no-data) with no "ownership" jargon; "Off; existing data preserved" → "Off".
- `apps/console/src/modules/settings/ModulesSettingsTab.tsx` — removed the `blockedReason` that told operators to "Clear its data before disabling it" (an instruction to delete data in order to disable).
- `apps/console/src/modules/settings/SyncBackupsTab.tsx` — primary line is now the state-independent "Saved on this device."; removed the "reconciled with the cloud when connected" claim; the cloud row (Syncing/Needs attention/Synced) now renders only when `pending_operations`, `blocked_operations`, or the new `acknowledged_operations` is nonzero.
- `apps/api/src/sync/reconciliation.py`, `apps/api/src/sync/application.py`, `apps/api/src/sync/routes.py`, `apps/api/src/sync/schemas.py` — added `acknowledged_operations` (count of outbox rows a cloud sync agent has ever acknowledged, any epoch) to the authority-status query and DTO, the only honest signal a "synced" claim can be grounded on.
- `apps/console/src/api/dto.generated.ts` (regenerated via `make generate-api`) and `apps/console/src/api/dto.ts` (hand-reconciled) — added `acknowledged_operations` to `AuthorityStatusDTO`.
- `apps/api/src/identity/entrants_routes.py` — `_mail`/`_send_verification` now return `bool` instead of swallowing the outcome silently; `resend_verification` (session-gated, not enumeration-sensitive) carries a real failure signal via `?ok=0` on its redirect and a `mailSent` field on its JSON response; `request_entrant_password_reset`'s form-post redirect now carries `?ttlMinutes=` (same value on every request, enumeration-safe) instead of a hardcoded "one hour".
- `apps/entrant/app/routes/verify.tsx` — the `/e/verify/sent` page reads `?ok=0` and renders "We could not send the email. Try again in a moment, or contact the organizer." with a working retry action, instead of always claiming success.
- `apps/entrant/app/routes/resetPassword.tsx` — the "sent" page now states the real TTL from `?ttlMinutes=` (via `formatTtl()`), or omits the duration sentence if absent; the request page and its non-enumeration hedge are unchanged.
- `apps/entrant/app/routes/enter.tsx` — softened the unverifiable "We email them an invitation" to "We'll try to email them an invitation" (first clause was flagged unverified; the truth is only known after send, and no in-scope surface exists to report per-invite failure — see debt log).
- `apps/api/src/entries/entries_json.py` — `_send_partner_invite` now returns `bool`; the submission redirect stays deliberately outcome-independent (replay-safety), so the return value isn't wired into it yet.
- `apps/console/src/modules/settings/__tests__/ModuleCatalogRow.test.tsx`, `apps/entrant/tests/recovery.render.test.ts` — updated/added tests for the new copy and the new failure-path notice.
- `docs/reference/debt-log.md` — new "v3 consolidated plan" subsection under "Open — small and unscheduled": (1) `Contact.public`/the `public` column are now unreachable from the UI (kept per ruling, no migration in this package); (2) partner-invite delivery failure has no entrant-facing recovery path yet.
- `docs/audits/v3-consolidated/ledger/05-strings.md` (new) — full string ledger.

## Commands run and results

- `npm --prefix apps/console run test:run -- src/modules/setup src/modules/settings/__tests__/ModuleCatalogRow.test.tsx src/modules/settings/__tests__/ModulesSettingsTab.test.tsx src/modules/settings/__tests__/SyncBackupsTab.test.tsx src/modules/settings/__tests__/SyncReconciliationPanel.test.tsx src/api/__tests__/dtoParity.test.ts` → **6 files, 37 tests passed.**
- `npm run lint:scheduler` → **0 errors, 134 warnings** (all pre-existing categories: `react-refresh/only-export-components`, `react-hooks/set-state-in-effect`, `react-hooks/static-components`; none introduced by this change).
- `npm run -w apps/entrant test:run -- tests/recovery.render.test.ts tests/enter.loader.test.ts tests/enter.quote.test.ts tests/entry-wizard.script.test.ts tests/login.test.ts tests/signup.test.ts` → **6 files, 226 tests passed.**
- `npm run typecheck:entrant` → clean.
- `.venv/bin/pytest tests/backend/test_entrant_lifecycle_routes.py tests/backend/test_auth_endpoints.py tests/backend/test_auth_surface.py tests/backend/test_tournament_setup.py tests/backend/unit/test_authority_lifecycle.py tests/backend/unit/test_sync_protocol.py tests/backend/unit/test_sync_quarantine.py tests/backend/unit/test_workspace_modules.py tests/backend/unit/test_sync_route_tenancy.py tests/backend/test_partner_invites.py -q` → **all passed** (48 + 78 + 23 = 149 across the runs).
- `.venv/bin/ruff check apps/api tests/backend` → **All checks passed.**
- `make generate-api` → regenerated `dto.generated.ts` (5-line diff, the new `acknowledged_operations` field only); `dto.ts` reconciled by hand.

## Claims left unchanged, and why

- `verify.tsx:108-110` ("Any entries you already sent are now with the organizer.") — true (`entries/lifecycle.py:125-145`); no change.
- `resetPassword.tsx:108` ("We will email you a link…") — describes the action about to be taken on the request form, not a completed outcome; not a success claim, so it's outside R4's failure-reporting scope. Left unchanged.
- `resetPassword.tsx:199-202, 215-218` (password set / link unusable) — true; no change.
- `login.tsx:271-274` ("Your entrant account is ready.") — deliberately ambiguous across the created/existing branches, both true; ruling R5 confirms no change.
- `routes/partner.tsx`, `myEntries.tsx`, `receipt.tsx`, `discovery.tsx`, `signup.tsx` (map A4 "true" rows) — verified still true, untouched (also outside this package's file scope for partner/receipt/myEntries/discovery/signup).
- A5 items (`NewWorkspacePage.tsx` "editable later", roster import, Display preview) — re-verified true; no change (R5).
- The `Contact.public` DB column and `public: bool` wire field were deliberately **kept**, not migrated away, per ruling R1 ("no migration"). Logged as debt.
- `_send_partner_invite`'s bool return is **not** wired into the submission redirect: that Location is deliberately outcome-independent for replay-safety (see the existing `result.replayed` comment in `entries_json.py`), and no resend/edit-entry route exists for an entrant to act on a failure notice even if one were shown. `enter.tsx`'s pre-submission hint was hedged instead. Logged as debt with a proposed closing shape (resend action from `/e/me/entries`, or a non-replay-breaking receipt signal).
- The **console** email backend (`core/config.py` `email_backend="console"`, log-only) counts as "accepted" for R4's purposes — it never raises, so `_mail`/`_send_partner_invite` report success under it exactly as SMTP success would. This is consistent with local-mode being a fully offline, single-operator deployment.
