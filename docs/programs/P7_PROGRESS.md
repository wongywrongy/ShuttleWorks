# SP-P7 — Public Entrant Surfaces: program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Plan:** the SP-P7 prompt (user-delivered 2026-08-17) + `SP-P7-phase0-audit.md`
(the Phase 0 report with the tree-vs-prompt register).
**Branch:** `dev/p7-p1-publication-projection`, worktree
`.claude/worktrees/p7-public-entrant`, based on `dev/prog1-p6-2-public-ia`
@ `6a5b177` (main predates the entrant tier; the console-2 agent's 15
commits were deliberately excluded while in flight — integrate before merge).
**Binding visual reference:** `public-site-entrant-mockups.html` (My Entries,
Player-in-Tournament, revised Tournament page).

## Phase table

| Phase | Name | Status |
|---|---|---|
| 0 | Audit + STOP | **DONE 2026-08-17** — signed off by Kyle (C3 default-off/confirmed-only; C4 club + consent copy; MatchCard entrant-local; `/e/api` names; own branch) |
| 1 | Publication model + projection API | **DONE 2026-08-18** — summary below; "full authority" granted, so the P1 STOP is a report, not a wait |
| 2 | My Entries + tournament page revisions | not started |
| 3 | Entrants + Player-in-Tournament | not started |
| 4 | Draws, Seeds, Winners | not started |
| 5 | QA pass (gate matrix, 380px, screenshots) | not started |

## Phase 1 — what shipped (commits 9e7df30 … 6f45095)

- **Migration `v6b2d6f9a4c5`**: `entry_pages` + `entrants_published` /
  `draws_published` / `results_published` (bool, server_default false) +
  `regulations_updated_at` (stamped only when the text actually changes,
  same condition as the version bump).
- **Operator control**: `GET /tournaments/{id}/entry-page` +
  `PATCH /tournaments/{id}/entry-page/publication` (patch semantics,
  strict body) + the "Public site" card on the Sharing tab (three
  checkboxes, hidden when no entry page exists). `ENTRY_PAGE_NOT_FOUND`
  added. Slug `me` reserved.
- **Page projection**: `publication` block, `regulationsUpdatedAt`,
  entrant rows gain `personKey` + `club`; list narrowed to **confirmed**
  (`_LISTED_STATES`), gated at the query; entry counts stay coupled to
  the listed set. Consent copy in `enter.tsx` now says "name and club …
  once the organizer publishes it" (C4).
- **`GET /e/api/me/entries`**: card-per-tournament, §3.1 lifecycle
  (`awaiting`/`entered`/`played`/`withdrawn`), summed submission
  snapshots, per-line states + result badges (gated, derived by the same
  `_event_winner` as the Winners tab). Private, no-store. Added to the
  entrant-reachable allowlist in `test_cross_principal_sessions.py`.
- **`api/entries_site.py`**: draws index/detail, seeds, winners, player
  pages — projected from the bracket module's serialized session (shared
  `response_cache`) + the Meet blob/`match_states`. Round labels, seed
  markers, W/L history pills, venue-local times mirroring `lib/time.ts`.
  **The advancement-redaction finding:** the engine overwrites feeder
  slots on resolution (`advancement.py`), so with results unpublished the
  projection reconstructs "Winner of SF 1" from the resulted dependency
  (`_derivation`) — sides, involvement, and match lists all use the
  redacted view.
- **Docs**: `docs/architecture/entrant-tier.md` written (the nav linked it;
  the page never existed).

### Gate results (2026-08-18, worktree)

Backend pytest **1639 passed / 66 skipped** (3 initial failures were all
SP-P7 seam reconciliations, fixed: entrant-reachable allowlist, parity
ledger rename, orphan-purge test now upgrades to its own revision).
Operator vitest **200 files / 1749 tests**. Entrant vitest **586** +
typecheck + lint. eslint 0 errors (116 warnings, lean-gate set).
depcruise 0 errors (15 warnings operator / 0 entrant). ruff clean.

### Negative controls demonstrated (rule 8 — accumulate for the completion report)

- Publication off-states are directly tested (not inferred):
  `test_an_unpublished_list_is_empty_even_when_entrants_exist`,
  `test_unpublishing_actually_stops_the_names_flowing` (via the real
  operator PATCH), `test_results_off_hides_scores_and_resolved_advancement`,
  `test_result_badges_respect_results_published` (both directions),
  `test_publication_flags_do_not_gate_the_owners_view` (§4 carve-out),
  seeds/winners `published: false` envelopes,
  `test_draw_detail_is_a_uniform_404_while_unpublished`.
- Privacy: `test_each_account_sees_its_own_acts_and_nothing_else` (the
  §7 pending-invisible-publicly/visible-to-owner trap),
  `test_a_pending_person_has_no_public_page`, key-set-exact tests on
  every public row (page entrants, me cards/lines, draw cards, standings
  rows, player page).
- Pre-existing negative-control instructions updated where the field set
  legitimately widened (`test_the_projection_never_carries_an_entrants_contact_data`
  now names `gender`/`birth_year` as the fields to try).

### Assumptions and deviations (flag at review)

- **Participant linkage**: entered persons are matched to bracket
  participants/roster rows by the commit seam's deterministic id
  `entry-{entry_player_id}` (exact id or `member_ids` membership). A
  participant named any other way degrades to "no link / no club" —
  calm, never wrong. Verify against the real roster→bracket flow in
  Phase 5.
- **Card status vocabulary** gained `withdrawn` (a card whose live
  entries are all withdrawn/rejected is not "awaiting" anything).
- **Fees on My Entries**: one card per tournament; `feeTotalCents` sums
  that account's submission snapshots (Seam B: summed, never recomputed).
- **Winners for compass/monrad plates**: positions/GF/last-segment
  heuristic covers se + de; plate winners deferred (ponytail note in
  `_event_winner`).
- **Entry counts** on the events list now count confirmed only (coupled
  to the list by the recorded invariant in `_entry_counts`).
- Doubles partners: E3 has not shipped; no partner data exists, so event
  lines and player pages render without "with X" until it does.

## Next task

Phase 2: `/e/me/entries` page (SSR shell + cookie-carrying browser fetch,
signed-out redirect via the `safeNext`/`_SAFE_NEXT` twins) + §3.7
tournament-page revisions (tab bar, regulations document row + routed
reader, fees off the overview). Integrate `design/console-2` into the
branch first (the other agent is done).
