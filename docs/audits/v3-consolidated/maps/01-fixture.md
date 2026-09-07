# Code map — package 01: one reproducible tournament fixture

Produced 2026-09-06 by an Explore subagent; orchestrator-reviewed. Paths verified at capture time.

## 1. How the demo / sample tournament is seeded

Canonical seeder: the simulator's BWF historical importer (writes over real HTTP).

- `simulator/tournament_sim/seed.py` — `_DEMO_LIVE_TOURNAMENT = "T029"`, `_DEMO_UPCOMING_TOURNAMENT = "T030"`, six courts, 30-min interval (L44-52). `_demo_dates` L1637 hardcodes T029 = 2026-07-28→08-02, T030 = 2026-08-04→08-09. `_demo_setup_sections` L1648-1772 (courts, sessions, events, venue, contacts, publicSlug). `_demo_operational_event` L1773-1797 (T029 keeps 50 R32 results; T030 none). `_demo_plan` L1808-1903 assigns slot 152 = 2026-07-31 13:00 Asia/Taipei, one live match per court (`court_id = position + 1`) — the shipped seed deliberately produces NO court conflict. `apply()` L1905-2264 is resumable and checkpointed into a JSON manifest.
- Fixture data: `simulator/fixtures/bwf-recent-completed.txt`, `-notes.txt`, `bwf-full-match-sources.json`.
- Seed manifest (`seed.py:1485-1493`): `{seedKey, seedFormatVersion, sourceSha256, tournaments: {T029: {workspaceId, slug, displayToken, urls…}}}` — the contract the capture pipeline `jq`s.
- Makefile: `Makefile:27-44` vars, `173-191` `demo-seed-*` targets. Deployment: `tools/demo-compose.sh` + `infra/compose/demo.override.yml` (8090 console / 8091 entrant / 8092 API).
- Other seeders (scenario-style, non-idempotent): `simulator/tournament_sim/scenarios/demo.py`, `scenarios/entry_states.py`, `demo_data.py`, `factories.py`, `rng.py`.

### Frozen clock — exists, nearly unwired

- `apps/api/src/core/demo_clock.py` `utcnow()` reads `SHUTTLEWORKS_DEMO_NOW` (local env only, tz-aware ISO). Set in `demo.override.yml:67-69` (`2026-07-31T05:15:00+00:00`) and `tests/e2e/run-console-contracts.sh:41`. Tests: `tests/backend/unit/test_demo_clock.py`.
- GAP: only product call site is `apps/api/src/entries/entries_json.py:76`; ~126 other `datetime.now/utcnow` call sites ignore it. No clock seam in console/entrant.

## 2. What the v3 books captured

- Workspace `9a885612-…` = T029 Taipei Open on the live Tailscale demo Postgres. Slug `2026-korea-masters-t030` = T030 (`seed.py:_slug` L1160; default in `tools/surface-capture.mjs:47`).
- `surface-capture.mjs:46` defaults `WS_ID` to a stale id; real captures pass `WS_ID` from `jq '.tournaments.T029.workspaceId'` (`Makefile:196`).
- The "two existing court conflicts" (Court 1, Court 3 — `docs/audits/surface-book-remediation/handoff.md`) are accidental durable state from live demo use, not seeded. The write invariant `apps/api/src/bracket/application.py:620-651` 409s any new double-current assignment, so the conflicts are unreproducible via supported API calls.

## 3. Existing full-tournament fixtures

| Artefact | Builds | Fit |
|---|---|---|
| `tests/e2e/run-console-contracts.sh` | temp SQLite → alembic → uvicorn :8600 with frozen clock → seed T029+T030 → viewer invite → DB check → console preview :4173 → Playwright | ~90% of target; never starts the entrant SSR server |
| `tests/e2e/prepare-console-fixture.py` | asserts counts, emits `fixture.json` (taipeiTid, koreaTid, displayToken, viewer creds) | handle producer |
| `tests/e2e/check-console-fixture.py` | exact row counts (bracket_matches 310, results 50, entry_pages 2, display_tokens 2…) | determinism gate |
| `tests/e2e/tests/console-browser-contracts.spec.ts` | 7 contract tests | consumer |
| `tests/e2e/tests/10-entrant-r11-evidence.spec.ts`, `11-public-bracket-geometry.spec.ts` | public tier against the compose stack (`global-setup.ts`) | different data source — the split to close |
| `apps/entrant/tests/helpers/entryPage.fixture.json` | one hand-written projection | entrant unit only |

## 4. Publication / audience model + privacy allow-list

- Storage `apps/api/src/db/models.py:2230-2325` (`EntryPage.audience` private/unlisted/public; `entrants_published`/`draws_published`/`results_published` default False). Migration `aa1b2c3d4e5f_entry_page_audience.py`.
- DTOs `apps/api/src/core/schemas.py:884-945`; route `entries/entries_routes.py:138-139`; public gate `entries/entries_public.py:123` (uniform 404); discovery filter `entries_json.py:690`; projection DTOs `entries_json.py:301-397`.
- Console UI `apps/console/src/modules/settings/PublicationSettings.tsx` inside `SharingTab.tsx`.
- Privacy allow-list: `apps/api/src/entries/entries_site.py` docstring L1-24; `PublicPersonDirectory` L164-179; `_public_identities` L182+ (excludes `list_opt_out`, unconfirmed, erased); results stripped when `results_published` off (L724).
- Seeder sets `audience: public`, `drawsPublished: True`, `resultsPublished: not T030` (`seed.py:2108-2115`); never sets `entrantsPublished`, never exercises `unlisted`/off.

## 5. Capture pipeline parameters

`tools/surface-capture.mjs` L46-55 env: `WS_ID, SLUG, DRAW_KEY, DOUBLES_DRAW_KEY, SUBMISSION_ID, DISPLAY_TOKEN, AUTH_ME_URL, PLAYER_KEY, CAPTURE_SETTLE_MS`. 33 console routes L58-101, 39 entrant routes L103-146, runtime player detail L253-279. Orchestrated by `Makefile:193-211` (`surface-books`, hard-requires the Tailscale demo). HTML disclaimer L486: "Timing is live demo data, not a frozen cross-surface snapshot."

## Recommendation

Generalise `tests/e2e/run-console-contracts.sh` into a fixture script; do not build a new seeder.

Needs building, in cost order:
1. Start the entrant SSR server in the same script (`API_BASE_URL` → :8600; export `E2E_PLAY_BASE_URL`).
2. Deterministic workspace UUID per seed key (extend `command_uuid(0, seed_key, …)` `seed.py:2223` to workspace create).
3. `tools/fixture-defects.py` post-seed step: two-court conflict (blocked by the 409 invariant — write via `PUT /tournaments/{id}/state` blob, documented as legacy-state reconstruction), approved slot w/o court, match w/o time, incomplete doubles pair (single `EntryPlayer`), unresolved predecessor (schedule an R16 whose R32 feeder has no result), completed match with loser winning a game (2-1 `record_result`), `entrantsPublished` on T029, `resultsPublished` off on T030, optional `unlisted` third page.
4. Widen the frozen clock to the ~10 modules driving phase/live/countdown rendering; no client-side clock seam exists.
5. `surface-books-fixture` Make target sourcing ids from `fixture.json` against local ports.
