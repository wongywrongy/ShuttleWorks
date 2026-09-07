# Work package 19 — backup, restore and sync decisions safe to understand

Branch `feat/surface-book-remediation`, backend HEAD `3b52f4eb` at verification time. Scope: `apps/console/src/modules/settings/{SyncBackupsTab,SyncReconciliationPanel}.tsx` + their tests, `apps/console/src/hooks/{useTournamentBackups,useAuthorityStatus}.ts`, the backup routes/services in `apps/api/src/workspaces/tournaments.py`, `apps/console/src/api/{dto.ts,dto.generated.ts}`, and `docs/audits/v3-consolidated/`, per `docs/audits/v3-consolidated/plan.md` §3 (X16), §4 ("Destructive/recovery copy", "Status", "Dates and numbers"), the contract `docs/reference/contracts/state-and-formatting.md` §7/§8 (ruling C5), and findings V3-OC27.1/V3-OC27.2. Builds on package 05's work (`SyncBackupsTab.tsx` "Saved on this device." primary line, outbox-evidence-gated cloud row) rather than undoing it.

## Files changed

- `apps/api/src/workspaces/tournaments.py` — `BackupEntryDTO` gains `matchCount: int`, `entryCount: int`, `changeSummary: str`. New `_snapshot_counts()` reads match/player counts (Meet + Bracket combined) straight off a backup's already-stored `snapshot` JSON; `_change_summary()` diffs a row's counts against the next-OLDER backup ("First recorded snapshot" / "No change from previous snapshot" / "+N matches, +N entrants since previous snapshot"). `list_tournament_backups` now passes each row's next-older snapshot into `_backup_entry` so every response entry carries real counts and a summary — no new query, since `list_for_tournament` already materializes the full ORM row (snapshot included).
- `apps/console/src/api/dto.ts` — `BackupEntryDTO` gains the three new optional fields (matching the pattern of the existing optional `origin`).
- `apps/console/src/api/dto.generated.ts` — regenerated via `make generate-api` (also picked up unrelated, already-committed backend schema growth from concurrent work packages, e.g. `DisplayMatchScoreDTO`/`DisplayMatchStateDTO` — not touched by hand, not this package's concern).
- `apps/console/src/modules/settings/SyncBackupsTab.tsx`:
  - New tournament-timezone-aware timestamp formatters (`fmtTimestamp`, `fmtTime`, `dayLabel`, `minuteKey`) replace the browser-locale `toLocaleString`/`toLocaleDateString` calls. Every rendered timestamp is now zone-qualified (`Mon, Jun 1, 2:00 AM SAST`) per contract §7, and seconds are added only when another backup in the list collides on the same minute (`minuteCollisions` map + `collides()`).
  - `SyncBackupsTab` accepts a `timeZone` prop (falls back to `'UTC'`, labeled explicitly per contract §7.2's "timezone unknown" rule); threaded in from `WorkspaceShellSurface`'s already-fetched `TournamentSummaryDTO.timeZone`.
  - The default row's byte-delta prose ("X KB larger/smaller than the next point") and inline filename are removed. Replaced by `b.changeSummary` + `countsText(matchCount, entryCount)` (e.g. "+1 match, +2 entrants since previous snapshot · 5 matches, 10 entrants").
  - Restore confirmation now names the chosen snapshot by its `changeSummary` + counts (not its filename), and the consequence paragraph is ruling R2's exact wording: "Restoring replaces the current workspace with this snapshot. A recovery point of the current state is saved first; if that safety snapshot cannot be saved, the restore will not run. Matches, results, and settings all change to match the snapshot — everything recorded since it is discarded." The existing safety-snapshot-first behavior (`restoreFlow`: `createBackup()` then `restoreBackup()`, aborting on failure) is unchanged — this package only re-worded and re-tested it.
  - "Inspect backup" (the existing details affordance) now also shows the exact filename + size (`fmtBytes`), the two facts removed from the default row.
  - The top authority card's pending badge is reworded from "Syncing · {n} committed locally · awaiting cloud" to ruling R1's exact phrase, "{n} change(s) saved on this device, waiting to sync".
- `apps/console/src/modules/settings/SyncReconciliationPanel.tsx` — new `headline(authority)` replaces the static "Reconciliation evidence" h2 with three ordinary-language states (blocked → "Changes needing attention"; pending → "N change(s) saved on this device, waiting to sync"; else → "No changes need attention"). The jargon paragraph ("Reconciliation evidence" / "immutable" / "cloud acknowledgement") moves into a `<details>` disclosure under the same label; the empty-state string drops "quarantined"; the loading string drops "reconciliation evidence".
- `apps/console/src/modules/workspace/WorkspaceShellSurface.tsx` — passes `timeZone={summary?.timeZone}` into `SyncBackupsTab` (one-line addition to an existing prop-threading pattern already used for `PeopleAccessTab`/`GeneralSettingsTab`).
- `apps/console/src/modules/settings/__tests__/SyncBackupsTab.test.tsx` — rewrote the byte-delta test into a same-minute-collision test (asserts seconds appear only when two rows collide, and that the summary/counts — not byte deltas or filenames — are what distinguish them); added a no-collision control test; updated the restore-confirmation test for the new wording and summary-naming; updated the origin/filename test (filename is no longer in the default row).
- `apps/console/src/modules/settings/__tests__/SyncReconciliationPanel.test.tsx` — replaced the static-heading assertion with three headline-state tests; asserts the technical term is still reachable (inside the disclosure).
- `tests/backend/test_tournaments.py` — three new tests: counts/summary correctness across a 3-write sequence, a shrinkage case, and an offline-recovery test that guards `socket.socket.connect` to fail on any non-loopback dial while running create → list → download → restore → delete.
- `docs/audits/v3-consolidated/ledger/19-strings.md` (new) — full string ledger.
- `docs/reference/debt-log.md` — new "Work package 19" subsection (two items, see below).

## Commands run and results (verbatim)

```
$ .venv/bin/pytest tests/backend/test_tournaments.py -q -k "backup or Backup"
.............
13 passed, 51 deselected in 18.39s

$ .venv/bin/pytest tests/backend/test_tournaments.py -q
................................................................
64 passed in 77.98s (0:01:17)

$ .venv/bin/ruff check apps/api tests/backend
F841 Local variable `live` is assigned to but never used
   --> tests/backend/test_publication_matrix.py:401:5
Found 1 error.
```
(`test_publication_matrix.py` is an untracked file from a different, concurrently in-progress work package — not touched by this package, not in scope.)

```
$ cd apps/api/src && ../../../.venv/bin/lint-imports --config ../.importlinter
Analyzed 166 files, 590 dependencies.
Contracts: 15 kept, 0 broken.

$ npm --prefix apps/console run test:run -- src/modules/settings src/hooks
Test Files  27 passed (27)
     Tests  156 passed (156)

$ npm --prefix apps/console run test:run -- src/modules/settings src/hooks src/api/__tests__/dtoParity.test.ts
Test Files  28 passed (28)
     Tests  162 passed (162)

$ npm run lint:scheduler
✖ 134 problems (0 errors, 134 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.

$ npx tsc -b apps/console
apps/console/src/platform/domain/sides.ts(145,65): error TS7053: …
```
(`sides.ts` is likewise an untracked file belonging to a different, concurrently in-progress work package — not this package's file, not fixed here.)

Also run once, standalone, to confirm this package's own type surface: `apps/console/src/modules/settings/SyncBackupsTab.tsx`, `SyncReconciliationPanel.tsx`, `WorkspaceShellSurface.tsx`, and `dto.ts` compiled clean before `sides.ts` was picked up by the same `tsc -b` project graph from a concurrent agent's uncommitted work.

## A note on a mid-task branch integration

Partway through this package, the shared branch was fast-forwarded by an orchestration step (commits for work packages 04b and 07 landed, plus a progress-gate commit) and the working tree was reset, stashing every agent's uncommitted work — including this package's — together in one stash. This package's own files (`tournaments.py`, `dto.ts`, `SyncBackupsTab.tsx`, `SyncReconciliationPanel.tsx`, their tests, `WorkspaceShellSurface.tsx`, `test_tournaments.py`, `debt-log.md`) were recovered file-by-file via `git checkout stash@{0} -- <path>` (never a blanket `stash pop`, to avoid clobbering other concurrently-running agents' newer in-progress edits to files outside this scope), then re-verified against the new HEAD (`dto.generated.ts` was regenerated fresh rather than restored from the stash, since the backend schema had moved). The stash itself was left in place, untouched, for the orchestrator/other agents.

## Per-finding acceptance

### V3-OC27.1 — reconciliation panel default view uses ordinary language

**Ruling R1.** Acceptance: *"The default view answers what is saved, what is pending, and what needs action using ordinary language."*

- Default heading (`SyncReconciliationPanel.tsx`) is now one of exactly the three ordinary-language phrases the ruling specifies, driven by the same `blocked_operations`/`pending_operations` counts already fetched for the panel:
  - `blocked_operations > 0` → **"Changes needing attention"**
  - else `pending_operations > 0` → **"N change(s) saved on this device, waiting to sync"** (plural-aware, verified for n=1 and the default fixture's n=1 in `SyncReconciliationPanel.test.tsx`)
  - else → **"No changes need attention"**
- "Reconciliation evidence", "immutable", "cloud acknowledgement" no longer appear in the default view — moved into a `<details><summary>Reconciliation evidence</summary>…</details>` disclosure, verified by `screen.queryByRole('heading', { name: 'Reconciliation evidence' })` being null while `screen.getByText('Reconciliation evidence')` (inside the collapsed `<summary>`) still exists.
- "quarantined" removed from the empty-state string (now "No changes need attention." / "Nothing to review yet.").
- Package 05's outbox-evidence gating (`SyncBackupsTab.tsx`'s cloud row rendering only on real pending/blocked/acknowledged counts) is unchanged; this package additionally unified the pending-badge wording there with the same ruling-R1 phrase, so the top card and the reconciliation panel no longer use two different sentences for the same fact.
- Evidence: `apps/console/src/modules/settings/__tests__/SyncReconciliationPanel.test.tsx` — 3 new tests (`leads with an ordinary-language headline…`, `headline says "Changes needing attention"…`, `headline says nothing needs attention…`).

### V3-OC27.2 — backups distinguishable before restoring

**Ruling R2.** Acceptance: *"Two same-second backups can be distinguished by their contents before restoring; the current state is not overwritten without a clear confirmation."*

- **Timezone-qualified timestamp, seconds on collision.** `fmtTimestamp`/`fmtTime` render in the tournament timezone (threaded from `TournamentSummaryDTO.timeZone` via `WorkspaceShellSurface`, falling back to labeled UTC), always showing the zone abbreviation, and add seconds only when `minuteCollisions` finds another backup in the same minute. Evidence: `SyncBackupsTab.test.tsx::'distinguishes same-minute recovery points…'` (two backups 25 seconds apart in the same minute both render `:30`/`:05`) and `::'does not show seconds when no other backup collides…'` (a solo backup shows no seconds).
- **Short change summary + meaningful counts, never byte-delta prose or the filename, in the default row.** `BackupEntryDTO.changeSummary`/`matchCount`/`entryCount` (backend) render as e.g. "+1 match, +2 entrants since previous snapshot · 5 matches, 10 entrants"; the old byte-delta sentence and the inline filename are gone from the row. Evidence: same test asserts `queryByText(/larger than the next point/i)` and the bare filename are both null, and that the summary/count `data-testid`s render the expected content. Backend evidence: `tests/backend/test_tournaments.py::test_backup_entries_carry_counts_and_change_summary` and `::test_backup_change_summary_reports_shrinkage_too`.
- **Exact filename and size in details.** Both moved to the existing "Inspect backup" modal (filename was already shown there; this package added the exact byte size next to it).
- **Restore confirmation names the chosen snapshot by its summary and states the consequence.** The modal heading is followed by a line rendering `changeSummary` + counts; the body text is ruling R2's two sentences verbatim, plus what changes (matches/results/settings) and what's discarded. Evidence: `SyncBackupsTab.test.tsx::'explains the pre-restore recovery point before confirmation, naming it by its summary'`.
- **Safety-snapshot-first, abort-on-failure — kept, verified.** `restoreFlow` is unchanged: it calls `createBackup()` then `restoreBackup()`, and a `createBackup()` rejection propagates (no `restoreBackup` call, `useAction`'s `onError` shows a truthful error + Retry). Existing coverage: `SyncBackupsTab.test.tsx::'restores a backup after confirm (delegates to the hook → store rehydrate)'` pins the ordering (`createBackup` called, then `restoreBackup`); the package did not need to add a new test for the abort path since `createFlow`/`restoreFlow`'s `await` chain and `useAction`'s existing error-surfacing tests already cover "a rejected async step stops the chain and shows Retry" generically (see `useAction`'s own tests) — re-verified by inspection, not duplicated.
- **Result counts precisely excluded, with reason** (ruling R2's "or state precisely why not"): recorded match results live in the separate `match_states` table, never captured by a backup `snapshot`. Documented in the ledger and `docs/reference/debt-log.md` (V3-19-1).

### R3 — offline recovery

- `tests/backend/test_tournaments.py::test_backup_lifecycle_makes_no_outbound_network_call` monkey-patches `socket.socket.connect` to raise on any non-loopback address, then runs create → list → download → restore → delete through the FastAPI TestClient (SQLite-backed, no real HTTP socket either — ASGI in-process transport). All five calls succeed with the guard active, demonstrating nothing in the backup path dials out. (The guard patches `connect`, not `socket()` itself, because the ASGI test transport's own event-loop plumbing legitimately opens `AF_UNIX` socketpairs that never call `connect`.)
- UI truthfulness after a failed create/restore was already covered before this package (`SyncBackupsTab.test.tsx`'s `onError` paths set a `role="alert"` message naming what failed plus a Retry button, never implying success or sync); this package didn't change that logic, only re-verified it still holds under the reworded copy.

## Debt logged (`docs/reference/debt-log.md`, "Work package 19")

- **V3-19-1** — `BackupEntryDTO` has no result count; recorded scores live in `match_states`, not the snapshot, so a past backup cannot honestly report results without re-deriving live state it never captured. Candidate follow-up if backups are ever extended to snapshot `match_states` too.
- **V3-19-2** — the contract §7.3 `lib/formatDateTime.ts` authority does not exist yet (package 07's deliverable, not shipped on this branch). `SyncBackupsTab.tsx`'s four new timestamp helpers implement the same rules locally with a redirect comment; fold them into the authority once it lands.
