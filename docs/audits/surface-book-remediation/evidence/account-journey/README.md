# Entrant account journey evidence

Date: 2026-09-06 UTC  
Environment: local disposable fixture, `AUTH_MODE=local`, `ENVIRONMENT=local`  
Origins: entrant SSR `http://127.0.0.1:15174`, API `http://127.0.0.1:18600`  
Database: `/tmp/shuttleworks-console-contracts.G3aSM6/console-contracts.db`

The account was created in the disposable database with the supported
`identity.entrants.create_account` service. The account email and password
are intentionally omitted. No email, payment, fake cookie, or auth bypass was
used.

Command (credential values supplied only through environment variables and
never printed):

```text
ACCOUNT_EMAIL=<redacted> ACCOUNT_PASSWORD=<redacted> \
ENTRANT_BASE_URL=http://127.0.0.1:15174 \
node tools/account-journey-real.mjs
```

Redacted result:

```text
login page: HTTP document; heading=Sign in; form=true; sw_play_csrf cookie=true; _csrf field=true
keyboard login: URL=/e/2026-korea-masters-t030/enter; heading=Entries are closed; sw_play_session cookie=true
authenticated continuation: heading=Continue with your account; form=false; continuation=true; next preserved=true
switch account: heading=Sign in to a different account; form=true; next field=/e/2026-korea-masters-t030/enter; _csrf field=true
credentials printed=false
```

The login was performed by focusing the password field and pressing Enter.
The browser followed the native form navigation through `/e/account/login`,
including the real CSRF pair minted by the SSR page. The entry destination is
closed in this fixture, so the successful post-login document says “Entries
are closed”; this is the actual closed-entry boundary reached after login.

Screenshots:

- [Initial login form](01-login-form.png)
- [Successful login at closed entry](02-after-login-entry.png)
- [Authenticated continuation without form](03-authenticated-continuation.png)
- [Switch-account form with preserved next](04-switch-account-form.png)

## Recovery boundaries

The same account was exercised with service-issued tokens. Token values are
redacted and were passed only through process environment variables. No mail
delivery was invoked.

```text
POST /e/account/verify (expired token): browser followed 303 -> /e/verify/failed; heading=Confirm your email
POST /e/account/verify (invalid token): browser followed 303 -> /e/verify/failed; heading=Confirm your email
POST /e/account/verify (valid token): browser followed 303 -> /e/verify/done; heading=Email confirmed
POST /e/account/reset-password (expired token): browser followed 303 -> /e/reset/failed; heading=Reset your password
POST /e/account/reset-password (invalid token): browser followed 303 -> /e/reset/failed; heading=Reset your password
POST /e/account/reset-password (valid token): browser followed 303 -> /e/reset/done?next=<redacted>; heading=Password updated
old password login: POST followed 303 -> /e/login/failed?next=<redacted>; form=true
new password login: POST followed 303 -> /e/2026-korea-masters-t030/enter; heading=Entries are closed
```

The database was checked after the successful transactions: `email_verified`
was true, both consumed token hashes were cleared, the old password no
longer matched, and the new password matched. Reset also revoked prior live
entrant sessions; the one live session observed afterward was the newly
authenticated browser session.

Recovery screenshots: [expired verification](05-expired-verification.png),
[invalid verification](06-invalid-verification.png),
[valid verification](07-valid-verification.png),
[expired reset](08-expired-reset.png), [invalid reset](09-invalid-reset.png),
[password updated](10-password-reset-done.png).

## Human check UI boundary (PE23.1)

The signup page was loaded in a real browser with the existing Turnstile
controller's callback contract supplied by a controlled test fixture. The
provider origin was blocked, the account form was not submitted, and no
account or backend auth state changed. This proves the UI state and action
visibility only; it is not evidence of production Turnstile verification.

```text
node tools/turnstile-ui-capture.mjs
classification=controlled callback UI only; not production provider verification
statusText=Human check complete.
helpHidden=true; Create account visible=true; accountPosts=0
callbackTokenSubmitted=false; productionTurnstileVerified=false
```

Artifacts: [controlled complete state](11-human-check-controlled-complete.png)
and [machine-readable classification](11-human-check-controlled-complete.json).
