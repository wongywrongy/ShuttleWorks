# Work package 24 — invitations, My entries and receipts

Plan refs: `docs/audits/v3-consolidated/plan.md` §3 "Short entry reference" (Adopt conditionally);
§4 "Success", "Errors", "Status"; §6 "Account journeys" (accepted/unavailable invitation). Findings
routed here: V3-PE16.1/16.2 (verified only — package 22's fix, already committed), V3-PE35.1, PE36.1,
PE37.1, PE38.1, PE39.1, and the PE17/PE18 evidence rows (`plan.md` row table, "Entries closed;
signed-in/account-created entry outcome not established").

## Files in scope (touched)

Backend:
- `apps/api/src/db/models.py` — `Entry.partner_invite_mail_sent` column
- `apps/api/src/entries/entries_json.py` — persists the invite mail outcome (submit route only;
  the season-listing DTO hunks in this file belong to package 21 and were left untouched — confirmed
  by re-checking `git diff --stat` before every edit)
- `apps/api/src/entries/entries_me.py` — `MyEntryLineDTO.partnerInviteMailFailed`
- `apps/api/src/alembic/versions/b1c6d0e5f2a7_partner_invite_mail_outcome.py` — new migration

Entrant tier:
- `apps/entrant/app/routes/partner.tsx`, `myEntries.tsx`
- `apps/entrant/app/components/MessagePage.tsx` (new optional `secondaryAction`)
- `apps/entrant/public/assets/my-entries.js` (+ `.d.ts`), `partner-accepted.js`, `receipt.js`
- `apps/entrant/tests/{myEntries.render,myEntries.script,partner.render,partner-accepted.script,receipt.script}.test.ts`

Console (generated only, no hand-authored change):
- `apps/console/src/api/dto.generated.ts` — `make generate-api` after the backend DTO change; `dto.ts`
  does not reference `MyEntryLineDTO` (entrant-only type), so no hand reconciliation was needed

Tests / docs:
- `tests/backend/test_partner_invites.py`, `test_entries_me_api.py` (one pinned exact-key-set test
  updated)
- `tests/e2e/check-account-journeys.py` — extended with checks (9)/(10)
- `docs/reference/debt-log.md` — "Work package 24" section
- `docs/audits/v3-consolidated/ledger/24-strings.md` (new)

**Not touched**: `enter.tsx`'s closed-entries branch (package 22, already committed); `verify.tsx`,
`login.tsx` (package 23's files — `partner.tsx`'s `unverified` action deliberately does not fabricate
a `next=` on `/e/verify`, which does not read one); `discovery.tsx`, `players.tsx`, the
`entries_json.py`/`entries_site.py` discovery/overview DTOs, `entrants-filter.js`, `lib/phase.ts`
(package 21's concurrent scope).

## Ruling-by-ruling account

**(1) States stay distinct.** No new state was invented. Invitation: preview/accept unchanged
(pending via `partner_invite_hash`+`partner_invite_expires_at`, accepted via `partner_accepted_at`,
declined has no row — an invite is either live or gone, per the module's own uniform-404 design).
Submission: `draft`/`submitted`/`confirmed`/`withdrawn` unchanged (`entries_me._entry_state`).
Payment: `not_required`/`required`/`recorded` — the three states `SubmissionReceiptDTO.paymentState`
actually persists; no fourth state was added or implied anywhere in this package's copy changes.

**(2) Account gates preserve destination.** Verified, not re-derived — this was already correct before
this package touched anything: `myEntries.tsx`'s sign-in link is `/e/login?next=/e/me/entries`
(SSR and the client `my-entries.js` 401 redirect agree); `receipt.js`'s 401 gate builds
`next=/e/{slug}/receipt/{submissionId}`; `partner.tsx`'s sign-in/create-account links carry
`next=/e/partner/{token}` (pinned by the pre-existing "preserves the invitation through sign-in and
account creation" test, still green). The one gap found — `partner.tsx`'s `unverified` failure branch
linking to `/e/verify` as if it preserved a destination — was NOT a gate needing a `next=` fix; it was
a copy fix, since `verify.tsx` (package 23's file) accepts no `next=` parameter at all. Adding a
`next=` there would have been a promise this route cannot keep, so the fix removes the implied promise
instead of fabricating a mechanism out of scope. This is recorded, not silently worked around: see
"What was NOT touched" above.

**(3) Short entry reference.** Implemented: the lookup + authorization half only (already correct —
`entries_me._own_submission` resolves a submission ID **strictly** inside
`Submission.account_id == <calling session's account>`; a foreign account's session or an invalid ID
answer the identical 404, pinned by `test_receipt_is_complete_private_and_account_scoped`, unchanged
by this package). The reference-FORMAT half (an 8-character human-copyable code replacing the UUID on
the receipt) is **not implemented** — it is a schema change (new column, two-phase migration, a
redirect/route change, a regex change) larger than this package's remaining budget once the
copy/state/mail-outcome work and its tests were done. Per the ruling's own escape hatch it is logged
as debt with the exact design: `docs/reference/debt-log.md`, entry **V3-24-1**. What DID ship for
PE39.1 is the copy half: the unverifiable "The reference is safe" claim is gone.

**(4) Invitation pages.**
- PE35.1 (unavailable/expired): fixed — "This invitation is unavailable. Ask your partner to send a
  new one.", plus a "Check My entries" action beside "Browse tournaments" for the case where the
  invite was actually already accepted (the uniform 404 cannot say either way, so both statements are
  offers, not claims).
- PE36.1 (unverified partner result): fixed — "We couldn't confirm whether your invitation was
  accepted. Check My entries for its status." replaces "We could not verify this accepted [entry|
  partner entry]" at all three call sites in `partner-accepted.js`. No success term for an unverified
  outcome; a real acceptance is separately captured by the same script when the entry IS found.
- PE37.1 (partner invitation failure): fixed on two fronts. (a) `partner.tsx`'s failed-acceptance page
  now matches its action to its stated remedy per `failureReason` (verify email / try the same
  invitation again / browse-or-check — never a bare "Sign in" that answers nothing). (b) The
  package 05 debt itself — "a failed invitation email is reported... with the truthful recovery" — is
  closed: `Entry.partner_invite_mail_sent` is now persisted at submission time and
  `MyEntryLineDTO.partnerInviteMailFailed` reports it on the nominating entrant's own My Entries line.
  Per the ruling's cascade (resend, else share-the-link, else the honest statement), **no resend or
  share-link action was offered** — the invite token is stored hashed only (invariant I5), so there is
  genuinely no link left to re-share, and no resend route exists. The honest statement is: "The
  invitation email to your partner could not be sent. Let them know directly."

## PE17/PE18 — established

Plan §6 named two evidence gaps: "Entries closed; signed-in entry outcome not established" (PE17) and
"...account-created entry outcome not established" (PE18) — the earlier evidence runs only ever
exercised a CLOSED entries window (package 22's territory), so a real, successful submission by (a) an
already-signed-in verified entrant and (b) a brand-new account created and verified in the same run had
never been driven end-to-end. `tests/e2e/check-account-journeys.py` now does both, as checks (9) and
(10): a real operator API call stands up one open, singles-event tournament
(`_open_entry_page`), then each of two independent entrant clients signs in (9: pre-existing verified
account) or signs up fresh and verifies through a real mailed token (10), submits a real entry over
`POST /e/api/submit/{slug}`, follows the 303 to its receipt id, and reads the receipt back through
`GET /e/api/me/submissions/{id}` — the exact two calls `enter.tsx`'s form post and `receipt.js`'s
`loadReceipt` make for real. Verified against a disposable local server twice (see "Commands run"
below); both checks passed on both runs.

## Commands run (verbatim)

```
$ .venv/bin/pytest tests/backend/test_partner_invites.py tests/backend/test_entries_me_api.py \
    tests/backend/test_entries_json_routes.py tests/backend/test_entries_submit_api.py -q -p no:xdist
149 passed in 276.36s (0:04:36)
```

```
$ .venv/bin/pytest tests/backend/unit/test_submission_service.py tests/backend/unit/test_entries_schema_levels.py -q
50 passed in 1.45s
```

```
$ .venv/bin/ruff check apps/api tests/backend tests/e2e
All checks passed!
```

```
$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.
```

Migration check (repo ships no single `alembic check` invocation for this project; verified the
equivalent — upgrade-to-head then downgrade-one, against a scratch SQLite DB):
```
$ DATABASE_URL="sqlite:////tmp/scratch/local.db" .venv/bin/alembic -c apps/api/alembic.ini upgrade head
... (all prior revisions) ...
INFO  [alembic.runtime.migration] Running upgrade aa1b2c3d4e5f -> b1c6d0e5f2a7, entries: persist the partner invite mail outcome (V3-PE37.1).
$ python3 -c "import sqlite3; ...PRAGMA table_info(entries)... 'partner_invite_mail_sent' in cols"
True
$ DATABASE_URL="sqlite:////tmp/scratch/local.db" .venv/bin/alembic -c apps/api/alembic.ini downgrade -1
INFO  [alembic.runtime.migration] Running downgrade b1c6d0e5f2a7 -> aa1b2c3d4e5f, entries: persist the partner invite mail outcome (V3-PE37.1).
```
Both directions ran clean.

```
$ npm run -w apps/entrant test:run
Test Files  53 passed (53)
     Tests  967 passed (967)
```
(One transient failure mid-session, `dtoParity.test.ts` — `MyEntryLineDTO.partnerInviteMailFailed`
hand-only until `make generate-api` regenerated `dto.generated.ts`; green after.)

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
$ npm run depcruise:entrant
✔ no dependency violations found (111 modules, 327 dependencies cruised)
```

```
$ npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)
```

```
$ make generate-api
Done. Inspect 'git diff apps/console/src/api/dto.generated.ts'.
```
(5-line diff: one new optional-with-default field, `MyEntryLineDTO.partnerInviteMailFailed`. No
hand-curated `apps/console/src/api/dto.ts` change needed — the console does not consume this
entrant-only DTO.)

```
$ PYTHONPATH=simulator .venv/bin/python tests/e2e/check-account-journeys.py \
    --base-url http://127.0.0.1:8612 --api-log /tmp/scratch/api.log
account journeys (1) signup, (2) non-enumeration, (3) verify/replay, (4) login oracle,
(5) reset non-enumeration, (6) weak-password/token-survival, (7) session revocation,
(8) invalid-token safety, (9) V3-PE17 signed-in entry submission,
(10) V3-PE18 new-account entry submission: verified
```
(Run twice against disposable local uvicorn instances + fresh SQLite DBs, not committed to the repo;
both runs green after fixing the fixture to publish the entry page — `_resolve` refuses
`audience == "private"` with the same 404 as an unknown slug, so `_open_entry_page` now also PATCHes
`audience: "public"`, not just `isOpen: true`.)

`tools/fixture-up.sh` with `FIXTURE_CHECK_ACCOUNT_JOURNEYS=1` was **not** run in this package — the
standalone reproduction above already drives the exact same script against a real server (the pattern
package 23's own report used), and the full fixture stack's setup/teardown cost was judged not worth
re-paying for a script whose behavior is otherwise identical either way. `tools/fixture-up.sh` was not
edited; the knob it already wires (package 23) needs no change to pick up checks (9)/(10).

## Tests changed to keep passing, and why

| Test | Reason |
|---|---|
| `apps/entrant/tests/myEntries.render.test.ts` "renders a sign-in action for signed-out visitors" | PE38.1 changed the gate's copy (no separate "Sign in to see your entries" heading) |
| `apps/entrant/tests/partner-accepted.script.test.ts` "does not claim acceptance..." | PE36.1 changed "could not verify" → "couldn't confirm whether ... was accepted" |
| `tests/backend/test_entries_me_api.py::test_card_and_line_key_sets_are_exact` | New `partnerInviteMailFailed` field added to the exact-key-set pin (package 05 debt closure) |

No pinned test contradicted a ruling; none were edited to paper over a behavior change other than the
ruling-driven copy/shape changes above.

## Per-finding acceptance

| Finding | Acceptance met by |
|---|---|
| V3-PE16.1/16.2 | Verified only — package 22's fix (`enter.tsx`'s closed-entries branch), already committed; re-read, not re-implemented |
| V3-PE35.1 | "This invitation is unavailable. Ask your partner to send a new one." claims neither expiry nor acceptance; "Check My entries" offered alongside "Browse tournaments" |
| V3-PE36.1 | No success term ("accepted"/"verified") anywhere in the unconfirmed-outcome branch; a real acceptance is still stated plainly when the entry IS found |
| V3-PE37.1 | Every failed-acceptance action matches its stated remedy; the partner-invite mail outcome now reaches the nominating entrant's own account view, with an honest statement (no fabricated resend/share action) |
| V3-PE38.1 | One task-specific sentence, one primary action, on the signed-out gate; the list explanation moved beside the actual list |
| V3-PE39.1 | No unverifiable safety claim; reference-format change logged as debt (V3-24-1) with the full design, per the ruling's own escape hatch |
| PE17 (plan §6) | `check-account-journeys.py` (9): a signed-in, already-verified entrant submits to a real open event and reaches its own receipt |
| PE18 (plan §6) | `check-account-journeys.py` (10): a freshly signed-up, verified account does the same |

## Debt logged

`docs/reference/debt-log.md`, "Work package 24" section:

- **V3-24-1** — the short entry reference (V3-PE39.1 / plan §3) is designed but not implemented: exact
  column, alphabet, migration sequence, redirect/route/regex change, and DTO field, ready to build. M.

## Not committed

Per instructions, no commit was made. Files changed/added are listed under "Files in scope" above.
