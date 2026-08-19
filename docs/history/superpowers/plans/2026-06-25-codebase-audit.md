> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# ShuttleWorks Audit — Consolidated & Prioritized

_Generated 2026-06-25 (branch `dev/workspace-suite`) by a 5-auditor read-only sweep (perf×2, dead code, forgotten features, structure) + Opus synthesis. The `perf-frontend` auditor finished reading but didn't emit structured output, so the Performance section is backend-weighted — re-run that single sweep for frontend render/polling/virtualization findings._

One cross-auditor conflict was resolved by direct grep: the forgotten-features note that "JSON import is fully working" is **incorrect** — `importFromJSON`/`importFromCSV`/`exportToJSON`/`exportScheduleToCSV` have zero import sites in `src`. The entire import/export layer is dead.

---

## Quick wins (high/medium impact, S effort — do these first)

1. **Enable SQLite WAL + busy_timeout, resize the pool** [high / S] — `backend/database/session.py:24–37`, `backend/app/main.py:184–189`. Default pool (5+10) with `busy_timeout=0` produces "database is locked" under contention; a 30s solve compounds it. Add `PRAGMA journal_mode=WAL` + `busy_timeout=5000` and pre-allocate (`pool_size=20, max_overflow=0`). Highest impact-per-effort item in the audit.
2. **Remove `react-force-graph-2d`** [high / S] — `frontend/package.json:39`. Zero source imports. Pure bundle weight.
3. **Delete the dead import/export layer** [medium / S] — `frontend/src/utils/importers.ts`, `frontend/src/utils/exporters.ts`. Zero import sites (collapses the dead-code + CSV-stub findings into one deletion).
4. **Delete `rosterMigration.ts`** [medium / S] — `frontend/src/lib/rosterMigration.ts`. `migrateFlatRosterToHierarchical()`/`needsMigration()` never called — legacy from an earlier roster refactor.
5. **Tidy `lib/time.ts` + `constraintChecker.ts`** [low / S] — drop `export` on file-internal `isOvernightSchedule()`/`getAdjustedEndMinutes()`; replace the private `getMatchPlayerIds()` (constraintChecker.ts:42–48) with the authoritative one from `trafficLight.ts`.

> Items 2–5 are a single small "dead-code sweep" PR.

---

## Performance (ranked by impact)

1. **Blocking OR-Tools solver on the async event loop** [high / M] — `api/schedule.py:94–98`, `api/schedule_repair.py:315`, `api/schedule_warm_restart.py:139`, `api/schedule_proposals.py:365,396`. Five async endpoints call the solver directly; one solve freezes ALL concurrent requests for up to 30s. The correct pattern already exists at `api/schedule.py:220` (`loop.run_in_executor(None, solve_in_thread)`). Wrap each, preserving signatures.
2. **N+1 bracket hydration loop** [high / M] — `api/brackets.py:334–487` (`_hydrate_session`) calls `list_participants`/`list_matches`/`list_results` per event (375/407/455) = 1+3N queries on every `GET /bracket` and mutation. Add bulk `list_all_*_for_tournament` methods → 4 queries regardless of N.
3. **Full-tournament re-serialization on every mutation** [medium / M] — `api/brackets.py:1123–1198, 1206–1300, 1459–1520` (+~10 endpoints). Every write returns full `TournamentOut` via `_serialize_session`, re-running `_hydrate_session` (upsert_event hydrates twice: 1152 + 1193). First kill the double-hydration via request-context cache; then move single-match writes to projections / `204`.
4. **Non-streaming `/schedule` has no cancellation guard** [medium / M] — `api/schedule.py:71,94–98`; `schedule_repair.py:212`; `schedule_warm_restart.py:70`. Client disconnect leaves the solver running; the streaming route handles it via `cancel_event` (229–230). Pass a `CancelToken`+progress callback. Bundles with #1.
5. **Redundant `tournaments.get_by_id` per request** [low / S] — `api/brackets.py:795,345,1085,513` fetch the same row up to 4×. Likely covered by SQLAlchemy's identity map if the session is request-scoped (`app/dependencies.py:168`). _Verify before acting — may be a non-issue._
6. **JSON blob schema / payload size** [medium / L] — see Bigger bets.

Lower-priority observability win: move the `scheduler_core` import to a lifespan pre-flight check (`main.py:55–110`) so failures surface at startup, not first request (`api/schedule.py:24–31`).

---

## Dead code

Top items are in Quick wins (#2–#5). Remaining:

1. **Radix UI deps possibly unused** [medium / M] — `frontend/package.json:22–30` declares `@radix-ui/react-{checkbox,slider,switch,tooltip,dialog}`, but direct Radix imports live only in `packages/design-system`. Run `npm ls @radix-ui/react-*` — remove direct-and-unused, leave transitives. _Verify before deleting._
2. **Deleted-component comment refs** [low / none] — `TabBar`/`ModuleDock`/`settingsTabs` (removed `03421ff`) survive only in comments. Informational.

Backend cross-checks clean: all 59 routes registered (`app/main.py:213–228`); `workspace_signals.py` fully wired.

---

## Forgotten / half-built features

1. **Bracket/custom match generation throws** [medium / M] — `frontend/src/utils/matchGenerator.ts:109–114` throws "Bracket generation is coming soon" / "Custom rules are not yet supported"; all-vs-all + round-robin work. A full BWF bracket engine already exists backend-side (`services/bracket/formats/single_elimination.py`), so this frontend stub may be **obsolete rather than unimplemented** — route to the backend or remove the dead affordance. _Verify the frontend path is still reachable._
2. **CSV import stub** — folded into Quick win #3 (the file is dead).
3. **Deliberate, documented deferrals — keep as-is:** `randomize=True` NotImplementedError (`single_elimination.py:14–16`); `compress_remaining` director action (`schedule_director.py:17–20`, documented design blocker); Supabase sync outbox (`main.py:83–94` + `sync_service.py`, env-gated); suggestions 90s heartbeat retirement; `coming_soon`→`available` migrations + frontend defensive map (`moduleModel.ts:96`); `useReachability` reconnect-flush split; commandQueue cold-read fix (`useCommandQueue.ts:92–109`).

The only true "abandoned mid-implementation" item is matchGenerator's bracket branch.

---

## Bigger bets (L-effort / structural — tie to the module-contract direction)

1. **Retire the legacy tournament-product bracket backend** [high / L] — `api/brackets.py:1–33` ("PR 3 retires it"). Ported from the old `:8765` backend, running in parallel pending frontend consolidation. *The* prerequisite for Bracket as a clean installable module — and it subsumes perf #2/#3 (the N+1 + full-serialization debt all lives in this file). Plan the retirement + perf refactor as one arc.
2. **Extract Operations as a first-class product** [high / L] — live-ops is scattered across `products/meet/{control-center,director,liveOps}` + backend `api/{match_state,schedule_advisories,schedule_proposals}.py` + `sync_service`. No `products/operations/` folder, no `WorkspaceModule` row. **Resolve the open question first: is Operations a separate installable module or an always-on cross-cutting concern?** Document in `PRODUCT.md` before moving folders. Directly gated by the module-contract direction.
3. **Tournament → Workspace rename** [high / M–L] — the `Tournament` entity/table (`database/models.py`), `/tournaments` routes, and `store/tournamentStore.ts` + `TournamentStateDTO` all use legacy naming while the domain/UI say "workspace." Phased rename with a dual-path deprecation shim: (1) entity+API, (2) frontend imports/routes, (3) store files/types. Essential before independent module packaging.
4. **Normalize the `tournaments.data` JSON blob** [medium / L] — `database/models.py` `Tournament.data`, fully serialized on every write (`api/brackets.py:496–545,627–718`); 100KB+ for 3 events, responses >1MB. Split static (participants/events/matches) from mutable (assignments/results) into indexed columns; persist deltas; add sparse field projection. Part of bet #1.
5. **Structural/doc hygiene** [low–medium / S–M] — adapter contract README (`backend/adapters/` — only `badminton.py`); `frontend/src/platform/README.md` (boundary undocumented); `legacy/README.md` or delete (`products/scheduler/legacy/`); mirror the well-organized `services/bracket/` substructure for the flat `services/match_state.py` (400+ lines); barrel exports + import convention; root build/test coordination (npm + Python). Do opportunistically alongside the bets they touch.

---

## Flagged for deeper look (don't act blind)
- **Radix deps** — confirm direct vs transitive via `npm ls` before removing.
- **`matchGenerator.ts` bracket branch** — confirm reachable given the backend bracket engine; may be deletable, not implementable.
- **Redundant `get_by_id` (perf #5)** — verify request-scoped session reuse.
- **Frontend perf** — re-run the dedicated sweep (render hotspots, polling cadence, list virtualization); the audit's perf section is backend-weighted.
