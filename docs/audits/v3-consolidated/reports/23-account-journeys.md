# Work package 23 — account, confirmation and reset journeys

Plan refs: `docs/audits/v3-consolidated/plan.md` §4 rows "Errors", "Success", "Hidden/interactive
copy"; §6 "Account journeys". Findings routed here: V3-PE19.1, PE20.1, PE21.1, PE22.1, PE23.1,
PE23.2, PE24.1, PE25.1, PE26.1, PE27.1, PE28.1, PE29.1, PE31.1, PE32.1, PE33.1, PE34.1. Builds on
package 05's ledger (`ledger/05-strings.md`, section A4 — the mail-outcome `bool` mechanism and the
enumeration-safe reset request) and package 08 (44 px controls, `TextField` hint/error/
`aria-describedby` wiring).

## Files in scope

- `apps/entrant/app/routes/login.tsx`
- `apps/entrant/app/routes/signup.tsx`
- `apps/entrant/app/routes/verify.tsx`
- `apps/entrant/app/routes/resetPassword.tsx`
- `apps/entrant/app/routes/partner.tsx` (read; no changes — no routed finding touches it)
- `apps/entrant/tests/login.test.ts`, `signup.test.ts`, `recovery.render.test.ts`
- `apps/api/src/identity/**` (read; no changes — see "What was already correct" below)
- `tests/e2e/check-account-journeys.py` (new)
- `tools/fixture-up.sh` (wired the new script in)
- `docs/audits/v3-consolidated/ledger/23-strings.md` (new)
- `docs/audits/v3-consolidated/evidence/account-journeys.md` (new)
- `docs/reference/debt-log.md` (package 23 section added)

Not touched: the shared account chrome component (package 22's scope), `enter.tsx` (out of this
package's five listed routes — its own "account is ready" notice on the entry-scoped signup flow is
a related but separate surface with no routed finding here).

## What was already correct (verified, not re-implemented)

Reading `apps/api/src/identity/entrants.py` and `entrants_routes.py` before touching anything, the
backend for every journey in scope was already correct and covered by 129 passing tests
(`test_entrant_auth_routes.py`, `test_entrant_lifecycle_routes.py`,
`unit/test_entrants_service.py`, `unit/test_entrant_throttle_namespaces.py`,
`test_entrant_ssr_contract.py`):

- Non-enumeration on signup, login and reset-request (uniform status/body/timing on both branches).
- `_mail`/`_send_verification` return a real `bool` (package 05's ruling), letting the session-gated
  resend route report a real failure while signup/reset-request stay silent by design.
- `consume_reset_token` validates the new password BEFORE touching `password_hash`/burning the
  token, and revokes every other live session unconditionally on success (OWASP).
- `reset_token_ttl_minutes` defaults to `60.0` — exactly the "1 hour" PE31.1's proposed copy names.
- One uniform refusal (`AUTH_RESET_INVALID`) for expired/used/never-valid tokens on both verify and
  reset, with no way for the route to distinguish causes even if it wanted to.

No backend code changed in this package — the defects found were entirely in the entrant SSR
copy/behavior layer, listed below.

## Journey matrix (pass/fail per journey, before and after)

| Journey | Before | After | Proof |
|---|---|---|---|
| Sign-up → created notice | Pass (backend); copy too defensive/imprecise (PE19.1, PE20.1, PE23.1) | Pass | `signup.test.ts`, `login.test.ts` |
| Sign-up, tournament-scoped | Pass mechanically; heading never named the tournament (PE24.1) | Pass, names the tournament | `signup.test.ts` new suite |
| Sign-in error | Pass; trailing "nothing has changed" sentence added unrelated concern (PE21.1) | Pass | `login.test.ts` |
| Sign-in authenticated outcome | **Fail** — a direct, unauthenticated visit to `/e/login/signed-in` rendered a generic "ready" banner implying a completed action (PE22.1) | Pass — unauthenticated direct visit now renders the ordinary sign-in state; authenticated visit unchanged | `login.test.ts` |
| Verification valid/invalid/expired | Pass; "a fresh link will replace this one" implied an unrequested action (PE27.1); success notice inferred entry delivery from confirmation (PE26.1, **major**) | Pass | `recovery.render.test.ts`, `check-account-journeys.py` (3) |
| Resend, with cooldown/session-gating | Pass; a signed-in visitor with no token in the URL was routed through a no-op sign-in instead of resending directly (PE25.1) | Pass — inline resend added for that case | `recovery.render.test.ts` new cases |
| Turnstile widget state (PE23.2) | Test-mode copy visible ("For testing only") | Unchanged — provider-rendered copy, needs a release-environment capture (logged as debt, not silently accepted) | — |
| Reset request (enumeration-safe) | Pass; "on its way"/"good for" was conversational vs. the acceptance's proposed exact wording (PE31.1) | Pass | `check-account-journeys.py` (5) |
| Reset-email-sent | Pass | Pass (copy tightened) | `resetPassword.tsx` |
| Valid-token reset form renders and sets password | **Missing evidence per the work order** | Now proven end-to-end with a REAL mailed token against a running server | `check-account-journeys.py` (6) — see "Evidence obtained" below |
| Password-updated + old sessions revoked | Pass mechanically; duplicated the success statement three times (PE32.1) | Pass, one statement | `check-account-journeys.py` (7) |
| Invalid reset link | Pass; wordier than necessary (PE33.1) | Pass | `recovery.render.test.ts`, `check-account-journeys.py` (8) |
| Weak-password validation | Pass mechanically; error was banner-only, hint disappeared with the error (PE34.1) | Pass — persistent hint + field-adjacent error via `aria-describedby` | `recovery.render.test.ts` new assertions |

## Defects found and fixed

1. **V3-PE22.1 (the one real behavioral defect).** `login.tsx`'s `/e/login/signed-in` route rendered
   "Sign in to continue. The form below is ready for your account." for EVERY visitor reaching that
   URL, including one with no session cookie at all — i.e., a direct/shared link claimed a
   just-completed action state regardless of whether anyone had authenticated. Fixed: the banner now
   only renders when `justSignedIn && !showLoginForm` (a real cookie is present); an unauthenticated
   visit renders the ordinary "Sign in" heading and form with no claim at all.
2. **V3-PE25.1.** A signed-in visitor who reached `/e/verify` with no `?token=` (typed the bare URL,
   or a mail client stripped the query) was told to "sign in" — a no-op for someone already signed
   in — instead of being offered the resend control this page already renders on its `failed`/`sent`
   states. Fixed: the no-token view now branches on `signedIn` and renders the inline resend form.
3. **V3-PE26.1 (major).** The email-confirmed success notice said "Any entries you already sent are
   now with the organizer" — inferring entry delivery/organizer receipt from account verification, a
   distinct and unverified fact (`_verify_and_promote` only moves entries `unverified`→`pending`).
   Fixed to "Your email is confirmed. View My entries to check each entry's status."
4. **V3-PE34.1.** The new-password field had no persistent requirements helper — the rule text
   existed only in the failure banner and vanished once the error cleared, and the specific
   rejection was never adjacent to (or `aria-describedby`-associated with) the field. Fixed:
   `TextField`'s `hint`/`error` props are now used (package 08's mechanism), giving a persistent
   "At least 8 characters. Avoid common passwords." hint that swaps for a field-adjacent error on
   failure, with the banner reduced to the token-still-valid reassurance only.
5. Cosmetic/tone fixes matching the plan §4 "Errors"/"Success" rules and each finding's proposed
   copy, applied verbatim or near-verbatim per the finding's acceptance: PE19.1, PE20.1, PE21.1,
   PE23.1, PE24.1 (tournament name — required a new best-effort `EntryPageDTO` read in the loader,
   fails closed to the old generic wording), PE27.1, PE28.1, PE29.1, PE31.1, PE32.1, PE33.1.

Full before/after text, factual prerequisite, and evidence for every string:
`docs/audits/v3-consolidated/ledger/23-strings.md`.

## Per-finding acceptance

| Finding | Acceptance met by |
|---|---|
| V3-PE19.1 | One short task-specific intro ("Sign in to manage your tournament entries."); outcome clarification stays at the entry handoff (unchanged, out of scope) |
| V3-PE20.1 | "Account created. Sign in to continue." — concise, appears only on the verified 303 target, matches the next action |
| V3-PE21.1 | Two clauses, no account-state speculation |
| V3-PE22.1 | Message now driven by verified session state (`EntrantSessionContext`); unauthenticated direct visit is the ordinary sign-in state |
| V3-PE23.1 | Ordinary-language field hints; privacy statement ("Name shown to the organizer") stays specific to organizer access |
| V3-PE23.2 | Logged as debt — needs a release-environment capture outside this package's boundary; explicitly not claimed fixed |
| V3-PE24.1 | Page visibly names the tournament (`EntryPageDTO.tournament.name`); return destination (`next`) unchanged, already preserved |
| V3-PE25.1 | Signed-in visitor reaches a working resend without leaving the confirmation task |
| V3-PE26.1 | Confirmation never claims entry state; only "View My entries to check" |
| V3-PE27.1 | Distinguishes the failed link from an unrequested replacement |
| V3-PE28.1 | "Confirmation email sent. Open the latest email..." is the first instruction; claimed only on `!mailFailed` |
| V3-PE29.1 | "Send reset link" / "Back to sign in" — names the outcome, no filler |
| V3-PE31.1 | Enumeration-safe wording unchanged in structure; displayed TTL matches `settings.reset_token_ttl_minutes` |
| V3-PE32.1 | One success statement (heading), one session consequence (subheading), one action (button) |
| V3-PE33.1 | Truthful failure category + unchanged-password reassurance + "Request a new reset link" |
| V3-PE34.1 | Same requirements visible before and after validation (persistent hint ↔ field error); rejection is field-adjacent via `aria-describedby` |

## Evidence obtained (the two gaps the work order named)

1. **Valid password-reset form renders and sets the password.** `apps/entrant/tests/
   recovery.render.test.ts` ("shows the same password requirements before any submission") proves
   the `set` view renders correctly; `tests/e2e/check-account-journeys.py` step (6) proves the whole
   chain for REAL against a running server: sign up → real mailed verification token → verify → real
   mailed reset token → weak password refused without burning the token → strong password accepted
   → new password works immediately.
2. **Authenticated outcome.** `check-account-journeys.py` step (4) proves a successful login returns
   the account over the real HTTP surface; `login.test.ts`'s updated case proves the SSR page treats
   an authenticated vs. unauthenticated visit to the SAME outcome URL differently, driven by the real
   session cookie rather than the URL alone (V3-PE22.1's fix).

New evidence doc: `docs/audits/v3-consolidated/evidence/account-journeys.md` — a journey-by-journey
table of what proves it and what remains outside the boundary (external email delivery, Turnstile
production keys).

## `tests/e2e/check-account-journeys.py`

New script, following `check-fixture-defects.py`'s pattern (`SimClient`, real running server, no
mocking). Drives `/e/account/*` directly over HTTP and extracts real tokens by tailing the API
server's own log for the `console` email backend's mailed body (never reads `verify_token_hash`/
`reset_token_hash` — those store only the SHA-256 and would prove nothing about what a mailed link
said). Verifies 8 numbered properties: signup + non-enumeration, verify + replay-safety, login
oracle, reset non-enumeration, weak-password/token-survival, session revocation, and invalid-token
safety. Verified standalone against a real local API instance (fresh SQLite DB, real Turnstile
siteverify call against Cloudflare's documented dummy sitekey/secret pair — not stubbed).

Wired into `tools/fixture-up.sh` behind a new `FIXTURE_CHECK_ACCOUNT_JOURNEYS` knob (default `1`),
independent of `FIXTURE_SKIP_ENTRANT`/`FIXTURE_APPLY_DEFECTS` since it only touches its own throwaway
accounts, never the seeded tournament rows those two care about.

**Debt logged, not silently worked around** (`docs/reference/debt-log.md`, package 23 section):
the script deliberately keeps its forced-failure count at 4 (not 5) to stay under the default
per-IP entrant throttle bucket shared by login and reset-password (`auth_throttle_max_failures = 5`)
— re-verifying "the old password is refused after a reset" over live HTTP would have been a 5th
forced failure and locked the bucket for the next (legitimate) call. That specific property is
instead pinned at the unit/integration level
(`test_entrant_lifecycle_routes.py::test_a_reset_link_sets_the_password_and_kills_live_sessions`).

## Commands run (verbatim)

```
$ .venv/bin/pytest tests/backend/test_entrant_auth_routes.py tests/backend/test_entrant_lifecycle_routes.py tests/backend/unit/test_entrants_service.py tests/backend/unit/test_entrant_throttle_namespaces.py tests/backend/test_entrant_ssr_contract.py -q
129 passed in 191.43s (0:03:11)
```

```
$ .venv/bin/ruff check apps/api tests/backend tests/e2e
All checks passed!
```

```
$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.
```

```
$ npm run -w apps/entrant test:run -- login.test.ts signup.test.ts recovery.render.test.ts partner.render.test.ts
Test Files  4 passed (4)
     Tests  73 passed (73)
```

```
$ npm run -w apps/entrant test:run
Test Files  2 failed | 51 passed (53)
     Tests  3 failed | 945 passed (948)
```
Full-suite failures are **pre-existing and unrelated to this package**: `tests/dtoParity.test.ts`
and `tests/launch-scripts.test.ts` fail against `apps/entrant/app/routes/regulations.tsx`, which
`git status` shows as concurrently modified (uncommitted) by package 22's work-in-progress on a
different branch/session, per this session's coordination instructions. Confirmed not caused by any
file this package touched — all 73 tests in the 4 files actually in scope pass.

```
$ npm run typecheck:entrant
> react-router typegen && tsc
(no errors)
```

```
$ npm run lint:entrant
> eslint .
(no errors)
```

```
$ PYTHONPATH=simulator .venv/bin/python tests/e2e/check-account-journeys.py --base-url http://127.0.0.1:<port> --api-log <fixture>/api.log
account journeys (1) signup, (2) non-enumeration, (3) verify/replay, (4) login oracle,
(5) reset non-enumeration, (6) weak-password/token-survival, (7) session revocation,
(8) invalid-token safety: verified
```
(Run against a disposable local uvicorn instance + fresh SQLite DB, not committed to the repo; see
`docs/audits/v3-consolidated/evidence/account-journeys.md` for the reproduction command.)

## Debt logged

See `docs/reference/debt-log.md`, "Work package 23" section:

- **V3-23-1** — V3-PE23.2 (Turnstile test-widget copy) needs a release-environment capture outside
  this package's boundary; not claimed fixed.
- **V3-23-2** — `check-account-journeys.py` intentionally does not re-verify the old-password-refused
  property over live HTTP (throttle-budget reason above); pinned instead at the unit/integration
  level, which is real but different coverage.

## Not committed

Per instructions, no commit was made. Files changed/added are listed under "Files in scope" above.
