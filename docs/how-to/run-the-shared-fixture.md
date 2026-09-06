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

`fixture.json` carries (at minimum): `taipeiTid`, `koreaTid`, `koreaSlug`,
`displayToken`, `viewerEmail`/`viewerPassword` (a real viewer-role
membership on Taipei), `apiBaseUrl`, `consoleBaseUrl`, `entrantBaseUrl`, and
a `defects` object naming exactly what the post-seed pass changed (below).

## The reconstructed operational states

A pristine BWF-history seed looks like a demo, not a live event. After the
canonical counts are seeded and verified, `tools/fixture-defects.py` runs an
idempotent pass through public HTTP APIs only (no direct database writes)
that reconstructs three states worth reviewing both tiers against:

- **An incomplete doubles pair.** A real entrant submitted a single-player
  men's-doubles entry on Korea (T030) with a partner invited by email who
  has not accepted — `pendingReasons: ["awaiting_partner"]`.
- **A deciding-game result.** A completed Korea match recorded 2-1, where
  the recorded winner lost the middle game.
- **A publication boundary.** Korea has `entrantsPublished: true` while
  `resultsPublished` stays `false` (results simply don't exist yet for an
  upcoming tournament) — a partially-open publication state.

Four more states the v3 plan's code map originally proposed — a two-court
"double current" bracket conflict, an approved slot with no court, a
scheduled match with a court but no time, and a round scheduled before its
feeder round resolves — turned out to have **no reachable write path**
through the product's supported API once actually tried against a running
instance (every route that could move a bracket assignment enforces "both
fields or neither" and "the predecessor must be resolved first", and the
one escape hatch that bypasses the same-court guard writes to a table a
bracket workspace never populates). See `tools/fixture-defects.py`'s module
docstring for the full trace, and `docs/reference/debt-log.md`'s "work
package 01" entries for what a fix would need. This is a real, currently
unreproducible gap — not a limitation of the fixture script.

Re-running `tools/fixture-defects.py` against an already-defected database
is a no-op; `tests/e2e/check-fixture-defects.py` asserts all three states by
reading back through the same API.

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
| `FIXTURE_APPLY_DEFECTS` | `1` | Run the post-seed defects pass |
| `FIXTURE_SKIP_ENTRANT` | `0` | Skip starting the entrant server entirely |
| `FIXTURE_SKIP_CONSOLE_BUILD` | `0` | Reuse a prior `apps/console` build instead of rebuilding |
| `FIXTURE_KEEP` | `0` | Keep the temp directory (database, logs) after teardown |

## Relationship to the console-browser-contracts CI job

`tests/e2e/run-console-contracts.sh` — the fixture the `console-browser`
CI job and `make test-console-contracts` use — is now a thin wrapper around
`tools/fixture-up.sh` with `FIXTURE_APPLY_DEFECTS=0` and
`FIXTURE_SKIP_ENTRANT=1`: the defects pass changes exact row counts that
job's own structural check pins (`tests/e2e/check-console-fixture.py`), and
that job never navigates to the entrant tier, so starting it there would be
pure overhead. Its CI-visible behaviour — a pristine seed, the row-count
check, the console preview, then Playwright — is unchanged.
