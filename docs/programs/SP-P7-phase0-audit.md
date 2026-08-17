# SP-P7 — Phase 0 audit (read-only). STOP for Kyle's sign-off.

**Date:** 2026-08-17 · **Tree:** `design/console-2` @ `8619446` (contains both `dev/prog1-p6-entrant-app` and `dev/prog1-p6-2-public-ia` as ancestors — the audit tree is current).
**No implementation code, migrations, or tests were written.** This file is the only artifact.

---

## 1. Current public tier — what actually exists

The prompt's "React + Vite + Zustand" framing is wrong for this tier (rule 9: tree wins).
The public site is **`products/scheduler/entrant/` — a React Router 7 SSR app** (node behind
nginx), Tailwind, `@scheduler/design-system` as its only shared dependency. State management
is loaders + URLs; there is **no client-side data fetching anywhere in the tier today**.

- Routes (`entrant/app/routes.ts`, explicit config): `/e/` discovery, `/e/{slug}` tournament
  page, `/e/{slug}/enter` (+ `/signed-in`, `/created` outcome aliases), `/e/{slug}/receipt/{submissionId}`,
  `/e/signup(/:slug)`, `/e/login` (+ outcome aliases), `sitemap.xml`, `robots.txt`, `health`.
  Static segments rank above `:slug`; **any new top-level segment (e.g. `me`) must be added to
  the reserved-slug discipline** (`tests/reservedSlugs.test.ts`).
- The tournament page (`routes/tournament.tsx`) already has a **phase-gated tab bar**
  (`lib/phase.ts` `visibleTabs`): Overview · Events · Entrants. Overview currently renders
  **Fees + Payment cards** and **Regulations as an inline `<details>` collapse** — both are
  what §3.7 changes. Timeline and venue cards exist and stay.
- nginx (`products/scheduler/frontend/nginx.conf`): `/e/api/` and `/e/account/` →
  FastAPI (cookie allowlist **forwards the entrant session cookie**), `/e/` → node :3000.
  One rate-limit zone (`sw_entries`) meters all four entrant locations.

### The SSR credential seam (load-bearing for My Entries)

Ruling **R8-D**: node never relays credentials. `apiFetch.server.ts` `apiGet()` sends a frozen
`accept`-only header allowlist and **hard-rejects any path outside `/e/api/`**. Consequence,
pinned by `tests/test_entrant_ssr_contract.py`: `ViewerDTO.signedIn` is **always false on
SSR**; identity is only visible to a **browser** request that carries its own cookies
(nginx forwards them on `/e/api/` and `/e/account/`). `GET /e/account/me` (api/entrants.py:651)
already answers identity to such a request. **My Entries is the first authenticated page on
`play.*`** — see §6 proposal.

## 2. Entrant auth / session

`entrant_accounts` + `entrant_sessions` (models.py:1102–1206): separate principal type (R10),
Argon2id, hashed opaque cookie token, `services/entrants.resolve_session`. CSRF: dual-channel
(`app/form_csrf.py` — session-derived token or SSR-minted `sw_play_csrf` digest). Account
routes owned by FastAPI at `/e/account/{signup,login,logout,me}`.

## 3. Entry schema vs R13 — and the §3.1 lifecycle mapping

R13 is fully materialized: `entrant_accounts → submissions → entries → entry_players`
(models.py:1209–1584).

- `Entry.state` vocabulary: `pending` (default), `confirmed`, `waitlisted`, `withdrawn`,
  `rejected`, `unverified` (reserved). **The desk writes only `pending → confirmed`**
  (api/entries.py:219; reject/promote/withdraw are E2, deliberately absent —
  EntriesDesk docstring pins this). `withdrawn_at` column exists.
  → §3.1's withdrawn/rejected question: **modeled in schema, no write path yet.** Render
  support (gray chip, no pricing) is buildable now; nothing produces the states until E2.
- Money: `submissions.fee_total_cents` + `fee_basis` — **one snapshot total**. There is no
  separate "confirmed total"; quoted and confirmed states show the same snapshot (R-P7a
  compatible — entry data frozen at submission).
- §3.1's three public states map: `Awaiting confirmation` = submission whose entries are
  `pending`/`waitlisted`; `Entered` = any `confirmed`; `Played` = tournament_date past.
  (A mixed submission — one entry confirmed, one pending — needs a per-event chip or a
  "partly confirmed" rule; **decide at STOP**, propose per-event chips within the card.)

## 4. Person identity — R-P7c is RESOLVED by the tree (no STOP finding)

`entry_players (tournament_id, id)` **is** the stable person-in-tournament identity. The
commit seam (`services/entries.py`) already materializes **one roster player per person** —
deterministic id `entry-{entry_player_id}`, adopt-don't-duplicate (`_adoptable`), explicitly
rejecting the person×event fan-out (the "42 rows for 23 people" defect is fixed and
documented in `_entrants`). The public entrant list already groups by `entry_player_id`.

- **person_key proposal:** `entry_player_id` (opaque UUID) — never the name.
- **Caveat:** hand-added roster players and bracket participants with no entry behind them
  have no `entry_player` row. Rule: names in draws/matches link to a player page **only when
  resolvable to an entry_player** (via `entries.committed_player_id` ↔ roster
  `sourceEntryId`); otherwise plain text. Player pages exist for entered persons only.

## 5. Where draws, matches, scores, results live

Two origins, non-merged (ADR 0006):

- **Bracket:** `bracket_events` (format: 6 kinds via FORMAT_REGISTRY — single/double elim,
  RR, swiss, compass, monrad; `status` draft→…, `seeded_count`), `bracket_participants`
  (name, **seed**, member_ids, meta incl. club), `bracket_matches` (round_index, match_index,
  slot_a/b with `feeder_play_unit_id` source refs — §3.3's "Winner of QF 3" is derivable),
  `bracket_results` (winner_side, **sets-mode score blob** `{'sets':[{sideA,sideB}]}`,
  walkover, reason). Court/slot assignments exist per play unit (assign/unassign + solver).
  Consolation = loser-routing formats (feeder_take), not a separate table.
- **Meet:** matches live in the `tournaments.data` blob (`MatchDTO`: sideA/B player-id lists,
  `eventRank`); schedule as slot/court assignments; live state + **match-level scores only**
  (`match_states.score_side_a/b` — no per-game scores for Meet). No draws, no seeds.
- **Standings math EXISTS, pure and unit-tested, backend-side:**
  - RR/Swiss: `services/bracket/standings.py` — BWF chain (wins → games ratio → points
    ratio → H2H → id). Computes PL/W/L, games W-L, points W-L, position. **No draws column
    (D) — WinnerSide.NONE counts nobody**; History pills derivable from round_index order.
  - Meet: `services/meet/standings.py` — school-vs-school W/L (already served on state DTO).
  → §3.4's column set adapts to: **PL · W · L · GM · PTS · Pos (+History)** — no D, no
  invented "match ratio" beyond what the BWF chain computes. Winners tab's RR rank-1 uses
  the same function (§3.6 requirement met without new math).
- **Slot→wall-clock conversion is frontend-only today** (`frontend/src/lib/time.ts`). The
  projection layer must own it server-side (house pattern: `_moment`/`_moment_iso` pairs).

## 6. Existing public API conventions (what §5 adapts to)

- Prefix: **`/e/api/`** (entries_json.py, `APIRouter(prefix="/e/api")`) — not `/public/`.
  `apiGet` structurally rejects anything else; nginx already routes it. All new projection
  endpoints go here.
- Serialization: camelCase Pydantic DTOs, explicit field-by-field construction (allow-list
  by construction — `EntrantRowDTO` docstring is the house statement of the discipline).
  Negative-control tests exist as precedent (`tests/test_entries_json_routes.py`).
- Uniform 404: `_resolve` (entries_public.py) — unknown slug ≡ closed page. Slug is the only
  public key; raw tournament UUIDs never are (display-token routes are the second precedent).
- Caching: **no Cache-Control on any public route today** (one `no-cache` in brackets.py).
  Short max-age is new. Trap: `EntryPageProjection.viewer` is per-cookie — the page
  projection must NOT get a public cache header while it carries viewer; new public
  endpoints carry no viewer-style fields; `/e/api/me/*` is `Cache-Control: private, no-store`.
- Session-free routes must each be a justified entry in the auth-surface test (I5).
- Tenancy: public routes bypass `require_tournament_access` by design (slug-resolved);
  `tests/test_tenant_isolation.py` derives operator routes from OpenAPI — new operator
  publication route needs the `tournament_id` + dependency seam.

## 7. MatchCard — reuse is blocked by an ERROR-level boundary

`frontend/src/components/control-plane/MatchCard.tsx` is the console MatchCard, but the
entrant app **cannot import operator frontend** (depcruise `entrant-no-operator-frontend`,
ERROR). Shared surface is `@scheduler/design-system` only. Options:
- **(a) Entrant-local `MatchCard.tsx` implementing the mockup anatomy** (header strip /
  two sides / footer strip, winner dot, tabular numerals) — SSR-friendly, Tailwind. ~Recommended.
- (b) Extract the operator card into design-system — heavier: it is coupled to operator CSS
  vars and StatusPill; would drag the console-2 agent's active surface.
§3.3 says "reuse or extract, never duplicate" — true reuse is structurally impossible
without (b). **STOP decision: accept (a) as anatomy-parity-by-spec, or order (b).**

## 8. Publication model — findings and the flag home

- No publication flags exist. Current gates: `entry_pages.is_open` (whole page) and
  per-entry `list_opt_out`.
- **Flag home: `entry_pages`** (3 boolean columns, default false). Rationale = the venue
  columns' recorded argument: public-page configuration, outside the blob, can never 409
  against CONFIG_LOCKED. A public tournament page only exists where an `entry_pages` row
  does, so flags without a page are moot. No new table.
- Operator UI home: **`products/settings/SharingTab.tsx`** (the prompt's named example
  exists). Note: **no operator UI calls `PUT /entry-page` today** (page config is
  API-only — F-E1-2-D1 history); the card will be the first UI writer, so propose a narrow
  `PATCH .../entry-page/publication` rather than racing the full PUT.
- Regulations metadata: `regulations_version` exists (bumps only on real text change —
  Q11.4). **No per-regulations updated-at** (`updated_at` is row-level). Migration adds
  `regulations_updated_at`, set on version bump.

## 9. Contradictions with the prompt (rule 9 register)

| # | Prompt says | Tree says | Proposed resolution (STOP) |
|---|---|---|---|
| C1 | Public tier is React+Vite+Zustand | React Router 7 SSR app, `products/scheduler/entrant/` | Build in the entrant app; no new framework needed |
| C2 | Routes `/public/tournaments/{slug}/...`, `/e/me/entries` | House prefix `/e/api/`, page-scoped; `me` collides with `:slug` | Endpoint/route names in §10; reserve `me` slug |
| C3 | §3.2 entrants = **confirmed only**, gated **off** by default | Shipped list shows `pending+confirmed+waitlisted`, published whenever page is open (I6 "published by default") | **Kyle decides:** adopting SP-P7 silently unpublishes every currently-open page's entrant list until the TD toggles, AND narrows who appears. Alternative: default `entrants_published=true` on migration for pages already open (grandfather), default off for new |
| C4 | §3.2 row shows club | `EntrantRowDTO` deliberately excludes club — the acknowledgment copy consents to **name** publication only | Adding club to the public list widens consent scope; needs the acknowledgment copy updated in the same slice, or club dropped from the list |
| C5 | §3.3 header "club · city" | No city field anywhere (R12 minimization) | Render club only |
| C6 | RR columns "PL·W·D·L·M·GM·Points·PTS·History" | BWF math has no draws, computes W/games/points ratios | Adapt columns (§5 above); prompt permits |
| C7 | Rule 4: CI domain grep guard "must stay green" | **Guard does not exist** (program Phase 2 not started); zero `wongworks` literals in code | Nothing to keep green; do not add the guard in P7 (it's Phase 2's) — just add no hostnames |
| C8 | R-P7c "if no stable person identity → STOP finding" | Identity exists (`entry_players` + one-roster-row-per-person seam) | No finding; person_key = entry_player_id |
| C9 | My Entries "requires entrant session; redirect signed-out" | SSR structurally cannot know the session (R8-D) | First authed page: SSR shell + hydrated cookie fetch to `/e/api/me/entries`; 401 → client redirect to `/e/login?next=…` (add path to the `safeNext`/`_SAFE_NEXT` twins) |
| C10 | §3.4 draws for the tournament | Only **bracket** workspaces have draws; Meet has none | Draws/Seeds tabs render for bracket-origin events only; Meet workspaces show match lists on player pages and meet standings are out of §3.4 scope |

## 10. Proposed shapes (final names — approve at STOP)

**Migrations (one revision):** `entry_pages` + `entrants_published`, `draws_published`,
`results_published` (bool, default false, server_default false), + `regulations_updated_at`
(nullable datetime). Nothing else.

**Backend (`/e/api`, all in the entries-public family):**
- extend `GET /e/api/page/{slug}` → `publication: {entrants, draws, results}` +
  `regulations: {version, updatedAt}`; entrants list gains `personKey` (+`club` if C4 approved)
  and honors the gate (empty + `publication.entrants=false` when off)
- `GET /e/api/page/{slug}/players/{person_key}` — header, events+partners, matches
  (schedule always; scores/W-L only when `results_published`)
- `GET /e/api/page/{slug}/draws` and `/draws/{event_id}` — index; RR = teams+standings+rounds,
  elim = rounds→nodes (position, sides, seeds, sourceMatch refs, score, winner, time, court)
- `GET /e/api/page/{slug}/seeds`, `/winners`
- `GET /e/api/me/entries` — cookie-authed, `private, no-store`
- `PATCH /tournaments/{tournament_id}/entry-page/publication` — operator, 3 flags
- All public GETs: `Cache-Control: public, max-age=30` except the viewer-carrying page
  projection (unchanged) and `/me/*`.

**Entrant app routes:** `/e/me/entries` (reserve `me`), `/e/{slug}/players/{personKey}`,
`/e/{slug}/draws/{eventId}`, `/e/{slug}/regulations` (routed reader — deep-linkable, fits
the tier's document-per-click model; no modal). Tab bar: Overview · Events · Entrants ·
Draws · Seeded entries · Winners (gated by `publication`, phase-gated as today).
New entrant-local components: `MatchCard`, RR standings table, bracket tree (columns +
connector CSS, horizontal scroll on mobile), letter-grouped entrants with client-side filter.

**Phases:** as the prompt's §6, unchanged. Branch: **new branch off `main`** (or off
`design/console-2` once merged — Kyle's call); NOT on `design/console-2` — another agent
is actively working that tree, and Phase 1+ must run in its own worktree to avoid the
shared-git-index race. Gate baseline: deferred to Phase 1 start on the new branch (running
`make check` mid-flight on another agent's tree would baseline their WIP, not ours).

## 11. Deferred / follow-ups already visible

Live-state chip wiring (slot ships data-driven, scheduled-time only) · highlight-player
(stretch) · withdrawn/rejected **write paths** (E2, not this program) · "account has newer
details" TD hint (R-P7a) · global profiles (R15 v1) · mixed-state submission chip ruling
(§3 above) · Meet workspaces on the public tier beyond player pages.

**STOP.** Awaiting sign-off on: C3 (entrants gating/grandfathering), C4 (club consent),
§7 (MatchCard option a/b), §10 names, branch choice.
