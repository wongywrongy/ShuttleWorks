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
  recorded, never recomputed).
- **Entry** — one event for one player-unit. Lifecycle `pending →
  confirmed` today (reject/promote/withdraw are E2); `state` also
  reserves `waitlisted`, `withdrawn`, `rejected`, `unverified`.
- **Entry player** — the human being entered: name, gender (R12,
  required), club, birth year, remarks. One person in three events is
  one row — the stable person-in-tournament identity the public player
  pages key on (SP-P7, R-P7c).

## The public page

`entry_pages` is the workspace's public address: globally-unique `slug`,
`is_open`, director-authored regulations (versioned, with
`regulations_updated_at`), fee schedule + payment instructions (R14),
entry policy, venue identity — and the SP-P7 **publication gates**
(`entrants_published`, `draws_published`, `results_published`), flipped
from the Sharing tab. See
[Entrant tier](/explanation/architecture/entrant-tier) for what each gate governs.

## Seam A — commit to roster

`services/entries.commit_entries`: every confirmed entry with no
`committed_player_id` becomes a roster player exactly once —
re-runnable, additive, idempotent (R3). The deterministic roster id
`entry-{entry_player_id}` is one person one row, however many events
they entered, and is the join the public projections use to attach
clubs and player pages to draw participants.

## Where things live

- Routers: `api/entries.py` (operator desk + page config),
  `api/entries_json.py` (public page projection + quote + submit),
  `api/entries_me.py` (the entrant's own record),
  `api/entries_site.py` (public draws/seeds/winners/player pages),
  `api/entrants.py` (entrant accounts), `api/entries_public.py`
  (shared projection helpers, no routes).
- Operator UI: `modules/entries/EntriesDesk.tsx`; publication card on
  `modules/settings/SharingTab.tsx`.
- Program ledgers: `docs/programs/ENTRIES_PROGRESS.md` (SP-PROGRAM-1)
  and `docs/programs/P7_PROGRESS.md` (SP-P7) — working records in the
  repo, deliberately outside this site.
