# Work package 15 — publication and entrant privacy

Branch `feat/surface-book-remediation`, repo HEAD `3b52f4eb` at verification time. Scope: `tests/backend/**` (new `test_publication_matrix.py`), `apps/api/src/entries/**` + `apps/api/src/display/**` (fix-only), `apps/console/src/modules/settings/PublicationSettings.tsx` + `apps/console/src/modules/setup/SetupProduct.tsx` (targeted copy/state edits for V3-OC13.1/13.2/OC20.1), and `docs/audits/v3-consolidated/`, per plan.md §5/§6, contract §9 + §2.4 D8, the fixture reports, the code map §4, and the routed findings (V3-OC12.1 verify-only, V3-OC13.1, V3-OC13.2, V3-OC20.1).

No commits were made (per instructions).

## Files touched

- `tests/backend/test_publication_matrix.py` (new) — the publication matrix test.
- `apps/console/src/modules/settings/PublicationSettings.tsx` — one string change (V3-OC20.1).
- `apps/console/src/modules/setup/SetupProduct.tsx` — labels, a multiline description field, and a preview-retry affordance (V3-OC13.1/13.2).
- `apps/console/src/modules/settings/__tests__/SharingTab.test.tsx` — two selectors sharpened to survive the new draws-row copy (see below).
- `docs/audits/v3-consolidated/ledger/15-strings.md` (new).
- `docs/reference/debt-log.md` — new "Work package 15" subsection (one item).
- `apps/api/src/entries/**` / `apps/api/src/display/**` — **no changes.** Every gate the matrix exercised (audience 404/discovery, entrants/draws/results content toggles, the opt-out/unconfirmed/erased degradation rule, the display-token projection's restricted-field absence) was already correct; D8 (`called` must not read as `live`) was already fixed by an earlier package (`entries_site.py::_meet_public_status`, contract-cited at line ~2396). No DTO shape change was needed, so `make generate-api` was not run.

## The matrix

`test_publication_matrix.py` builds ONE bracket workspace in-test (existing fixture/factory pattern, no demo data) with four seeded people covering every identity-degradation case in one draw:

- **Ada** — confirmed, listed (the control case).
- **Bo** — confirmed but `list_opt_out=True`.
- **Cass** — `pending` (unconfirmed).
- **Dev** — confirmed then `erased_at` stamped; the bracket blob independently carries his real name too, to prove the fallback rule.

One match is recorded with a score (for the results-on/off assertions); one is merely court-assigned (unstarted).

Dimensions exercised (18 tests, several parametrized):

- **audience** {private, unlisted, public} — discovery-list membership, slug reachability, and the uniform 404 across draws/players/matches/page for private.
- **entrantsPublished** {off, on} — the directory list is the toggle's scope; a confirmed, non-opted-out name stays resolved in the *draw* regardless (V3-OC20.1's exact claim), while it only appears in the *players directory* once the toggle is on (no `bracketPlayers`-blob name to fall back on in this fixture).
- **drawsPublished** {off, on} — the draw index's `published`/empty-envelope gate.
- **resultsPublished** {off, on} — score is null and no match ever reads `"completed"` with results off (D8's own claim: results-off hides the ledger, never the state); with results on, the recorded match is `completed` with a real score.
- **session** {signed-out, tournament-member (bootstrap operator's own session on the same `TestClient`)} — the identical public route returns byte-identical JSON either way; session state is not a publication toggle. (A signed-in *entrant* session was not separately exercised: the public entries_site/_json routes covered here are unauthenticated by construction — no cookie changes their output — so the property is already proven by the signed-out vs. member comparison; a true third leg would only re-test the same code path.)
- **Restricted-field walk**: a generic recursive scan of every response body's keys against an enumerated restricted set (`email`, `phone`, `birthYear`/`birth_year`, `remarks`, `accountId`/`account_id`, `partnerEmail`, password fields — read off `EntryPlayer`/`EntrantAccount`/`Entry` in `db/models.py`), across the page projection, season list, draws index/detail, players directory, player page, schedule, and the display-token `summary`/`bracket` routes. One field, `viewer.email` on the page projection, is explicitly excluded — it is the *requesting* viewer's own account email (`ViewerDTO`), not another person's contact data.
- **Degradation-specific tests** (deliverable #2): one test each for opt-out, unconfirmed, and erased. All three assert the exact dead-reference shape `{"identity": None, "resolution": "dead", "label": "Player not published"}` and that the person's real name does not appear anywhere in the draw-detail JSON at all — stricter than "falls back to a generic label," because an entry-backed hidden person is distinguished from an imported/never-entered participant (which *does* get to keep its name as inert display text under `_dead_person`). The erased case specifically proves the bracket blob's own independently-copied "Dev Roy" never resurfaces once the entry is erased.

18/18 pass.

## Findings verified/fixed

- **V3-OC12.1** — routed here for verification only (fixed by package 05). Confirmed: no "future public projection" / "public contact details" string remains in `apps/console/src/modules/settings/` or `apps/console/src/modules/setup/`. No action needed.
- **V3-OC13.1** — "Public information editor" labels/description. Applied: `Public slug` → `Tournament page address` (+ a hint stating only the slug segment changes), `Regulations URL` → `Regulations link`, `Logo URL` → `Logo image link`, `Banner URL` → `Banner image link`; the single-line Description input became a 4-row `<textarea>` in the same form footprint (styled inline to match `TextField`, no design-system export added — out of this package's file scope).
- **V3-OC13.2** — preview-failure message. Replaced the identical "Preview unavailable. Check the address before saving." on both logo and banner boxes with "The image could not be loaded from this link." plus an in-box "Retry preview" button that clears the error state and remounts the `<img>` (forcing a fresh fetch attempt). The acceptance's second half — distinct copy for *field-invalid* vs. *fetch-failed* — needs URL-syntax validation this component doesn't have; logged as debt (`V3-15-1`) rather than fabricating an "invalid URL" claim the code can't back up.
- **V3-OC20.1** — draws-row description in Publication settings. Changed "Draw structure and seeds. Scores remain hidden unless results are published." to the finding's exact text: "Shows draw pairings and player names. Scores appear only when Results is on." Verified true by the matrix test: names resolve in the draw independent of `entrantsPublished`.

## Incidental test fix

`PublicationSettings.tsx`'s draws-row text now contains the word "Results" (by design, per V3-OC20.1). Two `SharingTab.test.tsx` assertions used `getByLabelText(/Results/)` to find the *Results* checkbox specifically; that regex now matches both checkboxes' accessible names ambiguously. Sharpened both to `getByLabelText(/^Results/)` (the true Results checkbox's label starts with "Results"; the draws checkbox's label starts with "Draws & seeded entries"). This is a direct, intentional consequence of the finding's own acceptance text, not a behavior change to paper over.

## Commands run and results (verbatim)

```
$ .venv/bin/pytest tests/backend/test_publication_matrix.py tests/backend/test_entries_site_api.py tests/backend/test_public_schedule_api.py tests/backend/test_entrant_ssr_contract.py tests/backend/test_display_public.py tests/backend/test_tenant_isolation.py -q
........................................................................ [ 82%]
...............                                                          [100%]
87 passed in 128.94s (0:02:08)

$ .venv/bin/ruff check apps/api tests/backend
All checks passed!

$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Contracts: 15 kept, 0 broken.

$ npm --prefix apps/console run test:run -- src/modules/settings src/modules/setup
 Test Files  13 passed (13)
      Tests  103 passed (103)

$ npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
```

(The 134 lint warnings are pre-existing, downgraded-to-warn rules per CLAUDE.md's lean-gate philosophy — zero errors, none newly introduced by this package's edits.)

## Debt logged

- **V3-15-1** (`docs/reference/debt-log.md`, "Work package 15"): V3-OC13.2's full acceptance wants distinct messages for a field-validation failure vs. an image-fetch failure. Only the fetch-failure half was in scope for a copy/state fix (done); adding URL-syntax validation to the Logo/Banner/Regulations fields is a small but real behavior change, left for a future package.
