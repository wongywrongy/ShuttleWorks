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
| 2 | My Entries + tournament page revisions | **DONE 2026-08-18** (0a3b08e) |
| 3 | Entrants + Player-in-Tournament | **DONE 2026-08-18** (cf4711a) |
| 4 | Draws, Seeds, Winners | **DONE 2026-08-18** (ceeb667) |
| 5 | QA pass (gate matrix, 380px, screenshots) | **DONE 2026-08-18** — browser pass below; screenshots in `docs/screenshots/sp-p7/` |

**Mid-program:** `design/console-2` merged in (fc788e3) once that agent
finished — one conflict + TWO recovered defects it left: the
`v6a1c5e8f3b4` migration (backups `origin`) referenced by its tests and
ledger but never committed (authored here, chained after `v6b2d6f9a4c5`),
and three frontend files (`lib/stateWords.ts`, `bracket/drawProgress.ts`,
`display/publicDisplay/rotation.ts`) imported by committed code but
existing only untracked in the main checkout (recovered verbatim,
15bc839).

## The zero-JS constraint and the page-scoped-script pattern (P2, load-bearing)

The tier ships no client JS (`root.tsx`: no `<Scripts/>`; the CSP has no
inline allowance), so SP-P7's browser behaviour could not hydrate. The
pattern that resolved it: **external same-origin ES modules from
`public/assets/`** — `script-src 'self'` already permits them, no CSP
surgery, the no-inline posture intact. Two exist: `my-entries.js` (the
one credentialed read + DOM render, textContent-only, XSS negative
control in its suite) and `entrants-filter.js` (progressive: the input
exists only when JS runs). Both are tested by importing the shipped file
(jsdom per-file), typed by sibling `.d.ts`, and scanned by the tailwind
content glob.

## Phase 2–4 — what shipped

- **P2 (0a3b08e)**: `/e/me/entries` (SSR shell + script; signed-out →
  `/e/login?next=…` through the existing `safeNext` twins; year groups,
  lifecycle chips, symbol-less money — `formatCents` documents why the
  mockups' `$` was dropped; badges + View-results links gated by the
  card's echoed flags). §3.7: fees off the overview (pointer row whose
  enter link respects the closed state; FeeTable deleted with its only
  consumer), regulations document row + routed reader
  `/e/{slug}/regulations`. Header gains a static My-entries link (R8-D).
- **P3 (cf4711a)**: alphabetical letter-grouped Entrants tab (person-key
  links, club under name, codes on the row, CSS columns, filter script);
  `visibleTabs` now takes the publication block — the prompt's §3.2
  self-contradiction resolved as: unpublished HIDES the tab (rule 4),
  published-and-empty renders "No confirmed entries yet."; the by-event
  anchors died with the by-event grouping. Player page
  `/e/{slug}/players/{personKey}` + the entrant-local `MatchCard` (header
  strip · sides · footer; data-driven chip slot carrying schedule-only in
  v1).
- **P4 (ceeb667)**: tab bar in the §3.7 order, scrolling inside its strip
  at 380px; Draws tab cards → `/e/{slug}/draws/{drawKey}`; RR = adapted
  standings table (Pos·Player·PL·W·L·GM·PTS·History pills) + round list;
  elimination = round columns in the card's own horizontal scroll, seeds
  `[n]`, byes muted, consolation as `?segment=` link-pills; Seeds and
  Winners panels with the partial-state header. Nodes reuse MatchCard.

## Phase 5 — QA (2026-08-18, real browser)

Stack: worktree backend on :8601 (fresh DB — **both new migrations
applied cleanly on a cold upgrade**), entrant dev server with the new
dev-only `/e/api` + `/e/account` proxy in `vite.config.ts` (mirrors
nginx's split; production untouched). Seeded: Riverside Autumn Open
(10 confirmed people + 1 pending, 8-SE MS with 3 QFs decided, 4-RR WS
fully decided, courts/slots assigned, everything published) + Spring
Classic (played, decided, for the My Entries card).

Verified in the browser (screenshots 01–17 in `docs/screenshots/sp-p7/`):
overview with fees pointer + document row; regulations reader; entrants
letter groups + live filter ("riverside" → exactly the 4 Riverside BC
members, groups collapse); player page (record bar, Coming up above
Played, resolved SF + scored QF); draws cards; elimination tree (seeds,
scores, "Winner of QF 4", "Court to be assigned"); RR standings (Elif
3-0 top, history pills); seeds; winners (1 of 2 decided); sign-in
round-trip → My Entries (mixed card "Awaiting confirmation" with
per-line chips, badges Winner/Runner-up, played card with View results +
"Total 40.00", quoted card "Quoted 55.00 · pay at the desk"); pending
person absent everywhere public. **380px**: page `scrollWidth ==
clientWidth` on entrants and the draw page (the tree scrolls inside its
container), sweeps of overview/entrants/draw/player/my-entries.

**Live negative controls** (§7, beyond the automated ones): PATCH
`resultsPublished:false` → every score gone AND the semifinals reverted
to "Winner of QF n" placeholders (screenshot 16), player record `None`,
zero decided matches; PATCH `entrantsPublished:false` → player page 404.
Flags restored after.

### Final gate results (2026-08-18)

Backend pytest full suite **1648 passed / 66 skipped / 0 failed**;
entrant vitest 644 / typecheck / lint / depcruise / build all green;
operator vitest 1762 + tsc -b green (post-merge); docs:build green.

## Deferred (the §10 enumeration)

- Live-state chip wiring (the MatchCard slot is data-driven; Operations
  state lands projection-side later).
- Highlight-player on the tree (stretch, skipped).
- Elimination connector LINES between columns (columns + round labels
  shipped; lines are visual sugar the card language reads fine without).
- Withdrawn/rejected write paths (E2 — render support shipped and tested).
- "Account has newer contact details" TD hint (R-P7a).
- Global profiles (R15 v1).
- Compass/Monrad plate winners in the Winners tab (`_event_winner`
  ponytail note); walkover annotation on public draw nodes.
- Mixed-card status vocabulary gained `withdrawn` (recorded P1).
- The mockups artifact `public-site-entrant-mockups.html` was not
  reachable this session (not in repo/plans/artifacts) — anatomy built
  from the prompt's binding contracts + the tier's design language; a
  side-by-side against the real mockups is a cheap follow-up if Kyle
  drops the file in.
- `docs/architecture/entrant-tier.md` + `docs/modules/entries.md` should
  gain the §3 surface routes… done in the entrant-tier page; keep fresh.

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
