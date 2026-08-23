# Entries

The intake module: public entry submission on the entrant tier, the
operator's Entries desk, and the commit seam that materializes confirmed
entries onto the workspace roster. Tier-1, user-enableable, and
**cloud-only** (`CLOUD_ONLY_MODULES`) — the dual-mode boundary (I3) ends
the cloud dependency at commit: event day never reads an entry row.

## The model (R13)

`entrant_accounts → submissions → entries → entry_players`:

- **Account** — who *acts*: the entrant principal (see
  [Entrant tier](/explanation/architecture/entrant-tier)), holding all contact data.
- **Submission** — one form act covering 1–N events: the retry unit
  (tenant- and account-scoped idempotency key), the regulations
  acceptance (`regulations_version_accepted`), and the money snapshot
  (`fee_total_cents` + `fee_basis` — the total shown is the total
  recorded, never recomputed). It is also the unit money is recorded
  against, because it is the unit that was actually paid.
- **Entry** — one event for one player-unit, carrying the lifecycle
  `state` and its `pending_reasons` flags.
- **Entry player** — the human being entered: name, gender (R12,
  required), club, birth year, remarks. One person in three events is
  one row — the stable person-in-tournament identity the public player
  pages key on (SP-P7, R-P7c).

## The lifecycle

Six states — `unverified · pending · waitlisted · confirmed · rejected ·
withdrawn` — defined with the transitions in `entries/lifecycle.py`.
An entry lands in `unverified` while the account's email is unproven and
is promoted in bulk the moment it is verified; it lands in `waitlisted`
where the event is at cap. The waitlist is excluded from the cap
comparison, so a queued entry never raises the bar for the next one.

`pending_reasons` are **flags, not states** (invariant I4 — software
flags, operators decide): `over_cap`, `awaiting_payment`,
`awaiting_partner`, `pair_conflict`, plus the duplicate and
gender-mismatch flags raised at submit. Nothing clears a flag by
confirming an entry and nothing confirms an entry by clearing a flag —
recording a payment clears exactly one reason and never advances the
state.

The operator moves entries from the desk (`confirm` · `reject` ·
`promote` off the waitlist · `withdraw`); the entrant may withdraw their
own, checked against the event's `withdraws_until`, optionally erasing
their details as they go.

## Doubles (Q6)

The nominating entrant names a partner by email at submit. The invite
token is stored **hashed** (invariant I5, the `auth_sessions`
precedent), mailed as a link, and accepted by the partner once they hold
an account — signing up first if they need one. Acceptance is guarded
twice, by the cleared hash and by `partner_accepted_at`, so a replayed
link is inert. Where two entrants claim the same partner the conflict is
raised as an operator-resolved flag, never auto-resolved.

## Money and retention

Payment is recorded manually at the submission level; v1 records a
payment made elsewhere and fixes the integration boundary for Stripe
without crossing it (Q8). A tournament that priced nothing is never
flagged unpaid — `None` is not zero.

Retention is **operator-invoked per workspace**
(`POST /tournaments/{id}/entries/retention-sweep`), not a background
job, and nothing is swept where the director set no `retention_days`.
It is idempotent, and it erases entry PII only: accounts persist, on the
reasoning that an entry describes someone who played one tournament
while an account is a live relationship (Q10).

The account carries both GDPR rights — export and erasure — and erasure
is a **scrub, not a delete** (ruling D7): identity overwritten, password
cleared, every session revoked, every entered player scrubbed, and the
director's submissions and entries left intact. Any future account
deletion must therefore not be a bare `DELETE`, which would cascade
through `submissions.account_id` and take confirmed entries with it.

## The public page

`entry_pages` is the workspace's public address: globally-unique `slug`,
`is_open`, director-authored regulations (versioned, with
`regulations_updated_at`), fee schedule + payment instructions (R14),
entry policy, venue identity — and the SP-P7 **publication gates**
(`entrants_published`, `draws_published`, `results_published`), flipped
from the Sharing tab. See
[Entrant tier](/explanation/architecture/entrant-tier) for what each gate governs.

Public reads honour `list_opt_out` identically wherever they appear: an
opted-out entry never prints, but it still occupies its place, so a
reserve list's positions stay truthful rather than closing up over the
rows it may not show.

## Signals (Q9)

The control plane reads Entries through `workspaces/entries_facts.py`, which
counts rows and decides nothing; the workspace phase and the six
attention codes are derived from that record by pure functions in
`workspaces/workspace_signals.py`. The counting is deliberately split
from the querying so that the whole vocabulary can be tested against
literals — and because `workspaces` may not name `entries` (see
[Contracts](/reference/contracts/)).

## Seam A — commit to roster

`entries/entries.py:commit_entries`: every confirmed entry with no
`committed_player_id` becomes a roster player exactly once —
re-runnable, additive, idempotent (R3). The deterministic roster id
`entry-{entry_player_id}` is one person one row, however many events
they entered, and is the join the public projections use to attach
clubs and player pages to draw participants.

## Where things live

Backend, all under `apps/api/src/`:

| Path | Owns |
|---|---|
| `entries/entries_routes.py` | Operator desk + page config (`/tournaments/{tournament_id}/…`) |
| `entries/entries.py` | The commit seam |
| `entries/lifecycle.py` | States, transitions, caps, withdrawal, erasure |
| `entries/partners.py` + `partner_routes.py` | Doubles nomination, invites, acceptance |
| `entries/money.py` | Paid/unpaid at the submission level |
| `entries/retention.py` | The sweep and the account scrub |
| `entries/entries_json.py` | Public page projection, quote, submit (`/e/api`) |
| `entries/entries_me.py` | The entrant's own record, export, erasure (`/e/api/me`) |
| `entries/entries_site.py` | Public draws/seeds/winners/player pages |
| `entries/entries_public.py` | Shared projection helpers, no routes |
| `identity/entrants_routes.py` | Entrant accounts: signup, login, verification, reset (`/e/account`) |
| `workspaces/entries_facts.py` | The counted facts the control plane reads |

Frontend: operator UI at `apps/console/src/modules/entries/EntriesDesk.tsx`,
publication card on `modules/settings/SharingTab.tsx`; the public tier's
pages at `apps/entrant/app/routes/` (`enter` · `myEntries` · `verify` ·
`resetPassword` · `partner` · `tournament`).

Program ledgers: `docs/history/programs/ENTRIES_PROGRESS.md`
(SP-PROGRAM-1) and `docs/history/programs/P7_PROGRESS.md` (SP-P7) —
working records in the repo, deliberately outside this site.
