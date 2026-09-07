# Run the shared tournament fixture

Both apps — the operator console and the public entrant tier — can be
reviewed against the same reproducible tournament: a disposable SQLite
database, the frozen clock, the canonical Taipei (T029, live) / Korea
(T030, upcoming) seed, a viewer invite, and an idempotent post-seed pass
that reconstructs a handful of known-messy operational states. This is the
v3 consolidated plan's work package 01 (`docs/audits/v3-consolidated/plan.md`
§1 row 01) — before this, the console and entrant tiers were reviewed
against two different databases (a disposable console-only fixture and the
live Tailscale demo), so a finding on one tier had no guaranteed counterpart
on the other.

## Start it

```bash
make fixture-up
```

This builds a fresh database, seeds it, starts the API on `:8600`, the
entrant SSR server on `:5174`, and the console preview server on `:4173`,
then prints the path to a `fixture.json` manifest once everything answers.
It runs in the background — `Ctrl-C` only stops the `make` invocation
itself, not the fixture — so tear it down explicitly:

```bash
make fixture-down
```

Only one fixture instance is tracked at a time (`/tmp/shuttleworks-fixture-up.state.json`
by default — override with `FIXTURE_STATE_FILE=...` if you need more than
one, though nothing else in this repo expects that).

## What you get

| Surface | URL | Notes |
| --- | --- | --- |
| Operator console | `http://127.0.0.1:4173` | Vite preview build (production-shaped bundle) |
| Public entrant tier | `http://127.0.0.1:5174/e/` | React Router dev server, `API_BASE_URL` pointed at the fixture's API |
| API | `http://127.0.0.1:8600` | Same process both tiers talk to |
| Manifest | printed path, e.g. `/tmp/shuttleworks-fixture.XXXXXX/fixture.json` | Every id, credential and base URL below |

`fixture.json` carries (at minimum): `taipeiTid`, `taipeiSlug`, `koreaTid`,
`koreaSlug`, `displayToken`, `viewerEmail`/`viewerPassword` (a real
viewer-role membership on Taipei), the four public-person handles below,
`apiBaseUrl`, `consoleBaseUrl`, `entrantBaseUrl`, a `defects` object naming
what the HTTP post-seed pass changed, and a `dbDefects` object naming what
the direct-ORM pass changed (both below).

| Key | What it is |
| --- | --- |
| `playerKey` / `playerName` | A published person on **Korea**. `/e/{koreaSlug}/players/{playerKey}` is a real profile page with events, seeds, a draw path and matches. |
| `linkedPlayerKey` | The **same human** on Taipei — same entrant account, same stored name, a different `entry_players` row. This is the cross-tournament identity a profile history is built from. |
| `withheldPlayerKey` | A person who was registered and then withdrawn. Present in the draw, renders `Player not published`, and their profile URL is a real 404. |
| `missingPlayerKey` | A well-formed UUID belonging to nobody — the other 404 branch. |

`tests/e2e/prepare-console-fixture.py` **proves** all four against the running
API before it writes the file: a fixture that merely claims a working profile
URL is how the missing-player finding survived a review cycle.

## The published-entrant layer

The bracket import alone produces people who are *display-only*. The public
person directory is built from **confirmed entries**
(`entries_site.py::_public_identities`), so a draw whose roster never went
through the entries desk has no resolvable identity, no linkable name and no
profile page — every `/e/{slug}/players/{key}` request 404s at the
`entrants_published` gate.

So the demo seed registers its whole draw through the operator entries import
seam (`POST /tournaments/{id}/entries/import`) **before** the bracket is
imported, confirms every entry, and then uses the resulting
`entry_players.id` as each person's bracket roster id (`entry-{uuid}` — the
same key `entries/entries.py::roster_id` mints). One id, one person, one
profile URL, on both tiers. It has to happen before the bracket import for two
reasons: the ids are an input to it, and a workspace with live matches is
checked out to an event node, which freezes every entries write.

Six entrant accounts carry all of it, because `POST /e/account/signup` is
throttled to eight per hour per IP and that limit is a real protection rather
than a test artefact:

- four **club/association managers** (`Northgate Badminton Club`,
  `Harbourline Shuttlers`, `Riverside Racquet Academy`,
  `Summit Badminton Centre`), each entering the players their club sends;
- two **personal accounts** for the featured players — one men's-singles and
  one women's-doubles entrant who appear in **both** tournaments, so a single
  human is verifiably the same account across Taipei and Korea.

`(account_id, full_name)` is the fixture's canonical person link. A club
account deliberately owns many differently-named players, so a consumer that
treats `account_id` alone as a person key is demonstrably wrong against this
fixture rather than accidentally right.

## What each Taipei discipline is doing

Taipei's disciplines sit at deliberately different depths
(`simulator/tournament_sim/seed.py::_DEMO_LIVE_PROGRESS`) so that one fixture
contains a first round, a resolved-but-unplayed round, a mid-draw, and a
finished draw at the same time:

| Event | State at the frozen clock |
| --- | --- |
| MS | opening round, 10 of 16 played, the rest live or queued (one walkover) |
| WS | opening round complete, R16 half played (one retirement) |
| MD | into the quarter-finals |
| WD | **complete** — played out to its final, champion decided |
| XD | R32 complete; R16 fully resolved and entirely unplayed |

Six matches are live, one per court. Korea has no results at all: it is
upcoming, which is also the fixture's **withheld-scores** case
(`resultsPublished: false`).

Entry windows are written in **venue-local time with the venue's real UTC
offset**. Taipei's five events closed on 14 July; Korea's four main events
closed on 21 July and its **mixed doubles stays open until 1 August**, which
is what gives the fixture one genuinely open entry window next to four closed
ones at the frozen clock.

## The reconstructed operational states

A pristine BWF-history seed looks like a demo, not a live event. After the
canonical counts are seeded and verified, two post-seed passes run:

**`tools/fixture-defects.py`** — idempotent, through public HTTP APIs only
(no direct database writes) — reconstructs three states on Korea (T030):

- **An incomplete doubles pair.** A real entrant submitted a single-player
  men's-doubles entry on Korea (T030) with a partner invited by email who
  has not accepted — `pendingReasons: ["awaiting_partner"]`.
- **A deciding-game result.** A completed Korea match recorded 2-1, where
  the recorded winner lost the middle game.
- **A publication boundary.** Korea has `entrantsPublished: true` while
  `resultsPublished` stays `false` (results simply don't exist yet for an
  upcoming tournament) — a partially-open publication state. Since the
  published-entrant layer above, the seed itself already leaves the fixture
  in exactly this state, so this pass now only verifies it.

**`tools/fixture-defects-db.py`** (work package 01b) — idempotent, directly
through the SQLAlchemy models in `apps/api/src/db/models.py`, run against
the same SQLite file while the API stays up — reconstructs four more states
on Taipei (T029) that have no HTTP write path at all: a bracket-kind
workspace's write invariants (`bracket/application.py`'s same-court guard,
`BracketAssignIn`/`BracketPinIn`'s "both fields or neither" rule, and
`_require_resolved_play_unit`) sit in front of every supported bracket
write, so these are reconstructed as a legacy import or a hand-patched
database might produce them, not exercised as a real product path:

- **A double-current court conflict, on two different courts.** A second,
  different, resolved-but-unplayed play unit given the SAME court and
  "currently playing" clock as an already-live match, on each of two
  courts — the public schedule and the console's own Overview panel both
  suppress the court to `null`/"disputed" for both matches sharing it.
- **An R16 (or later) unit scheduled while its R32 feeder has no result.**
  Verified this is already this fixture's DEFAULT state for most of the
  bracket (the whole draw is scheduled up front, independent of round
  resolution — only `POST /bracket/assign` enforces resolution) — the
  script searches for a naturally-occurring instance before ever writing
  one.
- **An approved slot with no court.** Also already this fixture's default
  state for any not-yet-live scheduled play unit (the public schedule only
  ever shows a court for a CURRENTLY LIVE claim) — again found, not forced.
- **A match with a court but no scheduled time.** The one state actually
  forced with a write: a `matches` row with `court_id` set and `time_slot`
  left `None` — the only place in the data model this specific
  Optional/Optional combination genuinely exists. Verified this does NOT
  fully reach the public schedule as "a court and no time": `scheduledTime`
  there is derived purely from the play unit's own pre-existing bracket
  plan slot, which already exists for virtually every unit regardless of
  this write, so the observable result is "a court and a (pre-existing)
  time". The storage-level state is real; there is no read surface on a
  bracket-kind workspace that can show a genuinely timeless court.

See `tools/fixture-defects-db.py`'s module docstring for the full
investigation (including exactly which of the four states needed a write
vs. were already present), and `docs/reference/debt-log.md`'s "work package
01" entries for the decisions still open.

Re-running either script against an already-defected database is a no-op;
`tests/e2e/check-fixture-defects.py` asserts all seven states by reading
back through the same public API (the bracket GET and the public schedule
`GET /e/api/page/{slug}/matches`) — never by reading the database directly.

## Capturing surface books against it

```bash
make fixture-up
make surface-books-fixture
```

Runs the same `tools/surface-capture.mjs` pipeline as `make surface-books`,
but against the local fixture above instead of the Tailscale production-
parity demo — no network dependency, and the workspace id / slug / display
token come from the fixture's own manifest rather than a hardcoded default.
Reports land in `$(SURFACE_REPORT_DIR)` (`docs/screenshots/ui-review/` by
default), same as `make surface-books`.

## Skipping pieces

Every knob has a default that matches the description above; set these
before `make fixture-up` (or call `tools/fixture-up.sh` directly) to change
them:

| Env var | Default | Effect |
| --- | --- | --- |
| `FIXTURE_API_PORT` | `8600` | API port |
| `FIXTURE_CONSOLE_PORT` | `4173` | Console preview port |
| `FIXTURE_ENTRANT_PORT` | `5174` | Entrant SSR port |
| `FIXTURE_SEED_KEY` | `shared-fixture` | Import-run manifest key |
| `FIXTURE_MODE` | `normal` | `normal` = the clean visual-review dataset; `failure` = additionally apply the deliberately corrupted/conflicting defects passes (see below) |
| `FIXTURE_APPLY_DEFECTS` | *(from `FIXTURE_MODE`)* | Explicit `0`/`1` override of the mode's defects decision |
| `FIXTURE_SKIP_ENTRANT` | `0` | Skip starting the entrant server entirely |
| `FIXTURE_SKIP_CONSOLE_BUILD` | `0` | Reuse a prior `apps/console` build instead of rebuilding |
| `FIXTURE_KEEP` | `0` | Keep the temp directory (database, logs) after teardown |

## Fixture modes: normal vs failure

`FIXTURE_MODE` picks which of two datasets the fixture presents.

**`normal` (default) — the clean visual-review dataset.** The canonical T029/T030 seed and nothing
else: a believable event with venue-local dates and times, one current match per court, varied
match progress and resolved current participants. **This is the only mode a surface book may be
captured from.**

**`failure` — deliberately corrupted and conflicting state.** Runs `tools/fixture-defects.py` (an
incomplete doubles pair awaiting a partner, a partially open publication boundary, a deciding-game
result) and `tools/fixture-defects-db.py` (two double-booked courts, an approved slot with no
court, a court with no time, an R16 unit scheduled while its R32 feeder is unresolved). These
states exist so failure and recovery behaviour can be tested; they are **not** deleted, and they
must never contaminate a normal capture. Capture them separately and label the artefact as a
failure-mode capture.

The mode is written into `fixture.json` as `fixtureMode`, and `tools/surface-capture.mjs` records
it in the capture manifest, so no review book is ambiguous about which dataset it shows.

## What a capture records about its baseline

`tools/surface-capture.mjs` writes a `captureContext` block into the manifest
and prints it on the review book's cover. It answers the five questions a
reader needs before a single sheet means anything:

| Field | Answers |
| --- | --- |
| `checkoutSha` | which build — resolved from `git rev-parse HEAD`, overridable with `CHECKOUT_SHA` when the capture host is not a checkout |
| `fixtureMode` | which dataset (`normal` / `failure`) |
| `eventTimeZone` | which clock — auto-resolved from the public page projection unless `EVENT_TIMEZONE` is supplied |
| `viewports` | which window — desktop 1440 × 900 and mobile 390 × 844 CSS px, 2× |
| `baselineRoute` + per-sheet `path` / `finalUrl` | which route — the run's entry point, plus the requested and reached URL of every sheet |

## Keeping the capture dataset clean

The shared fixture is disposable and always starts from the canonical seed, so it is clean by
construction. The **long-lived Tailscale demo** is not: an interaction or smoke run against it
leaves its throwaway workspaces behind, and they then appear on the Hub in every surface book.

Remove them with `tools/demo-prune-workspaces.py`, which takes **workspace ids and nothing else** —
no name pattern, no "delete all drafts" heuristic — so a user-created production workspace can
never be caught by it:

```bash
make demo-backup            # deletion cascades; back up first
demo_ip="$(bash tools/demo-compose.sh ip)"
.venv/bin/python tools/demo-prune-workspaces.py --base-url "http://$demo_ip:8092" \
  --workspace <uuid> --workspace <uuid>     # dry run: prints name, kind, status, dates
.venv/bin/python tools/demo-prune-workspaces.py --base-url "http://$demo_ip:8092" \
  --workspace <uuid> --workspace <uuid> --confirm
```

Known test-only rows on the demo as of 2026-09-07 (both owned by the bootstrap `local@dev`
operator, `meet`/`draft`, no entries, four synthetic matches each):

| Workspace | Id |
| --- | --- |
| `Interaction smoke` | `ddf6b4b1-dae8-49e5-8a36-aea01f594958` |
| `Interaction smoke (viewer)` | `9144fecb-30cf-459e-9697-ab93f245de1d` |

## Relationship to the console-browser-contracts CI job

`tests/e2e/run-console-contracts.sh` — the fixture the `console-browser`
CI job and `make test-console-contracts` use — is now a thin wrapper around
`tools/fixture-up.sh` with `FIXTURE_APPLY_DEFECTS=0` and
`FIXTURE_SKIP_ENTRANT=1`: the defects pass changes exact row counts that
job's own structural check pins (`tests/e2e/check-console-fixture.py`), and
that job never navigates to the entrant tier, so starting it there would be
pure overhead. Its CI-visible behaviour — a pristine seed, the row-count
check, the console preview, then Playwright — is unchanged.
