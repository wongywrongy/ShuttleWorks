# Ledger — package 24 (invitations, My entries and receipts)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

Builds on package 05's ledger (`docs/audits/v3-consolidated/ledger/05-strings.md`, row 43/44 — the
partner-invite mail outcome `bool` and its "no post-submit surface" debt) and package 22 (the
entries-closed branch, `enter.tsx`, verified but not touched here — see "Files in scope" in the
report). V3-PE16.1/16.2 are package 22's fixes, already committed; this ledger does not re-list them.

## The dead invite (`partner.tsx`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `!invite` body | `/e/partner/{token}` | unknown/expired/already-accepted/withdrawn token (one uniform 404, all four causes) | "Invitations expire, and each one can be accepted once. Ask whoever invited you to send a new one." | change | "This invitation is unavailable. Ask your partner to send a new one." | `partner_service.resolve` returns `None` for all four causes with no way to tell which (module docstring, `partner_routes.py`) — the old copy asserted "expire" and "once" as facts about THIS link, which the API cannot know | V3-PE35.1 | `apps/entrant/tests/partner.render.test.ts` "a dead invite" suite |
| `!invite` secondary action | same | same | (none — one action, "Browse tournaments") | new | Adds "Check My entries" beside "Browse tournaments" | Safe regardless of the real cause: checking My entries never claims the invite was accepted, only offers the place that would show it if it was | V3-PE35.1 | same; `MessagePage`'s new optional `secondaryAction` prop |

## A failed acceptance (`partner.tsx`, `/e/partner/failed`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| action button, `unverified` | `/e/partner/failed?reason=unverified` | signed in, email not verified | Button "Sign in" → `/e/login` | change | Button "Verify your email" → `/e/verify` | The reader is already signed in (`accept_partner_invite` 403s only a resolved, unverified principal) — "Sign in" answered a question already answered; `/e/verify` (package 23's file) accepts no `next=`, so the link does not promise a return it cannot keep | V3-PE37.1 | `apps/entrant/tests/partner.render.test.ts` "sends an unverified account to verification" |
| action button, `retry` (checked-out tournament) | `/e/partner/failed?reason=retry` | `EVENT_CHECKED_OUT` | Button "Sign in" → `/e/login` | change | Button "Try again" → `/e/partner/{token}` (the same invitation) | `accept_partner_invite`'s `retry` branch names a real, retriable thing — the invitation itself, not an account state | V3-PE37.1 | `apps/entrant/tests/partner.render.test.ts` "offers to retry the SAME invitation" |
| action, `unusable`/default | `/e/partner/failed` (no reason, or `unusable`) | dead invite discovered only at accept-time (double-submit, race) | Button "Sign in" → `/e/login` | change | "Browse tournaments" + "Check My entries" (the same pair the dead-invite state above offers) | The body already says "ask ... for a new one" — an account action does not produce one | V3-PE37.1 | `apps/entrant/tests/partner.render.test.ts` "does not offer sign-in as the fix" |

## Unverified acceptance outcome (`partner-accepted.js`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| no `entryId` in the URL | `/e/partner/accepted` (direct/bare visit) | no signal to check at all | "We could not verify this accepted entry. Open My entries to check its status." | change | "We couldn't confirm whether your invitation was accepted. Check My entries for its status." | Heading stays "Partner invitation update" — never claims "accepted" for an outcome nothing here has verified | V3-PE36.1 | `apps/entrant/tests/partner-accepted.script.test.ts` |
| `/e/api/me/entries` lookup fails, or the entry/partner/player identity cannot be resolved | same | fetch error, 5xx, or the accepted entry is not (yet) in the account's own projection | "We could not verify the accepted partner entry. Open My entries to check its status." (×2 call sites) | change | "We couldn't confirm whether your invitation was accepted. Check My entries for its status." | Same — "accepted" is the one word this branch has not earned | V3-PE36.1 | same |

## Signed-out receipt gate (`receipt.js`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| 401 gate body | `/e/{slug}/receipt/{id}` | no session, or the wrong account's session | "The reference is safe. Sign in with the account that submitted this entry to see its events, partner, fee, and payment state." | change | "Sign in with the account used for this entry to view its details and payment status." | "The reference is safe" has no user-actionable meaning and is not a claim this page can verify; the field list ("events, partner, fee, and payment state") is restated by the receipt itself once it loads | V3-PE39.1 | `apps/entrant/tests/receipt.script.test.ts` "turns 401 into a context-preserving sign-in action" |
| visible reference (SectionCard, `receipt.tsx`) | same page, always (pre-fetch) | — | raw submission UUID, `break-all`, with a "Copy reference" action | **not changed — logged as debt** | (unchanged: the UUID, still copyable) | A short, human-copyable reference (plan §3 "Short entry reference") needs a schema change (new column + migration + redirect/route change) larger than this package's remaining budget; the copy/safety-claim half of PE39.1 is fixed, the reference-format half is deferred with the exact design in `docs/reference/debt-log.md` (V3-24-1) | V3-PE39.1 | `docs/reference/debt-log.md` "Work package 24" |

## My entries (`myEntries.tsx`)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| intro paragraph placement | `/e/me/entries` | rendered ahead of the sign-in gate for EVERY visitor, signed in or not | "Every tournament you have entered, newest first. The organizer confirms each entry." (always shown) | change (moved, not reworded) | Same sentence, now rendered only inside the signed-in branch, beside the actual list | The sentence describes the list; a signed-out visitor has no list to describe it | V3-PE38.1 | `apps/entrant/tests/myEntries.render.test.ts` "does not show the list explanation ahead of the sign-in gate" |
| sign-in gate heading | `/e/me/entries` (signed out) | static | h2 "Sign in to see your entries" | cut | (removed — no separate card heading) | "My entries" (the page h1) already says where the reader is | V3-PE38.1 | `apps/entrant/tests/myEntries.render.test.ts` |
| sign-in gate body | `/e/me/entries` (signed out) | static | "Your tournament entries and their current status are available after you sign in." | change | "Sign in to view and manage your tournament entries." | States the requirement once; does not repeat "available" twice across heading and body | V3-PE38.1 | same |

## Partner-invite mail outcome (My entries line, `my-entries.js`)

Closes the package 05 debt-log entry "Partner-invite delivery failure has no entrant-facing recovery
path" (`_send_partner_invite` already returned a real `bool`; nothing durable read it). New backend
column `entries.partner_invite_mail_sent` (nullable, never backfilled — see the migration's own
docstring for why NULL and `False` are different facts).

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| per-line invite-failure notice | `/e/me/entries`, one event line | `Entry.partner_invite_mail_sent is False` for THIS line's nomination | (nothing — the failure was logged for an operator only) | new | "The invitation email to your partner could not be sent. Let them know directly." | The invite token is stored hashed only (invariant I5) — there is no link left to re-share and no resend route exists, so no fake recovery action is offered, per ruling 4's cascade ("otherwise the honest statement") | V3-PE37.1 / package 05 debt | `apps/entrant/tests/myEntries.script.test.ts` "reports a failed partner invite honestly"; `tests/backend/test_partner_invites.py::test_a_failed_invite_is_recorded_and_reported_honestly` |

## Not strings — the reference/lookup/authorization design (plan §3)

No copy changed here; recorded because the plan names it explicitly. `entries_me._own_submission`
already resolves a submission ID **only** inside `Submission.account_id == <the calling session's
account>` — an identifier (UUID today, a short reference once V3-24-1 lands) is never, by itself,
access. Verified (not re-derived) by `tests/backend/test_entries_me_api.py::test_receipt_is_complete_private_and_account_scoped`,
which asserts a foreign account and an invalid ID answer the same 404 body. The plan's "lookup and
authorization together" is this property; the short-reference generation/uniqueness half is the
deferred half (V3-24-1).
