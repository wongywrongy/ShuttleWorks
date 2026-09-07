# Evidence — account, confirmation and reset journeys (package 23)

Companion to `docs/audits/surface-book-remediation/evidence/account-journey/README.md`
(the earlier evidence-tooling README for `tools/account-journey-real.mjs` /
`tools/account-recovery-real.mjs` / `tools/public-login-continuation-check.mjs` /
`tools/turnstile-ui-capture.mjs`). This page records, per journey, what proves it
works now and what is still outside this package's evidence boundary.

## Journeys and their proof

| Journey | Backend proof (real HTTP, real tokens) | SSR rendering proof | Notes |
|---|---|---|---|
| Sign-up, fresh address | `tests/e2e/check-account-journeys.py` (1); `tests/backend/test_entrant_lifecycle_routes.py` | `apps/entrant/tests/signup.test.ts` | Mails a real confirmation link via the `console` backend, captured from the API log |
| Sign-up, already-registered address (non-enumeration) | `check-account-journeys.py` (2); `tests/backend/test_entrant_auth_routes.py` | `signup.test.ts` byte-identity suite | 202/303 and body byte-identical to (1) |
| Tournament-scoped sign-up names the tournament | — | `signup.test.ts` "a tournament-scoped signup names the tournament" (V3-PE24.1) | Falls back to generic wording on a lookup failure — also asserted |
| Email confirmation — valid token | `check-account-journeys.py` (3) | `apps/entrant/tests/recovery.render.test.ts` (verify/done rendering elsewhere), `verify.tsx` component | Promotes `unverified` entries to `pending` (`_verify_and_promote`) |
| Email confirmation — invalid/expired token | `check-account-journeys.py` (3, bad token); `test_entrant_lifecycle_routes.py` | `recovery.render.test.ts` "distinguishes ... failed ..." (verify/failed copy, V3-PE27.1) | One message for expired/used/never-valid — the service offers no way to distinguish |
| Email confirmation — replay of a spent token | `check-account-journeys.py` (3, replay) | — | Second click refused, not double-counted |
| Resend confirmation, signed-in, no token in the URL | — | `recovery.render.test.ts` "offers the resend control directly to a signed-in visitor with no token" (V3-PE25.1, new) | Signed-in visitor never has to leave the page |
| Resend confirmation, signed-out | — | `recovery.render.test.ts` "sends a signed-out visitor through sign-in instead" | |
| Sign-in, success | `check-account-journeys.py` (4) | `apps/entrant/tests/login.test.ts` | |
| Sign-in, error (wrong password / unknown address — non-enumeration) | `check-account-journeys.py` (4) | `login.test.ts` "a refused sign-in" suite (V3-PE21.1 wording) | Same body for both causes, proven at both tiers |
| Sign-in, authenticated outcome (`/e/login/signed-in`) | — (session cookie is entrant-tier only; no backend route to assert against) | `login.test.ts` "does not show a second sign-in form...", and the new "says a sign-in worked..." case (V3-PE22.1) | A direct visit with NO cookie now renders the ordinary sign-in state, not a claimed-success banner |
| Password reset request (enumeration-safe) | `check-account-journeys.py` (5); `test_entrant_lifecycle_routes.py::test_reset_request_answers_identically_for_a_stranger` | `recovery.render.test.ts` "distinguishes an invalid token..." (reset/sent copy path exists but the "sent" state itself is covered by `resetPassword.tsx`'s own module tests — see the plan §7 evidence-boundary note below) | TTL match verified against `settings.reset_token_ttl_minutes = 60.0` (V3-PE31.1) |
| Valid password-reset form renders and sets the password | `check-account-journeys.py` (6); `test_entrant_lifecycle_routes.py::test_a_reset_link_sets_the_password_and_kills_live_sessions` | `recovery.render.test.ts` "shows the same password requirements before any submission" (new) | **This is the evidence the work-order specifically flagged as missing** — now covered on both the backend (form → real token → real password change) and the SSR side (the `set` view renders correctly and posts to the real endpoint) |
| Weak new password rejected, token survives | `check-account-journeys.py` (6) | `recovery.render.test.ts` "keeps a valid token and destination..." (V3-PE34.1: field-level error + `aria-describedby`) | |
| Password updated → old sessions revoked | `check-account-journeys.py` (7); `test_a_reset_link_sets_the_password_and_kills_live_sessions` | `resetPassword.tsx` "done" view (V3-PE32.1 copy) | Session revocation proven by checking the pre-reset cookie 401s afterward |
| Invalid/expired reset link | `check-account-journeys.py` (8) | `recovery.render.test.ts` "distinguishes an invalid token..." (V3-PE33.1 copy) | Proven not to change the password |
| Authenticated outcome generally (V3-PE22.1's "authenticated outcome" evidence gap) | `check-account-journeys.py` (4), plus `test_entrant_auth_routes.py`'s cookie-scoped `/e/account/me` checks | `login.tsx` component logic gated on `EntrantSessionContext` (root's cookie-presence read) | A signed-in session really does resolve `/e/account/me`; a direct visit to an outcome URL with no cookie renders the ordinary state, never a claimed success |

## What remains outside this package's evidence boundary

- **External email delivery.** Every journey above uses the `console` email backend (log-only, the default in every non-production stack per `core/email.py`). No test in this repository, and none added here, proves an SMTP provider actually delivers a ShuttleWorks email to a real inbox — that is infrastructure outside the application boundary. `_mail`/`_send_verification` returning a real `bool` (package 05, ledger section A4) is the honesty boundary: the entrant-facing copy only ever claims what the *send call* reported, never that a human received it.
- **Turnstile in production configuration.** V3-PE23.2 is explicitly a "this book cannot establish production verification behavior" finding. `check-account-journeys.py` and the dev/test signup flow both pass Cloudflare's own documented dummy sitekey/secret pair (`1x00000000000000000000AA` / `1x0000...AA`), verified for real against `https://challenges.cloudflare.com/turnstile/v0/siteverify` — but the widget's "For testing only" copy is Cloudflare's own, tied to that dummy pair, and only a capture against a real production sitekey in a release environment (outside this package's fixture) can retire the finding. Logged to the debt log.
- **Real inbox round-trip / spam-folder behavior** referenced in the "check your spam folder" copy (V3-PE28.1, V3-PE31.1) — inherently outside any automated boundary.

## How to reproduce

Backend journey matrix, against a disposable local API:

```
DATABASE_URL="sqlite:////tmp/scratch/local.db" SESSION_COOKIE_SECURE=false \
  .venv/bin/uvicorn core.main:app --host 127.0.0.1 --port 8600 --log-level warning \
  >/tmp/scratch/api.log 2>&1 &
PYTHONPATH=simulator .venv/bin/python tests/e2e/check-account-journeys.py \
  --base-url http://127.0.0.1:8600 --api-log /tmp/scratch/api.log
```

Or via the shared fixture (`tools/fixture-up.sh`), which now runs this automatically
(`FIXTURE_CHECK_ACCOUNT_JOURNEYS=1` by default — set to `0` to skip):

```
tools/fixture-up.sh
```

SSR rendering suites:

```
npm --prefix apps/entrant run test:run -- login.test.ts signup.test.ts recovery.render.test.ts partner.render.test.ts
```
