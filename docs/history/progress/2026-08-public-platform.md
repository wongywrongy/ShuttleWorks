# The public platform (SP-PROGRAM-1)

**Status: in progress.** Started 2026-08-06. This program gives a tournament a public face: a
place on the internet where a player finds it, sees whether they can enter it, and enters it,
with the entry landing on the director's roster rather than in an inbox to be re-keyed.

It has produced two things this site documents in full: the [Entries module](/reference/modules/entries)
(the operator's half, and the commit seam into the roster) and the
[entrant tier](/explanation/architecture/entrant-tier) (the public app under `/e/`).

**Ledger:** `docs/programs/ENTRIES_PROGRESS.md`. **Plan:** `docs/programs/SP-PROGRAM-1.md` —
that file is the plan, and deviation from it is a STOP rather than a judgment call.

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Consolidate and baseline | **Done** 2026-08-06 |
| 1 | Spec delta pass (R2, then the R3 master amendment) | **Done** 2026-08-06, signed off 2026-08-07 |
| 2 | Deploy on the prototype domain | Not started |
| 3 | Appearance pass (SP-UI-1) | Pre-executed, out of order (recorded as contradiction C1) |
| 4 | Dogfood at a real event | Not started (calendar-bound, floats) |
| 5 | **E1** — the walking skeleton, then the **E1-2** delta slice | **Both shipped** (E1 2026-08-06, merged `86182af`; E1-2 phases A–E 2026-08-07). **Phase still open**: the public-exposure sign-off gate is owed and sits after Phase 2 |
| 6 | **The entrant application** (`play.*` scaffold) | **Steps 1, 2 and 4 done** 2026-08-10. Step 3 (email) deferred entirely |
| 6-2 | **The public information architecture** | **Done** 2026-08-11 (phases A–E), design audit and its verification 2026-08-12 (phase F) |
| 7 | E2 — lifecycle (verification, reset, my-entries, withdraw-and-erase, caps, waitlist) | Not started |
| 8 | E3 — doubles and partner invites | Not started |
| 9 | E4 — signals, phases, public read surfaces | Not started |
| 10 | E5 — money, retention, GDPR pass | Not started |
| 11 | Cutover to the production domain + marketing | Not started |

## What shipped

### Phase 5 — E1: the public write pipe (2026-08-06)

The first end-to-end path from a public form to a roster row: the Entries schema and its
migrations, the module row with a **mode-aware seed** and the `MODULE_REQUIRES_CLOUD` guard, a
public slug-keyed page, submit, the operator desk, and the **commit seam**
(`services/entries.py`) that turns confirmed entries into roster players — re-runnable, additive,
idempotent, and reporting partial success per entry rather than rolling back.

Every session-free route added here is an explicit entry in the auth-surface allowlist **with a
written reason**, and every security test carries a negative control (Turnstile bypass, throttle,
idempotency replay, uniform 404, cross-tenant probe).

### Phase 5 delta — E1-2: accounts and the submission model (2026-08-07)

The R3 amendment arrived after E1 had merged, so it superseded shipped code rather than a design
on paper. Delivered over five phases in one day:

- **Entrant accounts** — signup, login, logout on the existing session machinery, with a
  `play.*`-scoped cookie, their own throttle namespace, and Turnstile moved from submit to signup.
  Entrants are not `users`: separate tables, separate cookie, no reach into any operator route.
- **The submission model** — `account → submission → entries → players`. One form act covering two
  children and four events is now **one agreement, one acceptance, one total, one person to write
  to**, instead of four rows an operator had to infer a relationship between from a repeated email
  address. The idempotency key and the regulations acceptance moved to the submission with it.
- **The R14 field set** — gender with soft filtering and an attention flag (never a hard block),
  club, director-toggled phone, a tiered fee schedule with a server-computed running total,
  payment instructions, `withdraws_until`, entry caps, and venue fields on the entry page.
- **Token retirement** — `Entry.manage_token_hash` and the success-page code card are gone. An
  entrant manages entries by being signed in, not by possessing a link.

Migrations ran **additive-then-narrowing**, each step keeping a green suite behind it. `gender` was
the one lossy backfill and existing rows were marked unknown-and-flagged rather than guessed.

### Phase 6 — the entrant application (2026-08-10)

The public pages moved off FastAPI templates into a real service: React Router 7, server-rendered,
**zero client JavaScript**, its own compose service reachable only through nginx, sharing
`packages/design-system` with the operator console. A blocking 4 KB page-weight gate and a
`script-src 'self'` CSP hold the floor.

This phase is also the program's most useful failure. For two days it was code-complete and shipped
a product that did not work: the signup page loads Turnstile from `challenges.cloudflare.com`, our
own CSP blocked it, the widget never rendered, and **every entrant signup answered
`403 AUTH_CHALLENGE_FAILED`** in every deployed stack. The unit gates could not see it — the policy
comes from nginx, and no dev server or jsdom test is ever sent one. It took a real browser in front
of the real containerised stack. The fix admits that one origin on `/e/signup` and nowhere else,
and an e2e spec fails if the allowance ever widens. See
[the entrant tier](/explanation/architecture/entrant-tier#the-three-hard-constraints).

Step 3 — a transactional email provider with SPF/DKIM/DMARC — was **deferred entirely**. That is
why entrant email verification and password reset do not exist.

The same browser pass closed finding **F-E1-2** (`fc26f5a`): the commit seam had keyed roster rows
on the *entry*, so a bracket roster read "42 players" for 23 people and the public entrant list
named someone once per event they had entered. A roster row is a human, so it is now keyed on
`entry_player_id`, and adoption matches either that id or the row's `sourceEntryId` so a roster
written by the old build is adopted rather than duplicated.

### Phase 6-2 — the public information architecture (2026-08-11)

The three pages that make the tier a site rather than a form: `/e/` discovery with
status/date/text filters ordered actionable-first, `/e/{slug}` with phase-gated Overview | Events |
Entrants tabs, and `/e/{slug}/enter` as a genuine two-column desktop layout that is fully usable at
390px. Fourteen shared components, each state-tested by SSR string renders. The throwaway E1 page
and the Phase B mocks were deleted only after every old URL was proven to serve its replacement.

Verified live through nginx against a seeded demo stack: byte-identical 404s for a closed page and
an unknown slug, OG/meta derived from the loader, the double-submit CSRF token and loader-minted
idempotency key on the real form, an anonymous submit refused by code, a signed-in quote re-posting
its body to render the quoted total, submit to receipt, and a replay returning the identical
`Location`. The operator desk received the submission.

**Gates:** entrant vitest 530 (from a 399 baseline), backend pytest 1596 passing / 66 skipped,
typecheck and eslint clean, depcruise 0 errors, and the blocking page-weight gate at
**2.0 / 2.1 / 3.2 KB gzipped with 0 script tags** for discovery, tournament and enter.

### Phase 6-2 F — the design audit and the verification that judged it (2026-08-12)

Six surfaces audited against the craft floor; findings in `docs/audits/2026-08-11-design-audit.md`.
Truncation removed at 71 sites across 45 files, em dashes removed from user-facing copy across
~110 files, the Gantt drift predicate rewritten, bracket segment layout reshelved, motion tokens
reconciled onto one scale, a 1024px breakpoint and off-canvas drawer added to the operator shell,
and table semantics restored where `role="button"` had flattened every cell. Two source-scan
contracts now keep truncation and em dashes out, each **proven red by mutation** rather than
trusted for being green on an already-clean tree.

Then a browser pass judged the six fixes that had shipped on unit tests alone: five confirmed, and
**one broken**. The truncation sweep had replaced one way of destroying a value with another —
`break-words` on flex children that collapse to 60-90px breaks the word itself. Fixed by giving the
columns room, never by putting the ellipsis back. The durable lesson is in the ledger: the sweep had
copied a previous fix's property without its reasoning. Wrapping is necessary, not sufficient.

## What is still owed

**Before anything is public:**

- **Phase 2 has not run.** Nothing in this program has touched DNS, tunnels, exposure or keys —
  every demo above is a local stack. The `[USER SIGN-OFF]` security gate on public exposure is
  still owed and comes after it.
- **Email does not exist**, so entrant accounts cannot be verified and passwords cannot be reset.

**Known gaps in what is built:**

- **Public draws, matches and results are not there.** The tab bar is built so new tabs are data
  additions, pending the migration of Display's projections under the public site. It is the
  largest gap between what the tier claims and what it does.
- **No signed-in surface** (my entries, profile, withdraw) — that is E2, and the API does not exist.
- **Finding F-E1** — an entry event maps onto a Meet **division**, not a rank slot. Still open, and
  deliberately not patched ad hoc.
- The **receipt page reads no submission at all**, so any well-formed UUID renders one. That is
  uniform, so it is not an enumeration oracle, but it does mean a receipt is not evidence of
  anything. Logged as a Phase 7 follow-up.
- Four open design calls from the audit — the fixed 88px bracket card height against wrapping text,
  the page-weight fixture being smaller than production, bracket auto-fit having underdelivered
  against its claimed numbers, and `WorkspaceInspector` being hidden below `lg`.

## See also

- [Entries module](/reference/modules/entries) · [Entrant tier](/explanation/architecture/entrant-tier) — what this program built
- [Progress reports](/history/progress/) — the board across all programs
- [API reference → Entries](/reference/api/#entries-the-public-entrant-surface) — the public route table
