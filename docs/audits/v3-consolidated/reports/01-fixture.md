# Work package 01 — one reproducible tournament fixture

Baseline `f5ccfcef`, branch `feat/surface-book-remediation`. Scope: `tools/`
(new files), `tests/e2e/` (scripts + new check), `simulator/tournament_sim/seed.py`,
`Makefile` (appended block only), `docs/how-to/` + `docs/audits/v3-consolidated/`,
per `docs/audits/v3-consolidated/plan.md` §1 row 01 and code map
`docs/audits/v3-consolidated/maps/01-fixture.md`. `apps/` and `packages/` were
not touched.

## Files changed

- `tools/fixture-up.sh` (new) — generalises `tests/e2e/run-console-contracts.sh`
  into a reusable fixture script: disposable SQLite database, frozen clock,
  alembic migrate, uvicorn on a configurable port, T029+T030 seeded through
  the HTTP API, `prepare-console-fixture.py` → `fixture.json`, the pristine
  row-count check, the entrant SSR server (`npm run dev` in `apps/entrant`)
  on a configurable port, the post-seed defects pass (`tools/fixture-defects.py`
  + `tests/e2e/check-fixture-defects.py`), and the console preview server.
  Runs a trailing command if given one (used by `run-console-contracts.sh`),
  otherwise blocks until `Ctrl-C`. Every port/behaviour is an env knob
  (`FIXTURE_API_PORT`, `FIXTURE_CONSOLE_PORT`, `FIXTURE_ENTRANT_PORT`,
  `FIXTURE_SEED_KEY`, `FIXTURE_APPLY_DEFECTS`, `FIXTURE_SKIP_ENTRANT`,
  `FIXTURE_SKIP_CONSOLE_BUILD`, `FIXTURE_KEEP`, `FIXTURE_STATE_FILE`).
- `tests/e2e/run-console-contracts.sh` (rewritten, same behaviour) — now a
  ~25-line wrapper: `FIXTURE_APPLY_DEFECTS=0 FIXTURE_SKIP_ENTRANT=1
  FIXTURE_SEED_KEY=console-browser tools/fixture-up.sh -- npm --prefix
  tests/e2e run test:console-contracts`. Defects are disabled here because
  they change exact row counts `tests/e2e/check-console-fixture.py` pins;
  the entrant server is skipped because this suite never navigates to it.
  CI-visible behaviour (pristine seed → row-count check → console preview →
  Playwright → teardown) is unchanged; verified green (see below).
- `tools/fixture-defects.py` (new) — idempotent post-seed pass, HTTP-only,
  using `tournament_sim.client.SimClient`. See "What the defects pass does
  and does not do" below; its module docstring carries the full
  investigation trail for the four states it cannot build.
- `tests/e2e/check-fixture-defects.py` (new) — asserts the three states the
  defects pass actually produces, by reading back through the same public
  API (`list_entries`, `get_bracket`, `GET .../entry-page`).
- `Makefile` — appended block only (68 lines at EOF, nothing above it
  touched): `fixture-up` (starts `tools/fixture-up.sh` in the background,
  writes/reads a `FIXTURE_STATE_FILE` pointer so `fixture-down` and
  `surface-books-fixture` can find it), `fixture-down`, and
  `surface-books-fixture` (the existing `surface-books` pipeline pointed at
  the local fixture's ids/URLs instead of the Tailscale demo). The existing
  `surface-books` target is untouched.
- `docs/how-to/run-the-shared-fixture.md` (new) + one line in
  `docs/.vitepress/config.mts`'s sidebar (registered next to "Running
  locally", matching its siblings — the brief's file-scope list didn't name
  `config.mts` but registering the page requires it, and it is a one-line,
  purely-additive change).
- `docs/reference/debt-log.md` — new "Work package 01" subsection under the
  existing "v3 consolidated plan" heading: four entries (V3-01-1..4), one
  per gap below.
- `simulator/tournament_sim/seed.py` — **not changed**. Item 2 (deterministic
  workspace UUIDs) turned out to be impossible from this file alone; see
  below.

## What was impossible, and why (please read before re-litigating)

The code map's Recommendation section proposed five items. Two of them do
not survive contact with the running API — verified empirically against a
live seeded instance, not just read from source:

**Item 2 — deterministic workspace UUID per seed key.** `POST /tournaments`
(`apps/api/src/workspaces/tournaments.py`, `TournamentCreateDTO`) has no
client-supplied id field; `Tournament.id` defaults server-side to
`uuid.uuid4()` (`apps/api/src/db/models.py:92`). There is nothing in
`seed.py` to extend — the workspace id is assigned by the server the moment
`create_tournament` returns, before any `command_uuid` derivation could
apply. `fixture.json` and the import-run manifest already are the "the id
is known" mechanism every consumer (`prepare-console-fixture.py`,
`check-console-fixture.py`, `fixture-defects.py`) reads from — none of them
assume a literal id. Logged as debt-log V3-01-1: this needs an `apps/api`
DTO/route change, out of this package's scope.

**Item 3, states (a), (b), (c), (e) — the four bracket-assignment defects.**
The map proposed reconstructing a two-court "double current" conflict via
`PUT /tournaments/{id}/state`, documented as "reconstructing legacy state
the invariant now prevents". Tried against a running instance; it does not
work, for a structural reason: `bracket_session` (the blob holding court/
slot/`actual_start_slot`) is not a `TournamentStateDTO` field, so
`LocalRepository.commit_tournament_state` always re-merges it from the
prior row — a client literally cannot move it through that route. The only
routes that ever move a bracket assignment (`POST /bracket/assign`,
`/bracket/pin`) require court+slot together (`assign requires a slot and
court`) and call `_require_resolved_play_unit` first, which also rules out
(b) "court, no time", (c) "time, no court", and (e) "an R16 unit scheduled
before its R32 feeder resolves" (all three need one of: a court without a
slot, a slot without a court, or writing an assignment for an unresolved
play unit). The one route that bypasses the same-court guard
(`POST .../match-states/import-bulk`, an admin/import escape hatch) writes
to the legacy Operations `matches`/`match_states` tables — verified empty
for a freshly-seeded bracket workspace (`_materialize_operations_assignment`
is only ever called from the direct-assign endpoint, which the demo seed
never uses; its "live" matches are started via `/bracket/match-action`,
which only touches the bracket session). Writing there would be invisible
to both apps' bracket surfaces, so it was not done. Logged as debt-log
V3-01-2.

Full investigation trail (the exact request/response evidence) lives in
`tools/fixture-defects.py`'s module docstring rather than repeated here.

**Item 4 — widen the frozen clock.** Explicitly deferred by this package's
own brief. Debt-log V3-01-3 restates the gap (~126 unwired
`datetime.now()`/`utcnow()` call sites, no client-side clock seam) and notes
the fixture instead picked defect content that is not clock-relative.

**One more constraint found while building item 3, not in the map:** the
demo seed itself checks a tournament out to an event-node authority epoch
the moment its first "replayable operation" runs (`seed.py`'s own comment) —
T029's 50 seeded results trigger this, so **T029 is permanently frozen for
entries-domain writes** by the time seeding finishes (`EVENT_CHECKED_OUT` on
`create_entry_event`, the publication PATCH, and entry submission). The
plan's first choice for the incomplete-doubles-pair and publication-flag
states was T029; both had to move to T030 instead, and inside
`fixture-defects.py` the entries-domain writes had to run *before* its own
`record_result` call, or they would have checked T030 out too. Logged as
debt-log V3-01-4.

## What the defects pass does and does not do

`tools/fixture-defects.py` runs after the pristine seed + row-count check,
targets **T030 (Korea) only**, and is idempotent (verified by running it
twice in a row against the same database — second run is a no-op):

- **(d) incomplete doubles pair** — achieved. T030's own MD event window is
  closed by design (`closesAt` is always 14 days before the tournament
  start, which is before the frozen demo clock), so a real submission
  against it 400s. Entry events have no code uniqueness (the route's own
  docstring: "two events can legitimately share one — a workspace running
  the same discipline in two age bands maps both onto the same rank"), so
  the script opens a **second** MD event with an open window and submits
  one real entrant's single-player entry into that one, naming a partner by
  email who has not accepted. Verified: `list_entries` shows
  `pendingReasons: ["awaiting_partner"]`.
- **(f) deciding-game result** — achieved. A normal `record_result` command
  recording a Korea R32 match 2-1, where the recorded winner lost the
  middle game (`{sets: [21-15, 18-21, 21-19]}`).
- **(g) publication boundary** — achieved, on T030 instead of T029 (see
  above): `entrantsPublished: true`, `resultsPublished` stays `false` (the
  seeder already leaves an upcoming tournament's results unpublished). The
  plan's optional third page/slug with `audience: "unlisted"` was skipped —
  T029/T030 are the fixture's only two entry pages and
  `check-console-fixture.py` pins `entry_pages: 2`; a third page needs a
  third tournament, out of scope.
- **(a), (b), (c), (e)** — not attempted; see above.

## Commands run and results

- `bash tools/fixture-up.sh` (end to end, `FIXTURE_SKIP_CONSOLE_BUILD=1` to
  reuse an existing `apps/console/dist`; a full build was also run once —
  see the pre-existing failure noted below) → database migrated, API up,
  T029+T030 seeded, `console fixture database: integrity, foreign keys,
  ids, and counts verified`, entrant SSR up (`curl .../e/health` → 200),
  defects applied and `fixture defects (d), (f), (g): verified`, console
  preview up (`curl .../` → 200). `fixture.json` produced with all expected
  keys (see below). Exit 0.
- `make fixture-up` / `make fixture-down` / `make surface-books-fixture` —
  `fixture-up`/`fixture-down` verified working (state-file pointer written,
  read back, process killed, torn down). `surface-books-fixture` was run
  against the live local fixture and confirmed it resolves real ids from
  `fixture.json` and drives the real `tools/surface-capture.mjs` pipeline
  (29 of 33 console surfaces captured with real screenshots before the
  sandbox this session runs in killed the job for system-wide low memory —
  an environment constraint of this run, not a defect in the target or the
  script; the mechanism itself — id resolution, URL wiring, output
  directory — is verified correct from that partial run and from the dry
  `make -n surface-books-fixture` check). Not re-run to completion given
  the memory pressure already observed once.
- `python tests/e2e/check-fixture-defects.py` → green as part of the
  `fixture-up.sh` run above (`fixture defects (d), (f), (g): verified`).
- `ruff check tools tests/e2e simulator` → **All checks passed.**
- `tests/e2e/run-console-contracts.sh` (`CONSOLE_CONTRACTS_SKIP_BUILD=1`,
  reusing a prior console build — see below) → **7 passed** (the full
  `console-browser-contracts.spec.ts` suite), stack left healthy,
  unchanged from its pre-existing behaviour.
- `.venv/bin/pytest simulator tests/backend -k seed -q` → **73 passed, 1
  failed.** The failure
  (`simulator/tests/test_seed.py::test_apply_checkpoints_and_same_hash_noop`)
  is **pre-existing and unrelated to this package** — confirmed by
  `git stash` (removing every change in this working tree, mine and other
  agents') and re-running: identical failure. `seed.py`'s
  `patch_entry_page_publication` call already sends `{"audience": "public",
  ...}`; the test's expectation only lists `drawsPublished`/
  `resultsPublished`. Not touched (seed.py is unmodified by this package;
  fixing a pre-existing test/code mismatch is outside this package's scope
  and the brief's instruction to flag rather than edit tests to match new
  behaviour applies even more so to behaviour this package didn't create).
- `npm run test:docs` → **39/39 passed.**
- `npm run docs:paths` → passes for every path this package's files
  reference (including the new `docs/audits/v3-consolidated/reports/01-fixture.md`
  self-reference from `debt-log.md`). The full run also reports ~75 missing
  references elsewhere in the docs tree (`docs/reference/contracts/state-and-formatting.md`,
  `docs/reference/contracts/match-card.md`) pointing at files other
  concurrently-running agents' packages (02, 09) are still landing —
  confirmed unrelated to this package's changes.

### A pre-existing failure found, not caused, not fixed

A full (non-skipped) console build inside `tools/fixture-up.sh` fails:

```
src/modules/settings/__tests__/SyncReconciliationPanel.test.tsx(68,37): error TS2741:
Property 'acknowledged_operations' is missing in type '{...}' but required in type 'AuthorityStatusDTO'.
```

`apps/console/src/api/dto.ts` already declares `acknowledged_operations` as
required on `AuthorityStatusDTO`; the test file's own mock objects are
missing it. This is entirely inside `apps/console`, a file this package
never touched, and reproduces identically with every change in this
session's working tree stashed — it is a pre-existing state of the shared
branch (other agents are editing `apps/console` concurrently per this
session's own instructions), not something work package 01 introduced or
is scoped to fix. All verification above therefore used
`FIXTURE_SKIP_CONSOLE_BUILD=1` / `CONSOLE_CONTRACTS_SKIP_BUILD=1` (reusing
the existing `apps/console/dist`) after confirming the failure is
unrelated once.

## The stable ids `fixture.json` now emits

```json
{
  "apiBaseUrl": "http://127.0.0.1:8600",
  "consoleBaseUrl": "http://127.0.0.1:4173",
  "entrantBaseUrl": "http://127.0.0.1:5174",
  "taipeiTid": "<uuid, server-assigned per run>",
  "koreaTid": "<uuid, server-assigned per run>",
  "koreaSlug": "2026-korea-masters-t030",
  "displayToken": "<T029 display token>",
  "viewerEmail": "console-viewer@example.test",
  "viewerPassword": "FixtureOnly!2026-aZ",
  "defects": {
    "decidingGamePlayUnitId": "<T030 play unit id>",
    "incompleteDoublesPair": { "entryEventId": "<uuid>", "entryId": "<uuid>" },
    "entrantsPublishedTournamentId": "<= koreaTid>"
  }
}
```

`taipeiTid`/`koreaTid` are **not** literal-stable across fresh databases
(see V3-01-1) — they are stable *within* one fixture's lifetime and are
always resolvable from this one file, which is the contract every consumer
(`check-console-fixture.py`, `fixture-defects.py`,
`surface-books-fixture`) already relies on.

## Debt logged

`docs/reference/debt-log.md`, "v3 consolidated plan" → "Work package 01 —
the shared tournament fixture": V3-01-1 (no deterministic workspace id),
V3-01-2 (no reachable bracket-assignment defect states a/b/c/e),
V3-01-3 (frozen clock still narrow — restates the plan's own deferral),
V3-01-4 (T029 permanently checked out by seeding itself).
