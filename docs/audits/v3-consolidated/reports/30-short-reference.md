# Work package 30 — the short entry reference

Plan refs: `docs/audits/v3-consolidated/plan.md` §3 "Short entry reference" (Adopt conditionally).
Findings routed here: **V3-PE39.1** (its reference-FORMAT half, deferred by package 24) via debt row
**V3-24-1**, whose design this package implements as written.

Package 24 shipped the copy half of PE39.1 (the unverifiable "The reference is safe" claim is gone)
and confirmed the authorization half was already correct. What it did not do — and logged with the
exact design instead of half-building — was cut the reference over from the submission's UUID. That
is what landed here.

## Files in scope (touched)

Backend:
- `apps/api/src/db/short_reference.py` — **new**. The alphabet, the generator, the validator, and the
  collision retry, in one place, importing nothing but the standard library
- `apps/api/src/db/models.py` — `Submission.short_reference` (`String(8)`, NOT NULL, defaulted) and
  `Index("uq_submissions_short_reference", unique=True)`
- `apps/api/src/alembic/versions/c3d8e2f6a1b5_submission_short_reference.py` — **new**: add nullable,
  create the unique index, backfill every existing row
- `apps/api/src/alembic/versions/c4e9f3a7b2c6_submission_short_reference_not_null.py` — **new**: the
  tightening
- `apps/api/src/entries/submissions.py` — mints a checked reference at the same `session.add`; the
  `find_for_account` docstring corrected to name the new handle
- `apps/api/src/entries/entries_json.py` — **the submission redirect only** (the package-29 DTO
  builder hunks in this file were left untouched)
- `apps/api/src/entries/entries_me.py` — `_own_submission` resolves by reference, the route parameter
  is `{reference}`, and `shortReference` joins `SubmissionReceiptDTO`, `MyTournamentCardDTO`,
  `MyEntryLineDTO` and `ExportedSubmissionDTO`

Entrant tier:
- `apps/entrant/app/routes/receipt.tsx` — the `REFERENCE` pattern, the route param, the printed
  "Reference", `data-reference`
- `apps/entrant/app/routes.ts` — `:slug/receipt/:reference`
- `apps/entrant/public/assets/receipt.js` (+ `.d.ts`) — prints, copies, downloads and re-signs-in with
  the reference; the account-scoped fetch takes it
- `apps/entrant/public/assets/my-entries.js` (+ `.d.ts`) — the receipt link is built from the
  reference; the card footer states it; a line from an older act states its own

Console (generated only):
- `apps/console/src/api/dto.generated.ts` — `make generate-api`. `apps/console/src/api/dto.ts` needed
  **no** hand reconciliation: it declares the operator desk's `EntrySubmissionDTO`, which this package
  did not touch, and none of the entrant-only types that changed

Tests / tools / docs:
- `tests/backend/unit/test_short_reference.py`, `tests/backend/unit/test_short_reference_migration.py`
  — **new**
- `tests/backend/test_entries_me_api.py`, `tests/backend/test_entries_json_routes.py`
- `apps/entrant/tests/{receipt,receipt.script,myEntries.script}.test.ts`
- `tests/e2e/check-account-journeys.py`, `tests/e2e/tests/entrant-a11y.spec.ts`,
  `tests/e2e/tests/10-entrant-r11-evidence.spec.ts`, `tools/surface-capture.mjs`
- `docs/reference/surface-map.md` — the receipt route's path segment

**Not touched**: `docs/reference/debt-log.md`, `docs/audits/v3-consolidated/PROGRESS.md`,
`closure.md`, the string ledger (`ledger/LEDGER.md`, `ledger/24-strings.md`) — the orchestrator owns
those; the rows this package invalidates are listed at the end. Package 29's concurrent files
(`shared/sides.py`, `bracket/brackets.py`, the `entries_json.py` side/match DTO builders,
`platform/domain/sides.ts`, `MatchCard.tsx`, `PersonGroup.tsx`, `helpers/matchCardFixtures.ts`,
`contracts/match-card.md`) were left alone; they appear in `git diff --stat` because both packages
share one working tree.

## The design, item by item

**(1) The column and the two migrations.** `submissions.short_reference` is `String(8)`, NOT NULL,
under a **global** unique index. `c3d8e2f6a1b5` adds it nullable, creates the index, then mints one
code per existing row through `op.get_bind()` (the row-level-logic-in-a-migration precedent is
`u5f0b4d7e2a3`); `c4e9f3a7b2c6` makes it NOT NULL in a batch alter. Three things are deliberate:

- the index is created **before** the backfill, so the backfill's uniqueness claim is checked by the
  database as it runs rather than asserted afterwards;
- the tightening is a **separate revision**, so the UPDATEs are committed before SQLite rebuilds the
  table for the NOT NULL — a rebuild sharing a transaction with the writes it depends on is one
  rollback away from a required column with nothing in it;
- a `server_default` was **not** used, because it would give every existing row the same value —
  a uniqueness violation wearing a default's clothes.

`alembic heads` is single afterwards (`c4e9f3a7b2c6`, chained onto package 24's `b1c6d0e5f2a7`);
`command.check` inside the migration test also passes, so the ORM metadata and the migrated schema
agree.

**(2) The generator, and where it lives.** `secrets.choice` over
`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, eight characters, retried against a caller-supplied `taken`
predicate and bounded at eight attempts so an exhausted keyspace fails loudly instead of spinning.

Two deviations from the debt row's literal text, both stated rather than glossed:

- the alphabet as written is **31 symbols, not 32** (26 letters minus `I`, `L`, `O`, plus 8 digits).
  The string in the design is authoritative and is used verbatim; only the arithmetic around it is
  corrected — 31⁸ ≈ 8.5×10¹¹ codes, which does not change any conclusion the design drew from it.
- the module sits at **`apps/api/src/db/short_reference.py`**, not in the entries domain. The reason
  is the model `default`: it is what makes every insert path — the entry form, a partner accepting a
  nomination (`entries/partners.py` builds its own `Submission`), a fixture, a test row — carry a
  reference, which is what makes the NOT NULL an invariant rather than a trap for the next writer. A
  default must be callable from `db.models`, and `db` may not import upward into a domain or into
  `shared` (`apps/api/.importlinter`, persistence-direction). The module imports only the standard
  library, so the direction rule is satisfied by construction and not by an exception. The migration
  keeps its **own frozen copy** of the six lines, as the task anticipated: a migration that imports
  today's service changes meaning when the service does.

**(3) The service.** `entries/submissions.py::_write` mints at the same `session.add(submission)`,
with a per-candidate SELECT as the pre-check. That closes the realistic collision (two draws far
apart in time). The flush-time race between two concurrent inserts that both passed the check is
refused by the unique index — nothing is written twice — and is left there deliberately rather than
given a second write path at a probability that does not warrant one; the module docstring says so.

**(4) The redirect, the route and the regex — and no UUID fallback.**
`entries_json.py`'s 303 now names `.../receipt/{short_reference}`. `receipt.tsx` validates
`^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$` before using the segment, same posture as before (the
segment is still a stranger's sentence otherwise, and it is still rendered as the "Reference" under
the organizer's name). The API route is `/e/api/me/submissions/{reference}` — renamed from
`{submission_id}`, because it stopped being the row's id and an OpenAPI document that still said
otherwise would be describing the old wire.

**No UUID fallback was kept**, and the check the task asked for is the reason: **nothing persisted
anywhere embeds the UUID receipt path.** There is no submission-confirmation email at all
(`core.email.send_email` has exactly four callers: operator invite, password reset, entrant
verification, and the partner invitation — the last is the only entrant-facing one and it links
`/e/partner?token=…`, never a receipt). The only place a receipt URL is ever constructed is the 303
and `my-entries.js`, both of which now build the new shape. So a fallback would have been a second
door into the same page for zero live links, and the test suite pins the old handle **out**: a UUID
presented to either the entrant route or the API answers the same uniform 404 as nonsense.

**(5) Authorization is unchanged, and now pinned against a real foreign reference.**
`entries_me._own_submission` still resolves inside `Submission.account_id == uuid.UUID(entrant.id)`;
the only change is which column the other predicate reads. The shape check runs before the query so a
segment that cannot be a reference is refused in one place rather than becoming a table scan.

The proof is `tests/backend/test_entries_me_api.py::test_receipt_is_complete_private_and_account_scoped`,
extended so the foreign case is no longer hypothetical: a signed-in stranger presents (a) the **real,
well-formed reference of another account's submission**, (b) a well-formed reference that names
nothing, (c) a string that is not a reference at all, and (d) the submission's UUID. All four answer
404, and `foreign.json() == unknown.json() == invalid.json()` — same status, same body. That is the
claim a short, guessable handle makes worth stating: the account gate authorizes, the handle only
selects.

**(6) Surfaced.** The receipt prints the reference and nothing else as its "Reference"; the copy
button copies it; the downloadable text receipt says `Reference: H4KJ29QW` and no longer contains the
UUID; the 401 sign-in gate returns to `/e/{slug}/receipt/{reference}`. My entries builds its "View
receipt" link from it, states it in the card footer, and — because a card folds every act an account
made against one tournament, while the footer can name only one — a line belonging to an **older** act
states its own reference beside it. A line belonging to the card's own act stays silent, because
repeating the footer on every row is noise.

`MyEntryLineDTO.shortReference` is what makes that possible; `MyTournamentCardDTO.shortReference` and
`SubmissionReceiptDTO.shortReference` sit beside the existing `submissionId`, which stays because it
is still the row's identity — a projection that renamed it would be claiming the UUID had stopped
existing. Both `.d.ts` twins were updated with their `.js`.

The account export (`/e/api/me/export`, `ExportedSubmissionDTO`) also carries it. That document
describes itself as "a projection of what is stored, not a summary of it", and the reference is stored
data about the entrant's own act — and the string they would quote to ask about it. Leaving it out
would have made the document's own claim slightly false.

**No mail template names a reference**, because no submission mail exists — `core.email.send_email`
has four callers (operator invite, password reset, entrant verification, partner invitation) and none
of them concerns a submission. Nothing to change there.

**(7) DTO regeneration.** `make generate-api` run at the end; `dto.ts` needed no hand reconciliation
(reason above). The regenerated file also carries package 29's schema changes, since both packages
were in the tree — the orchestrator re-runs it before the final gate.

**(8) Fixture, journeys, simulator.**
- `tests/e2e/check-account-journeys.py` **did** assert the receipt URL shape: its
  `re.search(r"/receipt/([0-9a-f-]{36})", location)` would have failed to match and reported
  "submission did not answer a receipt Location". It now matches the reference alphabet, calls
  `/e/api/me/submissions/{reference}`, and reads back `shortReference` rather than `submissionId`.
  **Not run** (it needs the Docker fixture); the script is consistent with the new shape.
- `tools/fixture-up.sh` mentions neither a receipt path nor `SUBMISSION_ID` — **no change needed**.
- `tools/surface-capture.mjs`'s `SUBMISSION_ID` default was a UUID, which would now capture a 404
  page; it is an eight-character reference.
- `tests/e2e/tests/entrant-a11y.spec.ts` and `10-entrant-r11-evidence.spec.ts` both put a literal UUID
  in a receipt path (both rely on the route rendering identically for any well-formed handle, since it
  performs no account-scoped read). Both literals changed shape; the reasoning comment in the evidence
  spec was updated with them.
- `simulator/` creates submissions through `POST /e/api/submit/{slug}` — the service path — so the
  generator covers it. It inserts no `submissions` row directly. **No change needed.**

## Tests changed to keep passing, and why

| Test | Reason |
|---|---|
| `test_entries_me_api.py::test_receipt_is_complete_private_and_account_scoped` | The route takes the reference; the exact-key-set pin gains `shortReference`. Extended (not weakened) with the foreign/unknown/invalid/stale-UUID quartet |
| `test_entries_me_api.py::test_card_and_line_key_sets_are_exact` | New `shortReference` on both the card and the line — the exact-set pin exists to force exactly this to be a decision |
| `test_entries_me_api.py::test_the_newest_submission_names_the_card` | Extended: the card names the newest act's reference, and the two lines carry their own |
| `test_entries_json_routes.py::test_a_submission_answers_303_to_the_receipt_route` and `…_states_the_recorded_total_and_only_that` | The Location's path segment changed. Asserted against `rows[0].short_reference`, so it is still the seam property (the redirect names what was recorded) and not a restatement of the generator |
| `apps/entrant/tests/receipt.test.ts` (loader + route suites) | Route param renamed; the "404s a submission id that is not a UUID" test became "404s anything that is not a reference" and now covers the UUID, a lower-cased code and an excluded symbol as well as the injection string |
| `apps/entrant/tests/receipt.script.test.ts`, `myEntries.script.test.ts` | Fixtures gain `shortReference`; the receipt/link assertions name it. `receiptHref`'s null guard moved from `submissionId` to `shortReference` |
| `tests/backend/test_entries_submit_api.py::test_a_replay_redirects_to_the_same_receipt` | Reads the expected handle off `short_reference` instead of `id`. `_receipt_id`'s docstring says what it parses now; the claim ("a replay names the same handle") is unchanged |
| `tests/backend/unit/test_public_person_contract.py` | The SP-P9 exact allow-lists for `MyEntryLineDTO` and `MyTournamentCardDTO` gain `shortReference`, each with the reason it is not a widening (an account's own name for its own act; no person data) |
| `tests/backend/unit/test_entries_schema_levels.py::test_no_natural_key_is_unique_at_any_level` | `uq_submissions_short_reference` added to the authorised set **with the distinction spelled out**: R13's claim is about keys a *human* supplies and may legitimately repeat. A server-minted random code describes nothing about the entrant and is unique because that is its job — a reference naming two submissions would be useless, not merely strict |
| `tests/backend/unit/test_orphan_purge_migration.py`, `test_entries_migration.py` | Raw `INSERT INTO submissions` seeds must now name a reference. Derived from each row's own id, never a shared literal (the unique index would refuse it); the orphan-purge seeder asks `PRAGMA table_info` first, because it also runs against the pre-column revision |

No pinned test contradicted a ruling, and none was edited to paper over a behavior change beyond the
handle cut-over itself. Two assertions were **added** rather than adjusted: the download text must not
contain the UUID, and the entrant route's hand-written pattern must equal the Python alphabet
(`tests/backend/unit/test_short_reference.py::test_the_entrant_receipt_route_validates_the_same_alphabet`)
— a Node route cannot import Python, and a silent drift there would 404 every real receipt.

## What V3-24-1 / V3-PE39.1 become

- **V3-PE39.1 — closed.** Both halves have now shipped: package 24 removed the unverifiable safety
  claim, and this package replaced the placeholder-grade UUID with a reference a person can read
  aloud, quote and re-type.
- **V3-24-1 — closed**, implemented exactly as designed, with the two deviations recorded above (the
  alphabet is 31 symbols, not 32; the generator lives under `db/` for the import-direction reason).
  Design item (6)'s UUID fallback was deliberately **not** built, on the evidence the design itself
  made it conditional on.

## Left open (not built, deliberately)

**An organizer cannot look a quoted reference up.** The entrant now has a handle they can read down a
phone, and the operator's entries desk has no field to match it against: `EntrySubmissionDTO`
(`core/schemas.py`) projects `id`, `accountEmail`, `accountName`, `feeTotalCents`, `submittedAt`.
Adding `shortReference` there is small, but it pulls in console DTO, desk UI and module-contract
baselines that no ruling in this package covers, so it is flagged rather than smuggled in. It is the
natural next step for whoever owns the desk.

## String-ledger rows the orchestrator should update

The ledger is package 25's file and was **not** edited. These rows now describe something different:

`ledger/24-strings.md`:
- the "visible reference (SectionCard, `receipt.tsx`)" row — recorded as *"not changed — logged as
  debt … (unchanged: the UUID, still copyable)"*. It **is** changed now: the page renders the
  eight-character reference. Its "facts/why" cell should point at this package instead of V3-24-1.
- the "401 gate body (`receipt.js`)" row — the text is unchanged, but its route cell says
  `/e/{slug}/receipt/{id}`; the gate now returns to `/e/{slug}/receipt/{reference}`.

`ledger/LEDGER.md` — scan-derived rows keyed on `file:line`, all shifted by this package's edits
(text unchanged unless noted):

| Row key | New line |
|---|---|
| `apps/entrant/app/routes/receipt.tsx:159` "Entry receipt" | `:167` |
| `…receipt.tsx:162` "Receipt details load after this page checks your account…" | `:170` |
| `…receipt.tsx:168` "Your entry" | `:175` |
| `…receipt.tsx:170` "Tournament" | `:177` |
| `…receipt.tsx:174` "Reference" | `:181` |
| `…receipt.tsx:176` "Copy reference" | `:183` |
| `…receipt.tsx:188` "Loading receipt details" | `:195` |
| `…receipt.tsx:189` "Checking the signed-in account for this entry" | `:197` |
| `…receipt.tsx:201` "Back to the tournament page" | `:209` |
| `apps/entrant/public/assets/receipt.js:351` "Sign in and return" | `:355` |
| `…receipt.js:361` "See my entries" | `:365` |
| `…receipt.js:380` "Try again" | `:384` |
| `apps/entrant/public/assets/my-entries.js:621` "Your entries could not be loaded…" | `:650` |

`receipt.js:28/29/30/145/319/321` and `my-entries.js:67-70` are unmoved.

**One new user-visible string** needs a ledger row of its own: `Reference {CODE}` in
`my-entries.js` — rendered once in the card footer, and again on any line whose act is not the card's.
It is a label plus data, with no claim in it.

## Gate tails (verbatim)

`.venv/bin/ruff check apps/api tests/backend tests/e2e simulator`:

```
All checks passed!
```

`cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter`:

```
Contracts: 15 kept, 0 broken.
```

`PYTEST_WORKERS=6 make test`:

```
FAILED tests/backend/unit/test_public_person_contract.py::test_every_sp_p9_serializer_has_its_exact_allow_list - AssertionError: PlayerMatchDTO
FAILED tests/backend/unit/test_architecture_boundary_inventory.py::test_boundary_inventory_is_machine_readable_owned_and_non_growing - AssertionError: boundary inventory violations:
===== 2 failed, 2437 passed, 72 skipped, 73 warnings in 504.75s (0:08:24) ======
```

**Both remaining failures belong to package 29, not to this one**, and are reported rather than
worked around — the two packages share one working tree:

- `test_every_sp_p9_serializer_has_its_exact_allow_list` fails on **`PlayerMatchDTO`**, whose new
  `scoresPublished` field comes from package 29's uncommitted `entries_site.py` (`git diff` shows the
  three hunks). This package's two entries in that same dict — `MyEntryLineDTO` and
  `MyTournamentCardDTO` — pass.
- `test_boundary_inventory_is_machine_readable_owned_and_non_growing` reports
  `bracket/state.py tournamentDataReferences grew from 1 to 2` and
  `new unowned boundary debt: shared/sides.py` — both package 29 files. It **did** also report
  `db/short_reference.py` on the first run, for the one `from sqlalchemy import select` inside a
  session helper; that helper was moved into `entries/submissions.py` (where SQLAlchemy already
  lives), leaving the reference module a pure value type with no query in it, and the finding is gone.

The first run of the suite additionally failed five tests that WERE this package's, all fixed and
green in the run above: the two raw-`INSERT INTO submissions` seeds, the SP-P9 allow-lists, the
replay-redirect assertion, and the authorised-uniqueness set. Each is in the table above.

`git diff --stat` for this package's files only (the working tree also holds package 29's):

`npm --prefix apps/entrant run test:run`:

```
 Test Files  54 passed (54)
      Tests  1046 passed (1046)
```

`npm run typecheck:entrant`, `npm run lint:entrant`, `npm run -w apps/entrant depcruise`:

```
> entrant@0.0.0 typecheck
> react-router typegen && tsc

> entrant@0.0.0 lint
> eslint .

> entrant@0.0.0 depcruise
> depcruise app

✔ no dependency violations found (111 modules, 332 dependencies cruised)
```

`npx tsc -b apps/console`:

```
(no output; exit 0)
```

`npm --prefix apps/console run test:run`:

```
 Test Files  255 passed (255)
      Tests  2258 passed (2258)
```

```
 apps/api/src/db/models.py                         | 24 +++++++
 apps/api/src/entries/entries_json.py              | 11 +++-
 apps/api/src/entries/entries_me.py                | 80 +++++++++++++++++++----
 apps/api/src/entries/submissions.py               | 23 ++++++-
 apps/console/src/api/dto.generated.ts             | 71 ++++++++++++++++++--
 apps/entrant/app/routes.ts                        |  4 +-
 apps/entrant/app/routes/receipt.tsx               | 39 ++++++-----
 apps/entrant/public/assets/my-entries.d.ts        |  7 ++
 apps/entrant/public/assets/my-entries.js          | 37 +++++++++--
 apps/entrant/public/assets/receipt.d.ts           |  4 ++
 apps/entrant/public/assets/receipt.js             | 20 +++---
 apps/entrant/tests/myEntries.script.test.ts       | 37 ++++++++---
 apps/entrant/tests/receipt.script.test.ts         | 11 +++-
 apps/entrant/tests/receipt.test.ts                | 40 +++++++-----
 docs/reference/surface-map.md                     |  2 +-
 tests/backend/test_entries_json_routes.py         |  9 ++-
 tests/backend/test_entries_me_api.py              | 52 +++++++++++++--
 tests/backend/test_entries_submit_api.py          | 12 ++--
 tests/backend/unit/test_entries_migration.py      | 14 +++-
 tests/backend/unit/test_entries_schema_levels.py  | 17 ++++-
 tests/backend/unit/test_orphan_purge_migration.py | 27 ++++++--
 tests/backend/unit/test_public_person_contract.py |  8 +--
 tests/e2e/check-account-journeys.py               | 12 ++--
 tests/e2e/tests/10-entrant-r11-evidence.spec.ts   | 13 ++--
 tests/e2e/tests/entrant-a11y.spec.ts              |  5 +-
 tools/surface-capture.mjs                         |  5 +-
 26 files changed, 462 insertions(+), 122 deletions(-)
```

## Not committed

Per instructions, no commit was made.
