# Work package 20 — make activity history readable

Branch `feat/surface-book-remediation`, backend HEAD `3f84ef2d` at start (moved forward during the session by concurrent work packages editing the same file — see "A note on concurrent edits" below). Scope: `apps/console/src/modules/settings/ActivityTab.tsx` + its test, NEW `apps/console/src/lib/formatDateTime.ts` (+ test) and the one-line redirect in `apps/console/src/modules/settings/SyncBackupsTab.tsx`, the backend activity-log DTO/service and setup change recording in `apps/api/src/workspaces/setup.py`, `tests/backend/test_tournament_setup.py`, `apps/console/src/api/{dto.ts,dto.generated.ts}`, and `docs/audits/v3-consolidated/`, per `docs/audits/v3-consolidated/plan.md` §4 ("Dates and numbers", "Status", "Destructive/recovery copy") and §3 X6/X16, the contract `docs/reference/contracts/state-and-formatting.md` §7/§8, and finding V3-OC28.1. Builds on package 19's timestamp work (factors its four local helpers out into the shared authority this package delivers, closing debt item V3-19-2) rather than duplicating it.

## Files changed

- `apps/console/src/lib/formatDateTime.ts` (**new**) — the contract §7.3 console formatting authority. Exports `formatDateTime(iso, context, timeZone?)` for the seven prose-facing named contexts (`clock`, `clock_with_zone`, `date`, `date_with_year`, `datetime`, `deadline`, `diagnostic`), always rendering in the given (tournament) timezone, falling back to labeled UTC, and returning `null` — never a placeholder — for a missing or unparseable timestamp (§7.2). Also exports the four helpers package 19 wrote locally in `SyncBackupsTab.tsx` (`minuteKey`, `dayLabel`, `fmtTime`, `fmtTimestamp`) verbatim, so that call site's behavior is unchanged.
- `apps/console/src/lib/__tests__/formatDateTime.test.ts` (**new**) — one test per named context plus the UTC-fallback and missing/unparseable-timestamp rules.
- `apps/console/src/modules/settings/SyncBackupsTab.tsx` — deleted its four local timestamp helpers and their "authority doesn't exist yet" NOTE comment; now imports `minuteKey`, `dayLabel`, `fmtTime`, `fmtTimestamp` from `lib/formatDateTime.ts`. No behavior change (existing `SyncBackupsTab.test.tsx` passes unmodified).
- `apps/api/src/workspaces/setup.py`:
  - New `ActivityFieldChange` model (`key`, `label`, `old`, `new`) and `ACTIVITY_MAX_ENTRIES = 200` constant (was previously an inline magic number, `activity[-200:]`).
  - `ActivityEntry` gains `fields: list[ActivityFieldChange]` (default `[]`) and `payloadHash: Optional[str]` (default `None`) — both backward-compatible with rows stored before this change.
  - `ActivityFeed` gains `retentionLimit: int = ACTIVITY_MAX_ENTRIES`.
  - New helpers: `_section_label` (plain-language section names, the same words the console used to show as a separate repeated label), `_field_label` (generic camelCase/snake_case humanizer), `_actor_display_name` (renders the bootstrap `local@dev` address as "Local operator"), `_diff_fields` (old/new field diff between two dicts), `_payload_hash` (sha256-16 of the new section payload, for diagnostics).
  - `get_activity`: applies `_actor_display_name` to every entry on read, so **pre-existing stored rows** also display correctly without a data migration.
  - `patch_setup_section`: captures the setup document's previously stored data for the section (`old_data`) before overwriting it, computes `field_changes = _diff_fields(old_data, new_data)`, builds the row's `summary` as `"Changed {section label}: {field labels…}"` (or `"Changed {section label}"` with no diff), and records `fields`/`payloadHash` on the new `ActivityEntry`. The `activity[-200:]` truncation now reads `activity[-ACTIVITY_MAX_ENTRIES:]`.
- `tests/backend/test_tournament_setup.py` — two new tests: `test_setup_patch_records_actor_section_and_field_diff` (actor renders "Local operator", summary names the section, first edit's field diff has `old: None` since nothing was stored yet, a second edit's diff has the real prior value, `payloadHash` is present) and `test_activity_feed_reports_its_own_retention_limit` (pins the DTO's `retentionLimit` to the `ACTIVITY_MAX_ENTRIES` constant).
- `apps/console/src/modules/settings/ActivityTab.tsx` — rewritten row rendering:
  - Row primary line is now `entry.summary` (the backend's plain-language, field-naming description) instead of the old `Updated ${activityTargetLabel(entry.target)}` / the old separate `{actorName} · {sectionLabel}` secondary line drops the section label, leaving only the actor.
  - Row timestamp now uses `formatDateTime(entry.occurredAt, 'datetime', timeZone)` (tournament timezone; contract §7.1 explicitly assigns the `datetime` context to "Activity log, receipts") instead of the browser-locale `toLocaleString`.
  - New `ActivityRowDetails`: always-present `<details>` expansion showing an old → new list per `entry.fields` (or "Details not recorded for this change." when empty) plus a diagnostics block (operation id, ISO `occurredAt` via the `diagnostic` context, `payloadHash`) — never shown in the default row.
  - New retention line under "Tournament history": "Kept for the most recent {retentionLimit} changes." sourced from the fetched feed's `retentionLimit`, never a hardcoded literal.
  - `ActivityTab` now accepts an optional `timeZone` prop (same pattern as package 19's `SyncBackupsTab`).
  - Session-activity (live-day, browser-only) timestamps are unchanged (`formatSessionTimestamp`, renamed from the old shared `formatTimestamp` — those events have no tournament timezone of their own; they are always "this browser, right now").
- `apps/console/src/modules/settings/__tests__/ActivityTab.test.tsx` — rewrote to mock `apiClient.getTournamentActivity` (previously untested — the durable list was never exercised beyond the empty/loading states) and added: actor + plain-language change + tournament-timezone timestamp render; no repeated section label beside the actor; expansion renders old → new; missing diff renders "Details not recorded for this change."; diagnostics stay behind the expansion; retention copy pinned to the backend-reported limit. Two pre-existing tests (heading structure, session-activity rendering) kept passing unmodified.
- `apps/console/src/modules/workspace/WorkspaceShellSurface.tsx` — one-line addition: `<ActivityTab tid={tid} timeZone={summary?.timeZone} />` (same prop-threading pattern already used for `SyncBackupsTab`/`PeopleAccessTab`/`GeneralSettingsTab`).
- `apps/console/src/api/dto.ts` — new `TournamentActivityFieldChangeDTO` interface; `TournamentActivityEntryDTO` gains `fields`/`payloadHash`; `TournamentActivityFeedDTO` gains `retentionLimit`.
- `apps/console/src/api/dto.generated.ts` — regenerated via `make generate-api` (run last; verified idempotent — a background process in this environment had already regenerated it identically moments after the backend edit landed, and a manual re-run produced no further diff).
- `apps/console/src/api/__tests__/dtoParity.test.ts` — added `TournamentActivityFieldChangeDTO: 'ActivityFieldChange'` to the `ALIASES` map (same DTO-suffix naming-drift pattern as the other `TournamentActivity*` entries).
- `docs/audits/v3-consolidated/ledger/20-strings.md` (new) — full string ledger.
- `docs/reference/debt-log.md` — new "Work package 20" subsection (three items) plus a resolution note closing V3-19-2 (the `formatDateTime.ts` authority now exists).

## A note on concurrent edits

`apps/api/src/workspaces/setup.py` was independently edited by a concurrently running work package (adding `RulesSection.pointCap` and daily-session out-of-window validation, unrelated to activity) while this package was also editing it. Both edits landed cleanly in the same file with no conflict — verified by re-running `ruff`, `lint-imports`, and `pytest tests/backend/test_tournament_setup.py` after noticing the file's mtime had moved, all still green. `apps/console/src/modules/settings/SyncBackupsTab.tsx` was flagged as changed on disk once by the harness after this package's own edit to it landed; the shown content matched exactly what this package wrote (no other agent's edit involved). A later flag on `apps/console/src/modules/workspace/WorkspaceShellSurface.tsx` showed a concurrent package had restructured the `ws-sync` segment into a path-conditional branch between `ActivityTab`/`SyncBackupsTab`; this package's own `timeZone={summary?.timeZone}` addition to the `ActivityTab` call survived that restructuring intact. One `npm run lint:scheduler` run reported 1 transient error under `apps/console` while another agent was mid-write on an unrelated file elsewhere in the tree; a re-run seconds later reported 0 errors (134 pre-existing warnings only, none in files this package touched). A later full-suite run also showed two failure sources with no connection to this package's files: `SharingTab.test.tsx` (a concurrent package mid-edit on `SharingTab.tsx`) and `dtoParity.test.ts`'s "matches the generated shapes" check (a concurrent package added `UserDTO.emailConfigured` to hand `dto.ts` without yet regenerating the matching backend field/`dto.generated.ts`). Neither touches `TournamentActivity*`; this package's own `TournamentActivityFieldChangeDTO` alias and all `ActivityTab`/`formatDateTime`/`SyncBackupsTab` tests pass cleanly in every run, isolated (`-- src/modules/settings/__tests__/ActivityTab.test.tsx`, `-- src/lib/__tests__/formatDateTime.test.ts`, `-- src/modules/settings/__tests__/SyncBackupsTab.test.tsx`) and as part of the combined `src/modules/settings src/lib` run.

## Commands run and results (verbatim)

```
$ .venv/bin/pytest tests/backend/test_tournament_setup.py -q
...............
15 passed in 23.02s
(re-run after the concurrent edit landed: 15 passed in 24.13s / 19.09s)

$ .venv/bin/pytest tests/backend/test_tournament_setup.py tests/backend/unit/test_auth_characterization.py -q
...............................
31 passed in 19.36s

$ .venv/bin/ruff check apps/api tests/backend
All checks passed!

$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Analyzed 166 files, 591 dependencies.
Contracts: 15 kept, 0 broken.

$ npm --prefix apps/console run test:run -- src/modules/settings src/lib
Test Files  34 passed (34)
     Tests  432 passed (432)

$ npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)

$ npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.
(A single transient "1 error" run mid-session, caused by a concurrent agent mid-write elsewhere, is not reproducible and not in this package's files — see note above.)

$ npx tsc -b apps/console
(no output — clean)

$ make generate-api
Dumping OpenAPI schema...
Generating apps/console/src/api/dto.generated.ts...
Done. Inspect 'git diff apps/console/src/api/dto.generated.ts'.
 apps/console/src/api/dto.generated.ts | 27 +++++++++++++++++++++++++++
 1 file changed, 27 insertions(+)
(re-run for idempotence check: identical 27-line diff, no further changes)
```

## Per-finding acceptance — V3-OC28.1

**Ruling R1** (row = actor · plain-language change naming section + field(s) · tournament-timezone timestamp; no repeated section label):

- `ActivityTab.tsx`'s durable row now renders `entry.summary` (server-built as `"Changed {section}: {field, field…}"`, e.g. **"Changed Public information: Venue address"**) as the primary line and `entry.actorName` alone as the secondary line — the old `{actorName} · {sectionLabel}` repetition is gone.
- The bootstrap operator (`local@dev`) now renders as **"Local operator"**, applied both at write time (`_actor_display_name` in `patch_setup_section`) and at read time (`get_activity`), so rows recorded before this package also display correctly.
- Timestamps render via `formatDateTime(entry.occurredAt, 'datetime', timeZone)` — tournament timezone, contract §7.1's own example row for "Activity log". Evidence: `ActivityTab.test.tsx::'renders a durable row with the actor, plain-language change, and a tournament-timezone timestamp'` (Africa/Johannesburg, UTC+2: `12:30Z` renders `2:30 PM`, not the browser's local time).

**Ruling R2** (expansion shows old → new when available; add a minimal field diff at write time for setup PATCHes; "Details not recorded for this change" for older rows — never invent):

- `patch_setup_section` now diffs the setup document's previously stored section data against the newly validated payload (`_diff_fields`) and records each changed field's key, humanized label, old value, and new value on the `ActivityEntry`.
- `ActivityTab.tsx`'s `ActivityRowDetails` renders that list as old → new pairs when `entry.fields` is non-empty, and the literal string **"Details not recorded for this change."** when it is empty (covering rows stored before this package existed, and any future action that never records a diff).
- Evidence: `test_tournament_setup.py::test_setup_patch_records_actor_section_and_field_diff` (backend: first edit's diff has `old: None` — nothing was stored yet — a second edit's diff has the real prior value); `ActivityTab.test.tsx::'expands to show old and new values…'` and `::'renders "Details not recorded for this change"…'` (frontend).

**Ruling R3** (diagnostics — raw operation id, ISO timestamp, payload hash — behind expansion, never in the default row):

- `ActivityRowDetails` always renders a diagnostics block (`Operation ID` = `entry.id`, `Recorded at` = the `diagnostic`-context ISO timestamp, `Payload hash` = `entry.payloadHash` or "not recorded") inside the same `<details>` as the field diff — never in the collapsed row.
- Evidence: `ActivityTab.test.tsx::'keeps diagnostics … behind the row expansion only'`.

**Ruling R4** (retention copy must match actual lifetime):

- Activity has never been pruned on a schedule — `document["activity"]` has always been truncated to the last N entries on every write (`activity[-200:]`, now `activity[-ACTIVITY_MAX_ENTRIES:]`). There is no age-based job. The new copy, **"Kept for the most recent 200 changes."**, says exactly that, and is sourced live from `ActivityFeed.retentionLimit` (backed by the `ACTIVITY_MAX_ENTRIES` constant) rather than a duplicated frontend literal — so a future change to the cap cannot silently desync the copy from the behavior.
- Evidence: `test_tournament_setup.py::test_activity_feed_reports_its_own_retention_limit`; `ActivityTab.test.tsx::'shows retention copy pinned to the backend-reported limit'`.

## Debt logged (`docs/reference/debt-log.md`, "Work package 20")

- **V3-20-1** — field-level diffs are only recorded for `setup.updated` (the only activity action that exists today); a future action needs its own diff call at write time.
- **V3-20-2** — `_field_label` is a generic humanizer, not a curated per-field label map; a few compound keys (`entryFeeMinor` → "Entry fee minor") read slightly awkwardly. Candidate follow-up once real operator feedback identifies which labels confuse.
- **V3-20-3** — list/object-valued fields (`courts`, `dailySessions`, `events`, `contacts`) diff as whole-array JSON via `JSON.stringify`, not a per-item diff. Honest (never invents a value) but not friendly prose; a structured per-item diff for array-shaped sections is out of this package's scope.
- Also resolved: **V3-19-2** (package 19's debt item — the `formatDateTime.ts` authority did not exist yet) is closed: the authority now exists and `SyncBackupsTab.tsx` redirects to it.
